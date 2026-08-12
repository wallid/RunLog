/**
 * Events the runner adds to a run themselves.
 *
 * A device records what happened; only the runner knows why. A gel at 28 km, a
 * cramp on the last climb, a shoe stopped for — none of it is in the file, and
 * all of it is context the rest of the page can use. These are kept apart from
 * `ActivityEvent`, which the pipeline detects from the data: a detected event
 * carries a confidence, a reported one carries the runner's word.
 */

export type EventCategory = "nutrition" | "body" | "test" | "kit" | "other";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  nutrition: "Nutrition",
  body: "Body",
  test: "Tests",
  kit: "Kit",
  other: "Other",
};

/**
 * A number the runner took at a point in the run, rather than a thing that
 * happened at it.
 *
 * A finger-prick lactate reading is not an event with a before and an after —
 * it is a measurement of the running that led up to it, and it is worthless
 * without its figure. A kind carrying one of these asks for the number and
 * refuses the entry without it; the range is what a real device can read, so a
 * fumbled decimal point is rejected rather than stored and later interpreted.
 */
export interface MeasureSpec {
  /** What the reader is being asked for, above the field. */
  label: string;
  /** Shown beside the field, and after the figure everywhere it appears. */
  unit: string;
  /** Outside this the entry is a typo, not a reading. */
  min: number;
  max: number;
  /** The step of the field, and the precision the figure is kept to. */
  step: number;
  decimals: number;
  placeholder: string;
}

/**
 * One kind of event the reader can log.
 *
 * A kind with an `impact` spec is one where a before-and-after comparison is
 * physiologically meaningful, and the windows say when the effect should show.
 * A kind without one is a marker and a note: for a cramp or a shoe stop there
 * is no honest window to score, only a place to remember. Adding a kind is one
 * entry here — nothing else changes.
 */
export interface EventKindSpec {
  /** Stable id, stored in the browser; never rename one that has shipped. */
  kind: string;
  label: string;
  category: EventCategory;
  /** Seconds relative to the event at which its effect is looked for. */
  impact?: {
    before: { from: number; to: number };
    after: { from: number; to: number };
  };
  /** Present when the entry is a number the runner read off a device. */
  measure?: MeasureSpec;
}

/**
 * The half-minute around the event itself is fumbling with a wrapper or a
 * bottle, not fuel, so every "before" window stops short of it.
 */
const BEFORE = { from: -330, to: -30 };

export const EVENT_KINDS: EventKindSpec[] = [
  // Nutrition — the analysed starting point. The "after" windows follow how
  // quickly each form reaches the blood: a gel inside 5–15 minutes, a
  // carbohydrate drink a little sooner, solid food notably later.
  { kind: "gel", label: "Gel", category: "nutrition", impact: { before: BEFORE, after: { from: 300, to: 900 } } },
  { kind: "drink", label: "Drink", category: "nutrition", impact: { before: BEFORE, after: { from: 180, to: 720 } } },
  { kind: "food", label: "Food", category: "nutrition", impact: { before: BEFORE, after: { from: 600, to: 1500 } } },
  // Marker only: electrolytes have no acute pace effect worth claiming.
  { kind: "salt", label: "Salt tab", category: "nutrition" },

  // Body — markers and notes. Scoring a cramp's before-and-after would dress
  // the obvious up as a finding.
  { kind: "cramp", label: "Cramp", category: "body" },
  { kind: "pain", label: "Pain or niggle", category: "body" },
  { kind: "energy", label: "Energy dip", category: "body" },

  // Tests — a number read off a device mid-run. No `impact` window: a lactate
  // sample is a measurement of the running *before* it, so comparing the
  // minutes either side of the prick would be reading the pause for the finger.
  // The *Lactate profile* card reads these instead.
  {
    kind: "lactate",
    label: "Blood lactate",
    category: "test",
    measure: {
      label: "Blood lactate",
      unit: "mmol/L",
      // Handheld meters read from about 0.5 to 25; the bounds are a little
      // wider so a genuine extreme is kept and a slipped decimal is not.
      min: 0.3,
      max: 30,
      step: 0.1,
      decimals: 1,
      placeholder: "e.g. 3.8",
    },
  },

  // Kit and everything else.
  { kind: "kit", label: "Shoe or kit", category: "kit" },
  { kind: "other", label: "Other", category: "other" },
];

export function kindSpec(kind: string): EventKindSpec | undefined {
  return EVENT_KINDS.find((spec) => spec.kind === kind);
}

/** How long a note is allowed to grow; storage is shared with the settings. */
export const MAX_NOTE_LENGTH = 120;

/** A point in the run the runner told us about, not one the device recorded. */
export interface RunAnnotation {
  id: string;
  /** Elapsed seconds since the start of the run, whole seconds. */
  t: number;
  /**
   * Matches an `EVENT_KINDS` entry. Kept a string rather than a union so a
   * kind stored by a newer build is dropped on read by an older one instead of
   * crashing it.
   */
  kind: string;
  note?: string;
  /**
   * The figure, for a kind that asks for one. Always in the kind's own unit —
   * there is no second unit to convert from, and storing one without the kind
   * that gives it meaning would be storing a bare number.
   */
  value?: number;
  /** ISO timestamp of when the reader added it. */
  createdAt: string;
}

/**
 * A measurement rounded to its kind's precision, or undefined.
 *
 * Undefined covers every way an entry can fail to be a reading: a kind that
 * takes no measurement, a missing or unparseable figure, and one outside what
 * the device could have produced. Nothing is clamped — a value of 380 is a
 * mistyped 3.8, and pinning it to the top of the range would put a maximal
 * reading on the page that the runner never took.
 */
export function sanitizeMeasurement(
  kind: string,
  value: unknown,
): number | undefined {
  const measure = kindSpec(kind)?.measure;
  if (!measure) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < measure.min || value > measure.max) return undefined;
  const factor = 10 ** measure.decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Keeps only entries that could be real annotations, sorted by position.
 *
 * The same philosophy as the settings: storage is not trusted, and anything
 * unrecognisable is dropped rather than repaired, because a repaired guess
 * would sit on the page claiming the runner said it.
 */
export function sanitizeAnnotations(value: unknown): RunAnnotation[] {
  if (!Array.isArray(value)) return [];
  const entries: RunAnnotation[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { id, t, kind, note, value, createdAt } = item as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) continue;
    if (typeof kind !== "string" || kindSpec(kind) === undefined) continue;
    if (typeof createdAt !== "string") continue;
    const entry: RunAnnotation = { id, t: Math.round(t), kind, createdAt };
    if (typeof note === "string" && note.trim().length > 0) {
      entry.note = note.trim().slice(0, MAX_NOTE_LENGTH);
    }
    const measurement = sanitizeMeasurement(kind, value);
    // A reading without its figure is not a weaker reading, it is nothing at
    // all — so a measured kind that lost its number is dropped rather than kept
    // as an empty marker the cards would then have to guard against.
    if (measurement === undefined && kindSpec(kind)?.measure) continue;
    if (measurement !== undefined) entry.value = measurement;
    entries.push(entry);
  }
  return entries.sort((a, b) => a.t - b.t);
}
