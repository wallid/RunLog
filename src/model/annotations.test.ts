import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  EVENT_KINDS,
  MAX_NOTE_LENGTH,
  kindSpec,
  sanitizeAnnotations,
  sanitizeMeasurement,
} from "./annotations";

/**
 * The catalogue and its reader.
 *
 * Nothing here is clever; all of it is load-bearing. Every kind that has ever
 * shipped is a string sitting in someone's browser, and `sanitizeAnnotations`
 * is the only thing standing between that storage and the page.
 */

describe("the event catalogue", () => {
  it("gives every kind a label and a category that exists", () => {
    for (const spec of EVENT_KINDS) {
      expect(spec.kind.length).toBeGreaterThan(0);
      expect(spec.label.length).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[spec.category]).toBeTruthy();
    }
  });

  it("uses each kind id once", () => {
    const ids = EVENT_KINDS.map((spec) => spec.kind);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("looks a window forward and back for anything it will analyse", () => {
    for (const spec of EVENT_KINDS) {
      if (!spec.impact) continue;
      // Before ends before the event, after starts after it, and both are
      // windows rather than instants.
      expect(spec.impact.before.from).toBeLessThan(spec.impact.before.to);
      expect(spec.impact.before.to).toBeLessThanOrEqual(0);
      expect(spec.impact.after.from).toBeGreaterThan(0);
      expect(spec.impact.after.from).toBeLessThan(spec.impact.after.to);
    }
  });

  it("only offers to analyse fuelling", () => {
    for (const spec of EVENT_KINDS) {
      if (spec.impact) expect(spec.category).toBe("nutrition");
    }
  });
});

describe("reading annotations back out of storage", () => {
  const valid = {
    id: "a",
    t: 600,
    kind: "gel",
    createdAt: "2026-05-02T08:10:00.000Z",
  };

  it("keeps a well-formed entry", () => {
    expect(sanitizeAnnotations([valid])).toEqual([valid]);
  });

  it("refuses anything that is not a list", () => {
    expect(sanitizeAnnotations(null)).toEqual([]);
    expect(sanitizeAnnotations({ id: "a" })).toEqual([]);
    expect(sanitizeAnnotations("gel at 5k")).toEqual([]);
  });

  it("drops a kind this build does not know", () => {
    expect(sanitizeAnnotations([{ ...valid, kind: "beer" }])).toEqual([]);
  });

  it("drops a position that could not be a point in a run", () => {
    expect(sanitizeAnnotations([{ ...valid, t: -1 }])).toEqual([]);
    expect(sanitizeAnnotations([{ ...valid, t: "600" }])).toEqual([]);
    expect(sanitizeAnnotations([{ ...valid, t: Number.NaN }])).toEqual([]);
  });

  it("trims a note and caps how long it can be", () => {
    const [entry] = sanitizeAnnotations([
      { ...valid, note: `  ${"x".repeat(300)}  ` },
    ]);
    expect(entry.note).toHaveLength(MAX_NOTE_LENGTH);
  });

  it("leaves an empty note off rather than storing an empty string", () => {
    const [entry] = sanitizeAnnotations([{ ...valid, note: "   " }]);
    expect(entry).not.toHaveProperty("note");
  });

  it("returns them in the order they happened", () => {
    const entries = sanitizeAnnotations([
      { ...valid, id: "b", t: 1200 },
      { ...valid, id: "a", t: 300 },
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("measurements", () => {
  const lactate = {
    id: "l1",
    t: 1800,
    kind: "lactate",
    value: 3.8,
    createdAt: "2026-05-02T09:00:00.000Z",
  };

  it("keeps a reading a meter could have produced", () => {
    expect(sanitizeMeasurement("lactate", 3.8)).toBe(3.8);
    expect(sanitizeMeasurement("lactate", 0.5)).toBe(0.5);
    expect(sanitizeMeasurement("lactate", 22)).toBe(22);
  });

  it("rounds to the precision the kind is read at", () => {
    expect(sanitizeMeasurement("lactate", 3.84)).toBe(3.8);
    expect(sanitizeMeasurement("lactate", 3.86)).toBe(3.9);
  });

  it("refuses a figure outside the range rather than pinning it to the edge", () => {
    // A mistyped 3.8, which clamping would turn into a maximal reading the
    // runner never took.
    expect(sanitizeMeasurement("lactate", 380)).toBeUndefined();
    expect(sanitizeMeasurement("lactate", 0)).toBeUndefined();
    expect(sanitizeMeasurement("lactate", -2)).toBeUndefined();
    expect(sanitizeMeasurement("lactate", Number.NaN)).toBeUndefined();
  });

  it("refuses a figure on a kind that does not take one", () => {
    expect(sanitizeMeasurement("gel", 3.8)).toBeUndefined();
    expect(sanitizeMeasurement("nonsense", 3.8)).toBeUndefined();
  });

  it("keeps a stored reading with its figure", () => {
    expect(sanitizeAnnotations([lactate])).toEqual([lactate]);
  });

  it("drops a reading that lost its figure rather than keeping an empty marker", () => {
    expect(sanitizeAnnotations([{ ...lactate, value: undefined }])).toEqual([]);
    expect(sanitizeAnnotations([{ ...lactate, value: "3.8" }])).toEqual([]);
    expect(sanitizeAnnotations([{ ...lactate, value: 900 }])).toEqual([]);
  });

  it("leaves a figure off a kind that never asked for one", () => {
    const [entry] = sanitizeAnnotations([{ ...lactate, kind: "gel", value: 3.8 }]);
    expect(entry).not.toHaveProperty("value");
  });
});

describe("kindSpec", () => {
  it("finds a kind and refuses one it has never heard of", () => {
    expect(kindSpec("gel")?.label).toBe("Gel");
    expect(kindSpec("gell")).toBeUndefined();
  });
});
