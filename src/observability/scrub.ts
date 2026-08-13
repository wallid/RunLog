import type { Breadcrumb, ErrorEvent } from "@sentry/react";

/**
 * What is removed from a crash report before it is sent.
 *
 * This is the whole privacy guarantee of crash reporting, and it fails
 * silently: a regression sends more than it should without anything visibly
 * breaking. It lives in its own module, free of the SDK, so it can be tested
 * directly and so both the lazily-loaded client and this test import the same
 * code rather than a copy.
 *
 * The rules are not boilerplate. Map tiles are requested by z/x/y, so a
 * breadcrumb reading `tile.openstreetmap.org/14/8210/5453.png` is a description
 * of where the runner was — the one piece of data this project most wants to
 * keep local.
 */

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.server_name;

  if (event.request) {
    // A query string is the only part of the address the app does not control.
    // The fragment is kept: it is a section anchor, and knowing which card was
    // on screen when something broke is exactly the useful part.
    event.request = { url: withoutQuery(event.request.url) };
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((crumb): crumb is Breadcrumb => crumb !== null);
  }

  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  // Anything the app logged could carry a sample, a pace or a place name.
  if (breadcrumb.category === "console") return null;

  // Sentry types breadcrumb data as `any`; taking it as `unknown` means the
  // guard below is what proves it is a URL, rather than a type nobody checked.
  const url: unknown = breadcrumb.data?.url;
  if (typeof url === "string") {
    breadcrumb.data = { ...breadcrumb.data, url: safeUrl(url) };
  }

  const { from, to } = breadcrumb.data ?? {};
  if (typeof from === "string") breadcrumb.data!.from = withoutQuery(from);
  if (typeof to === "string") breadcrumb.data!.to = withoutQuery(to);

  return breadcrumb;
}

/**
 * Keeps a same-origin path in full and reduces a third-party one to its host.
 *
 * `tile.openstreetmap.org/14/8210/5453.png` locates the runner to a few hundred
 * metres; `tile.openstreetmap.org` says only that the map was loading.
 */
function safeUrl(url: string): string {
  const parsed = parse(url);
  if (!parsed) return "";
  if (typeof location !== "undefined" && parsed.origin === location.origin) {
    return withoutQuery(url);
  }
  return parsed.origin;
}

function withoutQuery(url: string | undefined): string {
  if (!url) return "";
  const parsed = parse(url);
  if (!parsed) return url.split("?")[0];
  return `${parsed.origin}${parsed.pathname}${parsed.hash}`;
}

function parse(url: string): URL | null {
  try {
    const base = typeof location === "undefined" ? "http://localhost" : location.href;
    return new URL(url, base);
  } catch {
    return null;
  }
}
