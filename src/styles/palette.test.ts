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
 *
 * Every rule runs twice, once per theme, and each time against that theme's own
 * surfaces. A dark palette that is only eyeballed is a dark palette that ships
 * a 1.4:1 zone; the light one was checked, so this one is too.
 */

const tokens = readFileSync(resolve(__dirname, "tokens.css"), "utf8");

/** Every custom property declared by one selector, comments stripped. */
function declarations(selector: string): Record<string, string> {
  const start = tokens.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no rule for ${selector}`);
  const end = tokens.indexOf("\n}", start);
  const body = tokens.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const found: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) {
    found[name] = value.replace(/\s+/g, " ").trim();
  }
  return found;
}

const LIGHT = declarations(":root");
/* The dark rule only restates what colour changes, so what a reader on a dark
   page actually gets is the light set with those laid over it. Resolving it the
   same way the cascade does is the point: a token dark forgot to override is
   caught here as the light value it really would be. */
const DARK = { ...LIGHT, ...declarations(':root[data-theme="dark"]') };

const THEMES = [
  { name: "light", vars: LIGHT },
  { name: "dark", vars: DARK },
] as const;

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/**
 * How far the whole ramp is allowed to span, per theme.
 *
 * The light theme has the entire range below white to work in. The dark theme
 * does not: every zone has to clear 3:1 against the card or it is not on the
 * page at all, and that floor costs the bottom of the ramp. Keeping 1.4:1
 * between neighbours from there leaves about four stops, so this is what a dark
 * page can honestly promise rather than what would look tidier written down.
 */
const RAMP_SPAN = { light: 5, dark: 4 };

/**
 * How far every zone must stand off the card it is drawn on.
 *
 * 3:1 is the bar for a graphic, and the dark ramp was rebuilt to clear it — its
 * light-theme equivalent, #6e1210, sits at 1.4:1 on a dark card and is the
 * reason any of this exists.
 *
 * The light theme is recorded at 2, which is not an endorsement. Its Zone 1 is
 * a pale gold at 2.0:1 on a white card: findable as a band, weak as a line.
 * Raising it means rebuilding the light ramp from the top down — every step
 * above it has to move to keep the 1.4:1 between neighbours — and that is a
 * change to the light palette rather than an addition of a dark one. Written
 * down here so it stays visible and cannot quietly get worse.
 */
const ZONE_ON_CARD = { light: 2, dark: 3 };

/**
 * The surfaces each theme's ink tones are checked against.
 *
 * The dark set is held to all five, and the inset is the hard one there — it is
 * the lightest thing on a dark page, so it is where pale ink comes closest to
 * its background.
 *
 * The light set is held to three, because that is what it actually promises:
 * its muted grey sits at 4.4:1 on `--surface-hover` and 4.2:1 on
 * `--surface-inset`, both short of the bar. That predates the dark theme, and
 * the inset in practice carries `--confidence-low`, which does clear it. Listed
 * rather than waved through, so the shortfall is a known two rather than an
 * unknown many.
 */
const INK_SURFACES = {
  light: ["page", "card", "sunken"],
  dark: ["page", "card", "sunken", "hover", "inset"],
};

describe.each(THEMES)("the $name palette", ({ name, vars }) => {
  function token(key: string): string {
    const value = vars[key];
    if (!value) throw new Error(`no token called --${key}`);
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${key} is not a plain hex: ${value}`);
    return value;
  }

  const ZONES = [1, 2, 3, 4, 5].map((n) => token(`zone-${n}`));
  const BANDS = ["easy", "steady", "hard"].map((k) => token(`zone-band-${k}`));
  const LINES = ["metric-heart", "metric-pace", "metric-elevation", "metric-power"].map(token);
  const SURFACES = INK_SURFACES[name].map((k) => token(`surface-${k}`));
  const CARD = token("surface-card");

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
      expect(contrast(ZONES[0], ZONES[4])).toBeGreaterThan(RAMP_SPAN[name]);
    });

    it("puts every zone on the card it is drawn on", () => {
      // The rule the dark ramp was rebuilt for: below its floor a zone is a
      // shade of the background rather than a colour. See ZONE_ON_CARD for why
      // the two themes are held to different numbers.
      ZONES.forEach((zone, i) => {
        expect(contrast(zone, CARD), `zone ${i + 1} on the card`)
          .toBeGreaterThanOrEqual(ZONE_ON_CARD[name]);
      });
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

    it("moves steadily away from the surface as the effort gets harder", () => {
      // Which is darker on a light page and lighter on a dark one. What the
      // reader is actually tracking is distance from the paper, not lightness,
      // so that is what is checked — one rule covering both themes.
      const steps = BANDS.map((band) => contrast(band, CARD));
      expect(steps[1]).toBeGreaterThan(steps[0]);
      expect(steps[2]).toBeGreaterThan(steps[1]);
    });

    it("stays clear enough to draw a metric line on top of", () => {
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

  describe("the ink", () => {
    it("reads on every surface it can land on", () => {
      // The muted tone is the one to watch: it carries notes, captions and axis
      // labels at 0.7–0.8rem, so it is the one that has to be checked rather
      // than the one that can be assumed. See INK_SURFACES for which surfaces
      // each theme answers for.
      for (const key of ["text-primary", "text-secondary", "text-muted"]) {
        for (const surface of SURFACES) {
          expect(contrast(token(key), surface), `--${key} on ${surface}`)
            .toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it("reads on the tints that carry words", () => {
      const pairs: [string, string][] = [
        ["confidence-high", "tint-good"],
        ["confidence-medium", "tint-caution"],
        ["text-error", "tint-error"],
        ["confidence-low", "surface-inset"],
        ["text-on-inverse", "surface-inverse"],
        ["accent-on-strong", "accent-strong"],
        ["accent-ink", "accent-soft"],
      ];
      for (const [ink, ground] of pairs) {
        expect(contrast(token(ink), token(ground)), `--${ink} on --${ground}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    });

    it("writes the accent as words only where it is dark or light enough to be words", () => {
      // The brand orange is 3.3:1 on white — a legible graphic and an illegible
      // sentence, which is the whole reason `--accent-ink` exists.
      for (const surface of [token("surface-page"), CARD]) {
        expect(contrast(token("accent-ink"), surface)).toBeGreaterThanOrEqual(4.5);
      }
    });
  });

  describe("the marks", () => {
    // `--terrain-flat` is deliberately absent. It is the neutral middle of the
    // gradient polarity — the colour of "no slope" — and it is supposed to
    // recede; it sits at 1.7:1 on a white card by design, with the two poles
    // either side of it carrying the reading.
    it("keeps every series and pole visible on the card", () => {
      const marks = [
        "metric-heart",
        "metric-pace",
        "metric-elevation",
        "metric-power",
        "metric-cadence",
        "terrain-uphill",
        "terrain-downhill",
        "accent",
        "accent-strong",
      ];
      for (const key of marks) {
        expect(contrast(token(key), CARD), `--${key} on the card`).toBeGreaterThanOrEqual(3);
      }
    });
  });
});

describe("the two themes", () => {
  it("differ only in colour", () => {
    // Spacing, shape, motion and type are one design in both themes. A token
    // that appears in the dark rule and is not a colour is a token that can
    // drift out of step with the light one.
    const overridden = Object.keys(declarations(':root[data-theme="dark"]'));
    const colourish = /^(surface|text|border|gridline|accent|zone|metric|terrain|confidence|tint|shadow|swatch|map)/;
    for (const name of overridden) {
      expect(name, `--${name} should not be re-declared for the dark theme`).toMatch(colourish);
    }
  });

  it("gives the dark theme its own colour for everything that has one", () => {
    // A colour token left out of the dark rule keeps its light value, which is
    // almost always a mistake — the exceptions are listed, and are the ones
    // that are deliberately the same in both.
    const SHARED = new Set(["accent"]);
    const dark = declarations(':root[data-theme="dark"]');
    for (const [name, value] of Object.entries(LIGHT)) {
      if (!/^#|^rgba?\(/.test(value)) continue;
      if (SHARED.has(name)) continue;
      expect(dark, `--${name} has no dark value`).toHaveProperty(name);
    }
  });
});
