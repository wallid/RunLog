// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import { buildActivity } from "@/model/pipeline";
import type { DerivedActivity } from "@/model/activity";
import gradeAdjustedPace from "./gradeAdjustedPace";
import splits from "./splits";
import { isWidgetSupported } from "./contract";

/**
 * Grade adjustment, exercised on a run shaped to need it.
 *
 * Neither demo file has a hill worth the name — the lunch run climbs nine
 * metres in a kilometre, which is exactly the case the card is supposed to
 * decline. So the run below is built with one kilometre that climbs, one that
 * descends and three that do neither, run at an effort that answers the
 * gradient the way a runner does rather than the way the model does. The
 * adjustment is not being asked to reproduce the rule that generated the run;
 * it is being asked to bring the kilometres closer together than the clock did,
 * and to reverse the order the clock put them in.
 */

const BASE_SPEED_MPS = 3.0;
const TOTAL_DISTANCE_M = 5000;
const CLIMB_GRADIENT = 0.04;

/** Flat, then a kilometre up, flat, a kilometre down, flat. */
function gradientAt(distanceM: number): number {
  if (distanceM >= 1000 && distanceM < 2000) return CLIMB_GRADIENT;
  if (distanceM >= 3000 && distanceM < 4000) return -CLIMB_GRADIENT;
  return 0;
}

function hillyRun(totalDistanceM = TOTAL_DISTANCE_M): RawActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  let distanceM = 0;
  let elevationM = 100;

  for (let t = 0; distanceM < totalDistanceM; t++) {
    const gradient = gradientAt(distanceM);
    // Speed falls uphill and rises downhill, but not by the amount the cost
    // curve says it should — a runner is not a model, and an adjustment that
    // only worked on runners who were would be worth nothing.
    // Anything past five kilometres is a flat sprint for the line.
    const speedMps =
      distanceM >= TOTAL_DISTANCE_M
        ? BASE_SPEED_MPS * 1.3
        : BASE_SPEED_MPS * (1 - 3 * gradient);

    samples.push({
      time: new Date(start.getTime() + t * 1000),
      elevationM,
      distanceM,
      speedMps,
      // Effort held roughly level, which is the premise the card is testing:
      // the same runner working the same amount over different ground.
      hrBpm: 150 + 40 * gradient,
    });

    distanceM += speedMps;
    elevationM += gradient * speedMps;
  }

  return {
    source: "fit",
    startedAt: start,
    samples,
    timerEvents: [],
    laps: [],
    warnings: [],
  };
}

const activity: DerivedActivity = buildActivity(hillyRun());

function splitByIndex(index: number) {
  const split = activity.splits.find((s) => s.index === index);
  if (!split) throw new Error(`no kilometre ${index}`);
  return split;
}

describe("the run the adjustment is read from", () => {
  it("carries the gradient the card requires", () => {
    expect(isWidgetSupported(gradeAdjustedPace, activity)).toBe(true);
    expect(activity.splits.length).toBeGreaterThanOrEqual(5);
  });

  it("charges for a route that climbs and descends the same amount", () => {
    const adjustment = activity.summary.gradeAdjustment;
    expect(adjustment).toBeDefined();
    // The kilometre up and the kilometre down cancel in metres and do not
    // cancel in cost, which is the whole reason the card exists.
    expect(adjustment!.factor).toBeGreaterThan(1);
    expect(adjustment!.flatEquivalentDistanceM).toBeGreaterThan(TOTAL_DISTANCE_M * 0.99);
  });

  it("credits the climb and takes back the descent", () => {
    const climb = splitByIndex(2);
    const descent = splitByIndex(4);
    expect(climb.gradeAdjustedPaceSecPerKm!).toBeLessThan(climb.paceSecPerKm);
    expect(descent.gradeAdjustedPaceSecPerKm!).toBeGreaterThan(descent.paceSecPerKm);
  });

  it("leaves the flat kilometres where they were", () => {
    const flat = splitByIndex(1);
    expect(flat.gradeAdjustedPaceSecPerKm!).toBeCloseTo(flat.paceSecPerKm, 0);
  });

  it("brings the kilometres closer together than the clock did", () => {
    const actual = activity.splits.map((s) => s.paceSecPerKm);
    const adjusted = activity.splits.map((s) => s.gradeAdjustedPaceSecPerKm!);
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    expect(spread(adjusted)).toBeLessThan(spread(actual));
  });
});

