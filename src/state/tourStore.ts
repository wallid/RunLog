import { create } from "zustand";

/**
 * Whether the guided tour is on screen, and whether this browser has already
 * been through it.
 *
 * The tour runs once, on the first run someone opens, and never again unless
 * they ask for it. That is the whole point of persisting anything here: a tour
 * that reappears is an interruption rather than an introduction.
 */

const STORAGE_KEY = "run-story.tour";

/**
 * Bumped only when the tour gains something a returning reader needs to see.
 * A browser that has been through an older version is shown the tour again;
 * rewording a step is not a reason to bump it.
 */
export const TOUR_VERSION = 1;

interface TourState {
  /** The step showing, or null when the tour is not running. */
  step: number | null;
  /** The newest version this browser has finished or dismissed. */
  seenVersion: number;
  /** Opens at the first step, whether or not the tour has been seen before. */
  start: () => void;
  goTo: (step: number) => void;
  /** Closes the tour and records it as seen, however it was left. */
  end: () => void;
}

function loadSeenVersion(): number {
  if (typeof localStorage === "undefined") return 0;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return 0;
    const parsed = JSON.parse(stored) as { seenVersion?: unknown };
    // Anything unrecognisable counts as never seen: showing the tour once more
    // is a smaller cost than silently never showing it.
    return typeof parsed.seenVersion === "number" ? parsed.seenVersion : 0;
  } catch {
    return 0;
  }
}

function persist(seenVersion: number): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ seenVersion }));
  } catch {
    // A blocked storage means the tour is offered again next time, which is
    // not worth interrupting anyone over.
  }
}

export const useTourStore = create<TourState>((set) => ({
  step: null,
  seenVersion: loadSeenVersion(),

  start: () => set({ step: 0 }),
  goTo: (step) => set({ step }),

  // Skipping and finishing are recorded the same way. Someone who dismissed the
  // tour has told us as clearly as someone who read it that they do not need it
  // next time.
  end: () =>
    set(() => {
      persist(TOUR_VERSION);
      return { step: null, seenVersion: TOUR_VERSION };
    }),
}));

/** True when this browser has already been through the current tour. */
export function hasSeenTour(seenVersion: number): boolean {
  return seenVersion >= TOUR_VERSION;
}
