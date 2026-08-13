import { create } from "zustand";
import type { RawActivity } from "@/parsers/types";
import type { DerivedActivity } from "@/model/activity";
import { buildActivity } from "@/model/pipeline";
import { parseFile } from "@/parsers";
import { ArchiveError, readArchive, type ArchiveEntry } from "@/upload/archive";
import { useSelectionStore } from "./selectionStore";
import { useSettingsStore } from "./settingsStore";
import { useLibraryStore } from "./libraryStore";
import { getRunBlob } from "@/library/db";
import { fetchRunWeather } from "@/weather/openMeteo";

/**
 * The run currently being read.
 *
 * The raw parse is kept alongside the derived model so changing the maximum
 * heart rate can rebuild zones without asking the reader to upload again.
 */

export type LoadStatus = "idle" | "loading" | "choosing" | "ready" | "error";

interface ActivityState {
  status: LoadStatus;
  raw: RawActivity | null;
  activity: DerivedActivity | null;
  error: string | null;
  fileName: string | null;
  /**
   * The runs found inside an export archive, when it held more than one.
   *
   * Present only while the reader is picking; choosing one or starting over
   * clears it. Entries are lazy, so listing a Health export with four hundred
   * routes in it has not decompressed any of them.
   */
  choices: ArchiveEntry[] | null;

  loadFile: (file: File) => Promise<void>;
  /** Opens one run out of the archive currently being chosen from. */
  chooseEntry: (path: string) => Promise<void>;
  loadDemo: () => Promise<void>;
  /** Reads a run back out of the library. */
  openFromLibrary: (id: string) => Promise<void>;
  /** Recomputes the model against a new maximum heart rate. */
  rebuild: (maxHr: number | undefined) => void;
  /**
   * Looks up the conditions near this run, when the runner has asked for it.
   *
   * Separate from loading so it can be triggered by switching the setting on
   * for a run already on screen, and so a failed or refused lookup never has
   * any bearing on whether the run itself renders.
   */
  loadWeather: () => Promise<void>;
  reset: () => void;
}

const DEMO_URL = `${import.meta.env.BASE_URL}demo/Lunch_Run.fit`;

