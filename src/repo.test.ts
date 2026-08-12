import { describe, expect, it } from "vitest";
import { STARS_SHOWN_FROM, formatStars, starsWorthShowing } from "./repo";

describe("whether the count is worth printing", () => {
  it("says no when the build could not reach GitHub", () => {
    expect(starsWorthShowing(null)).toBe(false);
  });

  it("says no to a figure that argues against the project", () => {
    expect(starsWorthShowing(0)).toBe(false);
    expect(starsWorthShowing(STARS_SHOWN_FROM - 1)).toBe(false);
  });

  it("says yes once there are enough of them", () => {
    expect(starsWorthShowing(STARS_SHOWN_FROM)).toBe(true);
    expect(starsWorthShowing(4_200)).toBe(true);
  });
});

describe("formatting the count for a badge", () => {
  it("prints small numbers whole", () => {
    expect(formatStars(0)).toBe("0");
    expect(formatStars(12)).toBe("12");
    expect(formatStars(999)).toBe("999");
  });

  it("switches to thousands at a thousand", () => {
    expect(formatStars(1_000)).toBe("1K");
    expect(formatStars(1_200)).toBe("1.2K");
    expect(formatStars(123_500)).toBe("123.5K");
  });

  it("drops a trailing zero rather than printing it", () => {
    expect(formatStars(2_000)).toBe("2K");
    expect(formatStars(2_040)).toBe("2K");
  });

  it("rounds up rather than truncating, so 1,999 is not 1.9K", () => {
    expect(formatStars(1_999)).toBe("2K");
  });

  it("switches again at a million", () => {
    expect(formatStars(1_000_000)).toBe("1M");
    expect(formatStars(2_500_000)).toBe("2.5M");
  });
});

/**
 * The count is baked in at build time and is `null` under test by design — see
 * the `define` in vite.config.ts. This pins that, because a test run that
 * started reaching api.github.com would be a real regression.
 */
describe("the build-time constant", () => {
  it("is absent under test rather than fetched", async () => {
    const { STARS } = await import("./repo");
    expect(STARS).toBeNull();
  });
});
