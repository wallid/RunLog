// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import { buildActivity } from "@/model/pipeline";
import type { DerivedActivity } from "@/model/activity";
import type { RunWeather } from "@/model/weather";
import { WIDGETS } from "./registry";
import { isWidgetSupported, SECTION_LABELS } from "./contract";
import { buildWidgets, groupWidgets } from "./buildWidgets";
import { findFatigueOnset, splitIntoSegments } from "./labHelpers";

/**
 * The experimental lab, exercised on a run built to contain what it looks for.
 *
 * Neither demo file carries every signal these cards read, and none of them
 * contains a fatigue onset anyone can point to — so the only way to test the
 * detection is to plant one and check it comes back. The run below is
 * deliberately shaped: terrain that rises and falls early so the gradient bands
 * have something in them, then flat ground for the rest, with every signal
 * stepping the way fatigue steps them at a known moment on that flat ground.
 * A detector that finds the climb instead of the plant has failed.
 */

const DURATION_S = 3600;
const BASE_SPEED = 3.0;
const BASE_HR = 145;
const BASE_CADENCE = 172;
const BASE_POWER = 260;

/**
 * Rolling ground rather than one climb.
 *
 * A single hill early in the run would sit inside the stretch the durability
 * cards compare and swamp the planted change — which is a fair thing for those
 * cards to refuse to read, but it would mean this fixture never exercised them.
 * A hill that repeats every 275 seconds puts exactly three cycles in each of
 * the four quarters those cards use, so terrain cancels within every stretch
 * while still filling the gradient bands the terrain card reads.
 */
const HILL_PERIOD_S = 275;
const HILL_GRADIENT = 0.042;

/** The planted change. Every signal steps at once, on ground that did not change. */
const ONSET_T = 2400;

function syntheticRun(): RawActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  let distanceM = 0;
  let elevationM = 0;

  for (let t = 0; t < DURATION_S; t++) {
    const gradient = HILL_GRADIENT * Math.sin((2 * Math.PI * t) / HILL_PERIOD_S);
    const tired = t >= ONSET_T;

    // A slow wander on every signal, so nothing is a perfectly flat line and
    // the detector has to find the step rather than the only variation present.
    const wander = Math.sin(t / 130);

    // Every signal answers the gradient the way a runner does, so the terrain
    // card has real differences to find rather than planted constants.
    const speedMps = BASE_SPEED * (1 - 3 * gradient) * (tired ? 0.94 : 1) + 0.03 * wander;
    distanceM += speedMps;
    elevationM += gradient * speedMps;

    samples.push({
      time: new Date(start.getTime() + t * 1000),
      // A closed loop rather than a straight line, so every split faces a
      // different way and the wind card has real bearings to work with.
      ...loopPosition(distanceM),
      elevationM,
      distanceM,
      speedMps,
      hrBpm: BASE_HR + 260 * gradient + (tired ? 12 : 0) + 3 * wander,
      cadenceSpm: BASE_CADENCE - 150 * gradient - (tired ? 6 : 0) + 2 * wander,
      powerW: BASE_POWER + 700 * gradient - (tired ? 20 : 0) + 6 * wander,
    });
  }

  return {
    source: "fit",
    name: "Synthetic durability run",
    sport: "running",
    startedAt: start,
    samples,
    timerEvents: [],
    laps: [],
    warnings: [],
  };
}

