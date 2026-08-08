import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import type { DerivedActivity } from "@/model/activity";
import type { RunAnnotation } from "@/model/annotations";
import { buildActivity } from "@/model/pipeline";
import fuellingPattern from ".";
import { FUELLING_EXPECTED_S } from "./pattern";

/**
 * The fuelling spacing, on runs long enough for it to be a question.
 *
 * Unlike the impact card next to it there is nothing here to be uncertain
 * about, so the tests are mostly arithmetic — and the two things that are
 * judgements rather than sums: which events count as fuel, and when the card
 * stops measuring a run against expectations it is too short to have.
 */

const SPEED_MPS = 3.0;

/** A metronome at three metres a second, for the given number of seconds. */
function steadyRun(durationS: number): DerivedActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  for (let t = 0; t <= durationS; t++) {
    samples.push({
      time: new Date(start.getTime() + t * 1000),
      distanceM: t * SPEED_MPS,
      elevationM: 100,
      speedMps: SPEED_MPS,
      hrBpm: 150,
    });
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

function annotate(
  activity: DerivedActivity,
  entries: { t: number; kind: string }[],
): DerivedActivity {
  const annotations: RunAnnotation[] = entries.map((entry, index) => ({
    id: `a${index}`,
    t: entry.t,
    kind: entry.kind,
    createdAt: "2026-05-02T09:00:00.000Z",
  }));
  return { ...activity, annotations };
}

/** Three hours, which is past the point where fuelling is expected. */
const MARATHON_S = 3 * 3600;

describe("the spacing it reports", () => {
  it("measures the gaps, the opening and the closing", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 1800, kind: "gel" }, // 30 min
      { t: 3600, kind: "gel" }, // 60 min
      { t: 7200, kind: "gel" }, // 120 min — the long one
    ]);

    const result = fuellingPattern.compute(activity)!;
    expect(result.events).toHaveLength(3);
    expect(result.intervals.map((i) => i.durationS)).toEqual([1800, 3600]);
    expect(result.medianGapS).toBe(2700);
    expect(result.longest!.durationS).toBe(3600);
    expect(result.openingS).toBe(1800);
    // The run runs an hour past the last gel.
    expect(result.closingS).toBe(MARATHON_S - 7200);
  });

  it("counts events an hour off the clock, not off moving time", () => {
    const activity = annotate(steadyRun(3600), [
      { t: 900, kind: "gel" },
      { t: 2700, kind: "gel" },
    ]);
    expect(fuellingPattern.compute(activity)!.perHour).toBeCloseTo(2, 1);
  });

  it("puts the events in order however they were added", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 7200, kind: "gel" },
      { t: 1800, kind: "drink" },
    ]);
    expect(fuellingPattern.compute(activity)!.events.map((e) => e.t)).toEqual([
      1800, 7200,
    ]);
  });
});

describe("what counts as fuel", () => {
  it("takes every nutrition kind, including the ones no card scores", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 1800, kind: "gel" },
      { t: 3600, kind: "drink" },
      { t: 5400, kind: "food" },
      { t: 7200, kind: "salt" },
    ]);
    expect(fuellingPattern.compute(activity)!.events).toHaveLength(4);
  });

  it("leaves out a cramp, a niggle and a shoe stop", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 1800, kind: "gel" },
      { t: 3600, kind: "cramp" },
      { t: 5400, kind: "kit" },
      { t: 7200, kind: "gel" },
    ]);
    const result = fuellingPattern.compute(activity)!;
    expect(result.events).toHaveLength(2);
    // The cramp between them does not break the stretch into two.
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0].durationS).toBe(5400);
  });

  it("stays off a run with nothing on it, and off one with no fuelling", () => {
    expect(fuellingPattern.compute(steadyRun(MARATHON_S))).toBeNull();
    expect(
      fuellingPattern.compute(
        annotate(steadyRun(MARATHON_S), [{ t: 1800, kind: "cramp" }]),
      ),
    ).toBeNull();
  });
});

