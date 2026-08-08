import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  EVENT_KINDS,
  MAX_NOTE_LENGTH,
  kindSpec,
  sanitizeAnnotations,
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

describe("kindSpec", () => {
  it("finds a kind and refuses one it has never heard of", () => {
    expect(kindSpec("gel")?.label).toBe("Gel");
    expect(kindSpec("gell")).toBeUndefined();
  });
});