/** A circular route of about the run's length, centred on one spot. */
function loopPosition(distanceM: number): { lat: number; lon: number } {
  const CENTRE_LAT = 51.5;
  const CENTRE_LON = -0.12;
  const RADIUS_M = 1600;
  const angle = distanceM / RADIUS_M;
  const lat = CENTRE_LAT + (RADIUS_M * Math.cos(angle)) / 111_320;
  const lon =
    CENTRE_LON + (RADIUS_M * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { lat, lon };
}

/**
 * Conditions attached by hand, never fetched.
 *
 * The weather cards must be testable without a network, and a test that called
 * a third-party API would be both flaky and a small privacy leak of its own.
 */
const SYNTHETIC_WEATHER: RunWeather = {
  hours: [
    {
      timeIso: "2026-05-02T08:00",
      temperatureC: 26,
      apparentTemperatureC: 28,
      humidityPct: 74,
      windSpeedKmh: 24,
      windFromDegrees: 270,
      precipitationMm: 0,
    },
  ],
  temperatureC: 26,
  apparentTemperatureC: 28,
  humidityPct: 74,
  windSpeedKmh: 24,
  windFromDegrees: 270,
  precipitationMm: 0,
  requestedLat: 51.5,
  requestedLon: -0.1,
  gridLat: 51.5,
  gridLon: -0.1,
  gridDistanceM: 0,
  provider: "Open-Meteo",
};

const activity: DerivedActivity = {
  ...buildActivity(syntheticRun()),
  weather: SYNTHETIC_WEATHER,
};
const labWidgets = WIDGETS.filter((widget) => widget.section === "lab");

describe("the lab's shared machinery", () => {
  it("cuts the run into stretches of equal moving time", () => {
    const segments = splitIntoSegments(activity, 4);
    expect(segments).toHaveLength(4);

    const seconds = segments.map((segment) => segment.seconds);
    expect(Math.max(...seconds) - Math.min(...seconds)).toBeLessThanOrEqual(4);
    for (const segment of segments) {
      expect(segment.metresPerBeat).toBeGreaterThan(0);
      expect(segment.wattsPerBeat).toBeGreaterThan(0);
    }
  });

  it("sees efficiency fall across a run that was planted to fade", () => {
    const [first, , , last] = splitIntoSegments(activity, 4);
    expect(last.metresPerBeat!).toBeLessThan(first.metresPerBeat!);
    expect(last.hrBpm!).toBeGreaterThan(first.hrBpm!);
  });

  it("finds the planted onset", () => {
    const onset = findFatigueOnset(activity);
    expect(onset).not.toBeNull();
    expect(Math.abs(onset!.t - ONSET_T)).toBeLessThan(300);

    // All four signals were stepped, so all four should be reported.
    const moved = onset!.shifts.map((shift) => shift.metric).sort();
    expect(moved).toEqual(["cadence", "heartRate", "pace", "power"]);
    expect(onset!.gradientDeltaPct).toBeLessThanOrEqual(0.5);
  });

  it("refuses a run with nothing to find", () => {
    const flat = buildActivity({
      ...syntheticRun(),
      samples: syntheticRun().samples.map((sample, t) => ({
        ...sample,
        elevationM: 0,
        speedMps: BASE_SPEED,
        distanceM: BASE_SPEED * t,
        hrBpm: BASE_HR,
        cadenceSpm: BASE_CADENCE,
        powerW: BASE_POWER,
      })),
      // Long enough to clear the duration gate, so this tests the signal
      // requirement rather than simply being too short to look at.
    });
    expect(findFatigueOnset(flat)).toBeNull();
  });
});

describe("every lab widget on a run that carries everything", () => {
  it("is a section of eleven, all beta, all cited, all labelled", () => {
    expect(labWidgets).toHaveLength(11);
    for (const widget of labWidgets) {
      expect(widget.status).toBe("beta");
      expect(isWidgetSupported(widget, activity)).toBe(true);
      // Every claim in this section leans on published work; the card has to
      // say which, or the reader cannot check it.
      expect(widget.references.length).toBeGreaterThan(0);
      for (const reference of widget.references) {
        expect(reference.url).toMatch(/^https:\/\//);
        expect(reference.label.length).toBeGreaterThan(30);
        expect(reference.detail.length).toBeGreaterThan(5);
      }
      // The product rule: a reader must never have to guess whether a figure
      // was recorded, computed from recordings, or modelled.
      expect(["measured", "derived", "estimated"]).toContain(widget.provenance);
    }
  });

  for (const widget of labWidgets) {
    it(`${widget.id} computes, narrates and renders`, () => {
      const result = widget.compute(activity);
      expect(result).not.toBeNull();

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

      expect(narration.observations.length).toBeGreaterThan(0);
      for (const explanation of narration.explanations) {
        expect(["high", "medium", "low"]).toContain(explanation.confidence);
        expect(explanation.text.length).toBeGreaterThan(15);
      }
      for (const point of narration.teaching) {
        expect(point.text.length).toBeGreaterThan(30);
      }

      const markup = renderToStaticMarkup(
        <widget.View result={result as never} activity={activity} />,
      );
      expect(markup.length).toBeGreaterThan(0);
      expect(markup).not.toContain("NaN");
      expect(markup).not.toContain("undefined");
    });
  }
});

describe("what each lab card claims", () => {
  function narrationFor(id: string) {
    const widget = labWidgets.find((candidate) => candidate.id === id)!;
    const result = widget.compute(activity);
    return { result, narration: widget.narrate(result, activity) };
  }

  it("reads durability as efficiency falling on comparable ground", () => {
    const { narration } = narrationFor("cardiac-durability");
    expect(narration.information[0].value).toContain("−");
    // Terrain is comparable here, so it must not fall back to the caveat.
    expect(narration.explanations[0].confidence).toBe("medium");
    expect(narration.explanations[0].text).toContain("cost more heartbeats");
  });

  it("reads power against heart rate as the same work costing more", () => {
    const { narration } = narrationFor("power-efficiency");
    expect(narration.information[0].label).toBe("Cost change");
    expect(narration.information[0].value).toContain("−");
  });

  it("separates the cadence drop from the slowdown that explains part of it", () => {
    const { result, narration } = narrationFor("cadence-durability");
    const residual = (result as { residualSpm?: number }).residualSpm;

    // Cadence was planted 6 spm down while speed fell 6%; the run's own
    // speed–cadence line accounts for roughly half of that, leaving a residual.
    expect(residual).toBeDefined();
    expect(residual!).toBeLessThan(0);
    expect(narration.explanations[0].text).toContain("further than the slowdown");
  });

  it("splits the slowdown between turnover and step length", () => {
    const { result, narration } = narrationFor("stride-drift");
    const r = result as { speedPct: number; cadencePct: number; stridePct: number };

    expect(r.speedPct).toBeLessThan(0);
    // The whole point of this card: the two parts account for the change
    // exactly, because speed *is* turnover times step length.
    expect(r.cadencePct + r.stridePct).toBeCloseTo(r.speedPct, 0);
    expect(narration.explanations[0].text).toContain("turnover");
  });

  it("reports speed bought per unit of output, and calls it estimated", () => {
    const widget = labWidgets.find((w) => w.id === "mechanical-efficiency")!;
    const { narration } = narrationFor("mechanical-efficiency");

    // Power is modelled by the watch, so nothing built on it may claim to be
    // measured — this is the rule the whole provenance field exists to enforce.
    expect(widget.provenance).toBe("estimated");
    expect(narration.information[0].label).toBe("Speed per 100 W");
    expect(narration.information[0].value).toContain("km/h");
  });

  it("labels arithmetic as derived and searches as estimated", () => {
    const level = (id: string) => labWidgets.find((w) => w.id === id)!.provenance;

    // Speed is exactly turnover times step length, so nothing is modelled.
    expect(level("stride-drift")).toBe("derived");
    expect(level("cardiac-durability")).toBe("derived");
    // A change-point search and a least-squares fit are both models.
    expect(level("fatigue-onset")).toBe("estimated");
    expect(level("terrain-response")).toBe("estimated");
    // Reporting what the file contains is the one purely measured card.
    expect(level("data-confidence")).toBe("measured");
  });

  it("measures wobble inside windows rather than drift across the run", () => {
    const { result, narration } = narrationFor("rhythm-stability");
    const tracks = (result as { tracks: { key: string; cvPct: number }[] }).tracks;

    // Cadence, step length and power were all planted on this run.
    expect(tracks.map((t) => t.key).sort()).toEqual(["cadence", "power", "stride"]);
    for (const track of tracks) expect(track.cvPct).toBeGreaterThan(0);
    // No composite score: the card must not invent a threshold for "steady".
    expect(narration.information.some((s) => s.value.includes("/100"))).toBe(false);
    expect(narration.explanations[0].confidence).toBe("low");
  });

  it("concludes that both sides gave way on a run planted for exactly that", () => {
    const { result, narration } = narrationFor("what-changed");
    const verdict = (result as { verdict: string }).verdict;

    // The fixture steps heart rate up and speed down at the same moment, so
    // the engine and the stride should both be named.
    expect(verdict).toBe("both");
    expect(narration.information[0].value).toBe("Both");
    // Weather is attached to the fixture and warm, so heat must be offered.
    expect(narration.explanations[0].text).toContain("heat");
    // Both sides were readable here, so neither "could not be read" note fires.
    expect(narration.explanations[0].text).not.toContain("could not be read");
  });

  it("never reports an unread side as one that held", () => {
    // A run with no cadence cannot say anything about the stride, and a short
    // run cannot say anything about the cardiovascular cost. Presenting either
    // silence as "it held steady" would turn a gap into a finding.
    const noCadence = buildActivity({
      ...syntheticRun(),
      samples: syntheticRun().samples.map((sample) => ({
        ...sample,
        cadenceSpm: undefined,
      })),
    });

    const widget = labWidgets.find((w) => w.id === "what-changed")!;
    const result = widget.compute(noCadence);
    expect(result).not.toBeNull();

    const text = widget.narrate(result, noCadence).explanations[0].text;
    expect(text).toContain("stride could not be read");
    expect(text).not.toContain("the stride held its shape");
  });

  it("names where the onset sat and how many signals agreed", () => {
    const { narration } = narrationFor("fatigue-onset");
    expect(narration.information[2].value).toBe("4 of 4");
    expect(narration.explanations[0].confidence).toBe("medium");
    expect(narration.observations[1].text).toContain("ground was not what changed");
  });

  it("describes the climb against the runner's own flat ground", () => {
    const { result, narration } = narrationFor("terrain-response");
    const bands = (result as { bands: { label: string }[] }).bands;
    expect(bands.map((band) => band.label)).toContain("Flat");
    expect(bands.map((band) => band.label)).toContain("Gentle climb");
    // Cadence was planted lower on the climb, so the card should say the
    // stride was not what shortened.
    expect(narration.explanations[0].text).toContain("turning it over more slowly");
  });

  it("says which measurements the file does not carry", () => {
    const { narration } = narrationFor("data-confidence");
    const absent = narration.observations[1].text;
    expect(absent).toContain("ground-contact time");
    expect(absent).toContain("vertical oscillation");
    // Step length is derived from speed and cadence, so it must not be listed
    // as missing while the stride card is on the same page reporting it.
    expect(absent).toContain("directly measured stride length");
    expect(absent).toContain("left–right balance");
    expect(absent).not.toMatch(/(?<!measured )stride length/);
  });
});

describe("the lab as a section", () => {
  it("is hidden until a reader asks for it", () => {
    const ids = new Set(buildWidgets(activity).map((item) => item.widget.id));
    for (const widget of labWidgets) expect(ids.has(widget.id)).toBe(false);
  });

  it("groups into one contiguous section at the end of the page", () => {
    const groups = groupWidgets(buildWidgets(activity, { includeExperimental: true }));
    const lab = groups.filter((group) => group.section === "lab");

    expect(lab).toHaveLength(1);
    expect(lab[0].label).toBe(SECTION_LABELS.lab);
    expect(lab[0].widgets).toHaveLength(11);
    expect(groups[groups.length - 1].section).toBe("lab");
  });
});
