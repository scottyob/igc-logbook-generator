#! /usr/bin/env node

const { Command } = require("commander");
const program = new Command();

import { readFileSync, readdirSync } from "fs";
import IGCParser from "igc-parser";
import { distanceTo } from "geolocation-utils";
import { parse } from "csv-parse/sync";

/*
 * A record in the flight logbook for a flight
 */
type LogRecord = {
  /*
   * Included in IGC Files
   */
  date: string;
  wing?: string;
  durationSeconds?: number;
  maxDistanceMeters?: number;
  maxAltitudeMeters?: number;
  trackLengthMeters?: number;
  altitudeGainMeters?: number;
  comment?: string;
  fileName?: string;

  /*
   * Additional information added from launch database (or manual in CSV)
   */
  launchName?: string;
  location?: string;

  /*
   * Computed fields
   */
  launchTime?: number; // Useful for sequencing flights to give it a flightNumber
  flightNumber?: number; // The record of flight
};

/*
 * A launch or landing site, as found from the paragliding launches database
 */
type Launch = {
  name: string;
  longitude: number;
  latitude: number;
};

/*
 * Parse IGC file
 */
function parseFile(igc: IGCParser.IGCFile, launches: Launch[]): LogRecord {
  // Calculate the closest launch (within a 1km margin)
  const launchDistances = launches.map((l) => distanceTo(igc.fixes[0], l));
  const shortestDistance = Math.min(...launchDistances);
  const closestLaunch =
    shortestDistance < 1000
      ? launches[launchDistances.indexOf(shortestDistance)]
      : undefined;

  return {
    date: igc.date,
    wing: igc.gliderType!,
    durationSeconds:
      (igc.fixes[igc.fixes.length - 1].timestamp - igc.fixes[0].timestamp) /
      1000,
    maxDistanceMeters: Math.max(
      ...igc.fixes.map((f) => distanceTo(igc.fixes[0], f))
    ),
    maxAltitudeMeters: Math.max(...igc.fixes.map((f) => f.gpsAltitude!)),
    trackLengthMeters: igc.fixes.reduce(
      (previousValue, currentValue, currentIndex) => {
        if (currentIndex === 0) {
          return 0;
        }
        // Work out the distance to the last point
        return (
          previousValue + distanceTo(igc.fixes[currentIndex - 1], currentValue)
        );
      },
      0
    ),
    altitudeGainMeters: igc.fixes
      .map((value, index) => {
        if (index == 0) {
          return 0;
        }
        const difference =
          value.gpsAltitude! - igc.fixes[index - 1].gpsAltitude!;
        return difference > 0 ? difference : 0;
      })
      .reduce((partialSum, a) => partialSum + a, 0),
    launchTime: igc.fixes[0].timestamp,
    ...(igc?.task?.comment && { comment: igc?.task?.comment }),
    launchName: closestLaunch?.name,
  };
}

/*
* Loads in manually recorded flight records from CSV files.  Expect headers to match the LogRecord type
*/
function parseCsvs(srcDirectory: string): LogRecord[] {
  return readdirSync(srcDirectory)
    .filter((f) => f.endsWith(".csv"))
    .map((f) => {
      // Parse the CSV file
      const buffer = readFileSync(srcDirectory + "/" + f, {
        flag: "r",
        encoding: "utf8",
      });
      let csvRecords = parse(buffer, {
        columns: true,
        cast: (columnValue, context) => {
          if (
            context.column.toString().includes("Meters") ||
            context.column.toString().includes("duration")
          ) {
            let result = parseInt(columnValue, 10);
            return isNaN(result) ? null : result;
          }
          if (columnValue === "") {
            return null;
          }
          return columnValue;
        },
      });

      // Strip out any empty/null values
      csvRecords = csvRecords.map((obj: any) => {
        Object.keys(obj).forEach((key) => {
          if (obj[key] === null) {
            delete obj[key];
          }
        });
        return obj;
      });
      let records: LogRecord[] = csvRecords;

      // Populate the launchTime for those that are missing.  To keep ordering in-tact, we'll add
      // a second for the record number
      records = records.map((record, i) => {
        if (record.launchTime == undefined) {
          record.launchTime = Date.parse(record.date) + i;
        }
        return record;
      });

      return csvRecords;
    })
    .flat();
}

/*
* Replace locations from a file
*/
function replaceLocations(fileName: string, logbook: LogRecord[]): LogRecord[] {
  const locations: string[] = JSON.parse(readFileSync(fileName, {
    flag: "r",
    encoding: "utf8",
  }));

  return logbook.map(r => {
    if(r.location != undefined) {
      return r;
    }
    // Find location mame that matches (any really)
    r.location = locations.filter(l => r.launchName?.includes(l))[0];
    // console.debug(locations.filter(l => r.launchName?.includes(l)));
    return r;
  });
}

program
  .name("igc-logbook")
  .description("Converts igc files to a JSON logbook")
  .version("1.0");

program
  .command("build")
  .argument("<srcDirectory>", "Directory to find igc files in")
  .option("--launchesFile <string>", "kmz file containing launches")
  .option("--sitesFile <string>", "file containing the site names")
  .description("Builds a logbook from source files")
  .action("build")
  .action((srcDirectory: string, options: any) => {
    // Read the launches into memory
    const buffer = readFileSync(options["launchesFile"], {
      flag: "r",
      encoding: "utf8",
    });
    const launches: Launch[] = JSON.parse(buffer);

    // Import all IGC, vario logged flights
    let logbook = readdirSync(srcDirectory)
      .filter((f) => f.endsWith(".igc"))
      .map((f) => {
        const buffer = readFileSync(srcDirectory + "/" + f, {
          flag: "r",
          encoding: "utf8",
        });
        const igc = IGCParser.parse(buffer);
        let ret = parseFile(igc, launches);
        ret.fileName = f;
        return ret;
      });

    // Import any manually logged flights
    logbook = [...logbook, ...parseCsvs(srcDirectory)];

    // Insert the launch name
    if(options["sitesFile"]) {
      logbook = replaceLocations(options["sitesFile"], logbook);
    }      

    // Order the logbook by the launch time, assign flight numbers
    logbook = logbook.sort((a, b) => (a.launchTime ?? 0) - (b.launchTime ?? 0));
    logbook = logbook.map((r, i) => {
      r.flightNumber = i + 1;
      return r;
    });

    console.log(JSON.stringify(logbook));
  });

program.parse();
