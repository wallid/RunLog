// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RawActivity, RawSample } from "@/parsers/types";
import type { DerivedActivity } from "@/model/activity";
import { buildActivity } from "@/model/pipeline";
import { nearestMarker, Track, type TrackMarker } from "./Track";

/**
 * Naming the event under the cursor.
 *
 * A marker is a one-pixel dashed line, which nobody can point at. What the
 * reader points at is the run, and the track answers with whichever marker that
 * lands on — so what is under test is the reach, not a hover.
 */

/** A metre a pixel, which makes the arithmetic in these cases readable. */
const toPixels = (t: number) => t;

const GEL: TrackMarker = { t: 100, label: "Gel at 2.7 km", detail: "Caffeine gel" };
const DRINK: TrackMarker = { t: 118, label: "Drink at 3.1 km" };

describe("which marker the cursor has reached", () => {
  it("finds nothing before the reader has picked a position", () => {
    expect(nearestMarker([GEL], toPixels, null)).toBeNull();
  });

  it("finds the marker the cursor is sitting on", () => {
    expect(nearestMarker([GEL], toPixels, 100)?.marker).toBe(GEL);
  });

  it("reaches a little either side, so a marker can be aimed at", () => {
    expect(nearestMarker([GEL], toPixels, 108)?.marker).toBe(GEL);
    expect(nearestMarker([GEL], toPixels, 92)?.marker).toBe(GEL);
  });

  it("lets go once the cursor has moved past it", () => {
    expect(nearestMarker([GEL], toPixels, 140)).toBeNull();
  });

  it("picks the nearer of two events close together", () => {
    // Both are within reach of 110; the drink is nearer.
    expect(nearestMarker([GEL, DRINK], toPixels, 110)?.marker).toBe(DRINK);
    expect(nearestMarker([GEL, DRINK], toPixels, 104)?.marker).toBe(GEL);
  });

  it("reports where to draw the label, not where the cursor was", () => {
    // Off by a few pixels, the label still belongs over the marker.
    expect(nearestMarker([GEL], toPixels, 106)?.x).toBe(100);
  });
});

const SPEED_MPS = 3.0;

function steadyRun(durationS = 1800): DerivedActivity {
  const start = new Date("2026-05-02T08:00:00Z");
  const samples: RawSample[] = [];
  for (let t = 0; t <= durationS; t++) {
    samples.push({
      time: new Date(start.getTime() + t * 1000),
      distanceM: t * SPEED_MPS,
      elevationM: 100,
      speedMps: SPEED_MPS,
      hrBpm: 150,
    });
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

describe("a marker on an idle track", () => {
  const activity = steadyRun();
  const markup = renderToStaticMarkup(
    <Track
      activity={activity}
      height={60}
      widgetId="test"
      ariaLabel="A run"
      markers={[{ t: 900, label: "Gel at 2.7 km", detail: "Caffeine gel", color: "red" }]}
    >
      {() => null}
    </Track>,
  );

  it("draws a cap, so there is something visibly placed there", () => {
    expect(markup).toContain("<circle");
    expect(markup).toContain('cy="56"');
  });

  it("carries the name as a tooltip on the drawing", () => {
    expect(markup).toContain("<title>Gel at 2.7 km</title>");
  });

  it("keeps what the reader wrote until they ask for it", () => {
    // The note belongs to the label, which only appears at the cursor.
    expect(markup).not.toContain("Caffeine gel");
    expect(markup).not.toContain("undefined");
  });
});
