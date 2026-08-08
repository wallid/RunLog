import { create } from "zustand";
import {
  MAX_NOTE_LENGTH,
  kindSpec,
  sanitizeAnnotations,
  type RunAnnotation,
} from "@/model/annotations";
import { useActivityStore } from "./activityStore";

/**
 * The events readers have added to their runs.
 *
 * Keyed by the run's derived id, which every load path has synchronously and
 * which the same file always parses back to — so an annotation added today is
 * still on the run when the same export is opened next month. All runs' entries
 * are held together so switching runs never needs a re-read.
 *
 * The store also pushes a run's annotations onto the activity object on screen
 * (`attach`), the same way the weather lookup does: replacing the activity is
 * what re-runs every widget, so the cards react to a new event without the
 * pipeline ever learning annotations exist.
 */

const STORAGE_KEY = "runlog.annotations";

/** Enough for an aid station every 800 m of a marathon, twice over. */
const MAX_PER_RUN = 50;
/**
 * Storage is shared with the settings, so a record that grew without bound
 * could evict them. Oldest runs go first; nobody re-reads their two-hundredth
 * run back.
 */
const MAX_RUNS = 200;

interface AnnotationState {
  byRun: Record<string, RunAnnotation[]>;
  add: (runId: string, input: { t: number; kind: string; note?: string }) => void;
  update: (
    runId: string,
    id: string,
    patch: Partial<Pick<RunAnnotation, "t" | "kind" | "note">>,
  ) => void;
  remove: (runId: string, id: string) => void;
  /**
   * Pushes a run's annotations onto the activity on screen, when it is that
   * run. Idempotent — it bails when the activity already carries this exact
   * array — so callers may invoke it from an effect that watches the activity
   * without looping.
   */
  attach: (runId: string) => void;
}

function load(): Record<string, RunAnnotation[]> {
  if (typeof localStorage === "undefined") return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const byRun: Record<string, RunAnnotation[]> = {};
    for (const [runId, value] of Object.entries(parsed)) {
      const entries = sanitizeAnnotations(value);
      if (entries.length > 0) byRun[runId] = entries;
    }
    return byRun;
  } catch {
    return {};
  }
}

function persist(byRun: Record<string, RunAnnotation[]>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(byRun));
  } catch {
    // A full or blocked storage is not worth interrupting the reader over.
  }
}

/** Drops the longest-untouched runs once there are too many to keep. */
function pruned(byRun: Record<string, RunAnnotation[]>): Record<string, RunAnnotation[]> {
  const keys = Object.keys(byRun);
  if (keys.length <= MAX_RUNS) return byRun;
  const newestFirst = keys.sort((a, b) => latestEdit(byRun[b]) - latestEdit(byRun[a]));
  const kept: Record<string, RunAnnotation[]> = {};
  for (const key of newestFirst.slice(0, MAX_RUNS)) kept[key] = byRun[key];
  return kept;
}

function latestEdit(entries: RunAnnotation[]): number {
  let latest = 0;
  for (const entry of entries) {
    const at = Date.parse(entry.createdAt);
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return latest;
}

function cleanNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim().slice(0, MAX_NOTE_LENGTH);
  return trimmed ? trimmed : undefined;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => {
  /** Persists and stores one run's new list, then pushes it onto the page. */
  const commit = (runId: string, entries: RunAnnotation[]): void => {
    const sorted = [...entries].sort((a, b) => a.t - b.t);
    set((state) => {
      const byRun = pruned({ ...state.byRun, [runId]: sorted });
      if (sorted.length === 0) delete byRun[runId];
      persist(byRun);
      return { byRun };
    });
    get().attach(runId);
  };

  return {
    byRun: load(),

    add: (runId, input) => {
      const existing = get().byRun[runId] ?? [];
      if (existing.length >= MAX_PER_RUN) return;
      if (kindSpec(input.kind) === undefined) return;
      if (!Number.isFinite(input.t) || input.t < 0) return;
      const entry: RunAnnotation = {
        id: crypto.randomUUID(),
        t: Math.round(input.t),
        kind: input.kind,
        createdAt: new Date().toISOString(),
      };
      const note = cleanNote(input.note);
      if (note) entry.note = note;
      commit(runId, [...existing, entry]);
    },

    update: (runId, id, patch) => {
      const existing = get().byRun[runId] ?? [];
      const entries = existing.map((entry) => {
        if (entry.id !== id) return entry;
        const next: RunAnnotation = { ...entry };
        if (patch.t !== undefined && Number.isFinite(patch.t) && patch.t >= 0) {
          next.t = Math.round(patch.t);
        }
        if (patch.kind !== undefined && kindSpec(patch.kind) !== undefined) {
          next.kind = patch.kind;
        }
        if ("note" in patch) {
          const note = cleanNote(patch.note);
          if (note) next.note = note;
          else delete next.note;
        }
        return next;
      });
      commit(runId, entries);
    },

    remove: (runId, id) => {
      const existing = get().byRun[runId] ?? [];
      commit(
        runId,
        existing.filter((entry) => entry.id !== id),
      );
    },

    attach: (runId) => {
      const { activity } = useActivityStore.getState();
      if (!activity || activity.id !== runId) return;
      const entries = get().byRun[runId];
      // Undefined and absent are the same statement — nothing was added — so
      // an empty list is taken back off rather than left as [].
      if (activity.annotations === entries) return;
      if (activity.annotations === undefined && entries === undefined) return;
      useActivityStore.setState({ activity: { ...activity, annotations: entries } });
    },
  };
});
