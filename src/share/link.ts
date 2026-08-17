/**
 * The shape of a share link, and how the page recognises one.
 *
 * ```
 * https://runlogapp.com/s/7Qk2xN4vAe0Bd9Lm#k=nR7…kQ
 * └──────── the part the server sees ─────┘└─ the part it never does ─┘
 * ```
 *
 * The id addresses an encrypted blob; the fragment carries the key that opens
 * it. Splitting them this way is the whole privacy argument for the feature
 * (set out in `crypto.ts`), so the two halves are assembled and taken apart
 * here rather than by string handling scattered around the app — a single
 * `?k=` typed where a `#k=` was meant would put the key in the server's logs
 * and nothing would visibly break.
 *
 * The path is `/s/…` rather than a query on the front page because it is a
 * page in its own right: it can carry its own link preview, and it reads as a
 * permanent address rather than as the app in an unusual state.
 */

/** The path prefix a share lives under. */
export const SHARE_PATH = "/s/";

/** The fragment parameter holding the key. */
const KEY_PARAM = "k";

/**
 * Ids are made by the server from random bytes and spelled in base64url, so
 * this is a shape check rather than a guess at meaning: enough to tell a share
 * link from a stray `/s/favicon.ico`, and cheap enough to run before a fetch.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isShareId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export interface ShareLink {
  id: string;
  /** The key, still encoded. Decoding it is `crypto.importKey`'s job. */
  key: string;
}

/** Builds the link to hand over. `origin` so tests need no window. */
export function shareUrl(link: ShareLink, origin: string): string {
  return `${origin}${SHARE_PATH}${link.id}#${KEY_PARAM}=${link.key}`;
}

/**
 * Reads a share out of a location, or returns null for an ordinary visit.
 *
 * Takes the two strings rather than reading `window`, because this is the one
 * function that decides whether the app is about to fetch somebody's run, and
 * that decision is worth being able to test directly.
 *
 * A path that names a share but carries no key is still a share — it is a
 * broken one, and the caller says so. Returning null there would put the reader
 * on the upload page wondering why the link did nothing.
 */
export function readShareLink(pathname: string, hash: string): ShareLink | null {
  if (!pathname.startsWith(SHARE_PATH)) return null;

  const id = decodeURIComponent(pathname.slice(SHARE_PATH.length).replace(/\/+$/, ""));
  if (!isShareId(id)) return null;

  // `URLSearchParams` over the fragment: it is the same encoding, and it
  // handles a link that has picked up a `&utm_…` on its way through a chat app.
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return { id, key: params.get(KEY_PARAM) ?? "" };
}

/**
 * Takes the share out of the address bar without reloading.
 *
 * Called once the run is open. The point is the key: leaving it in the bar
 * means it goes into the browser's history and into any screenshot of the page,
 * and the reader has already got what the link was for. The run stays on
 * screen; only the address goes back to being the app's own.
 */
export function clearShareFromAddressBar(): void {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  window.history.replaceState(null, "", "/");
}
