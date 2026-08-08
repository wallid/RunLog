import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialProof } from "./SocialProof";
import { TESTIMONIALS } from "@/testimonials";
import { CONTACT_EMAIL } from "@/contact";

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

describe("the count", () => {
  it("prints no number before one has arrived", () => {
    // Static render is the pre-fetch state: the strip must hold its tongue
    // rather than showing a placeholder figure. Tags are stripped because
    // hashed class names carry digits of their own.
    const markup = renderToStaticMarkup(<SocialProof />);
    const visibleText = markup.replace(/<[^>]*>/g, " ");
    expect(visibleText).not.toMatch(/\d/);
  });
});
