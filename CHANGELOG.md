# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-08-07

The first public cut: a run explorer that reads a file in the browser and
explains what happened during it.

### Added

**Reading a run.** A hand-rolled FIT 2.0 decoder with no dependency, handling
compressed-timestamp headers, both endiannesses, invalid-value sentinels,
chained files and unknown developer fields. A GPX parser covering the Garmin and
Strava extension dialects. Both produce one source-independent `RawActivity`,
which the pipeline resamples onto a uniform one-sample-per-second grid.

**The page.** Around forty widgets, each following the same five-part contract —
information, visualisation, observation, explanation, teaching. Observations and
explanations are separate types in the code, and an explanation cannot be
constructed without a confidence of `high`, `medium` or `low`. Widgets declare
the metrics they need and are not rendered at all when a run lacks them, so a
recording without cadence simply has no cadence section.

**Detected moments.** Climbs, descents, stops, walks, fast starts, strong
finishes, surges, slowdowns, heart-rate recoveries, cadence drops and recoveries,
and best efforts over rolling time and distance windows — each ranked for how
much it is worth saying.

**One shared cursor.** Selection lives in elapsed seconds, the one axis all the
data shares, so dragging the timeline, clicking a split and selecting a zone all
move the same marker.

**Experimental lab.** Eleven cards applying recent running research to a single
run: cardiac durability, power against heart rate, speed for the power, cadence
durability, where the speed went, rhythm stability, fatigue onset, terrain
response, wind on the route, what changed, and what the file can support. Every
one is marked beta, carries citations to the work it borrows from, and states
what it cannot establish.

**Provenance labelling.** Each lab card declares whether its headline figure was
`measured`, `derived` or `estimated`, taking the weakest of its inputs — so
anything resting on the watch's modelled running power reads as estimated rather
than measured.

**Weather lookup, off by default.** Optionally fetches the conditions near a run
so the durability and stride cards can name heat and headwind instead of hedging
about them. Wind is resolved against each kilometre's bearing, because an average
wind speed over a loop is close to zero and explains nothing.

**A first-run tour.** Eight steps teaching how one card is laid out, on the
grounds that a reader who understands one card understands all of them. It runs
once and can be asked for again from Settings.

**Crash reporting, as an exception.** Only in a build given a `VITE_SENTRY_DSN`;
switchable off; and everything sent passes through a unit-tested scrubber first.

### Privacy

- The activity file is read in the browser and never uploaded.
- The weather lookup is the only feature that discloses anything about location.
  It is off until switched on, and coordinates are rounded to one decimal place —
  a cell about eleven kilometres across, coarser than the weather grid itself, so
  the rounding costs no accuracy. The request builder is a pure function and is
  unit-tested to prove a precise position cannot reach the URL.
- Crash reports carry a stack trace and nothing from the run. Map-tile
  breadcrumbs, console breadcrumbs, query strings, the user object and the file
  name are all stripped, because each of them can describe where somebody was.
- Feedback on each card is kept in the browser and copied out as Markdown by
  hand. There is nowhere to send it.

### Known limits

- One run at a time. There is no history, so every comparison is within a single
  activity and the personal baselines several cards would benefit from cannot yet
  be built.
- Ground-contact time, vertical oscillation and measured stride length are not
  present in the file formats this reads, so the cards that would need them are
  absent rather than approximated. Step length is the exception and is derived
  from speed and cadence.
- Left–right balance is deliberately not shown. A single wrist sensor cannot
  reconstruct it, and a plausible-looking number would be worse than none.
- Energy expenditure is read from the file but never used, being the least
  reliable figure consumer wearables produce.

[Unreleased]: https://github.com/OWNER/REPO/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/REPO/releases/tag/v0.1.0
