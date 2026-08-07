// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import { buildActivity } from "@/model/pipeline";
import { collect } from "@/lib/stats";
import { WIDGETS } from "./registry";
import { isWidgetSupported } from "./contract";
import { buildWidgets, groupWidgets } from "./buildWidgets";

/**
 * The cadence section, exercised on a run built for the purpose.
 *
 * Neither demo file carries cadence — most consumer recordings do not — so the
 * only way to test this section is to construct a run that does. The synthetic
 * run is deliberately shaped: a steady rhythm with one drop that pace does not
 * explain and one that a climb does, so both branches of the narration have
 * something real to describe.
 */

const DURATION_S = 2400;
const BASE_CADENCE = 176;
const BASE_SPEED = 3;

/** A flat drop where pace held: the case terrain cannot account for. */
const FLAT_DROP = { from: 600, to: 720, cadence: 158 };
/** The climb, where a lower rhythm is what the ground asks for. */
const CLIMB = { from: 1500, to: 1800, cadence: 166, speed: 2.4, gainM: 60 };

/** Flat, then up over the climb, then back down over the following five minutes. */
function elevationAt(t: number): number {
  if (t < CLIMB.from) return 0;
  if (t < CLIMB.to) return ((t - CLIMB.from) / (CLIMB.to - CLIMB.from)) * CLIMB.gainM;
  if (t < CLIMB.to + 300) return CLIMB.gainM * (1 - (t - CLIMB.to) / 300);
  return 0;
}

function syntheticRun(): RawActivity {
  const start = new Date("2026-03-14T09:00:00Z");
  const samples: RawSample[] = [];
  let distanceM = 0;

  for (let t = 0; t < DURATION_S; t++) {
    const onClimb = t >= CLIMB.from && t < CLIMB.to;
    const onFlatDrop = t >= FLAT_DROP.from && t < FLAT_DROP.to;

    // Pace drifts continuously, as a real one does, so the pace comparison has
    // a distribution to bin rather than two values. The flat drop is pinned to
    // the run's usual speed, which is what makes it the case pace cannot explain.
    const drift = 0.28 * Math.sin(t / 97) + 0.12 * Math.sin(t / 29);
    const speedMps = onClimb ? CLIMB.speed : onFlatDrop ? BASE_SPEED : BASE_SPEED + drift;
    distanceM += speedMps;

    const wobble = 2.5 * Math.sin(t / 37);
    const cadenceSpm = onClimb
      ? CLIMB.cadence + wobble
      : onFlatDrop
        ? FLAT_DROP.cadence + wobble
        : BASE_CADENCE + wobble;

    samples.push({
      time: new Date(start.getTime() + t * 1000),
      lat: 51.5 + distanceM / 111_320,
      lon: -0.12,
      elevationM: elevationAt(t),
      distanceM,
      speedMps,
      hrBpm: 138 + (onClimb ? 14 : 0) + 6 * Math.sin(t / 90),
      cadenceSpm,
    });
  }

  return {
    source: "fit",
    name: "Synthetic cadence run",
    sport: "running",
    startedAt: start,
    samples,
    timerEvents: [],
    laps: [],
    warnings: [],
  };
}

const activity = buildActivity(syntheticRun());
const cadenceWidgets = WIDGETS.filter((widget) => widget.section === "cadence");

