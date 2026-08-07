# runlog

**Run Log — an open-source visual run explorer that turns wearable activity data into a clear, interactive explanation of what happened during a run.**

> Upload a run. Explore the moments. Understand the data.

Most running apps show you totals and charts, then leave you to work out what they mean. Run Log walks through a single run and explains what changed, where, and what might account for it.

Everything runs in your browser. There is no account and no upload — your activity file is read locally and never leaves the machine. Two things talk to a server, both narrow and both listed in Settings: the hosted build sends anonymous crash reports carrying a stack trace and nothing from your run, and a weather lookup you have to switch on yourself sends a position rounded to about eleven kilometres, so the page can tell you what the wind and heat were doing.

---

## What it does

For one activity file, the page answers five questions in order:

A contents rail on the left tracks where you are and lets you jump straight to a section; on narrow screens it collapses into a **Contents** button in the masthead.

Each card shows only what happened. Press the **ⓘ** and the card turns over to reveal what the metric means — and to ask how the section is working for you.

1. **What happened?** — the totals, and a run-type badge.
2. **Where did it happen?** — a draggable timeline and a real map, both synced.
3. **Which metrics changed together?** — relationship cards showing what moved at the same moment.
4. **What might explain the change?** — every explanation carries its confidence.
5. **What does that metric mean?** — a short teaching note, specific to this run.

## The widget contract

Every widget follows the same five-part structure, and the order never changes:

| Part | Purpose |
|---|---|
| **Information** | The important values, without overwhelming |
| **Visualisation** | The metric in a form that makes its pattern readable |
| **Observation** | What happened, stated factually |
| **Explanation** | Why it might have happened, with an explicit confidence |
| **Teaching** | What the metric means |

Observations and explanations are separate types in the code, not a stylistic distinction — an `Explanation` cannot be constructed without a `confidence` of `high`, `medium` or `low`, which the UI renders as *Likely explanation*, *Possible explanation* or *Not enough data to be sure*.

Widgets declare the metrics they need:

```ts
requiredMetrics: ["heartRate", "hrZone"]
```

A widget whose metrics are missing is not rendered at all, so a run recorded without cadence simply has no cadence section rather than an empty one. A widget can also return `null` from `compute` when the data exists but has nothing worth saying.

## Fixtures carry a real run, moved

