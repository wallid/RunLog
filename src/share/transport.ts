/**
 * Getting a share to the server and back.
 *
 * The order of operations matters and is the same in both directions:
 *
 * ```
 * document → JSON → gzip → seal → POST          (share)
 * GET → open → gunzip → JSON → document         (read)
 * ```
 *
 * Compress *then* encrypt, never the other way round. Ciphertext is
 * indistinguishable from noise and does not compress at all, so encrypting
 * first would send several hundred kilobytes where eighty would do. (The usual
 * objection to this order — that a payload's compressed size leaks something
 * about its contents — needs an attacker who can inject text into the plaintext
 * and watch the length change. Nobody can inject anything into a run.)
 *
 * The whole exchange is bytes rather than JSON: the body is a sealed blob, and
 * the server treats it as opaque because to the server it is.
 */

import { open, seal } from "./crypto";
import { readShareDocument, type ShareDocument, type SharedRun } from "./document";

const API = "/api/share";

/**
 * The most a share may weigh, after compression and encryption.
 *
 * A marathon at one sample a second with every channel recorded lands around
 * 300 KB, so this is several times the largest honest run and still small
 * enough that the endpoint is not worth anybody's while as free file hosting.
 * The server enforces the same number; this copy exists so a runner is told
 * before spending a minute uploading.
 */
export const MAX_SEALED_BYTES = 2 * 1024 * 1024;

/**
 * The first byte of the plaintext, saying how the rest is packed.
 *
 * `CompressionStream` is in every current browser but not in every browser in
 * use, and a runner on an older one should still be able to share — just less
 * efficiently. One byte makes that legible to the reader rather than something
 * to be inferred from whether a gzip header happens to parse.
 */
const FORMAT_PLAIN = 0;
const FORMAT_GZIP = 1;

function compressionAvailable(): boolean {
  return typeof CompressionStream !== "undefined";
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Runs bytes through a compression stream.
 *
 * The cast is the price of two disagreeing type definitions rather than a
 * papered-over bug: `Blob.stream()` is declared as a stream of `Uint8Array`,
 * while `CompressionStream` declares its writable side as taking `BufferSource`
 * — a wider type that `Uint8Array` satisfies. The runtime pairing is exactly
 * right; only the generics need persuading.
 */
async function through(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const source = new Blob([bytes.slice().buffer as ArrayBuffer])
    .stream() as unknown as ReadableStream<BufferSource>;
  return collect(source.pipeThrough(transform) as ReadableStream<Uint8Array>);
}

function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new CompressionStream("gzip"));
}

function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  return through(bytes, new DecompressionStream("gzip"));
}

/** A document as bytes: one format marker, then the packed JSON. */
export async function packDocument(document: ShareDocument): Promise<Uint8Array> {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const useGzip = compressionAvailable();
  const body = useGzip ? await gzip(json) : json;
  const out = new Uint8Array(1 + body.length);
  out[0] = useGzip ? FORMAT_GZIP : FORMAT_PLAIN;
  out.set(body, 1);
  return out;
}

/** The inverse. Null for anything that does not unpack into an object. */
export async function unpackDocument(bytes: Uint8Array): Promise<unknown> {
  if (bytes.length < 2) return null;
  const format = bytes[0];
  const body = bytes.slice(1);
  try {
    const json = format === FORMAT_GZIP ? await gunzip(body) : body;
    return JSON.parse(new TextDecoder().decode(json)) as unknown;
  } catch {
    // A truncated download, or a payload packed by something that is not this.
    return null;
  }
}

/** Why a share could not be made. Each maps to one sentence for the reader. */
export type ShareFailure = "too-large" | "rate-limited" | "offline" | "server";

export class ShareError extends Error {
  readonly reason: ShareFailure;

  constructor(reason: ShareFailure, message: string) {
    super(message);
    this.name = "ShareError";
    this.reason = reason;
  }
}

export interface UploadResult {
  id: string;
}

