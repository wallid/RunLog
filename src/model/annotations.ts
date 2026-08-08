/**
 * Events the runner adds to a run themselves.
 *
 * A device records what happened; only the runner knows why. A gel at 28 km, a
 * cramp on the last climb, a shoe stopped for — none of it is in the file, and
 * all of it is context the rest of the page can use. These are kept apart from
 * `ActivityEvent`, which the pipeline detects from the data: a detected event
 * carries a confidence, a reported one carries the runner's word.
 */

export type EventCategory = "nutrition" | "body" | "kit" | "other";

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  nutrition: "Nutrition",
  body: "Body",
  kit: "Kit",
  other: "Other",
};

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
  /** ISO timestamp of when the reader added it. */
  createdAt: string;
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
    const { id, t, kind, note, createdAt } = item as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) continue;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) continue;
    if (typeof kind !== "string" || kindSpec(kind) === undefined) continue;
    if (typeof createdAt !== "string") continue;
    const entry: RunAnnotation = { id, t: Math.round(t), kind, createdAt };
    if (typeof note === "string" && note.trim().length > 0) {
      entry.note = note.trim().slice(0, MAX_NOTE_LENGTH);
    }
    entries.push(entry);
  }
  return entries.sort((a, b) => a.t - b.t);
}
