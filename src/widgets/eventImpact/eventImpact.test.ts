import { describe, expect, it } from "vitest";
import type { RawActivity, RawSample } from "@/parsers/types";
import type { DerivedActivity } from "@/model/activity";
import type { RunAnnotation } from "@/model/annotations";
import { buildActivity } from "@/model/pipeline";
import eventImpact from ".";
import { analyzeAnnotation, MIN_MOVING_S } from "./analysis";

/**
 * The before-and-after comparison, on runs built to have a known answer.
 *
 * The demo file carries no annotations, so there is nothing here the fixture
 * could exercise. Instead each case is a flat run at a steady pace with one
 * change written into it, which makes the expected difference arithmetic rather
 * than a judgement — and lets the refusals be tested, which is most of what
 * this card actually does.
 */

const BASE_SPEED_MPS = 3.0;

interface RunOptions {
  durationS: number;
  /** Metres per second at a given second; the default is a metronome. */
  speedAt?: (t: number) => number;
  hrAt?: (t: number) => number;
  /** Seconds the runner spent standing still. */
  stoppedBetween?: { from: number; to: number };
  /** Rises the ground by this fraction after the given second. */
  climbAfter?: { t: number; gradient: number };
}

function flatRun(options: RunOptions): DerivedActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  let distanceM = 0;
  let elevationM = 100;

  for (let t = 0; t <= options.durationS; t++) {
    const stopped =
      options.stoppedBetween !== undefined &&
      t >= options.stoppedBetween.from &&
      t <= options.stoppedBetween.to;
    const speedMps = stopped ? 0 : (options.speedAt?.(t) ?? BASE_SPEED_MPS);
    const gradient =
      options.climbAfter && t > options.climbAfter.t ? options.climbAfter.gradient : 0;

    samples.push({
      time: new Date(start.getTime() + t * 1000),
      distanceM,
      elevationM,
      speedMps,
      hrBpm: options.hrAt?.(t) ?? 150,
    });

    distanceM += speedMps;
    elevationM += speedMps * gradient;
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

/** A gel at 20 minutes into a 45-minute run, with room either side of it. */
const GEL_T = 1200;
const RUN_S = 2700;

describe("comparing the running either side of an event", () => {
  it("finds a real improvement and gets its size about right", () => {
    // Twenty seconds per kilometre faster is a change from 3.0 to about
    // 3.06 m/s, applied from the gel onwards.
    const activity = flatRun({
      durationS: RUN_S,
      speedAt: (t) => (t >= GEL_T ? 1000 / (1000 / BASE_SPEED_MPS - 20) : BASE_SPEED_MPS),
    });
    const annotated = annotate(activity, [{ t: GEL_T, kind: "gel" }]);

    const impact = analyzeAnnotation(
      annotated,
      annotated.annotations![0],
      annotated.annotations!,
    );
    expect(impact).not.toBeNull();
    expect(impact!.paceWithinNoise).toBe(false);
    // Negative is faster.
    expect(impact!.paceDeltaSecPerKm).toBeLessThan(0);
    expect(Math.abs(impact!.paceDeltaSecPerKm!)).toBeGreaterThan(15);
    expect(Math.abs(impact!.paceDeltaSecPerKm!)).toBeLessThan(25);
    expect(impact!.confidence).toBe("medium");
    expect(impact!.caveats).toEqual([]);
  });

  it("calls a difference smaller than the sensors' noise no change at all", () => {
    const activity = flatRun({ durationS: RUN_S });
    const annotated = annotate(activity, [{ t: GEL_T, kind: "gel" }]);

    const impact = analyzeAnnotation(
      annotated,
      annotated.annotations![0],
      annotated.annotations!,
    )!;
    expect(impact.paceWithinNoise).toBe(true);
  });

  it("reads each kind at its own delay", () => {
    const activity = flatRun({ durationS: RUN_S });
    const annotated = annotate(activity, [
      { t: GEL_T, kind: "gel" },
      { t: GEL_T, kind: "food" },
    ]);

    const [gel, food] = annotated.annotations!;
    const gelWindow = analyzeAnnotation(annotated, gel, [gel])!.after;
    const foodWindow = analyzeAnnotation(annotated, food, [food])!.after;

    // Solid food is looked for later than a gel, because it arrives later.
    expect(foodWindow.startT).toBeGreaterThan(gelWindow.startT);
  });
});

describe("what it refuses to compare", () => {
  it("declines a kind with no honest window to look in", () => {
    const activity = flatRun({ durationS: RUN_S });
    const annotated = annotate(activity, [{ t: GEL_T, kind: "cramp" }]);
    expect(
      analyzeAnnotation(annotated, annotated.annotations![0], annotated.annotations!),
    ).toBeNull();
  });

  it("declines an event too near the end for the window to be run", () => {
    const activity = flatRun({ durationS: 900 });
    // Three minutes of running left is less than the window needs.
    const annotated = annotate(activity, [{ t: 720, kind: "gel" }]);
    expect(
      analyzeAnnotation(annotated, annotated.annotations![0], annotated.annotations!),
    ).toBeNull();
  });

  it("declines an event too near the start", () => {
    const activity = flatRun({ durationS: RUN_S });
    const annotated = annotate(activity, [{ t: 30, kind: "gel" }]);
    const impact = analyzeAnnotation(
      annotated,
      annotated.annotations![0],
      annotated.annotations!,
    );
    expect(impact).toBeNull();
  });

  it("keeps a window that has just enough running in it", () => {
    const activity = flatRun({ durationS: RUN_S });
    const annotated = annotate(activity, [{ t: GEL_T, kind: "gel" }]);
    const impact = analyzeAnnotation(
      annotated,
      annotated.annotations![0],
      annotated.annotations!,
    )!;
    expect(impact.before.movingS).toBeGreaterThanOrEqual(MIN_MOVING_S);
    expect(impact.after.movingS).toBeGreaterThanOrEqual(MIN_MOVING_S);
  });
});

describe("what weakens a comparison", () => {
  it("drops its confidence when another event falls inside the window", () => {
    const activity = flatRun({ durationS: RUN_S });
    const annotated = annotate(activity, [
      { t: GEL_T, kind: "gel" },
      { t: GEL_T + 360, kind: "gel" },
    ]);

    const impact = analyzeAnnotation(
      annotated,
      annotated.annotations![0],
      annotated.annotations!,
    )!;
    expect(impact.confidence).toBe("low");
    expect(impact.caveats.join(" ")).toContain("Another event");
  });

  it("drops its confidence when a good part of a window was standing still", () => {
    const activity = flatRun({
      durationS: RUN_S,
      stoppedBetween: { from: GEL_T + 400, to: GEL_T + 700 },
    });
    const annotated = annotate(activity, [{ t: GEL_T, kind: "gel" }]);

    const impact = analyzeAnnotation(
      annotated,
      annotated.annotations![0],
      annotated.annotations!,
    )!;
    expect(impact.confidence).toBe("low");
    expect(impact.caveats.join(" ")).toContain("standing still");
  });
});

describe("the card itself", () => {
  it("stays off a run with nothing added to it", () => {
    const activity = flatRun({ durationS: RUN_S });
    expect(eventImpact.compute(activity)).toBeNull();
  });

  it("stays off a run whose events are all unanalysable", () => {
    const activity = annotate(flatRun({ durationS: RUN_S }), [
      { t: GEL_T, kind: "cramp" },
      { t: GEL_T + 300, kind: "kit" },
    ]);
    expect(eventImpact.compute(activity)).toBeNull();
  });

  it("counts every event but compares only the ones it can", () => {
    const activity = annotate(flatRun({ durationS: RUN_S }), [
      { t: GEL_T, kind: "gel" },
      { t: GEL_T + 60, kind: "cramp" },
    ]);
    const result = eventImpact.compute(activity)!;
    expect(result.totalAnnotations).toBe(2);
    expect(result.impacts).toHaveLength(1);
  });

  it("writes narration the page will accept", () => {
    const activity = annotate(flatRun({ durationS: RUN_S }), [
      { t: GEL_T, kind: "gel" },
    ]);
    const result = eventImpact.compute(activity)!;
    const narration = eventImpact.narrate(result, activity);

    const prose = [
      ...narration.information.map((stat) => `${stat.value} ${stat.note ?? ""}`),
      ...narration.observations.map((o) => o.text),
      ...narration.explanations.map((e) => e.text),
      ...narration.teaching.map((t) => `${t.title} ${t.text}`),
    ].join(" ");

    expect(prose).not.toContain("NaN");
    expect(prose).not.toContain("undefined");
    expect(prose).not.toContain("Infinity");

    for (const explanation of narration.explanations) {
      expect(["medium", "low"]).toContain(explanation.confidence);
      expect(explanation.text.length).toBeGreaterThan(15);
    }
    for (const point of narration.teaching) {
      expect(point.text.length).toBeGreaterThan(30);
    }
  });
});
