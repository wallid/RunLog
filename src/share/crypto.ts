/**
 * The lock on a shared run, and where its key is kept.
 *
 * Sharing a run means putting it on a server, which is the one thing the rest
 * of this project exists not to do. What makes it tolerable is that the server
 * is given something it cannot read: the run is encrypted in the runner's own
 * browser, and the key never reaches the server at all.
 *
 * The key travels in the link's **fragment** — the part after the `#`. Browsers
 * do not send fragments in HTTP requests. That is not a convention or a
 * courtesy; it is in the definition of a request line, and it is why this
 * works: the server can hand out the bytes to anyone who asks for that id and
 * still be unable to say what run they describe.
 *
 * What that buys, precisely:
 *
 * - The host of this site cannot read a shared run. Neither can anyone who
 *   later gets at the storage bucket.
 * - Anyone holding the whole link can. A link is a bearer token — forwarded,
 *   pasted into a group chat, or sitting in someone's browser history, it works
 *   for whoever has it. Sharing is publishing to an unknown audience, and no
 *   amount of cryptography changes that.
 *
 * The second point is the one worth being loud about, because the first can
 * make a reader feel safer than they are. It is said plainly in the share
 * dialog rather than only here.
 *
 * AES-GCM with a 256-bit key and a fresh 96-bit nonce per share. GCM is
 * authenticated, so a payload altered in storage or in flight fails to open
 * rather than opening as something else. The nonce is generated per encryption
 * and never reused, which is the one way GCM can be catastrophically misused;
 * since every share makes a brand new key as well, a repeat would need both
 * `getRandomValues` calls to collide at once.
 */

const ALGORITHM = "AES-GCM";
const KEY_BITS = 256;
/** 96 bits, the size AES-GCM is defined and fastest for. */
const NONCE_BYTES = 12;

/**
 * Base64 as a URL is allowed to spell it: `-` and `_` instead of `+` and `/`,
 * and no `=` padding.
 *
 * The key ends up in a fragment that people paste into chat windows, so a
 * character that some client decides to escape would silently break the link.
 */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array | null {
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    // Not base64 at all: a truncated link, or one a chat client mangled.
    return null;
  }
}

/** Whether this browser can encrypt at all. An insecure origin cannot. */
export function cryptoAvailable(): boolean {
  return typeof crypto !== "undefined" && crypto.subtle !== undefined;
}

/** A fresh key for one share. Never derived from anything, never reused. */
export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ALGORITHM, length: KEY_BITS }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64Url(new Uint8Array(raw));
}

/** Reads a key out of a link. Null for anything that is not one. */
export async function importKey(encoded: string): Promise<CryptoKey | null> {
  const bytes = fromBase64Url(encoded);
  if (!bytes || bytes.length !== KEY_BITS / 8) return null;
  try {
    return await crypto.subtle.importKey(
      "raw",
      // `bytes.buffer` may be a view into a larger buffer; slice to be exact.
      bytes.slice().buffer,
      { name: ALGORITHM },
      false,
      ["decrypt"],
    );
  } catch {
    return null;
  }
}

/**
 * Encrypts, with the nonce written in front of the ciphertext.
 *
 * Keeping them together means there is one opaque blob to store and one to
 * fetch — the nonce is not a secret, and a nonce stored separately from what it
 * belongs to is a nonce that eventually gets paired with the wrong payload.
 */
export async function seal(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: nonce },
    key,
    plaintext.slice().buffer,
  );
  const out = new Uint8Array(NONCE_BYTES + ciphertext.byteLength);
  out.set(nonce, 0);
  out.set(new Uint8Array(ciphertext), NONCE_BYTES);
  return out;
}

/**
 * Decrypts a blob written by `seal`. Null when it will not open.
 *
 * Null covers a wrong key, a truncated download and a payload somebody edited,
 * and it deliberately does not distinguish them: to the reader they are all
 * "this link does not work", and to anyone probing the endpoint the difference
 * between "wrong key" and "corrupt" is the only thing worth learning.
 */
export async function open(
  key: CryptoKey,
  sealed: Uint8Array,
): Promise<Uint8Array | null> {
  if (sealed.length <= NONCE_BYTES) return null;
  const nonce = sealed.slice(0, NONCE_BYTES);
  const ciphertext = sealed.slice(NONCE_BYTES);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: nonce },
      key,
      ciphertext.buffer,
    );
    return new Uint8Array(plaintext);
  } catch {
    return null;
  }
}

/**
 * The secret that proves a share is yours to withdraw.
 *
 * Kept in this browser and sent only when withdrawing. It is not the encryption
 * key: the key is in the link, so anyone the link reached would otherwise be
 * able to delete the share as well as read it.
 */
export function generateRevocationToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}
