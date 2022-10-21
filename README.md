This project is intended to take in flight logs in the format of both:
- [IGC files][def]
- Manual entries from a CSV

then produce a JSON document listing each flight.  

These flights will annotate launch and site information by:
- Taking in a launches database from [Paraglidingspots](https://www.paraglidingspots.com/)
- Taking in a JSON object mapping "Launch name regex to Site"

The output of this tool is intended to be parsed by [JQ](https://stedolan.github.io/jq/) or other to be able to slice and dice statistics from them.

## Running

### Installing and creating the launches database
1. First setup the environment
```
npm install
pip install yq
```

2.  Download the launches database from [Paraglidingspots](https://www.paraglidingspots.com/)

3.  Generate the launches JSON file
```
unzip -p ./test/launches.kmz doc.kml | ~/.local/bin/xq | sed 's/kml\://' | jq '[.. | .Placemark? // empty] | flatten | map((.Point | .coordinates | split(",")?) as $c | {name, longitude: ($c[0] | tonumber), latitude: ($c[1] | tonumber) })' > ./test/launches.json
```

### Create a list of sites
A lot of launches in this database will look something like 
> TO (SW) Mission...
> TO (WNW-SW) Ed Levin_2

The interesting part of this would be "Mission" or "Ed Levin", so the icea is storing sites.json is to store a list of strings containing site names that are used as a substring match.

```
[
    "Mission",
    "Ed Levin"
]
```

### Building Launch File

To generate a logbook from tracklogs, run
```
./node_modules/.bin/ts-node index.ts build ./test/flights --launches ./test/launches.json
```

[def]: https://en.wikipedia.org/wiki/IGC_(file_format)