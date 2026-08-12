# What stays here, and what does not

Your activity file is read in the browser and never uploaded. Nothing about a
run is sent anywhere by default.

Exactly three things talk to a server, all narrow and all listed in Settings.
Two of them are off until you switch them on. This document is the long version
of that list.

## The library keeps files, not conclusions

What a runner actually has is an export — a Strava zip, or every route an
iPhone has recorded — and reading one run out of it meant unpacking the same
archive again on the next visit. So runs are kept in IndexedDB, and what is
kept is the original FIT or GPX exactly as it arrived.

Nothing derived: the model built from a run is a sample per second and would
dwarf the file it came from, so opening a run from the library re-parses it
rather than trusting a cached result — which also means a run kept last month
gets this month's analysis. Metadata and files live in separate object stores
because IndexedDB materialises a whole record to read any part of it; one store
would mean pulling every stored activity file into memory just to draw a list
of names. Identity is the SHA-256 of the stored bytes rather than the start
time, because re-importing the same export is the ordinary way to add the runs
recorded since last time, and only a content hash can tell that apart from four
hundred duplicates.

This is the one thing the page keeps between visits that came out of a runner's
own data, so it is built to be taken back: every row in the list removes
itself, **Remove all stored runs** in Settings removes all of them at once, and
what that deletes is this browser's copy — your own files are untouched. A
browser that refuses storage, such as a private window, is not an error case;
the library reports itself unavailable, every part of the interface that would
offer one stands down, and the page behaves exactly as it did before there was
one. Safari may evict browser storage after about seven days without a visit,
which is worth knowing and costs nothing: the library is a convenience over
files you still have.

## The weather lookup is opt-in, and rounded

A run's conditions explain a great deal — heat drives cardiovascular drift, and
a headwind shortens a stride exactly the way fatigue does — but finding them
out means telling somebody else where you were and when, which is the one thing
this project most wants to keep local.

So it is off until you switch it on, and what goes out is a coordinate rounded
to one decimal place: a cell about eleven kilometres across, coarser than the
weather grid itself, so the rounding costs no accuracy at all. Your route, your
file and every measurement in it stay here. The request builder is a pure
function in [`src/weather/openMeteo.ts`](../src/weather/openMeteo.ts) and is
unit-tested to prove a precise position cannot reach the URL, because that
guarantee would otherwise fail silently. Everything it produces is labelled
**Estimated**: an hourly reanalysis grid several kilometres wide, measured ten
metres up, knows nothing about the lane you were actually in.

## Translation is machine translation, and it says so

Fifty languages is not something one person can write and keep true. This page
argues about thresholds and confidence, and it changes every release; a
hand-maintained translation of that would be quietly wrong in most languages
within a version or two, and a wrong explanation is worse than an English one.
So **Language** in Settings hands the page to Google's website translator
instead — and the cost is stated where the choice is made rather than in a
policy nobody opens.

Nothing loads until a language is picked: there is no script tag in the HTML,
and a reader who stays in English never contacts Google at all. What goes over
when they do pick one is the visible text — the headings, the observations, the
run's own name and the figures written into sentences. The activity file is
never part of it. The switch is driven through the widget's own control rather
than by reloading with a cookie set, because the run only exists in memory and
a reload would throw it away. Google merges and replaces text nodes as it
works, which is enough to unmount a React tree mid-update, so
[`src/i18n/googleTranslate.ts`](../src/i18n/googleTranslate.ts) teaches
`removeChild` and `insertBefore` to tolerate a node that has already been taken
away — applied on the first switch and never to a reader who has not asked for
it.

## Crash reporting is the other thing that talks to a server

It is built as an exception. A fault on someone else's browser is otherwise
invisible: the reader sees a broken page and closes the tab. So the hosted
build reports crashes — behind three gates. A build with no `VITE_SENTRY_DSN`
never loads the SDK at all, which covers local development and every fork. The
runner can switch it off in Settings, and that takes effect immediately rather
than at the next reload. And everything sent passes through
[`src/observability/scrub.ts`](../src/observability/scrub.ts) first.

The scrubber is the part worth reading. Map tiles are requested by z/x/y, so a
breadcrumb reading `tile.openstreetmap.org/14/8210/5453.png` says where the
runner was — the one thing this project most wants to keep local. Cross-origin
request breadcrumbs are therefore cut back to their origin, console breadcrumbs
are dropped rather than trusting that nothing ever logs a sample, query strings
are stripped while the section anchor is kept, and the user object is deleted
outright. The file name never goes; runners name their exports after places and
people. A failed parse reports only the extension and a size bucket. Because a
regression here would be silent, the scrubber is unit-tested against the shapes
Sentry actually produces.

The SDK sits behind a dynamic import so its 30 kB never lands in a build that
cannot use it. That opens a gap at startup — Sentry's handlers only attach at
`init` — so anything thrown while the chunk is in flight is held and replayed
once the client is up.

## Map tiles

The map is drawn from OpenStreetMap tiles, fetched by tile coordinate. That is
a request to a third party which implies roughly where the run was, and it is
the reason the crash-report scrubber cuts tile URLs back to their origin. It
is not opt-in: a run that carries a position renders its map, and the tiles
load with it.

The landing page shows one of these maps too — the flythrough, drawn from the
bundled demo run — so it is worth being exact about what that does and does
not disclose. The coordinates in those tile requests are the demo run's, not
yours, and the demo's own coordinates are re-projected to Richmond Park rather
than the place it was run, which `fixtures/README.md` explains. What reaches
OpenStreetMap is your IP address and the fact that someone looked at a fixed
park in London. Nothing about you or your files is in it.

**This does mean the front page contacts a third party.** The card is mounted
when it scrolls into view rather than with the page, but at the present layout
it is about 710 px down and therefore already in view on load — measured at
390×844, 1440×900 and 1920×1080, all of which fetch tiles immediately. The
gate is worth keeping because it holds if the section ever moves further down,
but it should not be read as a promise that a visit fetches nothing: today it
does. A visit that fetches no tiles at all would need the map held behind a
press, which is a trade against showing the thing the card exists to show.

## Everything else

A local build sends nothing anywhere. Crash reporting only exists in a build
given a `VITE_SENTRY_DSN` — see `.env.example` — and without one the SDK chunk
is never even fetched.
