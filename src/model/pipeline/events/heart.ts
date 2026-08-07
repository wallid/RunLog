import type { ActivityEvent, Confidence, DriftResult, Sample } from "../../activity";
import { collect, mean } from "@/lib/stats";

/**
 * Heart-rate drift and in-run recovery.
 *
 * Drift only means something when pace held steady, so the calculation reports
 * the pace change alongside it and lowers its own confidence when pace moved
 * enough to explain the difference on its own.
 */

const MIN_HALF_DURATION_S = 8 * 60;
/** Pace changes below this are small enough for drift to be readable. */
const STABLE_PACE_PCT = 3;
const AMBIGUOUS_PACE_PCT = 6;

export function computeDrift(samples: Sample[]): DriftResult | undefined {
  // Only moving samples count: standing still would deflate the second half.
  const moving = samples.filter(
    (s) => s.moving && s.hrBpm !== undefined && s.paceSecPerKm !== undefined,
  );
  if (moving.length < 240) return undefined;

  const midpoint = Math.floor(moving.length / 2);
  const firstHalf = moving.slice(0, midpoint);
  const secondHalf = moving.slice(midpoint);

  const firstHalfHr = mean(collect(firstHalf, (s) => s.hrBpm));
  const secondHalfHr = mean(collect(secondHalf, (s) => s.hrBpm));
  const firstHalfPace = mean(collect(firstHalf, (s) => s.paceSecPerKm));
  const secondHalfPace = mean(collect(secondHalf, (s) => s.paceSecPerKm));

  if (![firstHalfHr, secondHalfHr, firstHalfPace, secondHalfPace].every(Number.isFinite)) {
    return undefined;
  }

  const driftPct = (secondHalfHr / firstHalfHr - 1) * 100;
  const pacePct = (secondHalfPace / firstHalfPace - 1) * 100;
  const absPacePct = Math.abs(pacePct);
  const halfDuration = firstHalf.length;

  let confidence: Confidence;
  let caveat: string | undefined;
  if (absPacePct <= STABLE_PACE_PCT && halfDuration >= MIN_HALF_DURATION_S) {
    confidence = "high";
  } else if (absPacePct <= AMBIGUOUS_PACE_PCT) {
    confidence = "medium";
    caveat =
      halfDuration < MIN_HALF_DURATION_S
        ? "Each half of this run is short, so the comparison is less reliable."
        : "Pace also changed slightly, so part of the difference may reflect effort rather than drift.";
  } else {
    confidence = "low";
    caveat =
      "Pace changed noticeably between halves, so heart-rate drift cannot be separated from the change in effort.";
  }

  return {
    firstHalfHr,
    secondHalfHr,
    firstHalfPace,
    secondHalfPace,
    driftPct,
    pacePct,
    confidence,
    caveat,
  };
}

/** A peak must reach this fraction of the run's maximum to count as a hard effort. */
const PEAK_FRACTION_OF_MAX = 0.88;
const MIN_PROMINENCE_BPM = 8;
const MIN_RECOVERY_BPM = 10;
const RECOVERY_WINDOW_S = 60;
/** Two peaks within this window describe the same effort. */
const PEAK_SEPARATION_S = 120;

export function detectHrRecovery(samples: Sample[]): ActivityEvent[] {
  const hrValues = collect(samples, (s) => s.hrBpm);
  if (hrValues.length < 120) return [];

  const maxHr = Math.max(...hrValues);
  const threshold = maxHr * PEAK_FRACTION_OF_MAX;
  const events: ActivityEvent[] = [];
  let lastPeakT = -Infinity;

  for (let i = 30; i < samples.length - RECOVERY_WINDOW_S; i++) {
    const peakHr = samples[i].hrBpm;
    if (peakHr === undefined || peakHr < threshold) continue;
    if (samples[i].t - lastPeakT < PEAK_SEPARATION_S) continue;

    // A local maximum, not merely a high reading on a plateau.
    const before = samples.slice(Math.max(0, i - 30), i);
    const after = samples.slice(i + 1, i + RECOVERY_WINDOW_S + 1);
    const beforeMin = Math.min(...collect(before, (s) => s.hrBpm));
    if (!Number.isFinite(beforeMin) || peakHr - beforeMin < MIN_PROMINENCE_BPM) continue;
    if (after.some((s) => (s.hrBpm ?? 0) > peakHr)) continue;

    const hrAt30 = samples[i + 30]?.hrBpm;
    const hrAt60 = samples[i + 60]?.hrBpm;
    if (hrAt60 === undefined) continue;

    const recovery = peakHr - hrAt60;
    if (recovery < MIN_RECOVERY_BPM) continue;

    const window = samples.slice(i, i + RECOVERY_WINDOW_S + 1);
    const stopped = window.some((s) => !s.moving);
    const pacesBefore = collect(before, (s) => s.paceSecPerKm);
    const pacesAfter = collect(window, (s) => s.paceSecPerKm);
    const paceSlowed =
      pacesBefore.length > 0 && pacesAfter.length > 0
        ? (mean(pacesAfter) - mean(pacesBefore)) / mean(pacesBefore)
        : 0;

    events.push({
      id: `hr-recovery-${samples[i].t}`,
      type: "hrRecovery",
      startT: samples[i].t,
      endT: samples[i + RECOVERY_WINDOW_S].t,
      startDistanceM: samples[i].distanceM,
      endDistanceM: samples[i + RECOVERY_WINDOW_S].distanceM,
      confidence: "high",
      metrics: {
        peakHr,
        hrAfter30S: hrAt30 ?? NaN,
        hrAfter60S: hrAt60,
        recoveryBpm: recovery,
        recovery30SBpm: hrAt30 !== undefined ? peakHr - hrAt30 : NaN,
        stopped: stopped ? 1 : 0,
        paceSlowedPct: paceSlowed * 100,
      },
      label: "Heart-rate recovery",
    });

    lastPeakT = samples[i].t;
  }

  return events;
}
