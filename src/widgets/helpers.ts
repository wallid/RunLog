import type { ActivityEvent, DerivedActivity, HrZone, Sample } from "@/model/activity";
import type { TrackRegion } from "@/viz/Track";
import { bandDefinition, bandForZone, type IntensityBand } from "@/model/zones";
import { collect, mean } from "@/lib/stats";
import { formatDistanceShort } from "@/lib/format";

/** Shared logic several widgets need, kept in one place rather than copied. */

export const ZONE_COLORS: Record<HrZone, string> = {
  1: "var(--zone-1)",
  2: "var(--zone-2)",
  3: "var(--zone-3)",
  4: "var(--zone-4)",
  5: "var(--zone-5)",
};

/** The three washes, in the order they are read. */
export const BAND_COLORS: Record<IntensityBand, string> = {
  easy: "var(--zone-band-easy)",
  steady: "var(--zone-band-steady)",
  hard: "var(--zone-band-hard)",
};

export const TERRAIN_COLORS = {
  uphill: "var(--terrain-uphill)",
  flat: "var(--terrain-flat)",
  downhill: "var(--terrain-downhill)",
} as const;

/** Contiguous runs of a value along the sample series. */
export interface Run<T> {
  value: T;
  startT: number;
  endT: number;
  startDistanceM: number;
  endDistanceM: number;
  durationS: number;
}

export function findRuns<T>(
  samples: Sample[],
  pick: (sample: Sample) => T | undefined,
): Run<T>[] {
  const runs: Run<T>[] = [];
  let current: Run<T> | null = null;

  for (const sample of samples) {
    const value = pick(sample);
    if (value === undefined) {
      current = null;
      continue;
    }
    if (current && current.value === value) {
      current.endT = sample.t;
      current.endDistanceM = sample.distanceM;
      current.durationS = current.endT - current.startT + 1;
      continue;
    }
    current = {
      value,
      startT: sample.t,
      endT: sample.t,
      startDistanceM: sample.distanceM,
      endDistanceM: sample.distanceM,
      durationS: 1,
    };
    runs.push(current);
  }

  return runs;
}

/** The most prominent climb of the run, when there is one. */
export function mainClimb(activity: DerivedActivity): ActivityEvent | undefined {
  const climbs = activity.events.filter((e) => e.type === "climb");
  if (climbs.length === 0) return undefined;
  return climbs.reduce((a, b) =>
    b.metrics.elevationChangeM > a.metrics.elevationChangeM ? b : a,
  );
}

/** Averages a metric over an event's span. */
export function meanOver(
  activity: DerivedActivity,
  event: { startT: number; endT: number },
  pick: (sample: Sample) => number | undefined,
): number | undefined {
  const window = activity.samples.filter((s) => s.t >= event.startT && s.t <= event.endT);
  const values = collect(window, pick);
  return values.length > 0 ? mean(values) : undefined;
}

/**
 * Names where in the run something happened, in the reader's own terms.
 *
 * Positions are given as distance because that is how runners describe a route,
 * even when the page is currently showing time.
 */
export function positionPhrase(startDistanceM: number, endDistanceM?: number): string {
  if (endDistanceM === undefined || endDistanceM - startDistanceM < 50) {
    return formatDistanceShort(startDistanceM);
  }
  return `${formatDistanceShort(startDistanceM)} and ${formatDistanceShort(endDistanceM)}`;
}

/** Joins a list into prose: "a, b and c". */
export function listPhrase(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** A percentage of the run, phrased for a sentence. */
export function fractionOfRun(seconds: number, totalSeconds: number): string {
  if (totalSeconds <= 0) return "0%";
  return `${Math.round((seconds / totalSeconds) * 100)}%`;
}

/**
 * Whether a metric moved enough to be worth mentioning.
 *
 * These floors keep the explanations honest: below them a difference is inside
 * the noise of consumer sensors and should not be narrated as a change.
 */
export const NOISE_FLOOR = {
  paceSecPerKm: 5,
  hrBpm: 3,
  powerPct: 5,
  cadenceSpm: 2,
  gradientPct: 0.5,
} as const;

/**
 * Effort bands to lay behind a track, so how hard a stretch was is readable
 * without a second chart.
 *
 * Grouped by intensity rather than by zone, because that is what the wash can
 * actually say: a boundary is only drawn where the answer changes from easy to
 * steady to hard. Runs without heart-rate zones get nothing rather than a grey
 * stand-in.
 */
export function zoneRegions(activity: DerivedActivity): TrackRegion[] {
  if (!activity.availableMetrics.has("hrZone")) return [];
  const regions: TrackRegion[] = [];
  let current: TrackRegion | null = null;
  let currentBand: IntensityBand | null = null;

  for (const sample of activity.samples) {
    if (sample.hrZone === undefined) {
      current = null;
      currentBand = null;
      continue;
    }
    const band = bandForZone(sample.hrZone);
    if (current && currentBand === band) {
      current.endT = sample.t;
      continue;
    }
    current = {
      startT: sample.t,
      endT: sample.t,
      color: BAND_COLORS[band],
      label: bandDefinition(band).name,
      behind: true,
    };
    currentBand = band;
    regions.push(current);
  }

  return regions;
}

/** The intensities a run actually spent time in, in order. */
export function bandsUsed(activity: DerivedActivity): IntensityBand[] {
  const seen = new Set<IntensityBand>();
  for (const sample of activity.samples) {
    if (sample.hrZone !== undefined) seen.add(bandForZone(sample.hrZone));
  }
  return (["easy", "steady", "hard"] as const).filter((band) => seen.has(band));
}
