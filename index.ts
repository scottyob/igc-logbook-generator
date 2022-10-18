#! /usr/bin/env node

const { Command } = require("commander");
const program = new Command();

import { readFileSync, readdirSync } from "fs";
import IGCParser = require("igc-parser");
import GeoLocation = require("geolocation-utils");

type LogRecord = {
  date: string;
  wing?: string;
  durationSeconds?: number;
  maxDistanceMeters?: number;
  maxAltitudeMeters?: number;
  trackLengthMeters?: number;
  altitudeGainMeters?: number;
  comment?: string;
  fileName?: string;
  launchName?: string;
  location?: string;
};

/*
 * Parse IGC file
 */
function parseFile(igc: IGCParser.IGCFile): LogRecord {
  return {
    date: igc.date,
    wing: igc.gliderType,
    durationSeconds:
      (igc.fixes[igc.fixes.length - 1].timestamp - igc.fixes[0].timestamp) /
      1000,
    maxDistanceMeters: Math.max(
      ...igc.fixes.map((f) => GeoLocation.distanceTo(igc.fixes[0], f))
    ),
    maxAltitudeMeters: Math.max(...igc.fixes.map((f) => f.gpsAltitude)),
    trackLengthMeters: igc.fixes.reduce(
      (previousValue, currentValue, currentIndex) => {
        if (currentIndex === 0) {
          return 0;
        }
        // Work out the distance to the last point
        return (
          previousValue +
          GeoLocation.distanceTo(igc.fixes[currentIndex - 1], currentValue)
        );
      },
      0
    ),
    altitudeGainMeters: igc.fixes
      .map((value, index) => {
        if (index == 0) {
          return 0;
        }
        const difference = value.gpsAltitude - igc.fixes[index - 1].gpsAltitude;
        return difference > 0 ? difference : 0;
      })
      .reduce((partialSum, a) => partialSum + a, 0),
    ...igc?.task?.comment && {comment: igc?.task?.comment}
  };
}

program
  .name("igc-logbook")
  .description("Converts igc files to a JSON logbook")
  .version("1.0");

program
  .command("build")
  .argument("<srcDirectory>", "Directory to find igc files in")
  .description("Builds a logbook from source files")
  .action("build")
  .action((srcDirectory) => {
    const logbook = readdirSync(srcDirectory)
      .filter((f) => f.endsWith(".igc"))
      .map((f) => {
        const buffer = readFileSync(srcDirectory + "/" + f, {
          flag: "r",
          encoding: "utf8",
        });
        const igc = IGCParser.parse(buffer);
        return {
            fileName: f,
            ...parseFile(igc)
        };
      });

    console.log(JSON.stringify(logbook));
  });

program.parse();
