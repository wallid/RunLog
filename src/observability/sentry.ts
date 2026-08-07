/**
 * Crash reporting.
 *
 * Run Log's promise is that a runner's activity file never leaves their
 * machine, and crash reporting is the one thing on the page that talks to a
 * server at all. So it is built to send the least it can while still being
 * useful: a stack trace, the browser, the release — and nothing that describes
 * the run.
 *
 * Three gates stand between an error and Sentry:
 *
 *   1. No DSN, no SDK. A build without `VITE_SENTRY_DSN` never loads the client
 *      chunk and makes no request — the case for local development and for
 *      anyone who forks the project.
 *   2. The runner can turn it off in Settings, and the choice is remembered.
 *   3. Everything that does get sent goes through `scrub` first.
 *
 * The SDK is behind a dynamic import so its weight sits in a chunk that a build
 * without a DSN never fetches. The cost is a short window at startup before the
 * chunk arrives, which `bufferEarlyErrors` covers by holding anything thrown in
 * the meantime and replaying it once the client is up.
 */

type Client = typeof import("./client");

const DSN = import.meta.env.VITE_SENTRY_DSN;

/** Whether this build has crash reporting compiled in at all. */
export const CRASH_REPORTING_AVAILABLE = Boolean(DSN);

/**
 * Tracing is off unless a build asks for it. Every map pan issues tile
 * requests, so instrumenting fetch would bury the signal in tile spans.
 */
const TRACES_SAMPLE_RATE = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0);

let enabled = true;
let loading: Promise<Client | null> | null = null;
let early: unknown[] | null = null;

/**
 * Starts the SDK, unless this build has no DSN or the runner has opted out.
 * Safe to call more than once; the client is only ever created once.
 */
export function initSentry(optedIn: boolean): void {
  enabled = optedIn;
  if (optedIn) void load();
}

/** Applies the runner's choice immediately rather than at the next reload. */
export function setCrashReportsEnabled(optedIn: boolean): void {
  if (optedIn) initSentry(true);
  enabled = optedIn;
}

/** Reports an error caught by the boundary, with the React component stack. */
export function captureRenderError(error: unknown, componentStack?: string): void {
  send(error, {
    tags: { failure: "render" },
    context: componentStack ? { componentStack } : undefined,
  });
}

/**
 * Reports a file that could not be read.
 *
 * This is the one deliberate signal the project asks for: a format it claims to
 * support but failed on is a bug, and without a report it is invisible — the
 * runner sees a message and moves on. Only the shape of the file is sent. The
 * name is not, because runners name their exports after places and people.
 */
export function reportParseFailure(
  error: unknown,
  detail: { format: string; bytes: number },
): void {
  send(error, {
    tags: { failure: "parse", format: detail.format },
    // Bucketed, because an exact byte count is a weak fingerprint of a file.
    context: { sizeBucket: sizeBucket(detail.bytes) },
  });
}

function send(
  error: unknown,
  detail: { tags: Record<string, string>; context?: Record<string, unknown> },
): void {
  if (!enabled) return;
  void load().then((client) => {
    // The opt-out may have been chosen while the chunk was in flight.
    if (client && enabled) client.report(error, detail);
  });
}

function load(): Promise<Client | null> {
  if (!DSN) return Promise.resolve(null);
  if (!loading) {
    bufferEarlyErrors();
    loading = import("./client").then((client) => {
      client.start({
        dsn: DSN,
        release: import.meta.env.VITE_SENTRY_RELEASE,
        environment: import.meta.env.MODE,
        tracesSampleRate: TRACES_SAMPLE_RATE,
        isEnabled: () => enabled,
      });
      flushEarlyErrors(client);
      return client;
    });
  }
  return loading;
}

/**
 * Holds anything thrown before the SDK chunk arrives.
 *
 * Sentry's own handlers only attach at `init`, so without this the first few
 * hundred milliseconds — exactly where a bad build fails — would be a blind
 * spot that the dynamic import introduced.
 */
function bufferEarlyErrors(): void {
  if (typeof window === "undefined" || early) return;
  const held: unknown[] = [];
  early = held;
  const remember = (value: unknown) => {
    // Once the client is up it has its own handlers, and a page failing in a
    // loop should not be held in memory.
    if (early === held && held.length < 5) held.push(value);
  };
  window.addEventListener("error", (event) => remember(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => remember(event.reason));
}

function flushEarlyErrors(client: Client): void {
  const held = early;
  early = null;
  if (!held || !enabled) return;
  for (const value of held) {
    client.report(value, { tags: { failure: "startup" } });
  }
}

/** Buckets, because an exact size would tell a truncated file from a whole one
 * — and also tell one runner's file from another's. */
function sizeBucket(bytes: number): string {
  if (bytes < 1024) return "<1 KB";
  const kb = bytes / 1024;
  if (kb < 100) return "1-100 KB";
  if (kb < 1024) return "100 KB-1 MB";
  return ">1 MB";
}
