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
 * NOTE: `runlogapp.com` is registered but email forwarding is not set up yet.
 * Until an Email Routing rule points these addresses at a real mailbox, this
 * link goes nowhere — add the route, then this works with no code change.
 */
export const CONTACT_EMAIL = "feedback@runlogapp.com";

/**
 * Where a business writes to buy one of the ad slots on the page. Separate
 * from the feedback address so the two kinds of mail can be routed to
 * different people later without touching the page. Same caveat as above:
 * dead until the domain is registered and a route forwards it somewhere.
 */
export const ADVERTISING_EMAIL = "marketing@runlogapp.com";

/** The `mailto:` a reader's mail client opens, with the subject filled in. */
export function contactHref(subject = "Run Log feedback"): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** The `mailto:` an ad slot opens, subject pre-filled so replies sort themselves. */
export function advertiseHref(subject = "Advertising on Run Log"): string {
  return `mailto:${ADVERTISING_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
