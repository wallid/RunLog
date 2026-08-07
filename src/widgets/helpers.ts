import type { ActivityEvent, DerivedActivity, HrZone, Sample } from "@/model/activity";
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

export const ZONE_SOFT_COLORS: Record<HrZone, string> = {
  1: "var(--zone-1-soft)",
  2: "var(--zone-2-soft)",
  3: "var(--zone-3-soft)",
  4: "var(--zone-4-soft)",
  5: "var(--zone-5-soft)",
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
