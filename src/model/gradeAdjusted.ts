import type { GradeAdjustment, Sample } from "./activity";
import { clamp } from "@/lib/stats";

/**
 * What a stretch of running would have been on flat ground.
 *
 * A kilometre split is decided by where the run started, and a hilly one is not
 * comparable with a flat one at all — which the splits card already says in
 * words but has no number for. This is that number: the pace that would have
 * cost the same to run on the level.
 *
 * The conversion is metabolic, not mechanical. Minetti and colleagues walked
 * and ran subjects on a treadmill across gradients from −45% to +45% and
 * measured the oxygen cost of covering a metre at each one, then fitted a
 * fifth-order polynomial through it. Dividing that cost by its value on the
 * flat gives how many metres of level ground a metre of tilted ground was
 * worth, and pace divided by that factor is the level pace of equal cost.
 *
 * Two things follow that are worth stating plainly, because grade adjustment is
 * routinely read as more than it is:
 *
 * - **Downhill is not free, and past a point it is not even cheap.** The curve
 *   bottoms out near −20% and climbs again below that, because braking costs
 *   energy. A steep descent run fast can adjust to a *slower* level pace than
 *   it was run at.
 * - **It equalises cost, not damage.** Nothing here knows what a long descent
 *   does to the legs, and eccentric loading is most of what makes downhill
 *   running hurt the next day. An adjusted pace is not a fatigue measure.
 *
 * The curve came from a treadmill, at a fixed gradient, on subjects running
 * economically. This applies it to outdoor running over a gradient the watch
 * inferred from a smoothed barometric trace, which is why anything built on it
 * is `estimated` rather than `derived`.
 */

/**
 * The steepest gradient the curve was measured across.
 *
 * Beyond it the polynomial still returns a number and that number is an
 * extrapolation, so the gradient is clamped instead. In practice the pipeline
 * already caps gradient below this, and the clamp is here so the function
 * cannot be misused by a caller that does not.
 */
export const MAX_MODELLED_GRADE = 0.45;

/**
 * The energy cost of covering a metre at a gradient, in joules per kilogram.
 *
 * `gradeFraction` is rise over run — 0.05 for a 5% climb — not a percentage.
 */
export function costOfRunning(gradeFraction: number): number {
  const i = clamp(gradeFraction, -MAX_MODELLED_GRADE, MAX_MODELLED_GRADE);
  return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
}

/** The same cost on the level, which every adjustment is measured against. */
export const FLAT_COST_J_PER_KG_M = costOfRunning(0);

/**
 * Metres of flat ground that a metre at this gradient was worth.
 *
 * Above 1 uphill, below 1 on a gentle descent, and back above 1 on a steep one.
 */
export function gradeFactor(gradientPct: number | undefined): number | undefined {
  if (gradientPct === undefined || !Number.isFinite(gradientPct)) return undefined;
  return costOfRunning(gradientPct / 100) / FLAT_COST_J_PER_KG_M;
}

/** The level pace costing what this pace cost at this gradient. */
export function gradeAdjustedPace(
  paceSecPerKm: number | undefined,
  gradientPct: number | undefined,
): number | undefined {
  if (paceSecPerKm === undefined || !Number.isFinite(paceSecPerKm)) return undefined;
  const factor = gradeFactor(gradientPct);
  if (factor === undefined || factor <= 0) return undefined;
  return paceSecPerKm / factor;
}

/**
 * The share of a stretch's distance whose gradient has to be known before it is
 * worth adjusting.
 *
 * Ground with no gradient reading passes through unadjusted, which pulls the
 * answer towards the unadjusted pace. Below this much coverage the figure would
 * be a blend of an adjustment and a refusal to adjust, presented as neither.
 */
export const MIN_GRADIENT_COVERAGE = 0.8;

/**
 * How much a stretch of running was worth in flat ground.
 *
 * Deliberately returns a factor rather than an adjusted pace. Callers already
 * hold a pace they have computed their own way — a split's from elapsed time, a
 * run's from moving time — and dividing that pace by this factor keeps the
 * adjusted figure differing from the one beside it by terrain and nothing else.
 * Computing a pace here from the window's own distance would reintroduce the
 * boundary rounding the split code goes to some trouble to avoid.
 */
export function gradeAdjustmentOver(window: Sample[]): GradeAdjustment | undefined {
  let actualDistanceM = 0;
  let flatEquivalentDistanceM = 0;
  let adjustedDistanceM = 0;

  for (let i = 1; i < window.length; i++) {
    const previous = window[i - 1];
    const sample = window[i];
    // Only contiguous seconds: a gap means the distance between them was not
    // covered at the gradient at either end of it.
    if (sample.t - previous.t !== 1) continue;

    const ds = sample.distanceM - previous.distanceM;
    if (!(ds > 0)) continue;
    actualDistanceM += ds;

    const factor = gradeFactor(midGradient(previous, sample));
    if (factor === undefined) {
      flatEquivalentDistanceM += ds;
      continue;
    }
    flatEquivalentDistanceM += ds * factor;
    adjustedDistanceM += ds;
  }

  if (actualDistanceM <= 0 || flatEquivalentDistanceM <= 0) return undefined;
  const coverage = adjustedDistanceM / actualDistanceM;
  if (coverage < MIN_GRADIENT_COVERAGE) return undefined;

  return {
    factor: flatEquivalentDistanceM / actualDistanceM,
    actualDistanceM,
    flatEquivalentDistanceM,
    coverage,
  };
}

/** The gradient across a pair of samples, from whichever of them carries one. */
function midGradient(previous: Sample, sample: Sample): number | undefined {
  const a = previous.gradientPct;
  const b = sample.gradientPct;
  if (a !== undefined && b !== undefined) return (a + b) / 2;
  return a ?? b;
}
