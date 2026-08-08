import { create } from "zustand";
import { parseFile } from "@/parsers";
import type { RawActivity } from "@/parsers/types";
import {
  clearRuns,
  deleteRun,
  hasRun,
  libraryAvailable,
  listRuns,
  putRun,
  type RunSummary,
} from "@/library/db";
import { hashBlob, summarizeRaw, type ImportItem } from "@/library/import";

/**
 * The runs kept in this browser.
 *
 * Separate from the activity store on purpose: that one holds the single run
 * being read, at full derived weight, and this one holds a name and a distance
 * for each of possibly several hundred. Keeping them apart is what stops the
 * library from being a reason to hold every run in memory at once.
 *
 * Nothing here can stop a run being read. Storage may be absent, full, or
 * refused, and in every one of those cases the run still opens — the library
 * simply has nothing to add it to. That is why every failure lands in
 * `saveNotice` rather than in an error that a caller has to handle.
 */

export type LibraryStatus = "unloaded" | "loading" | "ready" | "unavailable";

export interface ImportProgress {
  done: number;
  total: number;
  added: number;
  duplicate: number;
  failed: number;
}

/** Which run was last opened, so the list can offer it back first. */
const LAST_RUN_KEY = "runlog.lastRun";

interface LibraryState {
  status: LibraryStatus;
  /** Most recent first. */
  entries: RunSummary[];
  /** Present only while an import is running. */
  importing: ImportProgress | null;
  /** A run that could not be kept. Not an error: the run itself was fine. */
  saveNotice: string | null;
  lastOpenedId: string | null;

  init: () => Promise<void>;
  /** Reads every item and keeps the ones not already held. Cancellable. */
  importAll: (items: ImportItem[]) => Promise<void>;
  cancelImport: () => void;
  /** Keeps a run that has just been opened, using the parse already done. */
  addOpened: (blob: Blob, fileName: string, raw: RawActivity) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  markOpened: (id: string) => void;
  dismissNotice: () => void;
}

/**
 * Set by cancelImport and read between items.
 *
 * Module state rather than store state because the import loop needs to see the
 * change immediately: a flag read out of the store would be a snapshot taken
 * before the reader pressed stop.
 */
let cancelled = false;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  status: "unloaded",
  entries: [],
  importing: null,
  saveNotice: null,
  lastOpenedId: readLastOpened(),

  /**
   * Opens the library and lists what is in it.
   *
   * Idempotent, and safe to call before anything needs it. A browser that
   * refuses storage settles on "unavailable", which every part of the interface
   * reads as "do not offer a library at all" — the page then behaves exactly as
   * it did before there was one.
   */
  init: async () => {
    if (get().status !== "unloaded") return;
    if (!libraryAvailable()) {
      set({ status: "unavailable" });
      return;
    }
    set({ status: "loading" });
    try {
      set({ status: "ready", entries: await listRuns() });
    } catch {
      set({ status: "unavailable", entries: [] });
    }
  },

  /**
   * Keeps every run in a drop or an export.
   *
   * Sequential, not parallel: each item is decompressed and parsed in turn, so
   * a four-hundred-run Health export never holds more than one run's bytes at a
   * time. It is the slower arrangement and the only one that fits in memory.
   *
   * One unreadable file does not end the import. An export of several years'
   * running will contain something this parser cannot read, and stopping there
   * would throw away every run after it.
   */
  importAll: async (items) => {
    if (get().status === "unavailable" || items.length === 0) return;
    if (get().importing) return;

    cancelled = false;
    let progress: ImportProgress = {
      done: 0,
      total: items.length,
      added: 0,
      duplicate: 0,
      failed: 0,
    };
    set({ importing: progress, saveNotice: null });

    for (const item of items) {
      if (cancelled) break;
      try {
        const blob = await item.read();
        const id = await hashBlob(blob);
        if (await hasRun(id)) {
          progress = { ...progress, duplicate: progress.duplicate + 1 };
        } else {
          const raw = await parseFile(blob, item.name);
          await putRun(summarizeRaw(raw, item.name, id), blob);
          progress = { ...progress, added: progress.added + 1 };
        }
      } catch {
        // Which file failed is not worth naming: in an export of hundreds the
        // count is the only part a reader can act on.
        progress = { ...progress, failed: progress.failed + 1 };
      }
      progress = { ...progress, done: progress.done + 1 };
      set({ importing: progress });
    }

    set({
      importing: null,
      entries: await safeList(),
      saveNotice: summarize(progress, cancelled),
    });
  },

  cancelImport: () => {
    cancelled = true;
  },

  /**
   * Keeps a run the reader has just opened.
   *
   * The parse has already happened by the time this is called, so keeping it
   * costs a hash and a write. Failures are swallowed into a notice: a run on
   * screen that could not also be filed away is still a run on screen.
   */
  addOpened: async (blob, fileName, raw) => {
    if (get().status === "unavailable") return;
    try {
      const id = await hashBlob(blob);
      if (!(await hasRun(id))) {
        await putRun(summarizeRaw(raw, fileName, id), blob);
        set({ entries: await safeList() });
      }
      get().markOpened(id);
    } catch {
      set({
        saveNotice: "This run is open, but could not be kept for next time.",
      });
    }
  },

  remove: async (id) => {
    try {
      await deleteRun(id);
      if (get().lastOpenedId === id) forgetLastOpened();
      set((state) => ({
        entries: state.entries.filter((entry) => entry.id !== id),
        lastOpenedId: state.lastOpenedId === id ? null : state.lastOpenedId,
      }));
    } catch {
      set({ saveNotice: "That run could not be removed." });
    }
  },

  clearAll: async () => {
    try {
      await clearRuns();
      forgetLastOpened();
      set({ entries: [], lastOpenedId: null, saveNotice: null });
    } catch {
      set({ saveNotice: "The stored runs could not be removed." });
    }
  },

  markOpened: (id) => {
    rememberLastOpened(id);
    set({ lastOpenedId: id });
  },

  dismissNotice: () => set({ saveNotice: null }),
}));

/**
 * What the import did, in a sentence.
 *
 * Said whatever the outcome, not only when something went wrong. Keeping four
 * hundred runs looks identical to keeping none once the progress line goes, and
 * a reader with no way to tell the difference will press the button again.
 */
function summarize(progress: ImportProgress, stopped: boolean): string {
  const parts: string[] = [];
  const runs = (n: number) => `${n} ${n === 1 ? "run" : "runs"}`;

  parts.push(progress.added > 0 ? `${runs(progress.added)} kept` : "Nothing new to keep");
  if (progress.duplicate > 0) parts.push(`${runs(progress.duplicate)} already here`);
  if (progress.failed > 0) parts.push(`${progress.failed} could not be read`);
  if (stopped) parts.push(`stopped with ${progress.total - progress.done} left`);

  return `${parts.join(" · ")}.`;
}

/** Listing must never be the thing that breaks an import that otherwise worked. */
async function safeList(): Promise<RunSummary[]> {
  try {
    return await listRuns();
  } catch {
    return useLibraryStore.getState().entries;
  }
}

function readLastOpened(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(LAST_RUN_KEY);
  } catch {
    return null;
  }
}

function rememberLastOpened(id: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LAST_RUN_KEY, id);
  } catch {
    // Losing which run was last read is not worth interrupting anybody over.
  }
}

function forgetLastOpened(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(LAST_RUN_KEY);
  } catch {
    // As above.
  }
}
