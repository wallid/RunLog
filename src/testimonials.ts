/**
 * What runners have said about Run Log, verbatim and with permission.
 *
 * The list ships empty, and the section it feeds says so out loud — on a page
 * whose cards separate measured from inferred, an invented quote would be the
 * one claim with no provenance at all. So the rule for adding to this file:
 * the words are the runner's own, they agreed to be quoted, and the
 * attribution is whatever they asked to be called (a first name, a handle,
 * "a marathoner from Beirut" — their choice). Nothing else qualifies.
 *
 * Quotes arrive through the feedback address in `src/contact.ts`.
 */

export type Testimonial = {
  /** The runner's words, uncut. Trimming for length is fine; rewording is not. */
  quote: string;
  /** How the runner asked to be credited. */
  attribution: string;
};

export const TESTIMONIALS: Testimonial[] = [];