async function fetchDemo(): Promise<Blob> {
  const response = await fetch(DEMO_URL);
  if (!response.ok) throw new Error("The demo run could not be downloaded.");
  return response.blob();
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  status: "idle",
  raw: null,
  activity: null,
  error: null,
  fileName: null,
  choices: null,

  /**
   * Takes whatever the reader handed over.
   *
   * An export from Apple Health or Strava arrives as a zip rather than an
   * activity, so the container is opened first and the runs inside it are
   * offered. One run inside means there is nothing to ask about.
   */
  loadFile: async (file) => {
    set({ status: "loading", error: null, fileName: file.name, choices: null });
    useSelectionStore.getState().clearAll();
    try {
      const entries = await readArchive(file, file.name);

      if (entries) {
        if (entries.length === 0) {
          throw new ArchiveError(
            "There are no FIT or GPX activities in that archive. An Apple Health export keeps them in workout-routes; a Strava export keeps them in activities.",
          );
        }
        if (entries.length > 1) {
          set({ status: "choosing", choices: entries });
          return;
        }
        await ingest(set, entries[0].name, () => entries[0].read());
        return;
      }

      await ingest(set, file.name, async () => file);
    } catch (error) {
      set({ status: "error", raw: null, activity: null, choices: null, error: messageFor(error) });
    }
  },

  chooseEntry: async (path) => {
    const entry = get().choices?.find((candidate) => candidate.path === path);
    if (!entry) return;
    set({ status: "loading", error: null, fileName: entry.name });
    try {
      await ingest(set, entry.name, () => entry.read());
    } catch (error) {
      // The list is kept: a route the parser could not read is a reason to try
      // another one, not a reason to go back to the file picker.
      set({ status: "choosing", raw: null, activity: null, error: messageFor(error) });
    }
  },

  loadDemo: async () => {
    set({ status: "loading", error: null, fileName: "Lunch Run (demo)", choices: null });
    useSelectionStore.getState().clearAll();
    try {
      // The demo goes through the same path as an upload, so it exercises the
      // real parser rather than a pre-baked result. It is not kept: the library
      // is for the reader's own runs, and a demo that quietly filed itself
      // alongside them would be the page putting something there unasked.
      await ingest(set, "Lunch_Run.fit", fetchDemo, {
        defaultName: "Lunch Run",
        persist: false,
      });
    } catch (error) {
      set({ status: "error", raw: null, activity: null, error: messageFor(error) });
    }
  },

  /**
   * Reopens a run already in the library.
   *
   * The failure case is the interesting one. If a run is already on screen,
   * a switch that cannot be completed leaves it there and says so — dropping
   * the reader back to an empty page because the run they asked for next has
   * gone would cost them the one they still had.
   */
  openFromLibrary: async (id) => {
    const hadRun = get().activity !== null;
    useSelectionStore.getState().clearAll();
    set({ error: null });
    if (!hadRun) set({ status: "loading", choices: null });

    try {
      const blob = await getRunBlob(id);
      if (!blob) throw new Error("That run is no longer stored in this browser.");
      const entry = useLibraryStore.getState().entries.find((run) => run.id === id);
      const name = entry?.fileName ?? "run.fit";

      set({ fileName: name });
      await ingest(set, name, async () => blob, { persist: false });
      useLibraryStore.getState().markOpened(id);
    } catch (error) {
      if (hadRun) {
        // The run on screen is untouched; only the attempt to replace it failed.
        set({ error: messageFor(error) });
        return;
      }
      set({ status: "error", raw: null, activity: null, error: messageFor(error) });
    }
  },

  rebuild: (maxHr) => {
    const { raw, activity } = get();
    if (!raw) return;
    // Weather and the reader's own annotations survive a rebuild: both belong
    // to the run, not to the zone boundaries being recomputed, and
    // re-requesting the weather would mean another needless disclosure.
    const rebuilt = buildActivity(raw, { maxHr });
    set({
      activity: {
        ...rebuilt,
        weather: activity?.weather,
        annotations: activity?.annotations,
      },
    });
  },

  loadWeather: async () => {
    const { activity } = get();
    if (!activity || activity.weather) return;
    if (!useSettingsStore.getState().weatherLookup) return;

    // The first fix of the run is what gets rounded and sent. A run with no
    // GPS has nothing to ask about.
    const fix = activity.samples.find(
      (sample) => sample.lat !== undefined && sample.lon !== undefined,
    );
    if (!fix?.lat || !fix.lon) return;

    const start = activity.startedAt;
    const end = new Date(start.getTime() + activity.elapsedS * 1000);
    const weather = await fetchRunWeather(fix.lat, fix.lon, start, end);
    if (!weather) return;

    // The run may have been replaced while the request was in flight.
    const current = get().activity;
    if (!current || current.id !== activity.id) return;
    set({ activity: { ...current, weather } });
  },

  reset: () => {
    useSelectionStore.getState().clearAll();
    set({
      status: "idle",
      raw: null,
      activity: null,
      error: null,
      fileName: null,
      choices: null,
    });
  },
}));

interface IngestOptions {
  /** Used when the file itself carries no name. */
  defaultName?: string;
  /**
   * Whether to keep this run in the library. False for the demo, which is not
   * the reader's own run, and for a run being reopened out of the library,
   * which is already in it.
   */
  persist?: boolean;
}

/**
 * The one path from bytes to a run on screen.
 *
 * An upload, an entry chosen out of an archive, a run reopened from the library
 * and the demo all go through it, so none of them can drift into exercising a
 * different parser or a different set of settings than the others.
 */
async function ingest(
  set: (partial: Partial<ActivityState>) => void,
  name: string,
  open: () => Promise<Blob>,
  options: IngestOptions = {},
): Promise<void> {
  const blob = await open();
  const parsed = await parseFile(blob, name);
  const raw = options.defaultName ? { ...parsed, name: parsed.name ?? options.defaultName } : parsed;
  const activity = buildActivity(raw, { maxHr: currentMaxHr() });
  set({ status: "ready", raw, activity, error: null, choices: null });

  // Deliberately not awaited. Whether a run can be filed away has no bearing on
  // whether it can be read, and making the reader wait on a write to find out
  // would be paying for the library with the thing it was meant to speed up.
  if (options.persist !== false) {
    void useLibraryStore.getState().addOpened(blob, name, raw);
  }
}

function currentMaxHr(): number | undefined {
  return useSettingsStore.getState().maxHr;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong while reading this file.";
}
