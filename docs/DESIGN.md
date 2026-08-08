# Design decisions worth knowing

Each of these was a choice with a plausible alternative. The reasoning matters
more than the rule, so it is written down rather than assumed.

**The page is an article, not a dashboard.** A warm off-white ground carries
white cards with generous corners and shadows soft enough to read as lift
rather than as a border. One accent colour does all the emphasis; everything
else is ink on paper. There is no dark mode — the design commits to a single,
open, daylight look.

**Heart-rate zones use a single-hue ramp, not a rainbow.** Zones are an
*ordered* sequence, so the order is carried by lightness rather than by hue. A
reader sees intensity rise without learning a legend, and the scale stays
readable for colourblind users. The orange ramp, the metric-identity slots and
the terrain poles were each checked with a colour-vision and contrast validator
against the card surface, not chosen by eye.

**The tour teaches the page, not the product.** On a first visit a short
walkthrough dims the page and lights up the contents rail, a section header,
and the first card's parts in turn — the figures, the observed lines, the
interpreted ones, the button that turns a card over. It is eight steps because
a reader who understands one card understands all forty. It runs once, Escape
or a click anywhere off the panel ends it, and it never comes back unless asked
for from Settings. Steps whose target the layout is not showing — the rail on a
narrow window — are passed over rather than pointed at, and
`src/tour/tour.test.tsx` renders the real page to check every step still finds
what it names.

**Type is self-hosted.** Inter is bundled at build time rather than fetched
from a CDN, so the app makes no external request other than map tiles.

**The estimated maximum heart rate is deliberately generous.** A single run
rarely reaches a runner's true ceiling, so treating the observed peak as the
maximum would push almost the whole run into Zone 5. The estimate divides the
peak by 0.94, and every zone widget states that it is a working figure until
you supply your own.

**Comparisons by terrain use the median, not the mean.** Pace over any stretch
is skewed by the seconds spent accelerating from a standstill; one slow start
is enough to make flat ground look harder than a hill.

**Nothing is ranked or scored.** Splits appear in the order they were run, not
fastest-first, and there is no overall rating. A slower split is usually a
hill, and a single number would hide exactly the context this project exists to
surface.

**Cadence is measured against the runner, not against 180.** The eleven-section
cadence chapter compares every figure to this run's own median rather than to a
target, because the right step rate depends on leg length, speed and style.
Stopped seconds are excluded throughout — a stationary watch reports a cadence
of zero, and counting that would turn every traffic light into a collapse in
rhythm.

**Uncertainty is visible.** Where a metric could be read more than one way —
walking versus slow running without cadence, drift on a run whose pace also
changed — the page says so instead of picking one.

**Explanation lives on the back of the card.** Twenty cards each carrying a
paragraph of definition is a wall of text. The front answers *what happened*;
the ⓘ turns the card over for *what it means*. Nothing is lost, and the page
stays readable.

**Unsettled work is opt-in.** Sections whose thresholds are still judgement
calls are marked `status: "beta"` and left out by default, so the page you get
first is only what the project stands behind. Turn on **Show experimental
sections** in Settings to see them; they carry a Beta badge and a caveat.

**Feedback is an email address, not a form.** There is no rating widget on the
cards and nothing stored about what you thought of them. If a section is wrong
or confusing, the footer carries an address to write to — which keeps the page
free of controls that collect opinions it has nowhere to send, and keeps the
promise that nothing about your run is sent anywhere.
