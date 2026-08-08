# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

**Events the runner adds themselves.** A watch records what happened; only the
runner knows why. Under the interactive timeline there is now a short editor for
marking what the file could not: a gel, a drink, food, a salt tab, a cramp, a
niggle, an energy dip, a stop to fix a shoe. Open the form and tap the timeline
where it happened, or type the distance; each event carries an optional note.
They are drawn as dashed markers on the timeline, the pace story and the heart
rate chart, and kept in this browser under `runlog.annotations`, keyed by the
run — so the same file opened next month still has them on it. Nothing is sent
anywhere, and storage is validated rather than trusted: an entry that is not a
kind this build knows is dropped on read rather than repaired, because a
repaired guess would sit on the page claiming the runner said it.

The catalogue is one list in `src/model/annotations.ts`, and what makes a kind
analysable is a window on its own entry rather than a branch in the code.

**Fuelling pattern, a new card in *Synthesis*.** Where the *Event impact* card
below it asks whether a particular gel did anything — the hard question, and the
one a single run answers worst — this one asks the easy and more useful one: was
there a plan, and did it hold. It reports when the fuel went in, the typical gap
between one and the next, the longest stretch without any and where it fell, and
how far the run carried on after the last of it. All of it is counting and
subtraction over what the reader typed, so it works on a run of any length and
has nothing to be uncertain about.

The one thing it refuses to do is convert events into grams. A gel is commonly
twenty to twenty-five grams of carbohydrate, brands vary by a factor of two, and
"drink" covers both water and a bottle carrying more than a gel does — so
turning five events into a figure per hour would mean inventing the number that
matters most and setting it in the same type as the ones that were measured. The
spacing is reported exactly and the amount is left to the reader. On a run under
about ninety minutes the card also declines to measure the spacing against
anything, because that is roughly where fuelling starts to change anything at
all.

**Event impact, a new beta card in *Synthesis*.** For every fuelling event
marked on a run, it reads the stretch where that form of carbohydrate would be
expected to act — five to fifteen minutes after a gel, sooner after a drink,
notably later after food — and compares it with the five minutes before. Pace
has the gradient taken out of it wherever the run recorded enough elevation to
do so, and both windows are read the same way or neither is, so a hill is never
reported as an effect of the gel. It refuses more than it reports: a window with
under two minutes of running in it, a difference smaller than the sensors' own
noise, a kind with no honest window to look in. A cramp or a shoe stop is marked
on the charts and left out of the card entirely rather than scored. Its
confidence never rises above medium, and the card says why in as many words —
one run has no control group, and a decision to push, a hill ending or simply
feeling better produce exactly this pattern.

**A disclaimer, everywhere the page could read as advice.** The cards describe
what a watch recorded and what can be inferred from it, and several of those
inferences are about a runner's body — which is description, not diagnosis, and
the difference is now stated rather than assumed. One sentence lives in
`src/disclaimer.ts` and is printed in the run page's footer, at the foot of the
landing page below the proof strip, and in the README alongside the licence:
Run Log is not medical, coaching or training advice, every figure comes from a
consumer device and can be wrong, and a symptom or a worrying reading belongs
with a qualified professional rather than a chart. Sharing the one constant
keeps the two screens from drifting into saying different things.

**A proof strip at the foot of the landing page.** Below the fold — the screen
above it still fits without a scrollbar — the page now says how many browsers
have opened Run Log, and holds a place for what runners say about it. The count
comes from the project's first and only piece of server code: a visit counter
in `functions/api/stats.ts`, backed by a KV namespace, incremented once per
browser by an empty POST that carries nothing the page request itself did not.
Runs still never leave the visitor's machine, and the strip says so in the same
breath as the number: visits are labelled as visits, and "one run per visit" is
stated as the assumption it is. The testimonials list (`src/testimonials.ts`)
ships empty, and the section admits that rather than papering over it — the
rule in the file is verbatim words, with permission, credited however the
runner asked. Until then the strip asks, pointing at the feedback address.

**Pace with the hills taken out.** A new card at the end of *Terrain* puts every
kilometre back on flat ground: each split's pace divided by what its own ground
was worth, drawn as the distance between where the kilometre was run and where
it belongs. On a route with a climb in it this routinely reverses the order — the
kilometre that looked slowest on the clock is often the one run hardest, and the
fastest one was a descent.

The conversion is the energy cost of covering a metre at a gradient, measured on
a treadmill from −45% to +45% by Minetti and colleagues in 2002 and fitted as a
curve. It is marked **estimated** for two reasons: it is a model, and it is
being fed a gradient the watch inferred from a smoothed barometric trace. Two
things it deliberately does not claim — that a descent is free, since the curve
turns back upward past about −20% where braking starts costing more than the
drop saves, and that it says anything about damage. It equalises what a
kilometre cost, not what it did to the legs.

