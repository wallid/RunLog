import { describe, expect, it } from "vitest";
import {
  buildWeatherUrl,
  hoursSpanned,
  parseWeather,
  roundCoordinate,
} from "./openMeteo";
import {
  compassPoint,
  heatCouldExplainDrift,
  heatLevel,
  isMuggy,
  windAtRunnerHeight,
  windComponents,
  type RunWeather,
} from "@/model/weather";
import { bearingDegrees } from "@/lib/geo";

/**
 * The weather layer, tested without a network.
 *
 * Every part of this is a pure function for exactly that reason: the request
 * builder is the whole privacy guarantee and has to be checked directly, and a
 * suite that called a third party would be flaky and would itself disclose
 * something.
 */

describe("what leaves the machine", () => {
  it("rounds coordinates to about eleven kilometres", () => {
    expect(roundCoordinate(51.53412)).toBe(51.5);
    expect(roundCoordinate(-0.16302)).toBe(-0.2);
    expect(roundCoordinate(-0.12)).toBe(-0.1);
  });

  it("never puts a precise position in the URL", () => {
    const url = buildWeatherUrl(
      51.534127891,
      -0.163024991,
      new Date("2026-05-02T08:00:00Z"),
      new Date("2026-05-02T09:00:00Z"),
      new Date("2026-05-03T00:00:00Z"),
    );

    // The exact figures a route would reveal must not survive into the request.
    expect(url).not.toContain("51.534");
    expect(url).not.toContain("0.163");
    expect(url).toContain("latitude=51.5");
    expect(url).toContain("longitude=-0.2");
  });

  it("asks the recent endpoint for a recent run and the archive for an old one", () => {
    const start = new Date("2026-05-02T08:00:00Z");
    const end = new Date("2026-05-02T09:00:00Z");

    // A run finished this morning is not in the reanalysis archive yet.
    expect(buildWeatherUrl(51.5, -0.1, start, end, new Date("2026-05-03T00:00:00Z"))).toContain(
      "api.open-meteo.com/v1/forecast",
    );
    expect(buildWeatherUrl(51.5, -0.1, start, end, new Date("2027-05-03T00:00:00Z"))).toContain(
      "archive-api.open-meteo.com",
    );
  });
});

describe("picking the hours a run touched", () => {
  it("takes every hour the run overlapped", () => {
    expect(
      hoursSpanned(new Date("2026-05-02T08:50:00Z"), new Date("2026-05-02T10:10:00Z")),
    ).toEqual(["2026-05-02T08", "2026-05-02T09", "2026-05-02T10"]);
  });

  it("takes the one hour a short run sat inside", () => {
    expect(
      hoursSpanned(new Date("2026-05-02T08:05:00Z"), new Date("2026-05-02T08:25:00Z")),
    ).toEqual(["2026-05-02T08"]);
  });
});

describe("reading a provider response", () => {
  const body = {
    latitude: 51.5,
    longitude: -0.1,
    hourly: {
      time: ["2026-05-02T07:00", "2026-05-02T08:00", "2026-05-02T09:00"],
      temperature_2m: [11, 14, 16],
      relative_humidity_2m: [80, 72, 65],
      apparent_temperature: [10, 13, 15],
      wind_speed_10m: [10, 20, 30],
      wind_direction_10m: [350, 10, 350],
      precipitation: [0, 0.2, 0],
    },
  };

  it("keeps only the hours the run overlapped", () => {
    const weather = parseWeather(
      body,
      51.53,
      -0.11,
      new Date("2026-05-02T08:10:00Z"),
      new Date("2026-05-02T09:20:00Z"),
    );

    expect(weather).not.toBeNull();
    expect(weather!.hours.map((hour) => hour.timeIso)).toEqual([
      "2026-05-02T08:00",
      "2026-05-02T09:00",
    ]);
    expect(weather!.temperatureC).toBe(15);
    expect(weather!.requestedLat).toBe(51.5);
  });

  it("averages wind direction as an angle, not as a number", () => {
    const weather = parseWeather(
      body,
      51.5,
      -0.1,
      new Date("2026-05-02T07:10:00Z"),
      new Date("2026-05-02T08:10:00Z"),
    );

    // 350° and 10° average to north, not to the 180° a plain mean would give.
    // North is 0 and 360 at once, so the check is on the angular distance.
    const degrees = weather!.windFromDegrees!;
    const fromNorth = Math.min(degrees, 360 - degrees);
    expect(fromNorth).toBeLessThan(1);
    expect(compassPoint(degrees)).toBe("north");
  });

  it("gives back nothing when the grid has not been filled in yet", () => {
    const empty = {
      latitude: 51.5,
      longitude: -0.1,
      hourly: { time: ["2026-05-02T08:00"], temperature_2m: [null] },
    };
    expect(
      parseWeather(
        empty,
        51.5,
        -0.1,
        new Date("2026-05-02T08:10:00Z"),
        new Date("2026-05-02T08:40:00Z"),
      ),
    ).toBeNull();
  });
});

