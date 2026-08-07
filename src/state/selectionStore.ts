import { create } from "zustand";

/**
 * What the reader is currently looking at.
 *
 * Every position is stored as elapsed seconds, which is the one axis all data
 * shares. Widgets convert to distance or pixels themselves. Because every
 * widget subscribes to just the slice it paints, dragging the timeline does not
 * re-render the twenty widgets that only care about the highlighted region.
 */

export type XMode = "time" | "distance";

export type Highlight =
  | { kind: "zone"; zone: number }
  | { kind: "event"; eventId: string }
  | { kind: "split"; index: number }
  | { kind: "moment"; momentId: string }
  | null;

export interface Selection {
  startT: number;
  endT: number;
  sourceWidgetId: string;
}

interface SelectionState {
  xMode: XMode;
  /** The single point in the run under inspection, or null when idle. */
  cursorT: number | null;
  selection: Selection | null;
  highlight: Highlight;

  setXMode: (mode: XMode) => void;
  setCursor: (t: number | null) => void;
  select: (startT: number, endT: number, sourceWidgetId: string) => void;
  clearSelection: () => void;
  setHighlight: (highlight: Highlight) => void;
  /** Moves the cursor to a region and highlights it — used by every "jump here" click. */
  focusRegion: (startT: number, endT: number, highlight: Highlight, sourceWidgetId: string) => void;
  clearAll: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  xMode: "distance",
  cursorT: null,
  selection: null,
  highlight: null,

  setXMode: (xMode) => set({ xMode }),
  setCursor: (cursorT) => set({ cursorT }),
  select: (startT, endT, sourceWidgetId) =>
    set({ selection: { startT, endT, sourceWidgetId } }),
  clearSelection: () => set({ selection: null }),
  setHighlight: (highlight) => set({ highlight }),

  focusRegion: (startT, endT, highlight, sourceWidgetId) =>
    set({
      selection: { startT, endT, sourceWidgetId },
      // Park the cursor in the middle of the region so the readout describes it.
      cursorT: Math.round((startT + endT) / 2),
      highlight,
    }),

  clearAll: () => set({ cursorT: null, selection: null, highlight: null }),
}));

/** True when a highlight refers to this event. */
export function isEventHighlighted(highlight: Highlight, eventId: string): boolean {
  return highlight?.kind === "event" && highlight.eventId === eventId;
}
