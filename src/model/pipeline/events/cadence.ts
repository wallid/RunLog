import type { ActivityEvent, Sample } from "../../activity";
import { rollingMedian, type Series } from "@/lib/smoothing";
import { collect, mean, median } from "@/lib/stats";

/**
 * Stretches where step rhythm fell away, and where it came back.
 *
 * Cadence is measured against the runner's own median for the run rather than
 * against any target figure, because the right step rate depends on height,
 * speed and style. What can be said without knowing any of that is when the
 * rhythm departed from what this runner was holding on this day.
 *
 * Seconds spent standing still are excluded throughout: a stopped watch reports
 * a cadence of zero, and calling that a drop would turn every traffic light
 * into a finding.
 */

/** Below this a reading is a stationary watch, not a step rate. */
const MIN_RUNNING_SPM = 40;
/** Cadence is despiked before comparison; single-second dips are sensor noise. */
const SMOOTHING_S = 9;
/** A shortfall smaller than this is inside the noise of a wrist or foot sensor. */
const MIN_DROP_SPM = 6;
const MIN_DROP_S = 20;
/** Drops closer together than this are one interruption, not two. */
const MERGE_GAP_S = 10;
/** Cadence counts as back to normal within this much of the baseline. */
const RECOVERY_TOLERANCE_SPM = 2;
/** The baseline has to be held this long to count as recovered rather than crossed. */
const MIN_HELD_S = 10;
/** Past this, whatever happened is a new section of the run rather than a recovery. */
const MAX_RECOVERY_S = 300;
/** Fewer running seconds than this cannot establish a baseline worth measuring against. */
const MIN_RUNNING_S = 120;

/**
 * A sample's cadence, but only where it describes running.
 *
 * Exported so widgets filter the series exactly as the detector does. Every
 * cadence figure on the page is a running figure by this definition.
 */
export function runningCadenceOf(sample: Sample): number | undefined {
  if (!sample.moving) return undefined;
  if (sample.cadenceSpm === undefined || sample.cadenceSpm < MIN_RUNNING_SPM) return undefined;
  return sample.cadenceSpm;
}

export interface CadenceBaseline {
  /** Median cadence while running — the figure drops are measured against. */
  medianSpm: number;
  /** Despiked cadence per sample, undefined wherever the runner was not running. */
  smoothed: Series;
  /** Median pace while running, for describing what a drop cost. */
  medianPaceSecPerKm?: number;
}

/**
 * The runner's own rhythm for this run.
 *
 * Exported because the widgets measure against exactly the same baseline the
 * detector does; two different definitions of "normal cadence" on one page
 * would be worse than either.
 */
export function cadenceBaseline(samples: Sample[]): CadenceBaseline | undefined {
  const running: Series = samples.map(runningCadenceOf);
  const known = collect(running, (value) => value);
  if (known.length < MIN_RUNNING_S) return undefined;

  const paces = collect(
    samples.filter((s) => s.moving),
    (s) => s.paceSecPerKm,
  );

  return {
    medianSpm: median(known),
    smoothed: rollingMedian(running, SMOOTHING_S),
    medianPaceSecPerKm: paces.length > 0 ? median(paces) : undefined,
  };
}

export function detectCadenceDrops(samples: Sample[]): ActivityEvent[] {
  const baseline = cadenceBaseline(samples);
  if (!baseline) return [];

  const { medianSpm, smoothed } = baseline;
  const threshold = medianSpm - MIN_DROP_SPM;

  const spans = mergeSpans(
    findSpans(smoothed, (value) => value < threshold),
    MERGE_GAP_S,
  ).filter((span) => span.end - span.start + 1 >= MIN_DROP_S);

  return spans.map((span) => {
    const window = samples.slice(span.start, span.end + 1);
    const values = collect(window, runningCadenceOf);
    const avgSpm = values.length > 0 ? mean(values) : medianSpm;
    const lowestSpm = values.length > 0 ? Math.min(...values) : medianSpm;
    const deficitSpm = medianSpm - avgSpm;
    const durationS = span.end - span.start + 1;

    const paces = collect(window, (s) => s.paceSecPerKm);
    const gradients = collect(window, (s) => s.gradientPct);
    const stoppedS = window.filter((s) => !s.moving).length;

    return {
      id: `cadence-drop-${window[0].t}`,
      type: "cadenceDrop" as const,
      startT: window[0].t,
      endT: window[window.length - 1].t,
      startDistanceM: window[0].distanceM,
      endDistanceM: window[window.length - 1].distanceM,
      // A deep, sustained shortfall is beyond what a sensor invents; a shallow
      // one of barely twenty seconds is closer to the edge of the noise.
      confidence:
        deficitSpm >= MIN_DROP_SPM * 1.5 && durationS >= MIN_DROP_S * 1.5
          ? ("high" as const)
          : ("medium" as const),
      metrics: {
        baselineSpm: medianSpm,
        avgSpm,
        lowestSpm,
        deficitSpm,
        durationS,
        stoppedS,
        avgPaceSecPerKm: paces.length > 0 ? mean(paces) : NaN,
        paceDeltaSecPerKm:
          paces.length > 0 && baseline.medianPaceSecPerKm !== undefined
            ? mean(paces) - baseline.medianPaceSecPerKm
            : NaN,
        avgGradientPct: gradients.length > 0 ? mean(gradients) : NaN,
      },
      label: "Cadence drop",
    };
  });
}

