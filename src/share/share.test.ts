import { describe, expect, it } from "vitest";
import type { RawActivity, RawSample } from "@/parsers/types";
import { decodeSamples, encodeSamples } from "./codec";
import {
  buildShareDocument,
  readShareDocument,
  TRIM_METRES,
  type ShareDocument,
} from "./document";
import { isShareId, readShareLink, shareUrl, SHARE_PATH } from "./link";

/**
 * The wire format, and the promises made about it.
 *
 * Three things are being defended here, in order of how badly they fail.
 *
 * A run that does not survive the round trip is a shared link that draws the
 * wrong charts, and nobody would ever know: the numbers would simply be
 * slightly wrong on somebody else's screen.
 *
 * A route choice that does not actually strip coordinates is the worst bug this
 * feature could have. A runner who picked "hide the first and last 250 m" and
 * got a full trace has been told a lie by a checkbox, and has published their
 * front door believing they did not. It is tested here rather than trusted to
 * review.
 *
 * And a reader that accepts a malformed document is a page rendering somebody's
 * run out of whatever a mangled link happened to decode to.
 */

/** A synthetic run: a straight line, one sample a second, everything recorded. */
function makeSamples(count: number): RawSample[] {
  const start = new Date("2026-03-14T09:00:00Z").getTime();
  return Array.from({ length: count }, (_, i) => ({
    time: new Date(start + i * 1000),
    lat: 51.5 + i * 0.00002,
    lon: -0.12 + i * 0.00001,
    elevationM: 20 + Math.sin(i / 60) * 8,
    distanceM: i * 3.1,
    hrBpm: 140 + (i % 17),
    cadenceSpm: 168 + (i % 5),
    powerW: 250 + (i % 23),
  }));
}

function makeActivity(count = 600): RawActivity {
  return {
    source: "fit",
    name: "Test run",
    sport: "running",
    startedAt: new Date("2026-03-14T09:00:00Z"),
    samples: makeSamples(count),
    timerEvents: [{ time: new Date("2026-03-14T09:00:00Z"), kind: "start" }],
    laps: [{ startTime: new Date("2026-03-14T09:00:00Z"), totalDistanceM: 1000 }],
    session: { totalDistanceM: 1860, totalCalories: 180 },
    warnings: [],
  };
}

const FULL = { route: "full", events: true, weather: true } as const;

describe("the sample codec", () => {
  it("brings every channel back at the precision it promises", () => {
    const samples = makeSamples(300);
    const back = decodeSamples(encodeSamples(samples));

    expect(back).toHaveLength(samples.length);
    for (let i = 0; i < samples.length; i++) {
      expect(back[i].time.getTime()).toBe(samples[i].time.getTime());
      // Five decimal places of degree, one of a metre — the precisions the
      // codec documents. Anything coarser would be a silent loss of fidelity.
      expect(back[i].lat!).toBeCloseTo(samples[i].lat!, 5);
      expect(back[i].lon!).toBeCloseTo(samples[i].lon!, 5);
      expect(back[i].elevationM!).toBeCloseTo(samples[i].elevationM!, 1);
      expect(back[i].distanceM!).toBeCloseTo(samples[i].distanceM!, 1);
      expect(back[i].hrBpm).toBe(samples[i].hrBpm);
      expect(back[i].cadenceSpm).toBe(samples[i].cadenceSpm);
      expect(back[i].powerW).toBe(samples[i].powerW);
    }
  });

  it("leaves out a channel the device never recorded", () => {
    const samples = makeSamples(10).map(({ powerW: _powerW, ...rest }) => rest);
    expect(encodeSamples(samples).columns.powerW).toBeUndefined();
  });

  it("keeps a gap as a gap rather than filling it with a zero", () => {
    const samples = makeSamples(10);
    delete samples[4].hrBpm;

    const back = decodeSamples(encodeSamples(samples));
    expect(back[4].hrBpm).toBeUndefined();
    // A dropout must not shift the readings after it, which is the failure a
    // delta-encoded column invites.
    expect(back[5].hrBpm).toBe(samples[5].hrBpm);
  });

  it("refuses a column layout that is not one", () => {
    expect(decodeSamples(null)).toEqual([]);
    expect(decodeSamples({ startMs: "soon", dt: [], columns: {} })).toEqual([]);
    // A column of the wrong length would otherwise write past the samples.
    expect(
      decodeSamples({ startMs: 0, dt: [0, 1, 1], columns: { hrBpm: [140, 141] } }),
    ).toHaveLength(3);
  });

  it("is markedly smaller than the rows it replaces", () => {
    const samples = makeSamples(3600);
    const rows = JSON.stringify(samples).length;
    const columns = JSON.stringify(encodeSamples(samples)).length;
    expect(columns).toBeLessThan(rows / 2);
  });
});