/**
 * Seals a document and puts it on the server.
 *
 * The key is the caller's, and stays the caller's: nothing in this function
 * sends it anywhere. The revocation token does go over, because the server has
 * to be able to check it later — it keeps only a hash, which is the same
 * arrangement as a password.
 */
export async function uploadShare(
  key: CryptoKey,
  document: ShareDocument,
  revocationToken: string,
): Promise<UploadResult> {
  const sealed = await seal(key, await packDocument(document));

  if (sealed.length > MAX_SEALED_BYTES) {
    throw new ShareError(
      "too-large",
      "This run is too large to share. That is unusual — if it is an ordinary run rather than a multi-day recording, it is worth reporting.",
    );
  }

  let response: Response;
  try {
    response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Share-Token": revocationToken,
      },
      body: sealed.slice().buffer as ArrayBuffer,
    });
  } catch {
    throw new ShareError(
      "offline",
      "The link could not be created — this browser could not reach the server. Your run is untouched and still here.",
    );
  }

  if (response.status === 413) {
    throw new ShareError("too-large", "This run is too large to share.");
  }
  if (response.status === 429) {
    throw new ShareError(
      "rate-limited",
      "That is a lot of links from one connection today. Try again tomorrow, or get in touch if you have a reason to need more.",
    );
  }
  if (!response.ok) {
    throw new ShareError(
      "server",
      "The link could not be created. Nothing was stored, and your run is still here.",
    );
  }

  const body = (await response.json()) as { id?: unknown };
  if (typeof body.id !== "string" || body.id.length === 0) {
    throw new ShareError("server", "The server did not return a link.");
  }
  return { id: body.id };
}

/** Why a share could not be opened. */
export type FetchFailure = "missing" | "no-key" | "unreadable" | "too-new" | "offline";

export class SharedRunError extends Error {
  readonly reason: FetchFailure;

  constructor(reason: FetchFailure, message: string) {
    super(message);
    this.name = "SharedRunError";
    this.reason = reason;
  }
}

/**
 * Fetches a shared run and opens it.
 *
 * Every failure here is one a reader can arrive at by following a link
 * somebody sent them, so each gets its own sentence rather than a generic
 * apology — "the runner withdrew this" and "your link lost its second half in
 * a chat app" call for completely different next steps.
 */
export async function fetchSharedRun(id: string, key: CryptoKey | null): Promise<SharedRun> {
  if (!key) {
    throw new SharedRunError(
      "no-key",
      "This link is missing the part that unlocks the run — the piece after the # . Some apps shorten links when they paste them; ask for the full one.",
    );
  }

  let response: Response;
  try {
    response = await fetch(`${API}/${encodeURIComponent(id)}`);
  } catch {
    throw new SharedRunError(
      "offline",
      "This browser could not reach the server to fetch the shared run.",
    );
  }

  if (response.status === 404 || response.status === 410) {
    throw new SharedRunError(
      "missing",
      "This shared run is no longer here. Whoever shared it can withdraw it at any time, and this one has been withdrawn — or the link was mistyped.",
    );
  }
  if (!response.ok) {
    throw new SharedRunError("offline", "The shared run could not be fetched.");
  }

  const sealed = new Uint8Array(await response.arrayBuffer());
  const plaintext = await open(key, sealed);
  if (!plaintext) {
    throw new SharedRunError(
      "unreadable",
      "This run could not be unlocked. The key in the link does not fit what the server has, which usually means the link was cut short somewhere along the way.",
    );
  }

  const parsed = await unpackDocument(plaintext);
  if (parsed === null) {
    throw new SharedRunError("unreadable", "This shared run could not be read.");
  }

  const shared = readShareDocument(parsed);
  if (!shared) {
    throw new SharedRunError(
      "too-new",
      "This run was shared by a newer version of Run Log than this page is running. Reloading should fetch the newer one.",
    );
  }

  return shared;
}

/** Withdraws a share. Returns false if the server declined the token. */
export async function revokeShare(id: string, revocationToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${API}/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "X-Share-Token": revocationToken },
    });
    // A share already gone is a share successfully withdrawn, as far as the
    // person pressing the button is concerned.
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}