The same figure now reaches the kilometre splits list, in brackets beside the
splits the ground actually moved, and the splits card will name the kilometre
run hardest where that is not the fastest one. Both stay silent on flat ground:
the card declines a run whose climbs and descents came to nothing rather than
reporting an adjustment of a second or two as a finding.

**Follow the run: the map and the timeline as one control.** A new card in *The
run* puts the route and a scrubbable chart on the same card, joined by the
cursor the page already shares. Dragging the chart walks a marker along the
route; the ground already covered stays lit in its effort colours while the rest
of the route falls back to a faint line, so the run reads as something being
travelled rather than something drawn. Play does the walking, taking about
twenty-four seconds whatever the run lasted, which is the only way to watch
where it climbed and where it slowed as a single motion.

The chart under the map is the timeline card's, not a reduction of it: heart
rate, pace and elevation on one horizontal position, over the effort shading,
with the same shared readout above. That is the point of joining the two — a
climb in the north-east corner is a fact about the route, and a climb the heart
rate answered is a fact about the run, and neither card alone could say they
were the same hill. The existing route and timeline cards are unchanged and
still stand on their own.

**Zone colours you can actually tell apart.** The five heart-rate zones were a
single-hue orange ramp ordered by lightness, and the numbers were bad: touching
zones sat 1.27:1 apart, and the pale wash behind the charts stepped by 1.08:1 —
a reader could see the shading change without being able to say which way it
had gone. The ramp is now gold through orange to deep red, so hue carries which
of the three intensities a zone belongs to while lightness still carries the
order: 1 and 2 are gold, 3 orange, 4 and 5 red. Neighbours clear 1.4:1, the ends
of the ramp clear 5:1, and every pair beats the old ramp's best for red-green
colour blindness.

The background wash behind a chart went from five steps to three — easy, steady
and hard, the grouping the zones fall into either side of the two thresholds.
That was not a simplification for its own sake: a wash pale enough to keep the
line drawn on top of it legible has room for about three distinguishable steps,
and five of them in that space is what produced 1.08:1. Three get the whole
range each and land 1.18:1 and 1.28:1 apart. So the background now answers "how
hard", the line colour answers "which zone", and every key says both — "Zone 4 ·
Hard", "Easy · Zones 1–2". `src/styles/palette.test.ts` holds the ramp to all of
these numbers, including that a metric line stays at 2.3:1 over the darkest
wash, so the next nicer-looking orange has to earn its place.

**A language setting, translated by Google.** Settings now opens with
**Language**: fifty options, each named in its own script before its English
name, because a list that only says "Arabic" in English is a list for people who
can already read the page. Choosing one translates everything through Google's
website translator and persists, so the next visit — including the upload
screen — opens in that language. Picking English again restores the page in
place.

It is off until chosen and loads nothing before then: no script tag in the HTML,
no cookie, no request. The browser's own language preference is used to *offer*
a switch, never to make one. What goes to Google when a language is picked is
the visible text of the page, including the run's name and the figures written
into sentences; the activity file never leaves the browser, and Settings says so
next to the control rather than in a policy. The README's count of things that
talk to a server has gone from two to three accordingly.

The switch is driven through the widget's own control instead of reloading with
a cookie set, because the run only exists in memory and a reload would discard
it. `removeChild` and `insertBefore` are patched to survive the text nodes
Google merges and replaces, which would otherwise unmount the React tree and
cost the reader the run they had open; the patch is applied on the first switch
only. Google's banner, tooltip and phrase highlights are suppressed, along with
the inline `top` it sets on the body, which slides a sticky masthead off screen.

**Motion, tied to reading rather than to loading.** Cards, section headers and
everything drawn inside them arrive as the reader scrolls to them, once, and
never replay. Charts on a track are uncovered left to right — the direction the
run was made in — the split bars fill in the order the kilometres were run, the
activity strip fills block by block, and trend lines draw themselves along their
own length. Each mark is drawn along the quantity it encodes, so the movement
says what the mark says. A hairline on the masthead reports how far through the
story the reader is.

Every duration and easing comes from four tokens in `tokens.css`, and the whole
lot collapses to nothing under `prefers-reduced-motion`, delays included. Where
there is no `IntersectionObserver`, the page arrives fully drawn: motion is an
enhancement here and the content is never allowed to depend on it.

**A key on every chart that uses colour.** Colour was carrying meaning in a
dozen widgets with nothing to read it against — the activity strip, the route,
the splits, the shaded bands behind the heart-rate and elevation lines. Each of
those now names what its colour encodes and lists only the values it actually
drew. Reference lines and single-colour lines are keyed in the shape they are
drawn in, so a dashed run-average rule is a dashed swatch rather than a
sentence underneath. Ordered scales with no named steps — pace on the strip and
on the map — get a joined ramp labelled at its ends with real paces instead of
"darker is faster".

