import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import type { DerivedActivity } from "@/model/activity";
import type { RunAnnotation } from "@/model/annotations";
import { buildActivity } from "@/model/pipeline";
import lactateProfile from ".";
import { lactateProfile as profileOf, OBLA } from "./profile";

/**
 * The lactate card, on runs built so the answer is arithmetic.
 *
 * The card's whole job is joining a typed-in number to the running behind it,
 * so the runs here are step tests with known speeds and readings placed at the
 * end of each step. Most of the cases are refusals, because most of what this
 * card does is decline to put a pace on four millimoles.
 */

const STEP_S = 300;

/** A run at a sequence of held speeds, one step each. */
function stepTest(speedsMps: number[]): DerivedActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  let distanceM = 0;

  for (let step = 0; step < speedsMps.length; step++) {
    for (let i = 0; i < STEP_S; i++) {
      samples.push({
        time: new Date(start.getTime() + (step * STEP_S + i) * 1000),
        distanceM,
        elevationM: 100,
        speedMps: speedsMps[step],
        hrBpm: 130 + step * 8,
      });
      distanceM += speedsMps[step];
    }
  }

  const raw: RawActivity = {
    source: "fit",
    startedAt: start,
    samples,
    laps: [],
    timerEvents: [],
    warnings: [],
  };
  return buildActivity(raw);
}

/** Readings, by default one at the end of each step. */
function withReadings(
  activity: DerivedActivity,
  readings: { t: number; mmol: number; kind?: string }[],
): DerivedActivity {
  const annotations: RunAnnotation[] = readings.map((reading, index) => ({
    id: `r${index}`,
    t: reading.t,
    kind: reading.kind ?? "lactate",
    value: reading.mmol,
    createdAt: "2026-05-02T09:00:00.000Z",
  }));
  return { ...activity, annotations };
}

/** The end of each step, where a sample would be taken. */
function stepEnds(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * STEP_S);
}

/** Six rising steps, crossing 4 mmol/L between the fourth and the fifth. */
const RISING_SPEEDS = [2.6, 2.8, 3.0, 3.2, 3.4, 3.6];
const RISING_VALUES = [1.2, 1.6, 2.2, 3.2, 4.6, 6.5];

function risingTest(): DerivedActivity {
  const ends = stepEnds(RISING_SPEEDS.length);
  return withReadings(
    stepTest(RISING_SPEEDS),
    ends.map((t, index) => ({ t, mmol: RISING_VALUES[index] })),
  );
}

describe("reading each sample against the running behind it", () => {
  it("pairs every reading with the pace and heart rate of the step it ended", () => {
    const profile = profileOf(risingTest());
    expect(profile).not.toBeNull();
    expect(profile!.readings).toHaveLength(6);

    profile!.readings.forEach((reading, index) => {
      expect(reading.mmol).toBe(RISING_VALUES[index]);
      // The step's own pace, not the next step's: a sample describes what came
      // before it.
      expect(reading.paceSecPerKm).toBeCloseTo(1000 / RISING_SPEEDS[index], -0.5);
      expect(reading.hrBpm).toBeCloseTo(130 + index * 8, 0);
      expect(reading.toT).toBeLessThan(reading.t);
    });
  });

  it("names the band each reading sits in", () => {
    const profile = profileOf(risingTest());
    expect(profile!.readings.map((reading) => reading.band)).toEqual([
      "clearing",
      "clearing",
      "between",
      "between",
      "accumulating",
      "accumulating",
    ]);
  });

  it("leaves a reading without a pace when there is no running behind it", () => {
    // A reading in the first seconds of the run has nothing in its lookback.
    const activity = withReadings(stepTest([3.0, 3.0]), [{ t: 30, mmol: 1.1 }]);
    const profile = profileOf(activity);
    expect(profile!.readings[0].paceSecPerKm).toBeUndefined();
    expect(profile!.readings[0].hrBpm).toBeUndefined();
  });

  it("is not there at all on a run with no readings", () => {
    expect(profileOf(stepTest([3.0, 3.0]))).toBeNull();
    // A gel is an event, not a measurement, and belongs to the other card.
    const gels = withReadings(stepTest([3.0, 3.0]), [
      { t: 300, mmol: 3.8, kind: "gel" },
    ]);
    expect(profileOf({ ...gels, annotations: gels.annotations })).toBeNull();
  });
});

