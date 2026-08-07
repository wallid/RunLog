import type { ComponentType } from "react";
import type { Confidence, DerivedActivity, MetricType } from "@/model/activity";

/**
 * The shape every widget takes.
 *
 * The five parts are the product's core idea: show the numbers, show the shape,
 * say what happened, offer why it might have happened, and explain the metric.
 * Keeping observation and explanation as separate fields is what stops a guess
 * from being presented as a fact.
 */

/** A single number with its label, shown in the widget's information row. */
export interface Stat {
  label: string;
  value: string;
  /** Optional context, e.g. "estimated" or "moving time only". */
  note?: string;
}

/** Where in the run an observation can be verified. */
export interface EvidenceReference {
  label: string;
  startT: number;
  endT: number;
}

/** A factual statement about the data. Never a guess. */
export interface Observation {
  text: string;
  evidence?: EvidenceReference[];
}

/** A possible reason for an observation, always carrying its confidence. */
export interface Explanation {
  text: string;
  confidence: Confidence;
  relatedMetrics: MetricType[];
}

/** What the metric means, in the context of this run. */
export interface TeachingPoint {
  title: string;
  text: string;
}

/**
 * Published work a section's method draws on.
 *
 * Kept separate from the teaching text so a reader can tell the difference
 * between what the app is asserting and where the idea came from — and so that
 * a method resting on one small study is visibly doing that. It is a pointer to
 * the source, not a claim that the source validated this implementation: these
 * cards apply the ideas to single runs from consumer watches, which is not the
 * setting any of the work was carried out in.
 */
export interface Reference {
  /** The finding, in the one line that makes it relevant here. */
  label: string;
  /** Publication and year, as it would be cited. */
  detail: string;
  url: string;
}

export interface Narration {
  information: Stat[];
  observations: Observation[];
  explanations: Explanation[];
  teaching: TeachingPoint[];
}

export type WidgetSection =
  | "overview"
  | "story"
  | "heart"
  | "pace"
  | "cadence"
  | "effort"
  | "terrain"
  | "splits"
  | "insight"
  | "lab";

/** Section names as they appear in the contents list. */
export const SECTION_LABELS: Record<WidgetSection, string> = {
  overview: "Overview",
  story: "The run",
  heart: "Heart rate",
  pace: "Pace",
  cadence: "Cadence",
  effort: "Output",
  terrain: "Terrain",
  splits: "Structure",
  insight: "What it means",
  lab: "Experimental lab",
};

/**
 * One line saying what a section is for, shown at the head of it on the page.
 *
 * A reader arriving at a run of five cadence cards has no way of knowing what
 * question they are all answering. This is that question, said once, so the
 * cards below it can get straight to their own numbers.
 */
export const SECTION_DESCRIPTIONS: Record<WidgetSection, string> = {
  overview: "The run in figures, before any of it is broken apart.",
  story: "What happened, in order, and where on the map it happened.",
  heart:
    "How hard the run was on you, read from heart rate rather than from speed.",
  pace: "How fast you ran, how evenly you held it, and where it changed.",
  cadence:
    "How often your feet landed, what kept it steady, and where it slipped.",
  effort: "The work itself, measured as power rather than inferred from pace.",
  terrain: "What the ground did underneath you, and what the climbs cost.",
  splits: "The run cut into pieces — kilometres, stops, and its best stretches.",
  insight: "What the metrics say together, and what to carry into the next run.",
  lab: "Methods still being worked out, shown with their reasoning and their limits.",
};

/**
 * The anchor a section's header carries.
 *
 * Derived from the section alone, which is safe because the registry keeps each
 * section's widgets contiguous — a section heads the page exactly once.
 */
export function sectionAnchorId(section: WidgetSection): string {
  return `section-${section}`;
}

/**
 * How settled a widget's method is.
 *
 * `beta` marks sections whose approach is still being worked out — where the
 * thresholds are guesses, or the metric is being interpreted more than
 * measured. They are hidden until a reader asks for them, so the default page
 * only shows what the project stands behind.
 */
