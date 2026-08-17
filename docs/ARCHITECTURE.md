# Architecture

How a file becomes a page, and where to put a change.

## The shape of it

```
src/
├── parsers/          FIT + GPX → RawActivity
│   ├── fit/          hand-rolled FIT 2.0 decoder (no dependency)
│   └── gpx/          DOMParser, Garmin + Strava extension dialects
├── model/
│   ├── activity.ts   the source-independent model every widget reads
│   ├── zones.ts      heart-rate zones from a configurable maximum
│   └── pipeline/     normalise → derive → split → detect events → rank moments
├── state/            small Zustand stores (activity, selection, settings)
├── observability/    the error boundary and the page it shows
├── shell/            masthead, contents rail, scroll-spy
├── share/            encrypt → upload → link, and the card image
├── tour/             the first-run walkthrough: steps, spotlight geometry
├── viz/              Track primitive, SVG shapes, scales
└── widgets/          one directory per widget: compute, narrate, view

functions/            Pages Functions — the only code that runs on a server
├── api/stats.ts      the visit counter
├── api/share/        create, fetch and withdraw a shared run
└── s/[id].ts         the page a share link lands on
server/share.ts       helpers both share handlers use (outside functions/ so
                      Pages does not turn it into a route)
```

**Parsing is not the widgets' problem.** Every parser produces a `RawActivity`;
the pipeline turns that into a `DerivedActivity` on a uniform
one-sample-per-second grid. Widgets never see a file format, so adding TCX
support means adding one parser file and nothing else.

**One shared cursor.** Selection state lives in elapsed seconds — the one axis
all data shares. Dragging the timeline, clicking a split, or selecting a zone
bubble all write to the same store, and every widget subscribes only to the
slice it paints.

**One widget list.** `buildWidgets()` decides what the run supports, and both
the page and the contents rail render from that same list — so the navigation
can never offer a link to a section that was not built.

**A share carries the recording, not the conclusions.** `src/share/document.ts`
packs the `RawActivity` — the samples as the watch recorded them — plus the
runner's own events and, if they looked it up, the weather. The page opening the
link runs the ordinary pipeline over it. That is the same choice the run library
makes and it buys the same three things: a payload a fraction of the size, a
link shared today that reads with next year's analysis, and exactly one code
path from samples to a page, so a shared run cannot drift into rendering
differently from the same run opened off disk.

The series is columnar and fixed-point before it is gzipped
(`src/share/codec.ts`), which is what keeps a marathon inside a couple of
hundred kilobytes. It is then encrypted, and only then uploaded: ciphertext does
not compress, so the order is not negotiable.

**The server cannot read a share.** The key is generated per share, lives in the
link's fragment, and is never sent anywhere — see `src/share/crypto.ts` for what
that does and does not buy. The two handlers under `functions/api/share/` never
parse a payload and could not; they check a size, count the request against a
daily allowance, and move bytes. Storage is R2 rather than the KV namespace the
visit counter uses, because KV's free tier is 1,000 writes a day *in total* and
the counter already spends from it.

## The widget contract

Every widget follows the same five-part structure, and the order never changes:

| Part | Purpose |
|---|---|
| **Information** | The important values, without overwhelming |
| **Visualisation** | The metric in a form that makes its pattern readable |
| **Observation** | What happened, stated factually |
| **Explanation** | Why it might have happened, with an explicit confidence |
| **Teaching** | What the metric means |

Observations and explanations are separate types in the code, not a stylistic
distinction — an `Explanation` cannot be constructed without a `confidence` of
`high`, `medium` or `low`, which the UI renders as *Likely explanation*,
*Possible explanation* or *Not enough data to be sure*.

Widgets declare the metrics they need:

```ts
requiredMetrics: ["heartRate", "hrZone"]
```

A widget whose metrics are missing is not rendered at all, so a run recorded
without cadence simply has no cadence section rather than an empty one. A
widget can also return `null` from `compute` when the data exists but has
nothing worth saying.

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

Register it in `src/widgets/registry.ts`. Keeping `compute` and `narrate` pure
means both are unit-testable without a DOM — see `src/widgets/render.test.tsx`,
which renders every widget against the demo run and fails if any `NaN` or
`undefined` reaches the reader.

## The FIT decoder

FIT files are self-describing: every data message is preceded by a definition
declaring each field's number, size and base type. That lets a decoder
interpret only the fields it needs while still skipping everything else
byte-correctly — including developer fields it has never seen. The decoder
handles compressed-timestamp headers, both endiannesses, invalid-value
sentinels and chained files in about 300 lines, with no dependency.

## Data support

| Format | Position | Elevation | Heart rate | Cadence | Power |
|---|---|---|---|---|---|
| FIT | ✅ | ✅ | ✅ | ✅ when recorded | ✅ |
| GPX | ✅ | ✅ | ✅ Garmin extension | ✅ when recorded | ✅ Strava extension |

Sparse metrics are interpolated across gaps of up to 15 seconds; longer gaps
are treated as recording interruptions rather than filled in.

## Fixtures carry a real run, moved

The demo and the test fixtures are a genuine recording — real heart rate,
cadence, power and elevation — with the location taken out of it.
[`scripts/make-fixtures.mjs`](../scripts/make-fixtures.mjs) converts the track
to metres from its own centre and re-projects it in Richmond Park, so every
distance, gradient and pace survives exactly while the place does not. Invented
physiology looks invented, and a generated run has no story to find; this one
has a real cadence drop in its third kilometre, which is the sort of thing the
page exists to notice.

The shape of the route and the elevation profile are still real, so this is a
large reduction in what is disclosed rather than anonymity. Activity files left
at the repository root are gitignored, so your own run cannot be committed by
accident. See [`fixtures/README.md`](../fixtures/README.md).

## Screenshots

The pictures in the README are captured from the real build by
[`scripts/screenshots.mjs`](../scripts/screenshots.mjs):

```bash
npm run screenshots
```

It builds, serves `dist/`, opens the demo run in Chromium and photographs
named sections by their anchor. Anchors are widget ids, so a renamed widget
fails the script loudly rather than quietly capturing the wrong card.
