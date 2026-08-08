import { isRightToLeft, PAGE_LANGUAGE } from "./languages";

/**
 * Machine translation of the whole page, through Google's website widget.
 *
 * This is the one part of Run Log that hands anything about the page itself to
 * a third party, and it is built to be as narrow as that allows:
 *
 * - Nothing is requested until a language is chosen. A reader who never opens
 *   the setting never contacts Google, and no script tag sits in the HTML
 *   waiting to.
 * - What Google receives is the visible text of the page — the headings, the
 *   observations, the explanations. Those are written by this app, not by the
 *   run: the numbers in them come from the file, so a translated pace or a
 *   translated place name does travel. That is stated in Settings rather than
 *   buried here, because a consent nobody can check is not consent.
 * - The activity file is never read by the widget. It is parsed into memory and
 *   never written into the DOM in raw form.
 *
 * The widget is driven through its own hidden `<select>` rather than by
 * reloading the page with a cookie set. A reload would be simpler and is what
 * most integrations do, but it would take the reader off the run they are
 * reading: the page opens on the library rather than on whatever was last on
 * screen, so changing language would cost them their place and a re-parse.
 */

const SCRIPT_ID = "runlog-google-translate";
const CONTAINER_ID = "runlog-google-translate-element";
const CALLBACK_NAME = "__runlogGoogleTranslateInit";
const SCRIPT_SRC = `https://translate.google.com/translate_a/element.js?cb=${CALLBACK_NAME}`;

/** The cookie Google's own widget reads to decide what to translate into. */
const COOKIE_NAME = "googtrans";

/** How long to wait for Google to render its select before giving up. */
const READY_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 60;

interface TranslateElementOptions {
  pageLanguage: string;
  autoDisplay: boolean;
}

declare global {
  interface Window {
    [CALLBACK_NAME]?: () => void;
    google?: {
      translate?: {
        TranslateElement?: new (
          options: TranslateElementOptions,
          containerId: string,
        ) => unknown;
      };
    };
  }
}

export type TranslateStatus = "off" | "loading" | "on" | "failed";

/**
 * Writes the cookie Google reads on start-up.
 *
 * Only ever set as a side effect of a choice already made in Settings; it is
 * what makes the next visit open in the chosen language without a second trip
 * through the panel. Both the bare host and the dot-prefixed form are written,
 * because Google's widget looks for either and which one sticks depends on how
 * the site is served.
 */
