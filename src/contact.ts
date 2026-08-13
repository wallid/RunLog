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
 * Where the mail lands is a dashboard setting, so it can be moved without a
 * deploy — which is the whole reason the page publishes the project address
 * rather than the destination.
 *
 * NOT DELIVERING YET (checked 2026-08-13): the zone publishes no MX record —
 * `dig MX runlogapp.com @lucy.ns.cloudflare.com` answers authoritatively with
 * nothing — so mail to these addresses bounces at the sender. Cloudflare Email
 * Routing adds the three `route*.mx.cloudflare.net` records and an SPF TXT
 * when it is switched on for the zone and the destination address has been
 * verified; until those show up in DNS, a routing rule on its own delivers
 * nothing. No code change is needed when it starts working — only this note.
 */
export const CONTACT_EMAIL = "feedback@runlogapp.com";

/**
 * Where a business writes to buy one of the ad slots on the page. Separate
 * from the feedback address so the two kinds of mail can be routed to
 * different people later without touching the page — the routing rule is per
 * address, so splitting them is a dashboard change and not a code change.
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

/**
 * The body of the testimonial mail, written out for the sender.
 *
 * `src/testimonials.ts` will not take a quote without the runner's own words,
 * their permission, and the credit they chose, so the mail that collects one
 * asks for exactly those three and nothing else. Asking in the draft rather
 * than in a reply is the difference between one message and three: a quote
 * that arrives complete can go on the page the same day, and one that arrives
 * without permission cannot go anywhere.
 *
 * Blank lines are left under each prompt because a mail client shows the draft
 * with the cursor at the top, and a reader should be able to type into it
 * rather than reformat it first.
 */
const TESTIMONIAL_TEMPLATE = [
  "What Run Log showed you, in your own words — this goes on the page exactly",
  "as you write it, so say it however you say it:",
  "",
  "",
  "Happy for it to be quoted publicly? (yes / no)",
  "",
  "",
  "How would you like to be credited? A first name, a handle, or something",
  'like "a marathoner from Beirut" — your choice, and nothing else is shown:',
  "",
  "",
].join("\n");

/**
 * The `mailto:` the "send yours" control opens: the feedback address, a
 * subject that sorts these out of the rest of the mail, and the template.
 */
export function testimonialHref(): string {
  const subject = encodeURIComponent("A quote for the Run Log page");
  const body = encodeURIComponent(TESTIMONIAL_TEMPLATE);
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}
