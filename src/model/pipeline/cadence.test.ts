import { describe, expect, it } from "vitest";
import type { RawActivity, RawSample } from "@/parsers/types";
import { buildActivity } from "./index";

/**
 * The demo run carries no cadence, so these detectors would otherwise ship
 * untested. A synthetic run with a deliberate, known dip is the only way to
 * check that they find what is there and stay quiet about what is not.
 */

interface SyntheticOptions {
  durationS: number;
  speedMps: number;
  /** Cadence at each second, or undefined for a file without cadence. */
  cadenceAt?: (t: number) => number | undefined;
  /** Seconds where the runner was standing still. */
  stoppedBetween?: [number, number];
}

function syntheticRun(options: SyntheticOptions): RawActivity {
  const start = new Date("2026-08-06T00:00:00Z");
  const samples: RawSample[] = [];
  let distance = 0;

  for (let t = 0; t < options.durationS; t++) {
    const stopped =
      options.stoppedBetween !== undefined &&
      t >= options.stoppedBetween[0] &&
      t < options.stoppedBetween[1];
    const speed = stopped ? 0 : options.speedMps;
    distance += speed;

    samples.push({
      time: new Date(start.getTime() + t * 1000),
      distanceM: distance,
      speedMps: speed,
      elevationM: 100,
      hrBpm: 150,
      // A stopped watch reports no steps, which is the case the detector has to
      // avoid mistaking for a change in rhythm.
      cadenceSpm: stopped ? 0 : options.cadenceAt?.(t),
    });
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

describe("cadence events", () => {
  it("finds a sustained drop and the recovery that follows it", () => {
    const activity = buildActivity(
      syntheticRun({
        durationS: 600,
        speedMps: 3,
        // Steady 170, falling to 152 between 200 s and 300 s, then back.
        cadenceAt: (t) => (t >= 200 && t < 300 ? 152 : 170),
      }),
    );

    const drops = activity.events.filter((e) => e.type === "cadenceDrop");
    expect(drops).toHaveLength(1);
    // Smoothing shifts the edges a little; the dip must still be located here.
    expect(drops[0].startT).toBeGreaterThanOrEqual(195);
    expect(drops[0].startT).toBeLessThanOrEqual(215);
    expect(drops[0].endT).toBeGreaterThanOrEqual(285);
    expect(drops[0].endT).toBeLessThanOrEqual(310);

    const recoveries = activity.events.filter((e) => e.type === "cadenceRecovery");
    expect(recoveries.length).toBeGreaterThanOrEqual(1);
    expect(recoveries[0].startT).toBeGreaterThanOrEqual(drops[0].startT);

    for (const event of [...drops, ...recoveries]) {
      expect(event.label.length).toBeGreaterThan(0);
      for (const value of Object.values(event.metrics)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("says nothing about a run that held its rhythm", () => {
    const activity = buildActivity(
      syntheticRun({
        durationS: 600,
        speedMps: 3,
        // Small wobble either side of 170, well inside sensor noise.
        cadenceAt: (t) => 170 + (t % 4) - 1.5,
      }),
    );

    expect(activity.events.filter((e) => e.type === "cadenceDrop")).toHaveLength(0);
    expect(activity.events.filter((e) => e.type === "cadenceRecovery")).toHaveLength(0);
  });

  it("does not read a stop as a loss of rhythm", () => {
    const activity = buildActivity(
      syntheticRun({
        durationS: 600,
        speedMps: 3,
        cadenceAt: () => 170,
        stoppedBetween: [250, 320],
      }),
    );

    // The watch reported a cadence of zero throughout the stop. Counting that
    // would turn every traffic light into a finding.
    expect(activity.events.filter((e) => e.type === "cadenceDrop")).toHaveLength(0);
    expect(activity.events.some((e) => e.type === "stop")).toBe(true);
  });

  it("stays silent on a file with no cadence at all", () => {
    const activity = buildActivity(
      syntheticRun({ durationS: 600, speedMps: 3, cadenceAt: () => undefined }),
    );

    expect(activity.availableMetrics.has("cadence")).toBe(false);
    expect(activity.events.filter((e) => e.type.startsWith("cadence"))).toHaveLength(0);
  });
});
