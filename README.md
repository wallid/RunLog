<div align="center">

# Run Log

### Your run, explained.

Drop in a file from your watch and read what actually happened —
what changed, where, and what might account for it.

**[runlogapp.com](https://runlogapp.com)**

No account. No upload. Everything runs in your browser.

</div>

<div align="center">
  <img src="docs/screenshots/landing.png" alt="The Run Log landing page: a drop target for a FIT or GPX file, beside a button that opens a demo run" width="900">
</div>

---

Most running apps show you totals and charts, then leave you to work out what
they mean. Run Log walks through a single run and explains what changed, where,
and what might account for it.

## What it does

For one activity file, the page answers five questions in order.

**1. What happened?** — the totals, and a run-type badge.

<img src="docs/screenshots/overview.png" alt="Run summary card showing distance, elapsed time, pace, heart rate, elevation, power, cadence and calories, with a Varied-pace run badge" width="820">

**2. Where did it happen?** — a draggable timeline and a real map, both synced
to the same cursor.

<img src="docs/screenshots/timeline.png" alt="Interactive run timeline: heart rate, pace and elevation over distance, banded by effort, with a control for adding your own events" width="820">

<img src="docs/screenshots/map.png" alt="The route drawn on an OpenStreetMap tile layer, its line coloured by heart-rate zone" width="820">

**3. Which metrics changed together?** — relationship cards showing what moved
at the same moment.

**4. What might explain the change?** — every explanation carries its
confidence, and is kept visibly separate from what was measured.

<img src="docs/screenshots/card.png" alt="Pace consistency card: figures, a dot plot of every ten seconds of running, an OBSERVED line and a POSSIBLE EXPLANATION line" width="820">

**5. What does that metric mean?** — a short teaching note, specific to this
run.

<img src="docs/screenshots/teaching.png" alt="What this run teaches: what held up, what changed, what that suggests, what is not clear, and what is worth watching next time" width="820">

A contents rail on the left tracks where you are and lets you jump straight to
a section; on narrow screens it collapses into a **Contents** button. Each card
shows only what happened — press the **ⓘ** and it turns over to reveal what the
metric means.

## The one idea

Every card separates **what your watch measured** from **what was inferred from
it**, and an inference cannot be written without stating how confident it is.
That is enforced in the types, not by style guide: an `Explanation` requires a
`confidence` of `high`, `medium` or `low`, which the page renders as *Likely
explanation*, *Possible explanation* or *Not enough data to be sure*.

Nothing is ranked or scored. A slower split is usually a hill, and a single
number would hide exactly the context this project exists to surface.

<img src="docs/screenshots/splits.png" alt="Splits listed in the order they were run rather than sorted by speed" width="820">

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser, pipeline and widget tests
npm run build    # static output in dist/
```

Drop in a `.fit` or `.gpx` file, or press **See a demo run**.

A local build sends nothing anywhere.

## Reading further

| | |
|---|---|
| [**Architecture**](docs/ARCHITECTURE.md) | How a file becomes a page: the parsers, the pipeline, the widget contract, and how to add a widget |
| [**Design decisions**](docs/DESIGN.md) | The choices with plausible alternatives, and why each went the way it did |
| [**Privacy**](docs/PRIVACY.md) | The three things that talk to a server, in full |
| [**Contributing**](CONTRIBUTING.md) | Setup and the trunk-based flow |
| [**Conventions**](CONVENTIONS.md) | Commit-message format |

## Data support

| Format | Position | Elevation | Heart rate | Cadence | Power |
|---|---|---|---|---|---|
| FIT | ✅ | ✅ | ✅ | ✅ when recorded | ✅ |
| GPX | ✅ | ✅ | ✅ Garmin extension | ✅ when recorded | ✅ Strava extension |

## Support

Run Log is free, has no account, and no plans to be anything else. If it showed
you something about your running, you can
[buy me a coffee](https://buymeacoffee.com/wallid) ☕ — it goes on the domain
and the hosting.

The site links to that page and nothing more: no embedded button, no widget
script, nothing third-party that runs before you decide to click. That is the
same rule as the rest of the page.

## Disclaimer

Run Log describes recorded data; it is not medical, coaching or training
advice. Everything on the page is read or inferred from a consumer device —
optical heart rate, modelled power, a smoothed barometric trace — and any of it
can be wrong, individually or together. The experimental sections go further
and say so on every card: they apply published research outside the conditions
it was tested under. Nothing here diagnoses, treats or prevents anything. For a
symptom, an injury, or a reading that worries you, see a qualified professional
rather than a chart. The software itself is provided as-is, without warranty of
any kind, per the licence below.

## Licence

MIT.

Map tiles © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