function writeCookie(language: string | undefined): void {
  if (typeof document === "undefined") return;

  const { hostname } = window.location;
  const scopes = [""];
  // An IP address or a bare `localhost` cannot take a domain attribute, and
  // offering one gets the whole cookie rejected.
  if (hostname.includes(".") && !/^[\d.]+$/.test(hostname)) {
    scopes.push(`; domain=.${hostname}`);
  }

  for (const scope of scopes) {
    if (language === undefined) {
      document.cookie = `${COOKIE_NAME}=; path=/${scope}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    } else {
      document.cookie = `${COOKIE_NAME}=/${PAGE_LANGUAGE}/${language}; path=/${scope}`;
    }
  }
}

/**
 * The node Google renders its own controls into.
 *
 * Kept outside the React tree and off-screen. The widget is initialised once
 * for the lifetime of the page, so a container that unmounted with the Settings
 * panel would leave the widget pointing at a node that no longer exists.
 */
function ensureContainer(): HTMLElement {
  const existing = document.getElementById(CONTAINER_ID);
  if (existing) return existing;

  const container = document.createElement("div");
  container.id = CONTAINER_ID;
  // Removed from the accessibility tree and from view, but still laid out:
  // `display: none` would stop Google rendering the select at all.
  container.setAttribute("aria-hidden", "true");
  container.style.position = "absolute";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.style.clipPath = "inset(50%)";
  container.style.pointerEvents = "none";
  document.body.appendChild(container);
  return container;
}

/** Google's select, once it has rendered one. */
function combo(): HTMLSelectElement | null {
  return document.querySelector<HTMLSelectElement>(".goog-te-combo");
}

let loading: Promise<HTMLSelectElement> | null = null;

/**
 * Loads the widget, resolving once it has rendered the select we drive.
 *
 * Idempotent: a second call while the first is in flight waits on the same
 * promise, and a call after it has settled returns immediately. The promise is
 * cleared on failure so a reader who tries again after their connection comes
 * back gets a fresh attempt rather than the cached rejection.
 */
function loadWidget(): Promise<HTMLSelectElement> {
  const ready = combo();
  if (ready) return Promise.resolve(ready);
  if (loading) return loading;

  loading = new Promise<HTMLSelectElement>((resolve, reject) => {
    ensureContainer();

    window[CALLBACK_NAME] = () => {
      const TranslateElement = window.google?.translate?.TranslateElement;
      if (!TranslateElement) return;
      // `autoDisplay: false` suppresses Google's own top banner, which would
      // otherwise push the whole page down by its own height and sit above a
      // masthead that is already sticky.
      new TranslateElement(
        { pageLanguage: PAGE_LANGUAGE, autoDisplay: false },
        CONTAINER_ID,
      );
    };

    // The select appears some time after the callback runs; the widget builds
    // it asynchronously and offers no event to say when it has.
    const startedAt = performance.now();
    const poll = window.setInterval(() => {
      const select = combo();
      if (select) {
        window.clearInterval(poll);
        resolve(select);
      } else if (performance.now() - startedAt > READY_TIMEOUT_MS) {
        window.clearInterval(poll);
        reject(new Error("Google Translate did not load"));
      }
    }, POLL_INTERVAL_MS);

    if (!document.getElementById(SCRIPT_ID)) {
      const script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onerror = () => {
        window.clearInterval(poll);
        reject(new Error("Google Translate could not be reached"));
      };
      document.head.appendChild(script);
    }
  });

  loading = loading.catch((error: unknown) => {
    loading = null;
    throw error;
  });

  return loading;
}

let patchedDom = false;

/**
 * Keeps React alive once Google has rewritten the page underneath it.
 *
 * The widget does not translate in place. It replaces text nodes, and it merges
 * adjacent ones — `{formatDate(x)} · {formatTimeOfDay(x)}` is three nodes to
 * React and one to Google. When React later goes to update one of the originals
 * it asks the parent to remove a node that is no longer its child, and the
 * whole tree unmounts with `NotFoundError`. That would cost the reader the run
 * they had open, because nothing here is persisted.
 *
 * So the two calls React makes are taught to tolerate it: a node that has
 * already been taken away is treated as removed rather than as a fault. This is
 * a patch on the DOM and is not applied to anyone who has not asked to
 * translate — it runs on the first switch and never comes off, since taking it
 * off while translated text is still on the page would just reopen the hole.
 */
function surviveTranslatedTextNodes(): void {
  if (patchedDom || typeof Node === "undefined") return;
  patchedDom = true;

  const { removeChild, insertBefore } = Node.prototype;

  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  };

  Node.prototype.insertBefore = function <T extends Node>(
    node: T,
    reference: Node | null,
  ): T {
    // A reference node Google has already replaced no longer marks a position,
    // so the only sane reading left is "at the end".
    if (reference && reference.parentNode !== this) {
      return insertBefore.call(this, node, null) as T;
    }
    return insertBefore.call(this, node, reference) as T;
  };
}

/**
 * Puts the page into `language`, or back into English when it is undefined.
 *
 * Changing the select and announcing it is how the widget is asked to work
 * without a navigation. Restoring English goes through the same select with an
 * empty value, which is the widget's own "show original".
 */
export async function applyLanguage(language: string | undefined): Promise<void> {
  writeCookie(language);
  if (language !== undefined) surviveTranslatedTextNodes();

  if (language === undefined) {
    // Nothing to undo if the widget was never loaded in the first place.
    const select = combo();
    if (!select) return;
    select.value = "";
    select.dispatchEvent(new Event("change"));
    setDocumentLanguage(undefined);
    return;
  }

  const select = await loadWidget();
  select.value = language;
  select.dispatchEvent(new Event("change"));
  setDocumentLanguage(language);
}

/**
 * Tells the browser what the page now is.
 *
 * Google rewrites the text but leaves `lang` and `dir` alone, so without this a
 * screen reader keeps pronouncing translated Greek with an English voice, and
 * Arabic renders left to right in a layout built for the other direction.
 */
function setDocumentLanguage(language: string | undefined): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.lang = language ?? PAGE_LANGUAGE;
  root.dir = isRightToLeft(language) ? "rtl" : "ltr";
}

/**
 * Restores the chosen language on a fresh page.
 *
 * Called once at start-up. It contacts Google only when a language was actually
 * chosen on a previous visit, which is why the default of `undefined` costs
 * nothing: no script, no cookie, no request.
 */
export function restoreLanguage(language: string | undefined): void {
  if (language === undefined) return;
  void applyLanguage(language).catch(() => {
    // A failed translation leaves an English page, which is a working page.
    // Nothing is reported and nothing is retried: the reader is looking at the
    // setting that caused it and can try again from there.
  });
}
