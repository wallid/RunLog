# What stays here, and what does not

Your activity file is read in the browser and never uploaded. Nothing about a
run is sent anywhere by default.

Exactly two things talk to a server, both narrow, both listed in Settings, and
both off until you switch them on. This document is the long version of that
list.

Crash reporting used to be a third, and the only one that was on by default.
It has been removed outright — no SDK, no DSN, no switch, nothing to consent
to. A fault is now seen only by the person it happens to, which costs the
project the one signal it had about breakage on other people's browsers, and
that is the trade.

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

## Map tiles

The map is drawn from OpenStreetMap tiles, fetched by tile coordinate — a
request to a third party which implies roughly where the run was. It is not
opt-in: a run that carries a position renders its map, and the tiles load with
it. This is the one disclosure on the list that the reader is not asked about
first, and it is here rather than in the count above because it follows from
drawing a map at all.

## Everything else

Nothing. There is no analytics script, no tag manager, no error reporter and no
build-time configuration that could switch one on: the app reads nothing from
the environment. A local build and the hosted one make exactly the same
requests.
