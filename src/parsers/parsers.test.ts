// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "./fit/parseFit";
import { parseGpx } from "./gpx/parseGpx";
import { detectFormat } from "./index";
import { collect } from "@/lib/stats";
import { cumulativeDistance } from "@/lib/geo";

const FIXTURES = resolve(__dirname, "../../fixtures");

function readFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(resolve(FIXTURES, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("detectFormat", () => {
  it("identifies FIT from the header signature", () => {
    expect(detectFormat(readFixture("Lunch_Run.fit"))).toBe("fit");
  });

  it("identifies GPX from the XML root", () => {
    expect(detectFormat(readFixture("Lunch_Run.gpx"))).toBe("gpx");
  });

  it("rejects anything else", () => {
    const junk = new TextEncoder().encode("hello world, not an activity").buffer;
    expect(detectFormat(junk, "notes.txt")).toBe("unknown");
  });
});

describe("parseFit", () => {
  const activity = parseFit(readFixture("Lunch_Run.fit"));

  it("reads every record message as a sample", () => {
    expect(activity.samples.length).toBeGreaterThan(1200);
    expect(activity.source).toBe("fit");
  });

  it("reads plausible GPS coordinates", () => {
    const withPosition = activity.samples.filter((s) => s.lat !== undefined);
    expect(withPosition.length).toBeGreaterThan(1000);
    // The fixture is a real recording moved to Richmond Park — see
    // scripts/make-fixtures.mjs. The running is genuine; the place is not,
    // because a GPS track says where somebody actually was.
    for (const sample of withPosition) {
      expect(sample.lat).toBeGreaterThan(51.43);
      expect(sample.lat).toBeLessThan(51.46);
      expect(sample.lon).toBeGreaterThan(-0.29);
      expect(sample.lon).toBeLessThan(-0.25);
    }
  });

  it("reads heart rate in a human range", () => {
    // This device writes heart rate roughly every five seconds rather than on
    // every record, so the series is sparse until the pipeline interpolates it.
    const hr = collect(activity.samples, (s) => s.hrBpm);
    expect(hr.length).toBeGreaterThan(200);
    expect(Math.min(...hr)).toBeGreaterThan(40);
    expect(Math.max(...hr)).toBeLessThan(220);
  });

  it("reads running power", () => {
    const power = collect(activity.samples, (s) => s.powerW);
    expect(power.length).toBeGreaterThan(1000);
    expect(Math.max(...power)).toBeLessThan(1500);
  });

  it("reads cadence, doubling the per-leg figure FIT stores", () => {
    const cadence = collect(activity.samples, (s) => s.cadenceSpm);
    expect(cadence.length).toBeGreaterThan(1200);
    // FIT writes strides per minute for one leg; runners count both feet.
    expect(Math.min(...cadence)).toBeGreaterThan(120);
    expect(Math.max(...cadence)).toBeLessThan(220);
  });

  it("reads monotonic cumulative distance", () => {
    // Distance is also written intermittently; it must never go backwards.
    const distances = collect(activity.samples, (s) => s.distanceM);
    expect(distances.length).toBeGreaterThan(400);
    for (let i = 1; i < distances.length; i++) {
      expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]);
    }
  });

  it("reads elevation near the local ground level", () => {
    const elevations = collect(activity.samples, (s) => s.elevationM);
    expect(Math.min(...elevations)).toBeGreaterThan(0);
    expect(Math.max(...elevations)).toBeLessThan(400);
  });

  it("reads session totals and laps", () => {
    expect(activity.session?.totalDistanceM).toBeGreaterThan(1000);
    expect(activity.laps.length).toBeGreaterThan(0);
  });

  it("orders samples in time", () => {
    for (let i = 1; i < activity.samples.length; i++) {
      expect(activity.samples[i].time.getTime()).toBeGreaterThanOrEqual(
        activity.samples[i - 1].time.getTime(),
      );
    }
  });
});

describe("parseGpx", () => {
  const text = new TextDecoder().decode(readFixture("Lunch_Run.gpx"));
  const activity = parseGpx(text);

  it("reads every track point", () => {
    expect(activity.samples.length).toBe(1245);
    expect(activity.name).toBe("Lunch Run");
    expect(activity.sport).toBe("running");
  });

  it("reads heart rate from the Garmin track-point extension", () => {
    const hr = collect(activity.samples, (s) => s.hrBpm);
    expect(hr.length).toBe(1245);
  });

  it("reads power from the plain Strava extension", () => {
    const power = collect(activity.samples, (s) => s.powerW);
    expect(power.length).toBeGreaterThan(1200);
  });

  it("carries no distance, because GPX does not record it", () => {
    expect(collect(activity.samples, (s) => s.distanceM)).toHaveLength(0);
  });
});

describe("a device that recorded no cadence", () => {
  const activity = parseGpx(new TextDecoder().decode(readFixture("No_Cadence.gpx")));

  it("reads the run but carries no cadence at all", () => {
    expect(activity.samples.length).toBe(1245);
    // Plenty of watches never record it, and the page drops its whole cadence
    // section when that happens rather than showing an empty one.
    expect(collect(activity.samples, (s) => s.cadenceSpm)).toHaveLength(0);
    expect(collect(activity.samples, (s) => s.hrBpm).length).toBeGreaterThan(1200);
  });
});

describe("FIT and GPX describe the same run", () => {
  const fit = parseFit(readFixture("Lunch_Run.fit"));
  const gpx = parseGpx(new TextDecoder().decode(readFixture("Lunch_Run.gpx")));

  it("starts at the same moment", () => {
    const deltaS = Math.abs(fit.startedAt.getTime() - gpx.startedAt.getTime()) / 1000;
    expect(deltaS).toBeLessThan(5);
  });

  it("agrees on distance within a few percent", () => {
    // Summing haversine hops over raw GPS slightly over-measures compared with
    // the device's own filtered distance. A few percent apart is agreement.
    const fitDistance = fit.session?.totalDistanceM ?? 0;
    const gpxTrack = gpx.samples.map((s) =>
      s.lat !== undefined && s.lon !== undefined ? { lat: s.lat, lon: s.lon } : undefined,
    );
    const gpxDistance = cumulativeDistance(gpxTrack).at(-1) ?? 0;
    expect(fitDistance).toBeGreaterThan(1000);
    expect(Math.abs(gpxDistance - fitDistance) / fitDistance).toBeLessThan(0.03);
  });

  it("agrees on the heart-rate range", () => {
    // The GPX carries a heart-rate value on every point because the exporter
    // filled the gaps; the FIT keeps the sparse original. Means therefore differ
    // slightly, but the range the runner actually reached should match.
    const fitHr = collect(fit.samples, (s) => s.hrBpm);
    const gpxHr = collect(gpx.samples, (s) => s.hrBpm);
    expect(Math.abs(Math.max(...fitHr) - Math.max(...gpxHr))).toBeLessThanOrEqual(2);
    expect(Math.abs(Math.min(...fitHr) - Math.min(...gpxHr))).toBeLessThanOrEqual(2);
  });
});
