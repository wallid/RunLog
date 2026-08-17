/**
 * The parts of the sharing endpoint that both handlers need.
 *
 * This lives outside `functions/` on purpose. Pages turns every file under that
 * directory into a route, and a module of helpers answering requests at
 * `/api/share/shared` would be a route nobody meant to publish.
 *
 * ## What this server knows
 *
 * Almost nothing, and that is the design rather than an accident. A share
 * arrives as a sealed blob whose key never left the sharer's browser (see
 * `src/share/crypto.ts`), so what is stored here is bytes that cannot be turned
 * back into a run by anyone holding them — including whoever runs this site.
 * The handlers below never parse the body, never look inside it, and could not
 * if they wanted to.
 *
 * What is unavoidably known is what any HTTP server knows: that a request
 * happened, and roughly how big it was. The one piece of that deliberately kept
 * is a per-day counter used to stop the endpoint being free file hosting, and
 * it is keyed by a hash of the address and the date rather than by the address,
 * so it cannot be read back into a list of who shared what.
 *
 * Bindings are hand-written interfaces rather than `@cloudflare/workers-types`,
 * matching `functions/api/stats.ts`: these two handlers use four methods
 * between them, and a type dependency for four methods is not worth the
 * install.
 */

/** The slice of R2 used here. */
export interface ShareBucket {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { customMetadata?: Record<string, string>; httpMetadata?: Record<string, string> },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream;
    size: number;
    customMetadata?: Record<string, string>;
  } | null>;
  delete(key: string): Promise<void>;
}

export interface Env {
  SHARES: ShareBucket;
}

/**
 * The ceiling on one share, matching `MAX_SEALED_BYTES` in the client.
 *
 * Enforced here as well as there because the client's copy is advice to a
 * runner and this one is the actual limit — anything can POST to this endpoint,
 * not only the page.
 */
export const MAX_SEALED_BYTES = 2 * 1024 * 1024;

/**
 * Shares one connection may create in a day.
 *
 * Set where a person sharing every run of a heavy week never notices it and a
 * script filling the bucket gives up quickly. It is not a security boundary —
 * addresses are cheap — it is the difference between an accident costing an
 * afternoon and costing the free tier.
 */
export const SHARES_PER_DAY = 25;

/** Where payloads and counters live inside the one bucket. */
const PAYLOAD_PREFIX = "share/";
const RATE_PREFIX = "rate/";

export function payloadKey(id: string): string {
  return `${PAYLOAD_PREFIX}${id}`;
}

/**
 * Base64url over random bytes.
 *
 * Ids are 16 bytes — 128 bits — because they are the only thing standing
 * between a stranger and the *existence* of a share. Guessing one gets them
 * ciphertext they still cannot read, but an id short enough to enumerate would
 * let somebody count how many runs have been shared, and there is no reason to
 * offer that.
 */
export function newShareId(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(16)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Ids as the client spells them; anything else is not a share to look for. */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isShareId(value: string): boolean {
  return ID_PATTERN.test(value);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The stored form of a revocation token.
 *
 * Hashed for the same reason a password is: the token is what proves a share is
 * yours to withdraw, and a bucket full of live tokens would be a bucket full of
 * other people's delete buttons.
 */
export function hashToken(token: string): Promise<string> {
  return sha256Hex(`runlog-share-token:${token}`);
}

/**
 * Compares two hex digests without leaking where they first differ.
 *
 * The timing signal from an early `return false` is small and awkward to
 * exploit across a network, and writing the comparison this way costs one loop
 * — so this is cheap insurance rather than a considered risk.
 */
export function digestsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

/** UTC day, so the window rolls at the same instant everywhere. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Counts one share against the caller's daily allowance.
 *
 * Returns false when they are over it. Read-then-write without a lock, exactly
 * like the visit counter, and undercounting for the same reason: two requests
 * at the same instant can both see the old number. That makes the limit
 * approximate in the generous direction, which is the right way for a limit
 * that exists to catch scripts rather than to ration people.
 *
 * The key is a hash of the address *and* the day, so yesterday's counters
 * cannot be joined to today's, and no key here can be turned back into an
 * address.
 */
export async function withinRateLimit(bucket: ShareBucket, address: string): Promise<boolean> {
  const day = today();
  const key = `${RATE_PREFIX}${day}/${await sha256Hex(`${day}:${address}`)}`;

  let used = 0;
  try {
    const existing = await bucket.get(key);
    if (existing) {
      const parsed = Number.parseInt(await new Response(existing.body).text(), 10);
      if (Number.isFinite(parsed) && parsed > 0) used = parsed;
    }
  } catch {
    // A counter that cannot be read is treated as unused. Failing open on the
    // rate limit is the right way round: a storage hiccup should not stop
    // someone sharing their run.
    used = 0;
  }

  if (used >= SHARES_PER_DAY) return false;

  try {
    await bucket.put(key, String(used + 1), {
      // Read by the lifecycle rule that sweeps these up; see docs/PRIVACY.md.
      customMetadata: { day },
    });
  } catch {
    // Same reasoning as above.
  }
  return true;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function problem(status: number, message: string): Response {
  return json({ error: message }, status);
}
