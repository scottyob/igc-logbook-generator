This project is intended to take in flight logs in the format of both:
- [IGC files][def]
- Manual entries from a CSV

then produce a JSON document listing each flight.  

These flights will annotate launch and site information by:
- Taking in a launches database from [Paraglidingspots](https://www.paraglidingspots.com/)
- Taking in a JSON object mapping "Launch name regex to Site"

The output of this tool is intended to be parsed by [JQ](https://stedolan.github.io/jq/) or other to be able to slice and dice statistics from them.

## Running
To generate a logbook from tracklogs, run
```
./node_modules/.bin/ts-node index.ts build ~/website/content/flying/tracklogs/
```

[def]: https://en.wikipedia.org/wiki/IGC_(file_format)