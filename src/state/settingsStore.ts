import { create } from "zustand";
import { readStored } from "./storage";
import { findLanguage } from "@/i18n/languages";

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
   * Look up what the weather was near a run. Undefined means off.
   *
   * It defaults off and has to be switched on: it is the only feature that
   * sends anything about where the runner was, and a location is not something
   * to disclose on someone's behalf.
   */
  weatherLookup?: boolean;
  /**
   * Translate the page into this language, through Google's widget. Undefined
   * means English, as written, and contacts nobody.
   *
   * Off until chosen, for the same reason as the weather lookup: translating
   * hands the visible text of the page to a third party, and that is the
   * reader's decision rather than a default. The browser's own language
   * preference is used to *suggest* a language, never to select one — a
   * request header is not consent.
   */
  language?: string;
}

interface SettingsState extends Settings {
  setMaxHr: (maxHr: number | undefined) => void;
  setShowExperimental: (show: boolean) => void;
  setWeatherLookup: (enabled: boolean) => void;
  setLanguage: (language: string | undefined) => void;
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
    // Only an explicit refusal is stored; anything else leaves it undecided,
    // and undecided shows them.
    if (parsed.showExperimental === false) settings.showExperimental = false;
    // Only an explicit yes is stored, so the default stays off.
    if (parsed.weatherLookup === true) settings.weatherLookup = true;
    // Refuse a stored code that is not one this build offers: an unknown code
    // would load the widget on every visit and translate into nothing.
    if (typeof parsed.language === "string" && findLanguage(parsed.language)) {
      settings.language = parsed.language;
    }
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
    const { maxHr, showExperimental, weatherLookup, language } = {
      ...get(),
      ...change,
    };
    const next: Settings = {
      maxHr,
      showExperimental,
      weatherLookup,
      language,
    };
    persist(next);
    return next;
  };

  return {
    ...loadSettings(),

    setMaxHr: (maxHr) => set(() => update({ maxHr })),
    setShowExperimental: (showExperimental) => set(() => update({ showExperimental })),
    setWeatherLookup: (weatherLookup) => set(() => update({ weatherLookup })),
    setLanguage: (language) => set(() => update({ language })),
  };
});
