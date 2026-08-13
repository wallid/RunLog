/**
 * Rolling-window smoothers over sparse series.
 *
 * Every function takes and returns an array of the same length where `undefined`
 * marks a missing sample. Windows are centred and shrink at the series edges,
 * so the output has no leading or trailing gaps that the input did not have.
 */

export type Series = (number | undefined)[];

/** Centred rolling mean over a window of `windowSize` samples (rounded up to odd). */
export function rollingMean(values: Series, windowSize: number): Series {
  const half = Math.max(0, Math.floor(windowSize / 2));
  const out: Series = new Array<number | undefined>(values.length);
  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) {
      out[i] = undefined;
      continue;
    }
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      const v = values[j];
      if (v !== undefined) {
        sum += v;
        count++;
      }
    }
    out[i] = count > 0 ? sum / count : undefined;
  }
  return out;
}

/** Centred rolling median — removes single-sample spikes without shifting edges. */
export function rollingMedian(values: Series, windowSize: number): Series {
  const half = Math.max(0, Math.floor(windowSize / 2));
  const out: Series = new Array<number | undefined>(values.length);
  const buffer: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] === undefined) {
      out[i] = undefined;
      continue;
    }
    buffer.length = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(values.length - 1, i + half);
    for (let j = lo; j <= hi; j++) {
      const v = values[j];
      if (v !== undefined) buffer.push(v);
    }
    if (buffer.length === 0) {
      out[i] = undefined;
      continue;
    }
    buffer.sort((a, b) => a - b);
    const mid = buffer.length >> 1;
    out[i] =
      buffer.length % 2 === 0 ? (buffer[mid - 1] + buffer[mid]) / 2 : buffer[mid];
  }
  return out;
}

/**
 * Fills gaps of at most `maxGap` consecutive missing samples by linear
 * interpolation between the surrounding known values. Longer gaps are left
 * missing so the pipeline can treat them as recording interruptions.
 */
export function interpolateGaps(values: Series, maxGap: number): Series {
  const out: Series = [...values];
  let i = 0;
  while (i < out.length) {
    if (out[i] !== undefined) {
      i++;
      continue;
    }
    const gapStart = i;
    while (i < out.length && out[i] === undefined) i++;
    const gapEnd = i; // first defined index after the gap
    const gapLength = gapEnd - gapStart;
    const before = gapStart > 0 ? out[gapStart - 1] : undefined;
    const after = gapEnd < out.length ? out[gapEnd] : undefined;
    if (before === undefined || after === undefined || gapLength > maxGap) continue;
    for (let j = gapStart; j < gapEnd; j++) {
      const ratio = (j - gapStart + 1) / (gapLength + 1);
      out[j] = before + (after - before) * ratio;
    }
  }
  return out;
}

/** Forward-fills missing values from the previous known value, up to `maxRun` samples. */
export function forwardFill(values: Series, maxRun: number): Series {
  const out: Series = [...values];
  let run = 0;
  let last: number | undefined;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== undefined) {
      last = out[i];
      run = 0;
    } else if (last !== undefined && run < maxRun) {
      out[i] = last;
      run++;
    }
  }
  return out;
}
