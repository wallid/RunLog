import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The colour rules the tokens are supposed to keep.
 *
 * These are not taste. Each one is a number the zone ramp failed on before it
 * was rebuilt — neighbouring zones a reader could not separate, and a
 * background wash whose five steps were 1.08:1 apart. Writing them down here
 * means the next person to reach for a nicer orange finds out immediately if
 * it costs a runner the ability to tell Zone 2 from Zone 4.
 */

const tokens = readFileSync(resolve(__dirname, "tokens.css"), "utf8");

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i").exec(tokens);
  if (!match) throw new Error(`no token called --${name}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const ZONES = [1, 2, 3, 4, 5].map((n) => token(`zone-${n}`));
const BANDS = ["easy", "steady", "hard"].map((name) => token(`zone-band-${name}`));
const LINES = ["metric-heart", "metric-pace", "metric-elevation", "metric-power"].map(token);

describe("the zone ramp", () => {
  it("keeps neighbouring zones apart", () => {
    for (let i = 0; i < ZONES.length - 1; i++) {
      // The old single-hue ramp bottomed out at 1.27:1 here.
      expect(contrast(ZONES[i], ZONES[i + 1]), `zone ${i + 1} against zone ${i + 2}`)
        .toBeGreaterThanOrEqual(1.4);
    }
  });

  it("still rises in one direction, so the order survives without colour", () => {
    const lightness = ZONES.map(luminance);
    for (let i = 0; i < lightness.length - 1; i++) {
      expect(lightness[i], `zone ${i + 1} should be lighter than zone ${i + 2}`)
        .toBeGreaterThan(lightness[i + 1]);
    }
  });

  it("separates the ends far enough to read across the whole ramp", () => {
    expect(contrast(ZONES[0], ZONES[4])).toBeGreaterThan(5);
  });
});

describe("the effort washes", () => {
  it("comes in three, because five could not be told apart", () => {
    expect(BANDS).toHaveLength(3);
    expect(tokens).not.toMatch(/--zone-\d-soft/);
  });

  it("steps far enough that a reader can see which is which", () => {
    for (let i = 0; i < BANDS.length - 1; i++) {
      // Nearly double the 1.08–1.12:1 the five-step washes managed.
      expect(contrast(BANDS[i], BANDS[i + 1])).toBeGreaterThanOrEqual(1.15);
    }
  });

  it("gets darker as the effort gets harder", () => {
    const lightness = BANDS.map(luminance);
    expect(lightness[0]).toBeGreaterThan(lightness[1]);
    expect(lightness[1]).toBeGreaterThan(lightness[2]);
  });

  it("stays light enough to draw a metric line on top of", () => {
    for (const line of LINES) {
      for (const band of BANDS) {
        // The washes are backgrounds for the timeline and flythrough charts. A
        // wash that swallows the line it sits behind has cost more than it
        // gained; 2.3:1 is where the old ramp already was at its darkest.
        expect(contrast(line, band), `${line} on ${band}`).toBeGreaterThanOrEqual(2.3);
      }
    }
  });

  it("carries body text, since labels sit on the washes too", () => {
    for (const band of BANDS) {
      expect(contrast(token("text-primary"), band)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
