# Fixtures

**No file here says where anybody actually ran.**

The recording is real — a genuine run, with the heart rate, cadence, power and
elevation it was recorded with. What has been removed is the place. Every
coordinate was moved to Richmond Park, and the sensor jitter was smoothed out.
Both are done by [`scripts/make-fixtures.mjs`](../scripts/make-fixtures.mjs).

```bash
# Invent a run from nothing. Needs no input; anyone can do this.
node scripts/make-fixtures.mjs

# Anonymise a real recording. This is how the committed fixtures were made.
node scripts/make-fixtures.mjs --source path/to/your-run.gpx
```

| File | What it exercises |
|---|---|
| `Lunch_Run.fit` | The FIT decoder: definition messages, invalid-value sentinels, a sparse heart-rate series, intermittent distance, session totals and laps. |
| `Lunch_Run.gpx` | The GPX parser: the Garmin `TrackPointExtension` for heart rate and cadence, and the plain Strava `<power>` element. The same run as the FIT, so the two can be cross-checked. |
| `No_Cadence.gpx` | The same run with cadence removed. Plenty of watches never record it, and the page has to drop its whole cadence section rather than show an empty one. |

`public/demo/Lunch_Run.fit` is a byte-identical copy of the FIT fixture, so the
demo a visitor loads is exactly what the tests exercise.

## Why a real run rather than an invented one

Invented physiology looks invented. A heart rate that never hesitates and a
pace line with no texture read as a chart of a formula — a poor advertisement
for a page whose whole claim is that it explains real running. Worse, a
generated run has no *story*: nothing to detect, no drop to attribute, no
moment worth a card. The committed run has a genuine cadence drop in its third
kilometre, which is precisely the sort of thing the page exists to notice.

## What moving the route does and does not protect

Moving it is not a fixed offset added to each coordinate. That would be wrong
in a way that is easy to miss: a degree of longitude is 111 km at the equator
and narrows towards the poles, so a route shifted from Melbourne to London
keeps its numbers and loses a fifth of its width. Instead the track is
converted to metres east and north of its own centre and re-projected at the
destination, so every distance, gradient and pace survives exactly.

What survives is also the limit of the protection. **The shape of the route and
the elevation profile are real.** Somebody holding the original recording could
match them, and in principle an elevation profile can be matched against
terrain. This is a large reduction in what is disclosed, not anonymity — it is
the right trade only for a route whose owner is content to publish its shape.

## Smoothing

Consumer GPS wanders a metre or two a second even when a runner does not. In
this recording the largest step between two consecutive seconds was 6.0 m
against a 2.46 m average — a 21 km/h sprint that never happened. Those wobbles
reach the page as pace spikes that say nothing about the run.

A five-second rolling mean over position and power removes them, taking the
largest step down to 3.6 m while changing the total distance by 0.3%. Heart
rate, cadence and elevation are left alone; they were already steady.

## Testing with a real run

Drop your own file into the app rather than into this directory. Anything
matching `*.fit`, `*.gpx` or `*.tcx` at the repository root is ignored by git,
so a file left there while working cannot be committed by accident.
