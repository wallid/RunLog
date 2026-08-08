import type { HrZone } from "./activity";
import { clamp } from "@/lib/stats";

/**
 * Heart-rate zones as percentages of maximum heart rate.
 *
 * These are the common five-zone percentages. The product deliberately treats
 * them as a convention rather than a truth: every zone widget says so, because
 * the boundaries only mean something once the runner has set a real maximum.
 */
export interface ZoneDefinition {
  zone: HrZone;
  name: string;
  /** Lower bound as a fraction of maximum heart rate, inclusive. */
  fromPct: number;
  /** Upper bound as a fraction of maximum heart rate, exclusive (1.01 for Z5). */
  toPct: number;
  description: string;
}

export const ZONE_DEFINITIONS: ZoneDefinition[] = [
  {
    zone: 1,
    name: "Zone 1",
    fromPct: 0,
    toPct: 0.6,
    description: "Very light effort, typically warm-up or recovery.",
  },
  {
    zone: 2,
    name: "Zone 2",
    fromPct: 0.6,
    toPct: 0.7,
    description: "Comfortable aerobic effort that can be held for a long time.",
  },
  {
    zone: 3,
    name: "Zone 3",
    fromPct: 0.7,
    toPct: 0.8,
    description: "Steady effort where conversation becomes harder.",
  },
  {
    zone: 4,
    name: "Zone 4",
    fromPct: 0.8,
    toPct: 0.9,
    description: "Hard effort approaching threshold.",
  },
  {
    zone: 5,
    name: "Zone 5",
    fromPct: 0.9,
    toPct: 1.01,
    description: "Very hard effort that can only be held briefly.",
  },
];

export const ALL_ZONES: HrZone[] = [1, 2, 3, 4, 5];

/**
 * The three intensities the five zones group into.
 *
 * Five zones is a finer grid than the body actually works on. What separates
 * running is where the effort sits relative to the two thresholds — below the
 * first, between them, above the second — which is the easy/steady/hard split
 * coaches describe and the one polarised training is argued in. The five-zone
 * scale maps onto it cleanly enough: 1 and 2 are below, 3 straddles, 4 and 5
 * are above.
 *
 * It earns its place here twice. It is what a reader is usually trying to work
 * out — whether a stretch was easy or hard, not whether it was Zone 2 or Zone
 * 3 — and it is what the page can colour honestly, because three background
 * washes can be told apart and five cannot.
 */
export type IntensityBand = "easy" | "steady" | "hard";

export interface IntensityBandDefinition {
  band: IntensityBand;
  name: string;
  zones: HrZone[];
  description: string;
}

export const INTENSITY_BANDS: IntensityBandDefinition[] = [
  {
    band: "easy",
    name: "Easy",
    zones: [1, 2],
    description:
      "Below the first threshold: conversational, and sustainable for as long as the legs hold out.",
  },
  {
    band: "steady",
    name: "Steady",
    zones: [3],
    description:
      "Between the thresholds: comfortably hard, the pace of a long tempo rather than a race.",
  },
  {
    band: "hard",
    name: "Hard",
    zones: [4, 5],
    description:
      "Above the second threshold: effort that is being spent rather than sustained, and is on a clock.",
  },
];

export function bandForZone(zone: HrZone): IntensityBand {
  return zone <= 2 ? "easy" : zone === 3 ? "steady" : "hard";
}

export function bandDefinition(band: IntensityBand): IntensityBandDefinition {
  return INTENSITY_BANDS.find((definition) => definition.band === band)!;
}

/** "Zone 4 · Hard" — the zone said with the thing a reader wants from it. */
export function zoneWithBand(zone: HrZone): string {
  return `Zone ${zone} · ${bandDefinition(bandForZone(zone)).name}`;
}

/** "Zones 1–2", or "Zone 3" where an intensity covers only one. */
export function bandZoneRange(band: IntensityBand): string {
  const { zones } = bandDefinition(band);
  return zones.length === 1
    ? `Zone ${zones[0]}`
    : `Zones ${zones[0]}–${zones[zones.length - 1]}`;
}

export function zoneForHeartRate(bpm: number, maxHr: number): HrZone {
  if (maxHr <= 0) return 1;
  const fraction = bpm / maxHr;
  for (const def of ZONE_DEFINITIONS) {
    if (fraction < def.toPct) return def.zone;
  }
  return 5;
}

export function zoneBoundsBpm(zone: HrZone, maxHr: number): { from: number; to: number } {
  const def = ZONE_DEFINITIONS.find((d) => d.zone === zone)!;
  return {
    from: Math.round(def.fromPct * maxHr),
    to: Math.round(Math.min(def.toPct, 1) * maxHr),
  };
}

export function zoneDefinition(zone: HrZone): ZoneDefinition {
  return ZONE_DEFINITIONS.find((d) => d.zone === zone)!;
}

/**
 * How close a single run's peak heart rate typically comes to a true maximum.
 *
 * Even a hard effort rarely reaches a runner's actual ceiling, so treating the
 * observed peak as the maximum pushes almost the whole run into Zone 5 and
 * makes the zone breakdown useless. Dividing by this factor produces a working
 * maximum that puts a hard run's average around Zone 4, which is where it
 * belongs.
 */
const PEAK_AS_FRACTION_OF_MAX = 0.94;

/**
 * A working maximum heart rate when the runner has not supplied one.
 *
 * This is a placeholder that keeps the zone widgets readable, not a
 * measurement. Every widget that uses zones says so and offers to take the
 * runner's real figure instead.
 */
export function estimateMaxHr(observedMaxHr: number | undefined): number | undefined {
  if (observedMaxHr === undefined || !Number.isFinite(observedMaxHr)) return undefined;
  return Math.round(clamp(observedMaxHr / PEAK_AS_FRACTION_OF_MAX, 160, 220));
}
