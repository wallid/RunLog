import type {
  ActivityEvent,
  DerivedActivity,
  GradientCategory,
  HrZone,
  Sample,
} from "@/model/activity";
import { distanceAtTime } from "@/model/activity";
import { gradientCategory } from "@/model/pipeline";
import { kindSpec, type RunAnnotation } from "@/model/annotations";
import type { TrackMarker, TrackRegion } from "@/viz/Track";
import { bandDefinition, bandForZone, type IntensityBand } from "@/model/zones";
import { collect, mean } from "@/lib/stats";
import { rollingMean } from "@/lib/smoothing";
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
 * The shortest stretch in a zone that counts as having been in it.
 *
 * Heart rate sitting near a boundary crosses it repeatedly without the effort
 * changing at all. Anything shorter than this is that flicker, and counting it
 * turns one sustained effort into a dozen entries.
 */
export const MIN_MEANINGFUL_ZONE_RUN_S = 20;

/**
 * How far apart in the run two kinds of ground were run.
 *
 * Gradient buckets pool seconds from wherever they happened to fall. When one
 * category clustered early and another late, a heart-rate comparison between
 * them is really a comparison between two moments of the run — and on any run
 * with cardiac drift that timing difference swamps the gradient. It is how a
 * card ends up reporting a lower heart rate uphill and calling it expected.
 *
 * Rather than test how far apart the two sat and give up, this removes the
 * drift and answers the question that was actually being asked: was heart rate
 * higher on this ground than it was on either side of it? Each second is
 * measured against a local baseline — the run's own heart rate over the minutes
 * around it — so a climb early in a run is compared with the early run and a
 * climb late in one with the late run.
 *
 * Returns the mean deviation from that baseline, in bpm, for each category.
 * A category with too few seconds to average is absent rather than zero.
 */
const HR_BASELINE_WINDOW_S = 300;

export function terrainHrDeviation(
  activity: DerivedActivity,
): Partial<Record<GradientCategory, number>> {
  if (!activity.availableMetrics.has("heartRate")) return {};

  const baseline = rollingMean(
    activity.samples.map((sample) => sample.hrBpm),
    HR_BASELINE_WINDOW_S,
  );

  const sums = new Map<GradientCategory, { total: number; count: number }>();
  for (let i = 0; i < activity.samples.length; i++) {
    const sample = activity.samples[i];
    const category = gradientCategory(sample.gradientPct);
    const local = baseline[i];
    if (category === undefined || sample.hrBpm === undefined || local === undefined) {
      continue;
    }
    const entry = sums.get(category) ?? { total: 0, count: 0 };
    entry.total += sample.hrBpm - local;
    entry.count += 1;
    sums.set(category, entry);
  }

  const out: Partial<Record<GradientCategory, number>> = {};
  for (const [category, { total, count }] of sums) {
    // A handful of seconds averages to noise, so those categories say nothing.
    if (count >= 30) out[category] = total / count;
  }
  return out;
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

/**
 * One colour for every reader-added event, whatever its kind. A colour per
 * category would demand a legend entry per category on every chart that shows
 * them; the marker's tooltip and the editor's list name each event instead.
 */
export const ANNOTATION_COLOR = "var(--accent-ink)";

/**
 * Markers for the runner's own events, for any track that wants them.
 *
 * A card that only speaks about some of them — the fuelling ones, say — passes
 * the subset it is talking about, so its chart and its sentences agree.
 */
export function annotationMarkers(
  activity: DerivedActivity,
  annotations: readonly RunAnnotation[] | undefined = activity.annotations,
): TrackMarker[] {
  return (annotations ?? []).map((annotation) => {
    const spec = kindSpec(annotation.kind);
    // A reading's figure belongs in the label rather than the detail line: it
    // is what the marker is, not a note about it.
    const what =
      annotation.value !== undefined && spec?.measure
        ? `${spec.label} ${annotation.value} ${spec.measure.unit}`
        : (spec?.label ?? "Event");
    return {
      t: annotation.t,
      label: `${what} at ${formatDistanceShort(distanceAtTime(activity, annotation.t))}`,
      detail: annotation.note,
      color: ANNOTATION_COLOR,
    };
  });
}

/**
 * The samples of one stretch of the clock, inclusive at both ends.
 *
 * Every card that reads "the running around this moment" — the fuelling
 * comparison, the lactate readings — starts here, so that they all agree on
 * what a window is and none of them drifts to a half-open interval.
 */
export function samplesBetween(
  activity: DerivedActivity,
  startT: number,
  endT: number,
): Sample[] {
  return activity.samples.filter(
    (sample) => sample.t >= startT && sample.t <= endT,
  );
}

/** Seconds of actual running in a stretch; standing still is not running. */
export function movingSecondsBetween(
  activity: DerivedActivity,
  startT: number,
  endT: number,
): number {
  return samplesBetween(activity, startT, endT).filter((sample) => sample.moving)
    .length;
}

/** The mean of whatever a stretch's samples offer, or undefined if none do. */
export function averageBetween(
  activity: DerivedActivity,
  startT: number,
  endT: number,
  pick: (sample: Sample) => number | undefined,
): number | undefined {
  const values = collect(samplesBetween(activity, startT, endT), pick);
  return values.length > 0 ? mean(values) : undefined;
}

/**
 * How close the cursor counts as being "at" an event.
 *
 * Generous, because the reader is aiming at a moment rather than a second, and
 * the keyboard moves the cursor five seconds at a time.
 */
const AT_EVENT_S = 15;

/** The event the cursor is sitting on, for a readout to name. */
export function annotationAt(
  activity: DerivedActivity,
  t: number,
): RunAnnotation | undefined {
  let nearest: { annotation: RunAnnotation; distance: number } | undefined;
  for (const annotation of activity.annotations ?? []) {
    const distance = Math.abs(annotation.t - t);
    if (distance > AT_EVENT_S) continue;
    if (!nearest || distance < nearest.distance) nearest = { annotation, distance };
  }
  return nearest?.annotation;
}

/** The intensities a run actually spent time in, in order. */
export function bandsUsed(activity: DerivedActivity): IntensityBand[] {
  const seen = new Set<IntensityBand>();
  for (const sample of activity.samples) {
    if (sample.hrZone !== undefined) seen.add(bandForZone(sample.hrZone));
  }
  return (["easy", "steady", "hard"] as const).filter((band) => seen.has(band));
}
