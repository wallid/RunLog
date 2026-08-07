# Fixtures

**Every file here is synthetic. None of them is a recording of a real run.**

A GPS track is a record of where somebody actually was, usually starting and
finishing at their front door. This project's whole argument is that a run
belongs to the person who ran it, so committing one of those to a public
repository would contradict the thing the app is built to protect.

So the fixtures are generated instead, by [`scripts/make-fixtures.mjs`](../scripts/make-fixtures.mjs):

```bash
node scripts/make-fixtures.mjs
```

| File | What it exercises |
|---|---|
| `Lunch_Run.fit` | The FIT decoder: definition messages, invalid-value sentinels, a sparse heart-rate series, intermittent distance, session totals and laps. No cadence, which is what many watches write. |
| `Lunch_Run.gpx` | The GPX parser: the Garmin `TrackPointExtension` for heart rate and the plain Strava `<power>` element. Describes the same run as the FIT, so the two can be cross-checked. |
| `Cadence_Run.gpx` | The same route with cadence, which is what the cadence section and most of the experimental lab need. |

`public/demo/Lunch_Run.fit` is a byte-identical copy of the FIT fixture, so the
demo a visitor loads is exactly what the tests exercise.

## What is real about them

The route is a loop in Greenwich Park — a landmark rather than anybody's house,
and obviously so. The file *format* is genuine: `Lunch_Run.fit` is a valid FIT
2.0 file with a correct header CRC, correct definition messages and a correct
trailing CRC. That matters. A fixture that only satisfied this project's own
decoder would stop the tests catching the day the decoder drifts away from the
format, which is the main thing they are there to catch.

The signals are smooth and slow-moving on purpose. The FIT writes heart rate
every fourth second while the GPX carries it on every point, and a test asserts
the two agree on the range — a signal that turned sharply would have its peak
fall between the FIT's samples and the two would disagree for reasons that say
nothing about either parser.

## Testing with a real run

Drop your own file into the app rather than into this directory. Anything
matching `*.fit`, `*.gpx` or `*.tcx` at the repository root is ignored by git,
so a file left there while working cannot be committed by accident.
