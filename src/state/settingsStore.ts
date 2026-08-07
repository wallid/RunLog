import { create } from "zustand";
import { readStored } from "./storage";

/**
 * Runner-supplied context.
 *
 * The only setting that changes any number on the page is maximum heart rate,
 * because it defines the zone boundaries. It is persisted so a runner sets it
 * once rather than on every upload.
 */

const STORAGE_KEY = "runlog.settings";
/** What the key was called before the project was renamed. */
const LEGACY_STORAGE_KEY = "run-story.settings";

export interface Settings {
  /** The runner's own maximum heart rate. Undefined means "estimate from the run". */
  maxHr?: number;
  /**
   * Show sections whose method is still being worked out. Undefined means "not
   * yet decided", which is treated as on — the sections carry a Beta badge and
   * say what they are unsure about, and a section nobody can find is a section
   * nobody can tell us is wrong.
   */
  showExperimental?: boolean;
  /**
   * Send anonymous crash reports. Undefined means "not yet decided", which is
   * treated as on — the reports carry no run data, and a report nobody opted
   * into is the only way a crash on someone else's browser is ever seen.
   */
  crashReports?: boolean;
  /**
   * Look up what the weather was near a run. Undefined means off.
   *
   * Unlike crash reports, this defaults off and has to be switched on: it is
   * the only feature that sends anything about where the runner was, and a
   * location is not something to disclose on someone's behalf.
   */
  weatherLookup?: boolean;
}

interface SettingsState extends Settings {
  setMaxHr: (maxHr: number | undefined) => void;
  setShowExperimental: (show: boolean) => void;
  setCrashReports: (send: boolean) => void;
  setWeatherLookup: (enabled: boolean) => void;
}

function loadSettings(): Settings {
  if (typeof localStorage === "undefined") return {};
  try {
    const stored = readStored(STORAGE_KEY, LEGACY_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Settings;
    const settings: Settings = {};
    // Refuse a stored value that could not belong to a person.
    if (typeof parsed.maxHr === "number" && parsed.maxHr >= 120 && parsed.maxHr <= 230) {
      settings.maxHr = parsed.maxHr;
    }
    // As with crash reports, only an explicit refusal is stored; anything else
    // leaves it undecided, and undecided shows them.
    if (parsed.showExperimental === false) settings.showExperimental = false;
    // Only an explicit refusal is stored; anything else leaves it undecided.
    if (parsed.crashReports === false) settings.crashReports = false;
    // Only an explicit yes is stored, so the default stays off.
    if (parsed.weatherLookup === true) settings.weatherLookup = true;
    return settings;
  } catch {
    return {};
  }
}

function persist(settings: Settings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full or blocked storage is not worth interrupting the reader over.
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  /**
   * Persists the whole settings object, so one setter never drops another's
   * field. Every key is present even when undefined: the store merges what it
   * is given, and an absent key would leave a cleared setting at its old value
   * rather than clearing it. `JSON.stringify` omits the undefined ones, so what
   * reaches storage is still only what was actually chosen.
   */
  const update = (change: Settings): Settings => {
    const { maxHr, showExperimental, crashReports, weatherLookup } = { ...get(), ...change };
    const next: Settings = { maxHr, showExperimental, crashReports, weatherLookup };
    persist(next);
    return next;
  };

  return {
    ...loadSettings(),

    setMaxHr: (maxHr) => set(() => update({ maxHr })),
    setShowExperimental: (showExperimental) => set(() => update({ showExperimental })),
    setCrashReports: (crashReports) => set(() => update({ crashReports })),
    setWeatherLookup: (weatherLookup) => set(() => update({ weatherLookup })),
  };
});

/** Undecided counts as consent; only an explicit "no" turns reporting off. */
export function sendsCrashReports(settings: Settings): boolean {
  return settings.crashReports !== false;
}
