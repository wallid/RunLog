import { create } from "zustand";

/**
 * What the reader thinks of each section.
 *
 * There is no server to send this to, and inventing one would undo the promise
 * that nothing leaves the browser. So feedback is kept locally and can be
 * copied out as Markdown when the reader chooses to — which is the form an
 * open-source project can actually act on.
 */

export type FeedbackRating = "too-much" | "unclear" | "wrong" | "useful";

export const FEEDBACK_OPTIONS: { rating: FeedbackRating; label: string }[] = [
  { rating: "too-much", label: "Too much detail" },
  { rating: "unclear", label: "Hard to follow" },
  { rating: "wrong", label: "Looks wrong" },
  { rating: "useful", label: "Useful" },
];

export interface FeedbackEntry {
  widgetId: string;
  widgetTitle: string;
  rating: FeedbackRating;
  note?: string;
  at: string;
}

const STORAGE_KEY = "run-story.feedback";

interface FeedbackState {
  entries: Record<string, FeedbackEntry>;
  setRating: (widgetId: string, widgetTitle: string, rating: FeedbackRating) => void;
  setNote: (widgetId: string, widgetTitle: string, note: string) => void;
  remove: (widgetId: string) => void;
  clear: () => void;
}

function load(): Record<string, FeedbackEntry> {
  if (typeof localStorage === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, FeedbackEntry>;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function persist(entries: Record<string, FeedbackEntry>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A full or blocked storage is not worth interrupting the reader over.
  }
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
  entries: load(),

  setRating: (widgetId, widgetTitle, rating) =>
    set((state) => {
      const existing = state.entries[widgetId];
      // Tapping the chosen rating again clears it, so a mis-tap is undoable.
      if (existing?.rating === rating && !existing.note) {
        const { [widgetId]: _removed, ...rest } = state.entries;
        persist(rest);
        return { entries: rest };
      }
      const entries = {
        ...state.entries,
        [widgetId]: {
          ...existing,
          widgetId,
          widgetTitle,
          rating,
          at: new Date().toISOString(),
        },
      };
      persist(entries);
      return { entries };
    }),

  setNote: (widgetId, widgetTitle, note) =>
    set((state) => {
      const existing = state.entries[widgetId];
      const trimmed = note.trim();
      if (!existing && trimmed.length === 0) return state;

      if (existing && trimmed.length === 0 && existing.rating === undefined) {
        const { [widgetId]: _removed, ...rest } = state.entries;
        persist(rest);
        return { entries: rest };
      }

      const entries = {
        ...state.entries,
        [widgetId]: {
          ...existing,
          widgetId,
          widgetTitle,
          rating: existing?.rating ?? "unclear",
          note: trimmed.length > 0 ? trimmed : undefined,
          at: new Date().toISOString(),
        },
      };
      persist(entries);
      return { entries };
    }),

  remove: (widgetId) =>
    set((state) => {
      const { [widgetId]: _removed, ...rest } = state.entries;
      persist(rest);
      return { entries: rest };
    }),

  clear: () =>
    set(() => {
      persist({});
      return { entries: {} };
    }),
}));

/** Renders the collected feedback as a Markdown report to paste into an issue. */
export function feedbackAsMarkdown(entries: FeedbackEntry[]): string {
  if (entries.length === 0) return "";

  const label = (rating: FeedbackRating) =>
    FEEDBACK_OPTIONS.find((option) => option.rating === rating)?.label ?? rating;

  const lines = ["## Run Story feedback", ""];
  for (const entry of entries) {
    lines.push(`- **${entry.widgetTitle}** — ${label(entry.rating)}`);
    if (entry.note) lines.push(`  - ${entry.note}`);
  }
  return lines.join("\n");
}
