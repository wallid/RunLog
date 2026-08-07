import type { ActivityEvent, Sample } from "../../activity";
import { collect, mean } from "@/lib/stats";

/**
 * Climb and descent detection.
 *
 * A climb is a run of consistently rising ground, not every upward metre. Short
 * dips inside a climb are absorbed so one hill reads as one hill.
 */

const CLIMB_GRADIENT_PCT = 2;
const DESCENT_GRADIENT_PCT = -2;
/** A sub-threshold stretch shorter than this does not end the climb. */
const GAP_TOLERANCE_M = 100;
const MIN_CLIMB_LENGTH_M = 200;
const MIN_CLIMB_GAIN_M = 10;
/** Separate climbs closer than this are treated as one. */
const MERGE_DISTANCE_M = 200;
/** A climb this large is unambiguous; smaller ones are reported less firmly. */
const HIGH_CONFIDENCE_GAIN_M = 20;

export function detectClimbs(samples: Sample[]): ActivityEvent[] {
  const climbs = detectSlopeRuns(samples, "climb");
  const descents = detectSlopeRuns(samples, "descent");
  return [...climbs, ...descents];
}

function detectSlopeRuns(samples: Sample[], kind: "climb" | "descent"): ActivityEvent[] {
  const matches = (gradient: number | undefined): boolean => {
    if (gradient === undefined) return false;
    return kind === "climb" ? gradient >= CLIMB_GRADIENT_PCT : gradient <= DESCENT_GRADIENT_PCT;
  };

  const ranges: { start: number; end: number }[] = [];
  let start = -1;
  let gapStartDistance: number | undefined;

  for (let i = 0; i < samples.length; i++) {
    if (matches(samples[i].gradientPct)) {
      if (start < 0) start = i;
      gapStartDistance = undefined;
      continue;
    }
    if (start < 0) continue;

    // Tolerate a short flat stretch before deciding the slope has ended.
    if (gapStartDistance === undefined) gapStartDistance = samples[i].distanceM;
    if (samples[i].distanceM - gapStartDistance > GAP_TOLERANCE_M) {
      ranges.push({ start, end: i - 1 });
      start = -1;
      gapStartDistance = undefined;
    }
  }
  if (start >= 0) ranges.push({ start, end: samples.length - 1 });

  const merged = mergeNearbyRanges(ranges, samples);
  const events: ActivityEvent[] = [];

  for (const range of merged) {
    const window = samples.slice(range.start, range.end + 1);
    const length = window[window.length - 1].distanceM - window[0].distanceM;
    const change = elevationDelta(window);
    const magnitude = kind === "climb" ? change : -change;

    if (length < MIN_CLIMB_LENGTH_M || magnitude < MIN_CLIMB_GAIN_M) continue;

    const gradients = collect(window, (s) => s.gradientPct);
    const hr = collect(window, (s) => s.hrBpm);
    const paces = collect(window, (s) => s.paceSecPerKm);

    events.push({
      id: `${kind}-${window[0].t}`,
      type: kind,
      startT: window[0].t,
      endT: window[window.length - 1].t,
      startDistanceM: window[0].distanceM,
      endDistanceM: window[window.length - 1].distanceM,
      confidence: magnitude >= HIGH_CONFIDENCE_GAIN_M ? "high" : "medium",
      metrics: {
        elevationChangeM: change,
        lengthM: length,
        avgGradientPct: gradients.length > 0 ? mean(gradients) : 0,
        maxGradientPct:
          gradients.length > 0
            ? kind === "climb"
              ? Math.max(...gradients)
              : Math.min(...gradients)
            : 0,
        avgHr: hr.length > 0 ? mean(hr) : NaN,
        avgPaceSecPerKm: paces.length > 0 ? mean(paces) : NaN,
        durationS: window[window.length - 1].t - window[0].t,
      },
      label: kind === "climb" ? "Climb" : "Descent",
    });
  }

  labelLargest(events, kind);
  return events;
}

function mergeNearbyRanges(
  ranges: { start: number; end: number }[],
  samples: Sample[],
): { start: number; end: number }[] {
  if (ranges.length === 0) return [];
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const previous = merged[merged.length - 1];
    const gap = samples[ranges[i].start].distanceM - samples[previous.end].distanceM;
    if (gap <= MERGE_DISTANCE_M) previous.end = ranges[i].end;
    else merged.push(ranges[i]);
  }
  return merged;
}

function elevationDelta(window: Sample[]): number {
  const first = window.find((s) => s.elevationM !== undefined)?.elevationM;
  const last = [...window].reverse().find((s) => s.elevationM !== undefined)?.elevationM;
  if (first === undefined || last === undefined) return 0;
  return last - first;
}

/** The biggest climb of a run is the one worth naming. */
function labelLargest(events: ActivityEvent[], kind: "climb" | "descent"): void {
  if (events.length === 0) return;
  let largest = events[0];
  for (const event of events) {
    if (Math.abs(event.metrics.elevationChangeM) > Math.abs(largest.metrics.elevationChangeM)) {
      largest = event;
    }
  }
  largest.label = kind === "climb" ? "Main climb" : "Longest descent";

  if (events.length > 1) {
    let counter = 1;
    for (const event of events) {
      if (event === largest) continue;
      event.label = kind === "climb" ? `Climb ${counter}` : `Descent ${counter}`;
      counter++;
    }
  }
}