The activity strip also stops drawing "stopped" and "no reading" in the same
near-invisible grey; they are separate greys with separate entries in the key.
A test names the widgets required to carry one, so a new chart cannot ship
without it.

**A page that works on a phone and with a keyboard.** The masthead publishes
its real height instead of asserting a fixed one, so a contents link on a
narrow screen no longer lands behind a header that has wrapped to three rows.
A skip link comes first in the tab order, because the masthead and the rail are
otherwise twenty-odd stops before a word of the run. The page is sized in
`dvh`, so it is not taller than the screen the moment it loads on a phone.

Touch targets are raised to 44px wherever the pointer is actually coarse,
including the contents panel, which is the only way to navigate twenty cards on
a phone. Marks inside a chart are exempt and say why: a block in the activity
strip is eight pixels wide because it is one of ninety along the run, so it
grows in height instead, and the timeline offers the same navigation at full
width. That strip is also one tab stop now rather than ninety — the arrow keys
walk along the run inside it.

Scatter plots scroll below 420px instead of scaling down, which was rendering
their axis labels at four and a half pixels inside a card on a phone. The map
stops swallowing the page scroll on touch. Split rows cap their last column so
a long detail line wraps rather than pushing the row past the viewport.

### Changed

**The export guide now says what you end up holding, not just which button to
press.** "Where is your run?" answered half the question: it named a click path
and stopped. But a run exported as GPX from one app and as FIT from another are
not the same run here — half the widgets need heart rate, and a widget whose
metrics are missing is not rendered at all. Each route now leads with what comes
across, listing route, pace, heart rate, cadence and power, with the ones the
format drops struck through rather than quietly omitted, so two routes can be
compared on what they cost.

Where an app offers more than one export, the fuller one is listed first and the
panel carries a tab strip. Strava's entry has changed most: it used to send
everyone to **Export GPX**, and now sends them to **Export Original** — the file
the watch actually wrote, laps and pauses intact — with GPX named as the
fallback for runs recorded in the Strava app, which have no original to give.
Its second tab is the full archive, which holds the originals for everything
ever uploaded. Garmin and Coros point at the FIT file for the same reason. Apple
now states plainly that its export carries the track but no heart rate, since
Apple files that separately from the route, and points at Strava or Garmin when
the same run is on one of them.

**The landing screen is three columns, and the guide is one of them.** The guide
hung off the bottom of the upload column, which made a screen sized to fit into
a screen that scrolled — and left the section that solves the hardest step of
getting started reading as a footnote to the step after it. A reader arrives
holding one of three things: interest, a file, or a file they cannot lay hands
on. Those are the pitch, the drop card and the guide, and above 1180px they now
sit side by side as peers. Nothing was dropped to make room: the hero widens
from 62rem to 72rem, the sources stack as a list down their own column, and the
panel opens in the flow using space the taller columns were already spending, so
the page is no longer than it was.

Below that the hero falls to two columns with the guide as its own grid row
under the upload, and to a single stack on a phone. In the two-column layout the
panel is anchored to the chip row and floats over the page. It used to hold a
strip of empty space open so that choosing a source never shifted the cards
above it; that worked, but spent four rems on the panel's usual state, which is
closed. Anchoring costs nothing closed and displaces nothing open, and dismisses
on Escape or a click outside. Where it is in the flow, a reserve under the chips
does the same job for free, because that column is the shortest on the screen
whichever source is open.

**Contrast, measured rather than assumed.** `--text-muted` carried notes,
captions and axis labels at 3.0:1, which is under the 4.5:1 that body text has
to clear; it is now the lightest grey that passes on all four surfaces. Links
were the brand orange at 3.3:1 — a legible graphic and an illegible sentence —
and are now `--accent-ink`. Two tokens are new, `--accent-strong` and
`--accent-strong-hover`, for the case of white text on an accent button, which
also failed. None of this is a second brand colour: it is the same hue at the
contrast each job needs, and `--accent` itself is untouched for the route line,
the progress hairline and the focus ring, where 3.3:1 is the right bar.

Forced-colours mode keeps the data painted — a legend swatch and a bar fill are
information, not decoration — and gives cards a real border, since shadows do
not render there.

### Removed

**The per-card feedback control and the feedback panel.** Ratings and notes were
kept in the browser and copied out as Markdown by hand. In practice that is a
form which collects opinions it has nowhere to send, on every one of twenty
cards. The footer now carries an email address instead. Anything previously
stored under `runlog.feedback` is deleted on the first load after this change,
rather than left sitting in storage that nothing will ever open again.

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
  hand. There is nowhere to send it. *(Removed in Unreleased — see above.)*

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