describe("what a share carries", () => {
  it("survives the round trip with its events and its name", () => {
    const raw = makeActivity();
    const document = buildShareDocument(
      raw,
      {
        annotations: [
          { id: "a", t: 300, kind: "gel", note: "caffeine", createdAt: "2026-03-14T10:00:00Z" },
          { id: "b", t: 480, kind: "lactate", value: 3.8, createdAt: "2026-03-14T10:00:00Z" },
        ],
      },
      FULL,
    );

    const back = readShareDocument(JSON.parse(JSON.stringify(document)));
    expect(back).not.toBeNull();
    expect(back!.raw.name).toBe("Test run");
    expect(back!.raw.source).toBe("fit");
    expect(back!.raw.samples).toHaveLength(raw.samples.length);
    expect(back!.raw.session?.totalDistanceM).toBe(1860);
    expect(back!.raw.laps).toHaveLength(1);

    // The runner's own events are half the reason to share a run at all.
    expect(back!.annotations).toHaveLength(2);
    expect(back!.annotations[0].kind).toBe("gel");
    expect(back!.annotations[0].note).toBe("caffeine");
    expect(back!.annotations[1].value).toBe(3.8);
  });

  it("leaves the events out when the runner said not to", () => {
    const document = buildShareDocument(
      makeActivity(),
      { annotations: [{ id: "a", t: 10, kind: "gel", createdAt: "2026-03-14T10:00:00Z" }] },
      { ...FULL, events: false },
    );
    expect(document.annotations).toEqual([]);
    expect(document.choices.events).toBe(false);
  });

  it("drops an event of a kind this build has never heard of", () => {
    const document = buildShareDocument(makeActivity(), {}, FULL) as ShareDocument;
    document.annotations = [
      { id: "x", t: 5, kind: "teleport", createdAt: "2026-03-14T10:00:00Z" },
    ];
    expect(readShareDocument(document)!.annotations).toEqual([]);
  });
});

describe("what a share withholds", () => {
  it("strips every coordinate when the runner asked for no map", () => {
    const document = buildShareDocument(makeActivity(), {}, { ...FULL, route: "none" });
    const back = readShareDocument(JSON.parse(JSON.stringify(document)))!;

    expect(back.raw.samples.some((sample) => sample.lat !== undefined)).toBe(false);
    expect(back.raw.samples.some((sample) => sample.lon !== undefined)).toBe(false);
    // Everything that is not a position is untouched — the charts still work.
    expect(back.raw.samples.every((sample) => sample.hrBpm !== undefined)).toBe(true);
    expect(back.choices.route).toBe("none");
  });

  it("strips the ends when the runner asked for them trimmed", () => {
    // 600 samples at 3.1 m each is about 1,860 m, so both trims fit inside it.
    const raw = makeActivity(600);
    const total = raw.samples[raw.samples.length - 1].distanceM!;
    const document = buildShareDocument(raw, {}, { ...FULL, route: "trimmed" });
    const back = readShareDocument(JSON.parse(JSON.stringify(document)))!;

    for (const sample of back.raw.samples) {
      const covered = sample.distanceM!;
      const atAnEnd = covered <= TRIM_METRES || covered >= total - TRIM_METRES;
      // The whole promise of the trimmed option, stated as an assertion: no
      // position survives within the trim distance of either end.
      if (atAnEnd) expect(sample.lat).toBeUndefined();
    }

    // And the middle is still there, or the option would just be "no map".
    expect(back.raw.samples.some((sample) => sample.lat !== undefined)).toBe(true);
    expect(back.choices.route).toBe("trimmed");
    expect(back.choices.trimM).toBe(TRIM_METRES);
  });

  it("withholds the whole route when it cannot tell where the ends are", () => {
    const raw = makeActivity(50);
    for (const sample of raw.samples) delete sample.distanceM;

    const document = buildShareDocument(raw, {}, { ...FULL, route: "trimmed" });
    const back = readShareDocument(JSON.parse(JSON.stringify(document)))!;
    // Failing closed: a run whose ends cannot be located gives up its route
    // rather than publishing it on the grounds that trimming was impossible.
    expect(back.raw.samples.some((sample) => sample.lat !== undefined)).toBe(false);
  });

  it("keeps the weather only when it was offered", () => {
    const weather = {
      hours: [],
      temperatureC: 18,
      requestedLat: 51.5,
      requestedLon: -0.1,
      provider: "open-meteo",
    };
    const withIt = buildShareDocument(makeActivity(), { weather }, FULL);
    expect(readShareDocument(withIt)!.weather?.temperatureC).toBe(18);

    const without = buildShareDocument(makeActivity(), { weather }, { ...FULL, weather: false });
    expect(readShareDocument(without)!.weather).toBeUndefined();
  });
});