The demo and the test fixtures are a genuine recording — real heart rate, cadence, power and elevation — with the location taken out of it. [`scripts/make-fixtures.mjs`](scripts/make-fixtures.mjs) converts the track to metres from its own centre and re-projects it in Richmond Park, so every distance, gradient and pace survives exactly while the place does not. Invented physiology looks invented, and a generated run has no story to find; this one has a real cadence drop in its third kilometre, which is the sort of thing the page exists to notice. The shape of the route and the elevation profile are still real, so this is a large reduction in what is disclosed rather than anonymity. Activity files left at the repository root are gitignored, so your own run cannot be committed by accident. See [`fixtures/README.md`](fixtures/README.md).

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser, pipeline and widget tests
npm run build    # static output in dist/
```

Drop in a `.fit` or `.gpx` file, or press **Try a demo run**.

A local build sends nothing anywhere. Crash reporting only exists in a build given a `VITE_SENTRY_DSN` — see `.env.example` — and without one the SDK chunk is never even fetched.

## Architecture

```
src/
├── parsers/          FIT + GPX → RawActivity
│   ├── fit/          hand-rolled FIT 2.0 decoder (no dependency)
│   └── gpx/          DOMParser, Garmin + Strava extension dialects
├── model/
│   ├── activity.ts   the source-independent model every widget reads
│   ├── zones.ts      heart-rate zones from a configurable maximum
│   └── pipeline/     normalise → derive → split → detect events → rank moments
├── state/            small Zustand stores (activity, selection, settings, feedback)
├── observability/    crash reporting: the gates, the scrubber, the boundary
├── shell/            masthead, contents rail, scroll-spy, feedback panel
├── tour/             the first-run walkthrough: steps, spotlight geometry
├── viz/              Track primitive, SVG shapes, scales
└── widgets/          one directory per widget: compute, narrate, view
```

**Parsing is not the widgets' problem.** Every parser produces a `RawActivity`; the pipeline turns that into a `DerivedActivity` on a uniform one-sample-per-second grid. Widgets never see a file format, so adding TCX support means adding one parser file and nothing else.

**One shared cursor.** Selection state lives in elapsed seconds — the one axis all data shares. Dragging the timeline, clicking a split, or selecting a zone bubble all write to the same store, and every widget subscribes only to the slice it paints.

**One widget list.** `buildWidgets()` decides what the run supports, and both the page and the contents rail render from that same list — so the navigation can never offer a link to a section that was not built.

### The FIT decoder

FIT files are self-describing: every data message is preceded by a definition declaring each field's number, size and base type. That lets a decoder interpret only the fields it needs while still skipping everything else byte-correctly — including developer fields it has never seen. The decoder handles compressed-timestamp headers, both endiannesses, invalid-value sentinels and chained files in about 300 lines, with no dependency.

## Design decisions worth knowing

**The page is an article, not a dashboard.** A warm off-white ground carries white cards with generous corners and shadows soft enough to read as lift rather than as a border. One accent colour does all the emphasis; everything else is ink on paper. There is no dark mode — the design commits to a single, open, daylight look.

**Heart-rate zones use a single-hue ramp, not a rainbow.** Zones are an *ordered* sequence, so the order is carried by lightness rather than by hue. A reader sees intensity rise without learning a legend, and the scale stays readable for colourblind users. The orange ramp, the metric-identity slots and the terrain poles were each checked with a colour-vision and contrast validator against the card surface, not chosen by eye.

**The tour teaches the page, not the product.** On a first visit a short walkthrough dims the page and lights up the contents rail, a section header, and the first card's parts in turn — the figures, the observed lines, the interpreted ones, the button that turns a card over. It is eight steps because a reader who understands one card understands all forty. It runs once, Escape or a click anywhere off the panel ends it, and it never comes back unless asked for from Settings. Steps whose target the layout is not showing — the rail on a narrow window — are passed over rather than pointed at, and `src/tour/tour.test.tsx` renders the real page to check every step still finds what it names.

**Type is self-hosted.** Inter is bundled at build time rather than fetched from a CDN, so the app makes no external request other than map tiles.

**The estimated maximum heart rate is deliberately generous.** A single run rarely reaches a runner's true ceiling, so treating the observed peak as the maximum would push almost the whole run into Zone 5. The estimate divides the peak by 0.94, and every zone widget states that it is a working figure until you supply your own.

**Comparisons by terrain use the median, not the mean.** Pace over any stretch is skewed by the seconds spent accelerating from a standstill; one slow start is enough to make flat ground look harder than a hill.

**Nothing is ranked or scored.** Splits appear in the order they were run, not fastest-first, and there is no overall rating. A slower split is usually a hill, and a single number would hide exactly the context this project exists to surface.

**Cadence is measured against the runner, not against 180.** The eleven-section cadence chapter compares every figure to this run's own median rather than to a target, because the right step rate depends on leg length, speed and style. Stopped seconds are excluded throughout — a stationary watch reports a cadence of zero, and counting that would turn every traffic light into a collapse in rhythm.

**Uncertainty is visible.** Where a metric could be read more than one way — walking versus slow running without cadence, drift on a run whose pace also changed — the page says so instead of picking one.

**Explanation lives on the back of the card.** Twenty cards each carrying a paragraph of definition is a wall of text. The front answers *what happened*; the ⓘ turns the card over for *what it means*. Nothing is lost, and the page stays readable.

**Unsettled work is opt-in.** Sections whose thresholds are still judgement calls are marked `status: "beta"` and left out by default, so the page you get first is only what the project stands behind. Turn on **Show experimental sections** in Settings to see them; they carry a Beta badge and a caveat.

**Feedback stays local.** Each card's back asks how the section is working. Answers are kept in the browser and can be copied out as Markdown to paste into an issue — there is nowhere to send them, and adding somewhere would undo the promise that your run stays on your machine.

**The weather lookup is opt-in, and rounded.** A run's conditions explain a great deal — heat drives cardiovascular drift, and a headwind shortens a stride exactly the way fatigue does — but finding them out means telling somebody else where you were and when, which is the one thing this project most wants to keep local. So it is off until you switch it on, and what goes out is a coordinate rounded to one decimal place: a cell about eleven kilometres across, coarser than the weather grid itself, so the rounding costs no accuracy at all. Your route, your file and every measurement in it stay here. The request builder is a pure function in [`src/weather/openMeteo.ts`](src/weather/openMeteo.ts) and is unit-tested to prove a precise position cannot reach the URL, because that guarantee would otherwise fail silently. Everything it produces is labelled **Estimated**: an hourly reanalysis grid several kilometres wide, measured ten metres up, knows nothing about the lane you were actually in.

**Crash reporting is the other thing that talks to a server, and it is built as an exception.** A fault on someone else's browser is otherwise invisible: the reader sees a broken page and closes the tab. So the hosted build reports crashes — behind three gates. A build with no `VITE_SENTRY_DSN` never loads the SDK at all, which covers local development and every fork. The runner can switch it off in Settings, and that takes effect immediately rather than at the next reload. And everything sent passes through [`src/observability/scrub.ts`](src/observability/scrub.ts) first.

The scrubber is the part worth reading. Map tiles are requested by z/x/y, so a breadcrumb reading `tile.openstreetmap.org/14/8210/5453.png` says where the runner was — the one thing this project most wants to keep local. Cross-origin request breadcrumbs are therefore cut back to their origin, console breadcrumbs are dropped rather than trusting that nothing ever logs a sample, query strings are stripped while the section anchor is kept, and the user object is deleted outright. The file name never goes; runners name their exports after places and people. A failed parse reports only the extension and a size bucket. Because a regression here would be silent, the scrubber is unit-tested against the shapes Sentry actually produces.

The SDK sits behind a dynamic import so its 30 kB never lands in a build that cannot use it. That opens a gap at startup — Sentry's handlers only attach at `init` — so anything thrown while the chunk is in flight is held and replayed once the client is up.

## Adding a widget

```ts
export default defineWidget<Result>({
  id: "my-widget",
  title: "…",
  description: "…",          // shown on the back of the card
  section: "pace",
  status: "beta",            // optional; omit for stable
  requiredMetrics: ["pace"],
  compute: (activity) => /* pure; null hides the widget */,
  narrate: (result, activity) => ({ information, observations, explanations, teaching }),
  View: ({ result, activity }) => /* SVG or DOM */,
});
```

Register it in `src/widgets/registry.ts`. Keeping `compute` and `narrate` pure means both are unit-testable without a DOM — see `src/widgets/render.test.tsx`, which renders every widget against the demo run and fails if any `NaN` or `undefined` reaches the reader.

## Data support

| Format | Position | Elevation | Heart rate | Cadence | Power |
|---|---|---|---|---|---|
| FIT | ✅ | ✅ | ✅ | ✅ when recorded | ✅ |
| GPX | ✅ | ✅ | ✅ Garmin extension | ✅ when recorded | ✅ Strava extension |

Sparse metrics are interpolated across gaps of up to 15 seconds; longer gaps are treated as recording interruptions rather than filled in.

## Licence

MIT.

Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