describe("a single event", () => {
  it("still describes it, without inventing a typical gap", () => {
    const activity = annotate(steadyRun(MARATHON_S), [{ t: 1800, kind: "gel" }]);
    const result = fuellingPattern.compute(activity)!;
    expect(result.medianGapS).toBeUndefined();
    expect(result.longest).toBeUndefined();
    expect(result.intervals).toEqual([]);

    const narration = fuellingPattern.narrate(result, activity);
    expect(narration.observations[0].text).toContain("once");
  });
});

describe("holding back on a run too short to judge", () => {
  it("says so rather than measuring a short run against a target", () => {
    const activity = annotate(steadyRun(1800), [{ t: 600, kind: "gel" }]);
    const result = fuellingPattern.compute(activity)!;
    expect(result.fuellingExpected).toBe(false);

    const text = fuellingPattern
      .narrate(result, activity)
      .explanations.map((e) => e.text)
      .join(" ");
    expect(text).toContain("shorter than the point where fuelling");
    expect(text).not.toContain("grams an hour");
  });

  it("raises the intake question only once the run is long enough", () => {
    const activity = annotate(steadyRun(FUELLING_EXPECTED_S + 600), [
      { t: 1800, kind: "gel" },
      { t: 3600, kind: "gel" },
    ]);
    const result = fuellingPattern.compute(activity)!;
    expect(result.fuellingExpected).toBe(true);

    const explanation = fuellingPattern.narrate(result, activity).explanations[0];
    expect(explanation.text).toContain("grams an hour");
    // The spacing is exact; what it implies about intake is not.
    expect(explanation.confidence).toBe("low");
  });

  it("never converts events into grams", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 1800, kind: "gel" },
      { t: 5400, kind: "gel" },
    ]);
    const narration = fuellingPattern.narrate(
      fuellingPattern.compute(activity)!,
      activity,
    );
    const prose = [
      ...narration.observations.map((o) => o.text),
      ...narration.explanations.map((e) => e.text),
    ].join(" ");
    expect(prose).not.toMatch(/\d+\s*g\b/);
    expect(prose).not.toMatch(/\d+\s*grams of carbohydrate an hour/);
  });
});

/**
 * The demo run carries no events, so this card never reaches the page-wide
 * render suite. Its view has to be exercised here or nowhere.
 */
describe("the card as drawn", () => {
  const View = fuellingPattern.View;

  it("renders the interval table on the server", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 1800, kind: "gel" },
      { t: 3600, kind: "drink" },
      { t: 7200, kind: "gel" },
    ]);
    const result = fuellingPattern.compute(activity)!;
    const markup = renderToStaticMarkup(<View result={result} activity={activity} />);

    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("undefined");
    expect(markup).toMatch(/legend|Legend/);
    // One row per stretch between two events, and the kinds are named.
    expect(markup).toContain("Gel");
    expect(markup).toContain("Drink");
    expect(markup).toContain("Longest gap");
  });

  it("renders a single event without an empty table or a phantom gap", () => {
    const activity = annotate(steadyRun(MARATHON_S), [{ t: 1800, kind: "gel" }]);
    const result = fuellingPattern.compute(activity)!;
    const markup = renderToStaticMarkup(<View result={result} activity={activity} />);

    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("Longest gap");
    expect(markup).toContain("After the last one");
  });
});

describe("the narration the page will accept", () => {
  it("writes no NaN, no undefined and nothing too short", () => {
    const activity = annotate(steadyRun(MARATHON_S), [
      { t: 1800, kind: "gel" },
      { t: 3600, kind: "drink" },
      { t: 7200, kind: "gel" },
    ]);
    const narration = fuellingPattern.narrate(
      fuellingPattern.compute(activity)!,
      activity,
    );

    const prose = [
      ...narration.information.map((s) => `${s.value} ${s.note ?? ""}`),
      ...narration.observations.map((o) => o.text),
      ...narration.explanations.map((e) => e.text),
      ...narration.teaching.map((t) => `${t.title} ${t.text}`),
    ].join(" ");

    expect(prose).not.toContain("NaN");
    expect(prose).not.toContain("undefined");
    expect(prose).not.toContain("Infinity");

    for (const explanation of narration.explanations) {
      expect(["high", "medium", "low"]).toContain(explanation.confidence);
      expect(explanation.text.length).toBeGreaterThan(15);
    }
    for (const point of narration.teaching) {
      expect(point.text.length).toBeGreaterThan(30);
    }
  });
});