describe("putting a pace on four millimoles", () => {
  it("interpolates between the readings either side of the crossing", () => {
    const profile = profileOf(risingTest());
    const estimate = profile!.estimate;
    expect(estimate).toBeDefined();
    expect(estimate!.atMmol).toBe(OBLA);
    expect(estimate!.below.mmol).toBe(3.2);
    expect(estimate!.above.mmol).toBe(4.6);

    // (4 − 3.2) / (4.6 − 3.2) = 0.571 of the way from 312.5 to 294.1 s/km.
    expect(estimate!.paceSecPerKm).toBeGreaterThan(298);
    expect(estimate!.paceSecPerKm).toBeLessThan(306);
    expect(estimate!.hrBpm).toBeGreaterThan(154);
    expect(estimate!.hrBpm).toBeLessThan(162);
    expect(profile!.refusal).toBeUndefined();
    // Never better than medium, whatever the readings look like.
    expect(profile!.confidence).toBe("medium");
  });

  it("refuses when every reading came in under it", () => {
    const activity = withReadings(
      stepTest([2.6, 2.8, 3.0]),
      stepEnds(3).map((t, index) => ({ t, mmol: [1.1, 1.5, 2.4][index] })),
    );
    const profile = profileOf(activity);
    expect(profile!.estimate).toBeUndefined();
    expect(profile!.refusal).toContain("extrapolation");
    expect(profile!.confidence).toBe("low");
  });

  it("refuses a single reading", () => {
    const activity = withReadings(stepTest([3.0, 3.0]), [{ t: 300, mmol: 4.4 }]);
    const profile = profileOf(activity);
    expect(profile!.estimate).toBeUndefined();
    expect(profile!.refusal).toContain("not a curve");
  });

  it("refuses a crossing the pace did not rise into", () => {
    // Lactate climbs past four while the runner slows down — drift, not a
    // threshold.
    const activity = withReadings(
      stepTest([3.4, 3.2, 3.0]),
      stepEnds(3).map((t, index) => ({ t, mmol: [2.2, 3.4, 4.8][index] })),
    );
    const profile = profileOf(activity);
    expect(profile!.estimate).toBeUndefined();
    expect(profile!.refusal).toContain("without the pace rising");
  });

  it("refuses readings that cross it more than once", () => {
    const activity = withReadings(
      stepTest([3.0, 3.4, 2.8, 3.6]),
      stepEnds(4).map((t, index) => ({ t, mmol: [2.0, 4.4, 2.6, 5.1][index] })),
    );
    const profile = profileOf(activity);
    expect(profile!.estimate).toBeUndefined();
    expect(profile!.refusal).toContain("more than once");
  });
});

describe("a stretch held with lactate flat across it", () => {
  it("finds one, and reports the pace it was held at", () => {
    const activity = withReadings(stepTest([3.0, 3.0, 3.0, 3.0, 3.0, 3.0]), [
      { t: 600, mmol: 2.6 },
      { t: 1500, mmol: 2.9 },
    ]);
    const profile = profileOf(activity);
    expect(profile!.steady).toBeDefined();
    expect(profile!.steady!.durationS).toBe(900);
    expect(profile!.steady!.riseMmol).toBeCloseTo(0.3, 5);
    expect(profile!.steady!.paceSecPerKm).toBeCloseTo(1000 / 3.0, -0.5);
  });

  it("does not call a rise of more than a millimole steady", () => {
    const activity = withReadings(stepTest([3.0, 3.0, 3.0, 3.0, 3.0, 3.0]), [
      { t: 600, mmol: 2.6 },
      { t: 1500, mmol: 4.2 },
    ]);
    expect(profileOf(activity)!.steady).toBeUndefined();
  });

  it("does not call two different paces a held one", () => {
    const activity = withReadings(stepTest([2.6, 2.6, 2.6, 3.4, 3.4, 3.4]), [
      { t: 600, mmol: 2.6 },
      { t: 1700, mmol: 3.2 },
    ]);
    expect(profileOf(activity)!.steady).toBeUndefined();
  });

  it("does not call a few minutes apart a steady state", () => {
    const activity = withReadings(stepTest([3.0, 3.0, 3.0]), [
      { t: 400, mmol: 2.6 },
      { t: 700, mmol: 2.7 },
    ]);
    expect(profileOf(activity)!.steady).toBeUndefined();
  });
});