describe("wind against a runner", () => {
  it("calls wind from ahead a headwind and wind from behind a tailwind", () => {
    // Wind from the north, running north: straight into it.
    expect(windComponents(20, 0, 0).headwindKmh).toBeCloseTo(20, 5);
    // Wind from the north, running south: it is behind.
    expect(windComponents(20, 0, 180).headwindKmh).toBeCloseTo(-20, 5);
  });

  it("calls wind from the side a crosswind", () => {
    const side = windComponents(20, 90, 0);
    expect(side.headwindKmh).toBeCloseTo(0, 5);
    expect(side.crosswindKmh).toBeCloseTo(20, 5);
  });

  it("reports less wind at running height than at ten metres", () => {
    const scaled = windAtRunnerHeight(30);
    expect(scaled).toBeLessThan(30);
    expect(scaled).toBeGreaterThan(10);
  });
});

describe("bearings", () => {
  it("points north, east and south-west correctly", () => {
    expect(bearingDegrees({ lat: 51.5, lon: -0.1 }, { lat: 51.6, lon: -0.1 })).toBeCloseTo(0, 1);
    expect(bearingDegrees({ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: 0.0 })).toBeCloseTo(90, 1);
    expect(bearingDegrees({ lat: 51.5, lon: -0.1 }, { lat: 51.4, lon: -0.1 })).toBeCloseTo(180, 1);
  });

  it("never returns a negative bearing", () => {
    const west = bearingDegrees({ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: -0.2 });
    expect(west).toBeGreaterThan(0);
    expect(west).toBeCloseTo(270, 1);
  });

  it("names the compass point", () => {
    expect(compassPoint(0)).toBe("north");
    expect(compassPoint(270)).toBe("west");
    expect(compassPoint(359)).toBe("north");
  });
});

describe("heat", () => {
  const at = (temp: number, humidity = 50): RunWeather => ({
    hours: [],
    temperatureC: temp,
    apparentTemperatureC: temp,
    humidityPct: humidity,
    requestedLat: 51.5,
    requestedLon: -0.1,
    provider: "test",
  });

  it("bands conditions by what they feel like", () => {
    expect(heatLevel(at(2))).toBe("cold");
    expect(heatLevel(at(15))).toBe("mild");
    expect(heatLevel(at(21))).toBe("warm");
    expect(heatLevel(at(30))).toBe("hot");
  });

  it("only offers heat as an explanation once it is genuinely warm", () => {
    expect(heatCouldExplainDrift(at(12))).toBe(false);
    expect(heatCouldExplainDrift(at(26))).toBe(true);
  });

  it("treats warm and humid as the expensive combination", () => {
    expect(isMuggy(at(24, 80))).toBe(true);
    expect(isMuggy(at(24, 40))).toBe(false);
    expect(isMuggy(at(5, 95))).toBe(false);
  });
});
