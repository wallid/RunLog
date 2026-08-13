import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialProof } from "./SocialProof";
import { DropZone } from "./DropZone";
import { TESTIMONIALS } from "@/testimonials";
import { CONTACT_EMAIL, testimonialHref } from "@/contact";

/**
 * The proof strip, checked as promises rather than markup.
 *
 * The section's whole reason to exist is social proof, which makes it the part
 * of the page most tempted to lie. What is testable is that it cannot: no
 * quote appears that is not in the testimonials file, no number appears before
 * one has been fetched, and the empty state asks for real words instead of
 * standing in for them.
 */

describe("the testimonials", () => {
  it("carry real words and a credit, or do not exist", () => {
    for (const testimonial of TESTIMONIALS) {
      expect(testimonial.quote.trim().length).toBeGreaterThan(0);
      expect(testimonial.attribution.trim().length).toBeGreaterThan(0);
    }
  });

  it("show nothing invented while the list is empty", () => {
    const markup = renderToStaticMarkup(<SocialProof />);
    if (TESTIMONIALS.length === 0) {
      expect(markup).not.toContain("<blockquote");
      // The empty state's job is to ask, so the address must be reachable.
      expect(markup).toContain(CONTACT_EMAIL);
    }
  });
});

describe("the ask", () => {
  it("offers the way to send one, whatever the list holds", () => {
    // The section may only print what arrived through this route, so the route
    // has to be on the page in both states — full as well as empty.
    const markup = renderToStaticMarkup(<SocialProof />);
    expect(markup).toContain("Send yours");
    expect(markup).toContain(CONTACT_EMAIL);
  });

  it("asks for the three things a quote cannot be published without", () => {
    // The draft carries the whole bargain: the runner's own words, their
    // permission, and the credit they chose. Drop any of them from the
    // template and the reply cannot go on the page.
    const draft = decodeURIComponent(testimonialHref());
    expect(draft).toContain("your own words");
    expect(draft).toContain("quoted publicly");
    expect(draft).toContain("credited");
  });
});

describe("the count", () => {
  it("prints no number before one has arrived", () => {
    // Static render is the pre-fetch state: the strip must hold its tongue
    // rather than showing a placeholder figure. Tags are stripped because
    // hashed class names carry digits of their own.
    const markup = renderToStaticMarkup(<SocialProof />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");
    expect(visibleText).not.toMatch(/\d/);
  });

  it("keeps the badge in the header silent until it has a figure too", () => {
    // The header is the one place the number appears without the sentence
    // qualifying it, so an empty-handed badge is the state that matters: no
    // chip, no zero, no dash — and therefore no digit in the bar.
    const markup = renderToStaticMarkup(<DropZone />);
    const bar = markup.slice(0, markup.indexOf("<main"));
    expect(bar.replace(/<[^>]*>/g, " ")).not.toMatch(/\d/);
    // And the badge, when it does arrive, points at the qualification.
    expect(markup).toContain('id="proof"');
  });
});
