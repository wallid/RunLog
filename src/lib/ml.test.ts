import { describe, expect, it } from "vitest";
import { fitRidge, meanAbsoluteError } from "./ml";

/** A deterministic pseudo-random stream, so the tests never flake. */
function* noise(seed: number): Generator<number> {
  let state = seed;
  while (true) {
    state = (state * 1103515245 + 12345) % 2147483648;
    yield state / 2147483648 - 0.5;
  }
}

describe("fitRidge", () => {
  it("recovers a linear relationship", () => {
    const rows: number[][] = [];
    const targets: number[] = [];
    const jitter = noise(7);
    for (let i = 0; i < 200; i++) {
      const x1 = i / 10;
      const x2 = Math.sin(i / 5) * 4;
      rows.push([x1, x2]);
      targets.push(3 * x1 - 2 * x2 + 5 + jitter.next().value * 0.01);
    }

    const fit = fitRidge(rows, targets);
    expect(fit).not.toBeNull();
    expect(fit!.weights[0]).toBeCloseTo(3, 1);
    expect(fit!.weights[1]).toBeCloseTo(-2, 1);
    expect(fit!.predict([4, 1])).toBeCloseTo(3 * 4 - 2 * 1 + 5, 0);
  });

  it("is deterministic", () => {
    const rows = Array.from({ length: 50 }, (_, i) => [i, (i * i) % 13]);
    const targets = rows.map(([a, b]) => 2 * a + b);
    const first = fitRidge(rows, targets)!;
    const second = fitRidge(rows, targets)!;
    expect(second.weights).toEqual(first.weights);
    expect(second.intercept).toBe(first.intercept);
  });

  it("survives collinear features by splitting the weight", () => {
    // Two copies of the same signal: without the ridge the normal equations
    // are singular and the weights explode in opposite directions.
    const rows = Array.from({ length: 100 }, (_, i) => [i, i]);
    const targets = rows.map(([a]) => 4 * a + 1);

    const fit = fitRidge(rows, targets);
    expect(fit).not.toBeNull();
    expect(fit!.weights[0] + fit!.weights[1]).toBeCloseTo(4, 1);
    expect(Math.abs(fit!.weights[0])).toBeLessThan(10);
    expect(fit!.predict([50, 50])).toBeCloseTo(201, 0);
  });

  it("ignores a constant column rather than dividing by nothing", () => {
    const rows = Array.from({ length: 60 }, (_, i) => [i, 7]);
    const targets = rows.map(([a]) => a * 1.5);

    const fit = fitRidge(rows, targets);
    expect(fit).not.toBeNull();
    expect(fit!.weights[1]).toBe(0);
    expect(fit!.predict([20, 7])).toBeCloseTo(30, 0);
  });

  it("shrinks towards the mean when the penalty dominates", () => {
    const rows = Array.from({ length: 40 }, (_, i) => [i]);
    const targets = rows.map(([a]) => 2 * a);
    const meanTarget = 39; // mean of 0, 2, …, 78

    const fit = fitRidge(rows, targets, 1e6)!;
    expect(fit.predict([0])).toBeCloseTo(meanTarget, 0);
    expect(fit.predict([39])).toBeCloseTo(meanTarget, 0);
  });

  it("declines too little data, a flat target, and empty features", () => {
    expect(fitRidge([], [])).toBeNull();
    expect(fitRidge([[1], [2], [3]], [1, 2, 3])).toBeNull();
    const rows = Array.from({ length: 30 }, (_, i) => [i]);
    expect(fitRidge(rows, new Array(30).fill(5))).toBeNull();
    expect(
      fitRidge(
        rows.map(() => []),
        rows.map(([a]) => a),
      ),
    ).toBeNull();
  });
});

describe("meanAbsoluteError", () => {
  it("averages absolute residuals and refuses emptiness", () => {
    expect(meanAbsoluteError([1, 2, 3], [2, 2, 1])).toBeCloseTo(1, 5);
    expect(meanAbsoluteError([], [])).toBeNaN();
  });
});