/**
 * How long each drop took to come back.
 *
 * A recovery is only recorded when cadence returns to the baseline and stays
 * there, so a single second brushing the line on the way past does not count as
 * having recovered. Drops that never come back produce no event at all, which
 * is what lets a widget say how many of them there were.
 */
export function detectCadenceRecoveries(
  samples: Sample[],
  drops: ActivityEvent[],
): ActivityEvent[] {
  if (drops.length === 0) return [];
  const baseline = cadenceBaseline(samples);
  if (!baseline) return [];

  const { medianSpm, smoothed } = baseline;
  const target = medianSpm - RECOVERY_TOLERANCE_SPM;
  const events: ActivityEvent[] = [];

  for (const drop of drops) {
    const from = indexOfTime(samples, drop.endT) + 1;
    const limit = Math.min(samples.length, from + MAX_RECOVERY_S);

    let held = 0;
    let recoveredAt = -1;
    for (let i = from; i < limit; i++) {
      const value = smoothed[i];
      if (value !== undefined && value >= target) {
        held++;
        if (held >= MIN_HELD_S) {
          // The recovery finished when the baseline was first reached, not when
          // it had been held long enough to prove it.
          recoveredAt = i - held + 1;
          break;
        }
      } else {
        held = 0;
      }
    }
    if (recoveredAt < 0) continue;

    const window = samples.slice(from, recoveredAt + 1);
    if (window.length === 0) continue;

    const regained = collect(
      samples.slice(recoveredAt, Math.min(samples.length, recoveredAt + MIN_HELD_S)),
      (s) => s.cadenceSpm,
    );

    events.push({
      id: `cadence-recovery-${window[0].t}`,
      type: "cadenceRecovery",
      startT: window[0].t,
      endT: window[window.length - 1].t,
      startDistanceM: window[0].distanceM,
      endDistanceM: window[window.length - 1].distanceM,
      confidence: "high",
      metrics: {
        dropStartT: drop.startT,
        dropStartDistanceM: drop.startDistanceM,
        recoveryS: window.length,
        baselineSpm: medianSpm,
        fromSpm: drop.metrics.avgSpm,
        toSpm: regained.length > 0 ? mean(regained) : medianSpm,
        regainedSpm:
          (regained.length > 0 ? mean(regained) : medianSpm) - drop.metrics.avgSpm,
      },
      label: "Cadence recovery",
    });
  }

  return events;
}

interface Span {
  start: number;
  end: number;
}

/** Contiguous index ranges where a defined value satisfies `test`. */
function findSpans(series: Series, test: (value: number) => boolean): Span[] {
  const spans: Span[] = [];
  let start = -1;

  for (let i = 0; i <= series.length; i++) {
    const value = i < series.length ? series[i] : undefined;
    const inside = value !== undefined && test(value);
    if (inside) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      spans.push({ start, end: i - 1 });
      start = -1;
    }
  }

  return spans;
}

/**
 * Joins spans separated by less than `gap`.
 *
 * The gap is measured in seconds regardless of why the series broke, so a brief
 * stop in the middle of a slow section leaves one drop rather than two halves
 * that are each too short to report.
 */
function mergeSpans(spans: Span[], gap: number): Span[] {
  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start - last.end <= gap) {
      last.end = span.end;
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

/** The sample index for an elapsed time on the one-second grid. */
function indexOfTime(samples: Sample[], t: number): number {
  if (samples.length === 0) return 0;
  return Math.max(0, Math.min(samples.length - 1, Math.round(t - samples[0].t)));
}