export type WidgetStatus = "stable" | "beta";

/**
 * How far a card's headline figure sits from something the device recorded.
 *
 * `status` says how settled the method is; this says something different and
 * more basic — whether the number was measured at all. The two come apart: a
 * settled method can rest on a modelled input, and a shaky method can read a
 * sensor directly.
 *
 * - `measured`  the device recorded this, and the card reports it.
 * - `derived`   arithmetic on recorded values, with nothing added. Step length
 *               is speed divided by step rate; no model sits in between.
 * - `estimated` a model, a fit or a search stands between the recording and the
 *               figure — including anything built on running power, which the
 *               watch infers rather than measures.
 *
 * A card takes the weakest of its inputs, not the strongest. The point is that
 * a reader should never have to guess which of the three they are looking at.
 */
export type Provenance = "measured" | "derived" | "estimated";

/** The badge each level carries, and what it promises. */
export const PROVENANCE_LABELS: Record<Provenance, { badge: string; text: string }> = {
  measured: {
    badge: "Measured",
    text: "Every figure on this card is something the device recorded. Nothing here was modelled or inferred.",
  },
  derived: {
    badge: "Derived",
    text: "The figures here are arithmetic on values the device recorded — no model stands in between, so they are exactly as good as the recordings they come from.",
  },
  estimated: {
    badge: "Estimated",
    text: "A model, a fitted line or a search over the run stands between the recording and the figure shown. Treat it as an interpretation of the data rather than a reading from it.",
  },
};

export interface WidgetViewProps<R> {
  result: R;
  activity: DerivedActivity;
}

export interface WidgetDefinition<R = unknown> {
  id: string;
  title: string;
  /** One line describing what the widget is for, shown on the back of the card. */
  description: string;
  section: WidgetSection;
  /** Defaults to stable. Beta sections are hidden until asked for. */
  status?: WidgetStatus;
  /** The widget is hidden unless the activity carries all of these. */
  requiredMetrics: MetricType[];
  /** Published work the method draws on, shown on the back of the card. */
  references?: Reference[];
  /** How far the headline figure sits from something the device recorded. */
  provenance?: Provenance;
  /**
   * Computes everything the widget needs. Returning null hides the widget,
   * which is how a metric that exists but has too little signal opts out.
   */
  compute: (activity: DerivedActivity) => R | null;
  narrate: (result: R, activity: DerivedActivity) => Narration;
  View: ComponentType<WidgetViewProps<R>>;
}

export function defineWidget<R>(definition: WidgetDefinition<R>): WidgetDefinition<R> {
  return definition;
}

/**
 * A widget with its result type hidden.
 *
 * The registry holds widgets whose result types all differ, and only the widget
 * itself can interpret its own result. Erasing the type in one place keeps the
 * unavoidable cast contained here rather than scattered through the page.
 */
export interface ErasedWidget {
  id: string;
  title: string;
  description: string;
  section: WidgetSection;
  status: WidgetStatus;
  requiredMetrics: MetricType[];
  references: Reference[];
  provenance?: Provenance;
  compute: (activity: DerivedActivity) => unknown;
  narrate: (result: unknown, activity: DerivedActivity) => Narration;
  View: ComponentType<WidgetViewProps<never>>;
}

export function erase<R>(widget: WidgetDefinition<R>): ErasedWidget {
  return {
    ...widget,
    status: widget.status ?? "stable",
    references: widget.references ?? [],
    compute: (activity) => widget.compute(activity),
    narrate: (result, activity) => widget.narrate(result as R, activity),
    View: widget.View as ComponentType<WidgetViewProps<never>>,
  };
}

/** The label shown beside an explanation, per the product's uncertainty rules. */
export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case "high":
      return "Likely explanation";
    case "medium":
      return "Possible explanation";
    case "low":
      return "Not enough data to be sure";
  }
}

export function isWidgetSupported(
  widget: Pick<ErasedWidget, "requiredMetrics">,
  activity: DerivedActivity,
): boolean {
  return widget.requiredMetrics.every((metric) => activity.availableMetrics.has(metric));
}
