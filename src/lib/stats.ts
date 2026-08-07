/** Basic descriptive statistics over numeric series. Missing values are skipped. */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

/** Linear-interpolated percentile. `p` in [0, 1]. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * clamp(p, 0, 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function min(values: readonly number[]): number {
  let m = Infinity;
  for (const v of values) if (v < m) m = v;
  return m;
}

export function max(values: readonly number[]): number {
  let m = -Infinity;
  for (const v of values) if (v > m) m = v;
  return m;
}

export function sum(values: readonly number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

export function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Collects defined, finite numbers produced by `pick` across `items`. */
export function collect<T>(
  items: readonly T[],
  pick: (item: T) => number | undefined,
): number[] {
  const out: number[] = [];
  for (const item of items) {
    const v = pick(item);
    if (v !== undefined && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/**
 * Pearson correlation between two series of equal length.
 *
 * Returns NaN when either series is flat or there is too little to compare, so
 * a caller has to decide what to say rather than being handed a spurious zero.
 */
export function correlation(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 10) return NaN;

  const meanX = mean(xs.slice(0, n));
  const meanY = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

export interface LinearFit {
  /** Change in y per unit of x. */
  slope: number;
  /** Value of y where x is zero. */
  intercept: number;
}

/**
 * Least-squares line of `ys` on `xs`.
 *
 * Returns null when `xs` is flat or there is too little to fit, for the same
 * reason `correlation` returns NaN: a caller should have to decide what to say
 * rather than be handed a line through a single point.
 */
export function linearFit(
  xs: readonly number[],
  ys: readonly number[],
): LinearFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 10) return null;

  const meanX = mean(xs.slice(0, n));
  const meanY = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    sxy += dx * (ys[i] - meanY);
    sxx += dx * dx;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX };
}

/** The slope alone, as NaN when there is nothing to fit. */
export function linearSlope(xs: readonly number[], ys: readonly number[]): number {
  return linearFit(xs, ys)?.slope ?? NaN;
}

/** Prefix sums where `prefix[i]` is the sum of the first `i` values. Length is n + 1. */
export function prefixSums(values: readonly number[]): Float64Array {
  const out = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) out[i + 1] = out[i] + values[i];
  return out;
}

/** Linear interpolation between two points, evaluated at `x`. */
export function lerpAt(x0: number, y0: number, x1: number, y1: number, x: number): number {
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}
