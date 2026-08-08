/**
 * A small linear model, trained in the browser.
 *
 * This is the whole of the product's machine learning: ridge regression on a
 * handful of features, solved in closed form. Nothing iterates, nothing is
 * random, and the same data always produces the same model — which matters
 * because everything here is recomputed on every load, and a card whose figure
 * wobbled between visits would be reporting its own training run rather than
 * the run it was given.
 *
 * The scale is why this is enough. A run is a few thousand seconds and a
 * feature set is a handful of columns, so the normal equations are a matrix a
 * few cells wide and the solve is instant. A heavier framework would buy
 * nothing but weight, and a nonlinear model would buy flexibility at the cost
 * of the one thing a card built on this has to be able to say plainly: what
 * the model looked at, and how wrong it typically is.
 */

/** A fitted linear model. Weights are in the inputs' own units. */
export interface RidgeFit {
  weights: number[];
  intercept: number;
  predict(row: readonly number[]): number;
}

/** Fewer rows than this per feature and the fit is memorising, not learning. */
const MIN_ROWS_PER_FEATURE = 3;
const MIN_ROWS = 12;

/**
 * Least-squares with a ridge penalty, solved by normal equations.
 *
 * Features are standardised internally so the penalty treats a gradient in
 * percent and a speed in metres per second as the same kind of thing, then the
 * weights are mapped back to the original units. The intercept is never
 * penalised: shrinking the mean of the target would bias every prediction for
 * no gain.
 *
 * The penalty is small and fixed. Its job is not tuning but honesty under
 * collinearity — the features a run produces are correlated with each other,
 * and without the ridge the solve would put enormous opposing weights on two
 * columns that carry the same information.
 *
 * Returns null rather than a fit when there is too little data, or when the
 * target does not vary — a model of a constant is a constant, and pretending
 * it learned something would mislead everything built on top.
 */
export function fitRidge(
  rows: readonly (readonly number[])[],
  targets: readonly number[],
  lambda = 0.01,
): RidgeFit | null {
  const n = Math.min(rows.length, targets.length);
  if (n === 0) return null;
  const dims = rows[0].length;
  if (dims === 0 || n < Math.max(MIN_ROWS, dims * MIN_ROWS_PER_FEATURE)) return null;

  // Column statistics for standardisation. A constant column gets a stand-in
  // deviation of 1, which turns it into a column of zeros: harmlessly ignored
  // rather than divided by nothing.
  const means = new Array<number>(dims).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < dims; j++) means[j] += rows[i][j];
  }
  for (let j = 0; j < dims; j++) means[j] /= n;

  const sds = new Array<number>(dims).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < dims; j++) sds[j] += (rows[i][j] - means[j]) ** 2;
  }
  for (let j = 0; j < dims; j++) {
    sds[j] = Math.sqrt(sds[j] / n);
    if (sds[j] === 0 || !Number.isFinite(sds[j])) sds[j] = 1;
  }

  let targetMean = 0;
  for (let i = 0; i < n; i++) targetMean += targets[i];
  targetMean /= n;

  let targetVaries = false;
  for (let i = 0; i < n; i++) {
    if (targets[i] !== targets[0]) {
      targetVaries = true;
      break;
    }
  }
  if (!targetVaries) return null;

  // Normal equations over standardised, centred data: (XᵀX/n + λI) w = Xᵀy/n.
  const a: number[][] = Array.from({ length: dims }, () => new Array<number>(dims).fill(0));
  const b = new Array<number>(dims).fill(0);
  const z = new Array<number>(dims);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < dims; j++) z[j] = (rows[i][j] - means[j]) / sds[j];
    const dy = targets[i] - targetMean;
    for (let j = 0; j < dims; j++) {
      b[j] += z[j] * dy;
      for (let k = j; k < dims; k++) a[j][k] += z[j] * z[k];
    }
  }
  for (let j = 0; j < dims; j++) {
    b[j] /= n;
    for (let k = j; k < dims; k++) {
      a[j][k] /= n;
      a[k][j] = a[j][k];
    }
    a[j][j] += lambda;
  }

  const standardisedWeights = solve(a, b);
  if (!standardisedWeights) return null;

  const weights = standardisedWeights.map((w, j) => w / sds[j]);
  let intercept = targetMean;
  for (let j = 0; j < dims; j++) intercept -= weights[j] * means[j];

  return {
    weights,
    intercept,
    predict(row) {
      let y = intercept;
      for (let j = 0; j < dims; j++) y += weights[j] * row[j];
      return y;
    },
  };
}

/**
 * Gaussian elimination with partial pivoting.
 *
 * The matrix is a handful of cells and the ridge keeps it well-conditioned, so
 * nothing fancier is needed. A vanishing pivot means the system is degenerate
 * despite the ridge, and null lets the caller decline rather than divide.
 */
function solve(a: number[][], b: number[]): number[] | null {
  const dims = b.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < dims; col++) {
    let pivot = col;
    for (let row = col + 1; row < dims; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]];

    for (let row = col + 1; row < dims; row++) {
      const factor = m[row][col] / m[col][col];
      for (let k = col; k <= dims; k++) m[row][k] -= factor * m[col][k];
    }
  }

  const x = new Array<number>(dims).fill(0);
  for (let row = dims - 1; row >= 0; row--) {
    let acc = m[row][dims];
    for (let k = row + 1; k < dims; k++) acc -= m[row][k] * x[k];
    x[row] = acc / m[row][row];
  }
  return x;
}

/** Mean absolute error between two aligned series. NaN when there is nothing. */
export function meanAbsoluteError(
  actual: readonly number[],
  predicted: readonly number[],
): number {
  const n = Math.min(actual.length, predicted.length);
  if (n === 0) return NaN;
  let acc = 0;
  for (let i = 0; i < n; i++) acc += Math.abs(actual[i] - predicted[i]);
  return acc / n;
}
