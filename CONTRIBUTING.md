# Contributing

Thanks for looking at Run Log. This page is the practical guide; the design
rationale lives in [README.md](README.md).

## Getting set up

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser, pipeline and widget tests
npm run lint
npm run build    # what CI runs; includes the TypeScript build
```

There is nothing else — no database, no API keys, no accounts. Press **Try a
demo run** for data to work against, or drop in your own `.fit`/`.gpx` file
(files left at the repository root are gitignored, so your own run cannot be
committed by accident).

## How changes land

Trunk-based development, small steps:

1. Branch off `main` (`feat/<slug>` or `fix/<slug>` — see
   [CONVENTIONS.md](CONVENTIONS.md)).
2. Open a PR with a [Conventional Commits](CONVENTIONS.md) title. CI runs
   lint, tests and the build; a workflow checks the title format.
3. PRs are squash-merged, so the PR title becomes the commit on `main`.
4. Every push to `main` deploys to the official site automatically. There is
   no staging branch — if it is on `main`, it is live.

Keep PRs small and self-contained. A PR that adds a widget and reworks the
pipeline should be two PRs.

## What to know before changing things

**The privacy model is the product.** Activity files are parsed in the
browser and never leave the machine. Anything that would send run data to a
server — including "just analytics" — is out, and the three narrow existing
network paths (opt-in crash reports, opt-in weather, opt-in translation) are
documented in the README and surfaced in Settings. New network calls need the
same treatment: off by default, listed in Settings, and carrying as little as
possible.

**Widgets follow the contract.** Information, visualisation, observation,
explanation, teaching — in that order, with explanations carrying an explicit
confidence. Read the widget contract section of the README and copy the shape
of an existing widget directory before writing a new one.

**Observations state facts; explanations guess honestly.** An `Explanation`
cannot be constructed without a confidence level, on purpose. Do not smuggle
speculation into observation text.

**Tests render the real page.** `npm test` includes tests that mount widgets
against the fixture run. A new widget needs one; a bug fix needs a test that
fails without it.

## Reporting bugs

Use the bug template. The single most useful thing you can attach is an
activity file that reproduces the problem — stripped of location if you like,
`scripts/make-fixtures.mjs` shows how.