describe("the grade-adjusted pace card", () => {
  const result = gradeAdjustedPace.compute(activity);

  it("computes on a run with hills in it", () => {
    expect(result).not.toBeNull();
  });

  it("names the climb as the kilometre run hardest, not the descent", () => {
    // The clock says the descent was the best kilometre of the run. It was the
    // easiest. A card that agreed with the clock here would be pointless.
    expect(result!.quickest.split.index).toBe(4);
    expect(result!.strongest.split.index).toBe(2);
    expect(result!.reordered).toBe(true);
  });

  it("reports the run as worth a quicker pace than it was run at", () => {
    expect(result!.adjustedMovingPaceSecPerKm).toBeLessThan(result!.movingPaceSecPerKm);
  });

  it("narrates and renders without a number going missing", () => {
    const narration = gradeAdjustedPace.narrate(result!, activity);
    const text = [
      ...narration.information.flatMap((s) => [s.label, s.value, s.note ?? ""]),
      ...narration.observations.map((o) => o.text),
      ...narration.explanations.map((e) => e.text),
      ...narration.teaching.flatMap((t) => [t.title, t.text]),
    ].join(" ");

    expect(text).not.toContain("NaN");
    expect(text).not.toContain("undefined");
    // The dash the formatters print for a value they could not compute. Checked
    // on the figures alone, because the prose uses the same character as prose.
    for (const stat of narration.information) expect(stat.value).not.toBe("—");
    expect(narration.observations.length).toBeGreaterThan(0);

    const markup = renderToStaticMarkup(
      <gradeAdjustedPace.View result={result!} activity={activity} />,
    );
    expect(markup).toContain("km 2");
  });

  it("says where its figures come from", () => {
    expect(gradeAdjustedPace.provenance).toBe("estimated");
    expect(gradeAdjustedPace.references?.length).toBeGreaterThan(0);
  });

  it("draws a part-kilometre finish without letting it win anything", () => {
    // Five kilometres of hills and then a four-hundred-metre sprint for the
    // line. The sprint is the fastest pace on the card by some way, and it is
    // fast because it is short — the same reason the splits list keeps partials
    // out of its own fastest and slowest.
    const withFinish = buildActivity(hillyRun(5400));
    const last = withFinish.splits[withFinish.splits.length - 1];
    expect(last.tags).toContain("partial");
    expect(last.paceSecPerKm).toBeLessThan(withFinish.splits[0].paceSecPerKm);

    const finishResult = gradeAdjustedPace.compute(withFinish)!;
    expect(finishResult.rows.map((row) => row.split.index)).toContain(last.index);
    expect(finishResult.quickest.split.index).not.toBe(last.index);
    expect(finishResult.strongest.split.index).toBe(2);
  });

  it("declines a run with nothing for it to say", () => {
    // Flat ground: the adjustment is a rounding error, and reporting it would
    // invite the reader to read meaning into noise.
    const flat = buildActivity({
      ...hillyRun(),
      samples: hillyRun().samples.map((sample, t) => ({
        ...sample,
        elevationM: 100,
        speedMps: BASE_SPEED_MPS,
        distanceM: t * BASE_SPEED_MPS,
      })),
    });
    expect(gradeAdjustedPace.compute(flat)).toBeNull();
  });
});

describe("the splits card, once the adjustment reaches it", () => {
  it("tells the reader which kilometre was actually run hardest", () => {
    const result = splits.compute(activity);
    const narration = splits.narrate(result!, activity);
    const texts = narration.observations.map((o) => o.text);

    expect(texts.some((text) => /run harder than kilometre/.test(text))).toBe(true);
    expect(texts.join(" ")).not.toContain("NaN");
  });

  it("shows the flat-ground figure beside the kilometres it changes", () => {
    const result = splits.compute(activity);
    const markup = renderToStaticMarkup(<splits.View result={result!} activity={activity} />);
    expect(markup).toContain("flat)");
  });
});
