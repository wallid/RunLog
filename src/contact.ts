/**
 * Where to write when something on the page is wrong or confusing.
 *
 * This is the only address the app publishes, so it lives on its own rather
 * than inline in the footer: changing where feedback goes should be one edit.
 *
 * It is a project address on the project's own domain, forwarded on from
 * there. That indirection is the point — the address can outlive whoever is
 * reading it, and the person reading it does not have their personal mailbox
 * printed at the bottom of a public page.
 *
 * NOTE: `runlog.app` is not registered yet, and the live site is on a
 * `pages.dev` subdomain, which cannot receive mail. Until the domain exists
 * and forwarding is set up, this link goes nowhere — register the domain, add
 * an email route to your own mailbox, then this works with no code change.
 */
export const CONTACT_EMAIL = "feedback@runlog.app";

/**
 * Where a business writes to buy one of the ad slots on the page. Separate
 * from the feedback address so the two kinds of mail can be routed to
 * different people later without touching the page. Same caveat as above:
 * dead until the domain is registered and a route forwards it somewhere.
 */
export const ADVERTISING_EMAIL = "marketing@runlog.app";

/** The `mailto:` a reader's mail client opens, with the subject filled in. */
export function contactHref(subject = "Run Log feedback"): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** The `mailto:` an ad slot opens, subject pre-filled so replies sort themselves. */
export function advertiseHref(subject = "Advertising on Run Log"): string {
  return `mailto:${ADVERTISING_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
