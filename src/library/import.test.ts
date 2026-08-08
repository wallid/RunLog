// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFit } from "@/parsers/fit/parseFit";
import { parseGpx } from "@/parsers/gpx/parseGpx";
import type { RawActivity, RawSample } from "@/parsers/types";
import { hashBlob, summarizeRaw } from "./import";
import { labelFor } from "./label";

const FIXTURES = resolve(__dirname, "../../fixtures");

function readFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(resolve(FIXTURES, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe("hashBlob", () => {
  it("gives the same run the same identity every time", async () => {
    const bytes = readFixture("Lunch_Run.fit");
    // Re-importing the same export is the ordinary case, not the exotic one:
    // the second import has to recognise what the first one kept.
    expect(await hashBlob(new Blob([bytes]))).toBe(await hashBlob(new Blob([bytes])));
  });

  it("tells two different runs apart", async () => {
    const fit = await hashBlob(new Blob([readFixture("Lunch_Run.fit")]));
    const gpx = await hashBlob(new Blob([readFixture("Lunch_Run.gpx")]));
    // The same run recorded two ways is two files, and the library keeps files.
    expect(fit).not.toBe(gpx);
  });
});

describe("summarizeRaw", () => {
  it("describes a FIT run from the totals its device recorded", () => {
    const raw = parseFit(readFixture("Lunch_Run.fit"));
    const entry = summarizeRaw(raw, "Lunch_Run.fit", "abc");

    expect(entry.source).toBe("fit");
    expect(entry.distanceM).toBeGreaterThan(1000);
    expect(entry.elapsedS).toBeGreaterThan(60);
    expect(entry.startedAt).toBe(raw.startedAt.getTime());
  });

  it("walks the track when nothing reported a distance", () => {
    const raw = parseGpx(new TextDecoder().decode(readFixture("Lunch_Run.gpx")));
    const stripped: RawActivity = {
      ...raw,
      session: undefined,
      samples: raw.samples.map(({ distanceM: _distance, ...rest }) => rest),
    };

    const entry = summarizeRaw(stripped, "Lunch_Run.gpx", "abc");
    // A phone's GPX carries neither a session total nor a running distance, so
    // the only figure available is the one the coordinates imply.
    expect(entry.distanceM).toBeGreaterThan(1000);
    expect(entry.elapsedS).toBeGreaterThan(60);
  });

  it("prefers the device's own total to anything derived", () => {
    const entry = summarizeRaw(
      activityWith({ session: { totalDistanceM: 4242, totalElapsedS: 999 } }),
      "run.fit",
      "abc",
    );
    expect(entry.distanceM).toBe(4242);
    expect(entry.elapsedS).toBe(999);
  });

  it("falls back to the last cumulative distance the watch wrote", () => {
    const entry = summarizeRaw(activityWith({}), "run.fit", "abc");
    expect(entry.distanceM).toBe(300);
    expect(entry.elapsedS).toBe(120);
  });

  it("names a run after the recording, or the day in the file name", () => {
    expect(summarizeRaw(activityWith({ name: "Morning Run" }), "x.fit", "a").name).toBe(
      "Morning Run",
    );
    expect(
      summarizeRaw(activityWith({}), "route_2026-03-16_7.42am.gpx", "a").name,
    ).toBe("16 March 2026");
  });

  it("survives a run with no samples at all", () => {
    const entry = summarizeRaw(
      { ...activityWith({}), samples: [] },
      "empty.fit",
      "abc",
    );
    expect(entry.distanceM).toBe(0);
    expect(entry.elapsedS).toBe(0);
  });
});

describe("labelFor", () => {
  it("lifts the day out of an Apple route name", () => {
    expect(labelFor("route_2026-03-16_7.42am.gpx")).toBe("16 March 2026");
  });

  it("drops the extension when there is no date to lift", () => {
    expect(labelFor("8123456789.gpx.gz")).toBe("8123456789");
  });

  it("leaves a name alone when its month could not be one", () => {
    expect(labelFor("run_2026-19-40.fit")).toBe("run_2026-19-40.fit");
  });
});

const start = new Date("2026-03-16T07:42:00Z");

function activityWith(overrides: Partial<RawActivity>): RawActivity {
  const samples: RawSample[] = [
    { time: start, distanceM: 0 },
    { time: new Date(start.getTime() + 60_000), distanceM: 150 },
    { time: new Date(start.getTime() + 120_000), distanceM: 300 },
  ];
  return {
    source: "fit",
    startedAt: start,
    samples,
    timerEvents: [],
    laps: [],
    warnings: [],
    ...overrides,
  };
}