describe("the model on a run that records cadence", () => {
  it("knows the file carries cadence", () => {
    expect(activity.availableMetrics.has("cadence")).toBe(true);
    expect(collect(activity.samples, (s) => s.cadenceSpm).length).toBeGreaterThan(2000);
  });

  it("finds both planted drops and nothing else", () => {
    const drops = activity.events.filter((event) => event.type === "cadenceDrop");
    expect(drops).toHaveLength(2);

    const [flat, climb] = drops;
    expect(flat.startT).toBeGreaterThanOrEqual(FLAT_DROP.from);
    expect(flat.startT).toBeLessThan(FLAT_DROP.from + 20);
    expect(flat.metrics.deficitSpm).toBeGreaterThan(12);
    expect(flat.metrics.stoppedS).toBe(0);

    expect(climb.startT).toBeGreaterThanOrEqual(CLIMB.from);
    expect(climb.startT).toBeLessThan(CLIMB.from + 20);
    expect(climb.metrics.avgGradientPct).toBeGreaterThan(2);
  });

  it("records a recovery for each drop that came back", () => {
    const recoveries = activity.events.filter((event) => event.type === "cadenceRecovery");
    expect(recoveries).toHaveLength(2);
    for (const recovery of recoveries) {
      expect(recovery.metrics.recoveryS).toBeGreaterThan(0);
      expect(recovery.metrics.recoveryS).toBeLessThanOrEqual(300);
      expect(recovery.metrics.regainedSpm).toBeGreaterThan(0);
      expect(recovery.startT).toBeGreaterThan(recovery.metrics.dropStartT);
    }
  });

  it("keeps a stopped second out of the cadence figures", () => {
    // Nothing in this run is stopped, so the running average and the whole-file
    // average have to agree. The guard is against the two definitions drifting.
    const running = collect(activity.samples, (s) => (s.moving ? s.cadenceSpm : undefined));
    expect(running.length).toBe(activity.movingS);
  });
});

describe("every cadence widget on that run", () => {
  it("registers eleven of them", () => {
    expect(cadenceWidgets).toHaveLength(11);
  });

  it("supports all of them on a file with cadence, heart rate and gradient", () => {
    for (const widget of cadenceWidgets) {
      expect(isWidgetSupported(widget, activity)).toBe(true);
    }
  });

  for (const widget of cadenceWidgets) {
    it(`${widget.id} computes, narrates and renders`, () => {
      const result = widget.compute(activity);
      expect(result).not.toBeNull();
      if (result === null || result === undefined) return;

      const narration = widget.narrate(result, activity);

      const allText = [
        ...narration.information.flatMap((s) => [s.label, s.value, s.note ?? ""]),
        ...narration.observations.map((o) => o.text),
        ...narration.explanations.map((e) => e.text),
        ...narration.teaching.flatMap((t) => [t.title, t.text]),
      ].join(" ");

      expect(allText).not.toContain("NaN");
      expect(allText).not.toContain("undefined");
      expect(allText).not.toContain("Infinity");
      expect(allText).not.toContain("[object Object]");

      for (const explanation of narration.explanations) {
        expect(["high", "medium", "low"]).toContain(explanation.confidence);
        expect(explanation.text.length).toBeGreaterThan(15);
      }
      for (const point of narration.teaching) {
        expect(point.text.length).toBeGreaterThan(30);
      }
      expect(narration.observations.length).toBeGreaterThan(0);

      const markup = renderToStaticMarkup(
        <widget.View result={result as never} activity={activity} />,
      );
      expect(markup.length).toBeGreaterThan(0);
      expect(markup).not.toContain("NaN");
      expect(markup).not.toContain("undefined");
    });
  }
});

describe("the cadence section in the page", () => {
  it("groups as one contiguous section named Cadence", () => {
    const groups = groupWidgets(buildWidgets(activity, { includeExperimental: true }));
    const cadence = groups.filter((group) => group.section === "cadence");
    expect(cadence).toHaveLength(1);
    expect(cadence[0].label).toBe("Cadence");
    expect(cadence[0].widgets).toHaveLength(11);
  });

  it("hides the two experimental sections until they are asked for", () => {
    const ids = buildWidgets(activity).map((item) => item.widget.id);
    expect(ids).toContain("cadence-summary");
    expect(ids).not.toContain("cadence-drops");
    expect(ids).not.toContain("cadence-recovery");
  });

  it("reads the figures back off the drop that pace does not explain", () => {
    const drops = WIDGETS.find((widget) => widget.id === "cadence-drops")!;
    const narration = drops.narrate(drops.compute(activity), activity);
    expect(narration.explanations[0].text).toContain("stride lengthened");
  });
});
