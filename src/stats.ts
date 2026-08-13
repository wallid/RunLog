/**
 * The one number the server knows.
 *
 * Runs never leave the browser, so the server cannot count them — visits are
 * the only usage figure this project can honestly hold. The landing page
 * reports itself to `/api/stats` once per browser and shows the tally that
 * comes back. The report is an empty POST: no id, no file, no timings —
 * nothing the request for the page itself did not already carry.
 *
 * Once per browser, not per visit, so a regular cannot inflate the number by
 * coming back — which means it counts people (roughly) rather than visits,
 * and underestimates at that. Where the count cannot be fetched at all — the
 * dev server has no functions, an extension may block the call — the page
 * shows no number rather than a made-up one.
 */

const ENDPOINT = "/api/stats";

/** Set once this browser has been counted, so it never counts twice. */
const COUNTED_KEY = "runlog.visitCounted";

function alreadyCounted(): boolean {
  try {
    return localStorage.getItem(COUNTED_KEY) !== null;
  } catch {
    // Storage disabled: this browser counts on every visit, which overstates
    // people the way a newspaper counts readers. Tolerable, and rare.
    return false;
  }
}

function markCounted(): void {
  try {
    localStorage.setItem(COUNTED_KEY, "1");
  } catch {
    // See above — without storage the flag simply does not stick.
  }
}

/** The count out of a response, or null for anything that is not a count. */
async function readCount(response: Response): Promise<number | null> {
  if (!response.ok) return null;
  try {
    const data = (await response.json()) as { visits?: unknown };
    const visits = data.visits;
    return typeof visits === "number" && Number.isFinite(visits) && visits >= 0
      ? Math.floor(visits)
      : null;
  } catch {
    // The dev server answers this path with the page itself; not a count.
    return null;
  }
}

/**
 * The one report this page makes, shared by everything that shows the figure.
 *
 * Two places print the count now — the badge in the header and the strip at
 * the foot — and a first visit that asked twice would race its own localStorage
 * flag and count itself twice. So the call is made once per page load and both
 * readers await the same promise. It is never cleared: a second answer would
 * differ from the first only by other people's visits, and a number that ticks
 * while you read the page it is on looks like a thing being faked.
 */
let reported: Promise<number | null> | null = null;

/**
 * Counts this browser in if it has not been counted, and returns the total.
 * Null means the number is unknowable right now, and the caller should show
 * nothing rather than something.
 */
export function countVisit(): Promise<number | null> {
  reported ??= report();
  return reported;
}

async function report(): Promise<number | null> {
  try {
    if (alreadyCounted()) {
      return await readCount(await fetch(ENDPOINT));
    }
    const visits = await readCount(await fetch(ENDPOINT, { method: "POST" }));
    if (visits !== null) markCounted();
    return visits;
  } catch {
    return null;
  }
}
