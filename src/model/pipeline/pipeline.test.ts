// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "@/parsers/fit/parseFit";
import { parseGpx } from "@/parsers/gpx/parseGpx";
import { buildActivity } from "./index";
import { collect } from "@/lib/stats";

function loadDemoRun() {
  const path = resolve(__dirname, "../../../fixtures/Lunch_Run.fit");
  const buffer = readFileSync(path);
  const raw = parseFit(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
  return buildActivity(raw);
}

describe("buildActivity on the demo run", () => {
  const activity = loadDemoRun();

  it("produces one sample per second with no gaps", () => {
    expect(activity.samples.length).toBeGreaterThan(1200);
    for (let i = 0; i < activity.samples.length; i++) {
      expect(activity.samples[i].t).toBe(i);
    }
  });

  it("reports the run the device recorded", () => {
    expect(activity.distanceM).toBeCloseTo(3045, 0);
    expect(activity.elapsedS).toBeGreaterThan(1200);
    expect(activity.elapsedS).toBeLessThan(1300);
  });

  it("fills the sparse heart-rate series across every second", () => {
    const hr = collect(activity.samples, (s) => s.hrBpm);
    // The fixture writes heart rate every fourth second; interpolation should
    // cover nearly every second of the run from that.
    expect(hr.length).toBeGreaterThan(activity.samples.length * 0.9);
    expect(Math.max(...hr)).toBeLessThan(220);
  });

  it("keeps cumulative distance monotonic", () => {
    for (let i = 1; i < activity.samples.length; i++) {
      expect(activity.samples[i].distanceM).toBeGreaterThanOrEqual(
        activity.samples[i - 1].distanceM,
      );
    }
  });

  it("derives pace only while moving", () => {
    for (const sample of activity.samples) {
      if (!sample.moving) expect(sample.paceSecPerKm).toBeUndefined();
    }
    const paces = collect(activity.samples, (s) => s.paceSecPerKm);
    expect(paces.length).toBeGreaterThan(600);
    // A human running pace, in seconds per kilometre.
    expect(Math.min(...paces)).toBeGreaterThan(120);
    expect(Math.max(...paces)).toBeLessThan(1800);
  });

  it("knows which metrics this file carries", () => {
    const metrics = activity.availableMetrics;
    expect(metrics.has("heartRate")).toBe(true);
    expect(metrics.has("power")).toBe(true);
    expect(metrics.has("elevation")).toBe(true);
    expect(metrics.has("position")).toBe(true);
    expect(metrics.has("pace")).toBe(true);
    // The demo carries cadence, which is what lets the cadence section and
    // most of the experimental lab appear on it.
    expect(metrics.has("cadence")).toBe(true);
  });

  it("estimates a maximum heart rate and says that it did", () => {
    expect(activity.maxHrIsEstimated).toBe(true);
    expect(activity.maxHrUsed).toBeGreaterThanOrEqual(160);
    expect(activity.maxHrUsed).toBeLessThanOrEqual(220);
  });

  it("assigns every heart-rate sample to a zone", () => {
    const zoneSeconds = Object.values(activity.summary.zoneTime).reduce((a, b) => a + b, 0);
    const hrSeconds = collect(activity.samples, (s) => s.hrBpm).length;
    expect(zoneSeconds).toBe(hrSeconds);
  });

  it("splits the run into kilometres", () => {
    expect(activity.splits.length).toBeGreaterThanOrEqual(3);
    expect(activity.splits[0].index).toBe(1);
    for (const split of activity.splits) {
      expect(split.paceSecPerKm).toBeGreaterThan(120);
      expect(split.paceSecPerKm).toBeLessThan(1800);
      expect(split.distanceM).toBeGreaterThan(0);
    }
    const totalSplitDistance = activity.splits.reduce((a, s) => a + s.distanceM, 0);
    expect(totalSplitDistance).toBeCloseTo(activity.samples.at(-1)!.distanceM, 0);
  });

  it("finds between three and five story moments in time order", () => {
    expect(activity.moments.length).toBeGreaterThanOrEqual(3);
    expect(activity.moments.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < activity.moments.length; i++) {
      expect(activity.moments[i].startT).toBeGreaterThanOrEqual(
        activity.moments[i - 1].startT,
      );
      expect(activity.moments[i].order).toBe(i + 1);
    }
    for (const moment of activity.moments) {
      expect(moment.description.length).toBeGreaterThan(10);
      expect(moment.description).not.toContain("NaN");
      expect(moment.description).not.toContain("undefined");
    }
  });

  it("keeps every detected event inside the run", () => {
    for (const event of activity.events) {
      expect(event.startT).toBeGreaterThanOrEqual(0);
      expect(event.endT).toBeLessThanOrEqual(activity.samples.at(-1)!.t);
      expect(event.endT).toBeGreaterThanOrEqual(event.startT);
      expect(event.label.length).toBeGreaterThan(0);
    }
  });

  it("splits time between the three gradient categories", () => {
    const buckets = activity.summary.gradientBuckets;
    expect(buckets).toHaveLength(3);
    const totalTime = buckets.reduce((a, b) => a + b.timeS, 0);
    expect(totalTime).toBeGreaterThan(activity.samples.length * 0.8);
  });

  it("finds best sustained efforts no faster than the run's quickest pace", () => {
    const efforts = activity.summary.bestEfforts;
    expect(efforts.length).toBeGreaterThan(0);
    for (const effort of efforts) {
      expect(effort.paceSecPerKm).toBeGreaterThan(120);
      expect(effort.endT).toBeGreaterThan(effort.startT);
    }
    // A shorter window can always be run at least as fast as a longer one.
    const thirty = efforts.find((e) => e.kind === "time" && e.window === 30);
    const sixty = efforts.find((e) => e.kind === "time" && e.window === 60);
    if (thirty && sixty) {
      expect(thirty.paceSecPerKm).toBeLessThanOrEqual(sixty.paceSecPerKm + 1);
    }
  });

  it("measures pace consistency against the runner's own median", () => {
    const consistency = activity.summary.consistency;
    expect(consistency).toBeDefined();
    expect(consistency!.withinBandFraction).toBeGreaterThanOrEqual(0);
    expect(consistency!.withinBandFraction).toBeLessThanOrEqual(1);
    expect(consistency!.intervals.length).toBeGreaterThan(10);
  });

  it("computes drift with a confidence that reflects the pace change", () => {
    const drift = activity.summary.drift;
    expect(drift).toBeDefined();
    expect(Number.isFinite(drift!.driftPct)).toBe(true);
    if (Math.abs(drift!.pacePct) > 6) expect(drift!.confidence).toBe("low");
    if (drift!.confidence !== "high") expect(drift!.caveat).toBeDefined();
  });

  it("agrees on moving time between the summary and the samples", () => {
    const movingSamples = activity.samples.filter((s) => s.moving).length;
    expect(activity.movingS).toBe(movingSamples);
    expect(activity.summary.stoppedS).toBe(activity.samples.length - movingSamples);
  });
});

describe("the same run parsed from GPX", () => {
  // GPX carries no distance, so this exercises the fallback where the pipeline
  // accumulates great-circle hops instead of trusting the device.
  const path = resolve(__dirname, "../../../fixtures/Lunch_Run.gpx");
  const gpx = buildActivity(parseGpx(readFileSync(path, "utf8")));
  const fit = loadDemoRun();

  it("derives distance from the GPS track", () => {
    expect(gpx.distanceM).toBeGreaterThan(2500);
    expect(gpx.distanceM).toBeLessThan(3500);
  });

  it("agrees with the FIT version on the shape of the run", () => {
    expect(Math.abs(gpx.elapsedS - fit.elapsedS)).toBeLessThanOrEqual(2);
    expect(Math.abs(gpx.distanceM - fit.distanceM) / fit.distanceM).toBeLessThan(0.03);
    expect(Math.abs((gpx.summary.avgHr ?? 0) - (fit.summary.avgHr ?? 0))).toBeLessThan(4);
    expect(gpx.splits.length).toBe(fit.splits.length);
  });

  it("carries the same metrics and produces a story", () => {
    expect(gpx.availableMetrics.has("heartRate")).toBe(true);
    expect(gpx.availableMetrics.has("power")).toBe(true);
    expect(gpx.availableMetrics.has("cadence")).toBe(true);
    expect(gpx.moments.length).toBeGreaterThanOrEqual(3);
  });
});

describe("a runner's own maximum heart rate changes the zones", () => {
  it("recomputes zones and stops calling the maximum an estimate", () => {
    const path = resolve(__dirname, "../../../fixtures/Lunch_Run.fit");
    const buffer = readFileSync(path);
    const raw = parseFit(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );

    const estimated = buildActivity(raw);
    const configured = buildActivity(raw, { maxHr: 200 });

    expect(configured.maxHrIsEstimated).toBe(false);
    expect(configured.maxHrUsed).toBe(200);
    // A higher maximum pushes the same heart rates into lower zones.
    const estimatedHigh = estimated.summary.zoneTime[4] + estimated.summary.zoneTime[5];
    const configuredHigh = configured.summary.zoneTime[4] + configured.summary.zoneTime[5];
    expect(configuredHigh).toBeLessThanOrEqual(estimatedHigh);
  });
});
