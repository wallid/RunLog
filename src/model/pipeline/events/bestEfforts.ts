import type { BestEffort, Sample } from "../../activity";
import { collect, mean } from "@/lib/stats";

/**
 * Fastest sustained sections, found by rolling window rather than split.
 *
 * Kilometre splits are an accident of where the run started: a runner's best
 * kilometre rarely begins on a split boundary. Rolling windows find the real
 * effort.
 */

/** A window containing more than this much stopped time is not a sustained effort. */
const MAX_STOPPED_S_IN_WINDOW = 5;

const TIME_WINDOWS_S = [30, 60, 300];
const DISTANCE_WINDOWS_M = [400, 1000, 5000];

export function computeBestEfforts(samples: Sample[]): BestEffort[] {
  if (samples.length < 30) return [];

  const efforts: BestEffort[] = [];
  const totalDistance = samples[samples.length - 1].distanceM;
  const totalTime = samples[samples.length - 1].t - samples[0].t;

  for (const window of TIME_WINDOWS_S) {
    if (totalTime < window) continue;
    const best = bestByTime(samples, window);
    if (best) efforts.push(best);
  }

  for (const window of DISTANCE_WINDOWS_M) {
    if (totalDistance < window) continue;
    const best = bestByDistance(samples, window);
    if (best) efforts.push(best);
  }

  return efforts;
}

/** The fixed-duration window covering the most ground. */
function bestByTime(samples: Sample[], windowS: number): BestEffort | undefined {
  let bestStart = -1;
  let bestDistance = -1;

  for (let i = 0; i + windowS < samples.length; i++) {
    const from = samples[i];
    const to = samples[i + windowS];
    if (countStopped(samples, i, i + windowS) > MAX_STOPPED_S_IN_WINDOW) continue;
    const distance = to.distanceM - from.distanceM;
    if (distance > bestDistance) {
      bestDistance = distance;
      bestStart = i;
    }
  }

  if (bestStart < 0 || bestDistance <= 0) return undefined;
  return buildEffort(
    samples,
    bestStart,
    bestStart + windowS,
    `Fastest ${formatTimeWindow(windowS)}`,
    "time",
    windowS,
  );
}

/** The fixed-distance window covering the least time. */
function bestByDistance(samples: Sample[], windowM: number): BestEffort | undefined {
  let bestStart = -1;
  let bestEnd = -1;
  let bestDuration = Infinity;
  let end = 0;

  for (let start = 0; start < samples.length; start++) {
    if (end < start) end = start;
    while (end < samples.length - 1 && samples[end].distanceM - samples[start].distanceM < windowM) {
      end++;
    }
    if (samples[end].distanceM - samples[start].distanceM < windowM) break;
    if (countStopped(samples, start, end) > MAX_STOPPED_S_IN_WINDOW) continue;

    const duration = samples[end].t - samples[start].t;
    if (duration < bestDuration) {
      bestDuration = duration;
      bestStart = start;
      bestEnd = end;
    }
  }

  if (bestStart < 0) return undefined;
  return buildEffort(
    samples,
    bestStart,
    bestEnd,
    `Fastest ${formatDistanceWindow(windowM)}`,
    "distance",
    windowM,
  );
}

function countStopped(samples: Sample[], from: number, to: number): number {
  let count = 0;
  for (let i = from; i <= to && i < samples.length; i++) {
    if (!samples[i].moving) count++;
  }
  return count;
}

function buildEffort(
  samples: Sample[],
  startIndex: number,
  endIndex: number,
  label: string,
  kind: "time" | "distance",
  window: number,
): BestEffort | undefined {
  const from = samples[startIndex];
  const to = samples[endIndex];
  const distance = to.distanceM - from.distanceM;
  const duration = to.t - from.t;
  if (distance <= 0 || duration <= 0) return undefined;

  const slice = samples.slice(startIndex, endIndex + 1);
  const hr = collect(slice, (s) => s.hrBpm);
  const power = collect(slice, (s) => s.powerW);
  const gradient = collect(slice, (s) => s.gradientPct);

  return {
    id: `best-${kind}-${window}`,
    label,
    kind,
    window,
    startT: from.t,
    endT: to.t,
    startDistanceM: from.distanceM,
    endDistanceM: to.distanceM,
    paceSecPerKm: (duration / distance) * 1000,
    avgHr: hr.length > 0 ? mean(hr) : undefined,
    avgPowerW: power.length > 0 ? mean(power) : undefined,
    avgGradientPct: gradient.length > 0 ? mean(gradient) : 0,
  };
}

function formatTimeWindow(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}

function formatDistanceWindow(metres: number): string {
  return metres < 1000 ? `${metres} m` : `${metres / 1000} km`;
}