describe("reading an untrusted document", () => {
  it("refuses anything that is not a share", () => {
    expect(readShareDocument(null)).toBeNull();
    expect(readShareDocument("a run, honestly")).toBeNull();
    expect(readShareDocument({})).toBeNull();
    expect(readShareDocument({ version: 1 })).toBeNull();
  });

  it("refuses a run with no samples rather than rendering an empty page", () => {
    const document = buildShareDocument(makeActivity(), {}, FULL);
    document.run.samples = { startMs: 0, dt: [], columns: {} };
    expect(readShareDocument(document)).toBeNull();
  });

  it("refuses a document from a newer version", () => {
    const document = buildShareDocument(makeActivity(), {}, FULL);
    document.version = 99;
    expect(readShareDocument(document)).toBeNull();
  });

  it("loses a corrupt weather block without losing the run", () => {
    const document = buildShareDocument(makeActivity(), {}, FULL) as ShareDocument;
    // Every card reading this would divide by it.
    document.weather = { temperatureC: "warm" } as never;

    const back = readShareDocument(document);
    expect(back).not.toBeNull();
    expect(back!.weather).toBeUndefined();
    expect(back!.raw.samples.length).toBeGreaterThan(0);
  });
});

describe("share links", () => {
  it("puts the key in the fragment and the id in the path", () => {
    const url = shareUrl({ id: "7Qk2xN4vAe0Bd9Lm", key: "abcDEF123" }, "https://runlogapp.com");
    expect(url).toBe("https://runlogapp.com/s/7Qk2xN4vAe0Bd9Lm#k=abcDEF123");
    // The one property the whole design rests on: nothing after the `#` is
    // sent to a server, so the key must never appear before it.
    expect(url.split("#")[0]).not.toContain("abcDEF123");
  });

  it("reads back what it wrote", () => {
    const link = { id: "7Qk2xN4vAe0Bd9Lm", key: "abcDEF123" };
    const url = new URL(shareUrl(link, "https://runlogapp.com"));
    expect(readShareLink(url.pathname, url.hash)).toEqual(link);
  });

  it("reports a link that lost its key, rather than ignoring it", () => {
    // A chat client that truncated the fragment. The reader needs to be told
    // the link is incomplete, not dropped silently onto the upload page.
    expect(readShareLink(`${SHARE_PATH}7Qk2xN4vAe0Bd9Lm`, "")).toEqual({
      id: "7Qk2xN4vAe0Bd9Lm",
      key: "",
    });
  });

  it("is not fooled by paths that merely start the same way", () => {
    expect(readShareLink("/", "")).toBeNull();
    expect(readShareLink("/settings", "")).toBeNull();
    expect(readShareLink(`${SHARE_PATH}../../etc/passwd`, "")).toBeNull();
    expect(readShareLink(`${SHARE_PATH}short`, "")).toBeNull();
  });

  it("survives a tracking parameter glued onto the fragment", () => {
    expect(readShareLink(`${SHARE_PATH}7Qk2xN4vAe0Bd9Lm`, "#k=abcDEF123&utm_source=chat")).toEqual({
      id: "7Qk2xN4vAe0Bd9Lm",
      key: "abcDEF123",
    });
  });

  it("accepts only ids shaped like the ones the server makes", () => {
    expect(isShareId("7Qk2xN4vAe0Bd9Lm")).toBe(true);
    expect(isShareId("with/slash")).toBe(false);
    expect(isShareId("tiny")).toBe(false);
    expect(isShareId("")).toBe(false);
  });
});
