import type { Placement } from "./placement";

/**
 * What the tour says, in order.
 *
 * It teaches the page rather than the product: the rail, the sections, and the
 * one card layout every section is written into. Someone who has read these
 * eight steps can read all forty cards, which is the only thing worth stopping
 * a reader for.
 *
 * Each step names the elements it lights up. Nothing here reaches into a
 * widget's internals — the marks are put on the page by the shell, so a card
 * that grows a new part does not silently break the tour.
 */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /**
   * CSS selectors for what to light up, lit together as one shape. A step with
   * no target is shown centred, over nothing in particular.
   */
  target?: string[];
  /** Breathing room around the target, in pixels. */
  padding?: number;
  /** Where the panel would rather sit; ignored if it does not fit there. */
  placement?: Placement;
}

/** The one card the tour reads from: the first on the page. */
const CARD = '[data-tour="card"]';

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "This is your run, written out",
    body: "About a minute to learn how the page is laid out, and then you can read any part of it. Your file never left this browser, and neither does anything you do here.",
  },
  {
    id: "contents",
    title: "Everything the file supported",
    body: "The rail lists only the sections your data could actually build — a run without cadence has no cadence section, rather than an empty one. Click any line to jump; it marks where you are as you scroll.",
    target: ['[data-tour="contents"]'],
    padding: 12,
    placement: "right",
  },
  {
    id: "sections",
    title: "The page comes in parts",
    body: "Cards are grouped, and each group opens with the question its cards are answering. Read the header and you know what the next few cards are for.",
    target: ['[data-tour="section-header"]'],
    padding: 10,
  },
  {
    id: "card",
    title: "Every card is built the same way",
    body: "Same order on all of them, top to bottom: the figures, the picture, then what happened, then what it might mean. Learn it once here and the rest of the page reads itself.",
    target: [CARD],
    padding: 8,
  },
  {
    id: "information",
    title: "The figures behind it",
    body: "The row at the top is what the card was computed from. It is there so you can check a claim against its numbers instead of taking it on trust.",
    target: [`${CARD} [data-tour-part="information"]`],
    padding: 10,
  },
  {
    id: "reading",
    title: "Observed, then interpreted",
    body: "A line tagged Observed is what the data literally shows. A line tagged with a confidence is an interpretation, and the tag tells you how far the page is willing to stand behind it.",
    target: [
      `${CARD} [data-tour-part="observations"]`,
      `${CARD} [data-tour-part="explanations"]`,
    ],
    padding: 10,
  },
  {
    id: "info",
    title: "Turn a card over",
    body: "This button gives you the back: what the metric means, where the method came from, and a place to tell us a card has it wrong.",
    target: [`${CARD} [data-tour-part="info"]`],
    padding: 8,
  },
  {
    id: "settings",
    title: "Settings, when you want them",
    body: "Your maximum heart rate sets every zone on the page, and experimental sections are switched on and off in here. This tour lives in the same panel if you want it again.",
    target: ['[data-tour="settings"]'],
    padding: 8,
    placement: "bottom",
  },
];

/**
 * The elements a step wants lit, ignoring any the layout is not showing.
 *
 * The rail is not rendered on a narrow window and a card may have no
 * interpretation to offer, so a target that measures zero is treated as absent
 * and its step is passed over rather than pointing at nothing.
 */
export function stepTargets(step: TourStep, root: ParentNode = document): HTMLElement[] {
  if (!step.target) return [];
  return step.target
    .flatMap((selector) => Array.from(root.querySelectorAll<HTMLElement>(selector)))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
}

/** Whether a step has anything to point at on this page, at this width. */
export function isStepAvailable(step: TourStep, root?: ParentNode): boolean {
  return !step.target || stepTargets(step, root).length > 0;
}

/**
 * The next step in `direction` with something to point at, or null when the
 * tour has run out in that direction — which is how Next on the last step ends
 * it, and how Back on the first one is hidden.
 */
export function resolveStep(
  from: number,
  direction: 1 | -1,
  available: (step: TourStep) => boolean,
  steps: TourStep[] = TOUR_STEPS,
): number | null {
  for (let index = from + direction; index >= 0 && index < steps.length; index += direction) {
    if (available(steps[index])) return index;
  }
  return null;
}
