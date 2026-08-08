import { describe, expect, it } from "vitest";
import type { Sample } from "./activity";
import {
  FLAT_COST_J_PER_KG_M,
  MAX_MODELLED_GRADE,
  costOfRunning,
  gradeAdjustedPace,
  gradeAdjustmentOver,
  gradeFactor,
} from "./gradeAdjusted";

/**
 * A run at a constant speed over ground of a given shape.
 *
 * Distance advances by the same metre count every second, so any change in the
 * adjustment comes from the gradient and never from the pace.
 */
function ramp(seconds: number, metresPerSecond: number, gradientPct?: number): Sample[] {
  return Array.from({ length: seconds }, (_, t) => ({
    t,
    distanceM: t * metresPerSecond,
    moving: true,
    ...(gradientPct === undefined ? {} : { gradientPct }),
  }));
}

function join(...windows: Sample[][]): Sample[] {
  const out: Sample[] = [];
  for (const window of windows) {
    const t = out.length;
    const distanceM = out.length === 0 ? 0 : out[out.length - 1].distanceM;
    for (const sample of window) {
      out.push({ ...sample, t: t + sample.t, distanceM: distanceM + sample.distanceM });
    }
  }
  return out;
}

describe("costOfRunning", () => {
  it("costs 3.6 J/kg per metre on the flat", () => {
    expect(costOfRunning(0)).toBeCloseTo(3.6, 6);
    expect(FLAT_COST_J_PER_KG_M).toBeCloseTo(3.6, 6);
  });

  it("rises without interruption as the ground tilts up", () => {
    for (let i = 0; i < 0.4; i += 0.02) {
      expect(costOfRunning(i + 0.02)).toBeGreaterThan(costOfRunning(i));
    }
  });

  it("is cheapest on a moderate descent, not the steepest one", () => {
    // The curve bottoms out around −20%: below that, braking starts costing
    // more than the drop saves. A card that assumed downhill was monotonically
    // cheaper would credit steep descents with a level pace they never earned.
    const gentle = costOfRunning(-0.2);
    expect(gentle).toBeLessThan(costOfRunning(-0.05));
    expect(gentle).toBeLessThan(costOfRunning(-0.35));
  });

  it("clamps rather than extrapolating past the measured range", () => {
    expect(costOfRunning(0.8)).toBe(costOfRunning(MAX_MODELLED_GRADE));
    expect(costOfRunning(-0.8)).toBe(costOfRunning(-MAX_MODELLED_GRADE));
  });
});

describe("gradeFactor", () => {
  it("leaves level ground alone", () => {
    expect(gradeFactor(0)).toBeCloseTo(1, 10);
  });

  it("takes a percentage, not a fraction", () => {
    // A 5% climb, not a 500% one. Passing the fraction by mistake would clamp
    // and silently return the same number for every gentle gradient.
    expect(gradeFactor(5)).toBeCloseTo(costOfRunning(0.05) / 3.6, 10);
    expect(gradeFactor(5)).toBeGreaterThan(1.2);
    expect(gradeFactor(5)).toBeLessThan(1.5);
  });

  it("has no answer where there is no gradient", () => {
    expect(gradeFactor(undefined)).toBeUndefined();
    expect(gradeFactor(NaN)).toBeUndefined();
  });
});

describe("gradeAdjustedPace", () => {
  it("reports a climb as the quicker level pace it was worth", () => {
    const adjusted = gradeAdjustedPace(360, 5);
    expect(adjusted).toBeDefined();
    expect(adjusted!).toBeLessThan(360);
  });

  it("reports a gentle descent as the slower level pace it was worth", () => {
    expect(gradeAdjustedPace(360, -5)!).toBeGreaterThan(360);
  });

  it("declines when either half of the pair is missing", () => {
    expect(gradeAdjustedPace(undefined, 5)).toBeUndefined();
    expect(gradeAdjustedPace(360, undefined)).toBeUndefined();
  });
});

describe("gradeAdjustmentOver", () => {
  it("finds no adjustment to make on level ground", () => {
    const adjustment = gradeAdjustmentOver(ramp(120, 3, 0));
    expect(adjustment).toBeDefined();
    expect(adjustment!.factor).toBeCloseTo(1, 10);
    expect(adjustment!.coverage).toBe(1);
  });

  it("charges for a loop that ends where it started", () => {
    // Up and back down to the same height is not level ground: the climb costs
    // more than the matching descent saves. This is the property that makes an
    // adjusted pace worth showing on a loop route at all.
    const adjustment = gradeAdjustmentOver(join(ramp(100, 3, 5), ramp(100, 3, -5)));
    expect(adjustment!.factor).toBeGreaterThan(1);
    expect(adjustment!.flatEquivalentDistanceM).toBeGreaterThan(
      adjustment!.actualDistanceM,
    );
  });

  it("refuses a stretch whose gradient is mostly unknown", () => {
    const known = ramp(30, 3, 5);
    const unknown = ramp(120, 3);
    expect(gradeAdjustmentOver(join(known, unknown))).toBeUndefined();
  });

  it("reports partial coverage it was still willing to use", () => {
    const adjustment = gradeAdjustmentOver(join(ramp(180, 3, 5), ramp(20, 3)));
    expect(adjustment).toBeDefined();
    expect(adjustment!.coverage).toBeGreaterThan(0.8);
    expect(adjustment!.coverage).toBeLessThan(1);
  });

  it("ignores the distance across a gap in the samples", () => {
    const contiguous = ramp(60, 3, 5);
    const gapped = [...ramp(30, 3, 5), ...ramp(30, 3, 5).map((s) => ({
      ...s,
      t: s.t + 200,
      distanceM: s.distanceM + 90,
    }))];
    // The jump between the two halves covered ground at an unknown gradient, so
    // it is left out of both distances rather than credited to the last one.
    expect(gradeAdjustmentOver(gapped)!.actualDistanceM).toBeLessThan(
      gradeAdjustmentOver(contiguous)!.actualDistanceM,
    );
  });

  it("has no answer for a stretch that covered no ground", () => {
    const standing = Array.from({ length: 60 }, (_, t) => ({
      t,
      distanceM: 100,
      moving: false,
      gradientPct: 0,
    }));
    expect(gradeAdjustmentOver(standing)).toBeUndefined();
  });
});