describe("the card itself", () => {
  it("says what it found without claiming the fixed figure is the runner's", () => {
    const activity = risingTest();
    const result = lactateProfile.compute(activity);
    expect(result).not.toBeNull();

    const narration = lactateProfile.narrate(result!, activity);
    expect(narration.information[0]).toEqual({ label: "Readings", value: "6" });
    expect(narration.information[1].value).toBe("1.2–6.5 mmol/L");
    expect(narration.observations).toHaveLength(6);

    const said = narration.explanations.map((entry) => entry.text).join(" ");
    expect(said).toContain("not your threshold");
    expect(narration.explanations.every((entry) => entry.confidence !== "high")).toBe(
      true,
    );
  });

  it("says why it has no figure when it refuses one", () => {
    const activity = withReadings(stepTest([3.0, 3.0]), [{ t: 300, mmol: 2.2 }]);
    const result = lactateProfile.compute(activity);
    const narration = lactateProfile.narrate(result!, activity);
    expect(narration.explanations[0].text).toContain("not a curve");
  });

  it("draws the readings, the curve and the crossing", () => {
    const { View } = lactateProfile;
    const activity = risingTest();
    const result = lactateProfile.compute(activity)!;
    const markup = renderToStaticMarkup(<View result={result} activity={activity} />);

    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("undefined");
    // A row per reading, the curve, and the interpolated figure.
    expect(markup).toContain("6.5 mmol/L");
    expect(markup).toContain("Accumulating");
    expect(markup).toContain("Lactate (mmol/L)");
    expect(markup).toContain(`Crossing ${OBLA} mmol/L`);
  });

  it("draws no curve when the readings were not taken at rising paces", () => {
    const { View } = lactateProfile;
    // Three readings, but the pace wandered rather than stepped up.
    const activity = withReadings(
      stepTest([3.0, 2.7, 3.1]),
      stepEnds(3).map((t, index) => ({ t, mmol: [2.0, 2.4, 3.1][index] })),
    );
    const result = lactateProfile.compute(activity)!;
    expect(result.incremental).toBe(false);

    const markup = renderToStaticMarkup(<View result={result} activity={activity} />);
    expect(markup).not.toContain("Lactate (mmol/L)");
    expect(markup).toContain("No curve is drawn here");
  });

  it("draws a single reading without a curve or a crossing", () => {
    const { View } = lactateProfile;
    const activity = withReadings(stepTest([3.0, 3.0]), [{ t: 400, mmol: 2.2 }]);
    const result = lactateProfile.compute(activity)!;
    const markup = renderToStaticMarkup(<View result={result} activity={activity} />);

    expect(markup).not.toContain("NaN");
    expect(markup).toContain("2.2 mmol/L");
    // Two points would draw a straight line and imply the running between them
    // had been measured; one point would not even do that.
    expect(markup).not.toContain("Lactate (mmol/L)");
    expect(markup).not.toContain("Crossing");
  });

  it("draws a reading with no running behind it without inventing a pace", () => {
    const { View } = lactateProfile;
    const activity = withReadings(stepTest([3.0, 3.0]), [{ t: 20, mmol: 1.1 }]);
    const result = lactateProfile.compute(activity)!;
    const markup = renderToStaticMarkup(<View result={result} activity={activity} />);

    expect(markup).not.toContain("NaN");
    expect(markup).toContain("—");
  });
});
