// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, resolveTheme, watchSystemTheme } from "./theme";

/**
 * Which palette the page ends up wearing.
 *
 * The behaviour worth pinning down is the difference between "dark" and "dark
 * because this machine is". They look identical on screen and are not the same
 * thing: one of them has to keep following the operating system for the rest of
 * the visit, and one of them has to stop.
 */

/** Stands in for the OS setting, which no test environment lets us actually set. */
function systemIs(dark: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return {
    /** The reader changes their system setting mid-visit. */
    flip(nowDark: boolean) {
      systemIs(nowDark);
      for (const fn of listeners) fn();
    },
  };
}

const themeAttribute = () => document.documentElement.dataset.theme;
const browserChrome = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#fc5200" />';
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolving a choice", () => {
  it("takes the system's answer when nobody has chosen", () => {
    systemIs(true);
    expect(resolveTheme(undefined)).toBe("dark");
    systemIs(false);
    expect(resolveTheme(undefined)).toBe("light");
  });

  it("overrides the system once somebody has", () => {
    systemIs(true);
    expect(resolveTheme("light")).toBe("light");
    systemIs(false);
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("falls back to light where there is nothing to ask", () => {
    // Server-rendered, or a browser old enough to lack matchMedia.
    vi.stubGlobal("matchMedia", undefined);
    expect(resolveTheme(undefined)).toBe("light");
  });
});

describe("applying it", () => {
  it("puts the theme where the tokens can see it", () => {
    systemIs(false);
    applyTheme("dark");
    expect(themeAttribute()).toBe("dark");
    applyTheme("light");
    expect(themeAttribute()).toBe("light");
  });

  it("repaints the browser's own furniture to match", () => {
    // An orange address bar over a near-black page reads as a header that
    // failed to load.
    systemIs(false);
    applyTheme("dark");
    expect(browserChrome()).toBe("#131211");
    applyTheme("light");
    expect(browserChrome()).toBe("#fc5200");
  });
});

describe("following the system", () => {
  it("keeps up with it while the choice is unset", () => {
    const system = systemIs(false);
    const stop = watchSystemTheme(() => undefined);
    applyTheme(undefined);
    expect(themeAttribute()).toBe("light");

    system.flip(true);
    expect(themeAttribute()).toBe("dark");
    stop();
  });

  it("leaves an explicit choice alone", () => {
    const system = systemIs(false);
    const stop = watchSystemTheme(() => "light" as const);
    applyTheme("light");

    system.flip(true);
    expect(themeAttribute()).toBe("light");
    stop();
  });

  it("reads the choice each time rather than remembering it", () => {
    // A reader who picks dark and then clears it back to "match my system" is
    // followed again, without the watch being torn down and rebuilt.
    let choice: "light" | "dark" | undefined = "light";
    const system = systemIs(false);
    const stop = watchSystemTheme(() => choice);

    system.flip(true);
    expect(themeAttribute()).toBeUndefined();

    choice = undefined;
    system.flip(true);
    expect(themeAttribute()).toBe("dark");
    stop();
  });
});

describe("what is written down", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    systemIs(false);
  });

  /** The store reads storage once, on import, so each case gets a fresh one. */
  async function storeWith(stored: unknown) {
    if (stored !== undefined) {
      localStorage.setItem("runlog.settings", JSON.stringify(stored));
    }
    const { useSettingsStore } = await import("@/state/settingsStore");
    return useSettingsStore;
  }

  /** What actually reached storage. */
  function persisted(): Record<string, unknown> {
    return JSON.parse(localStorage.getItem("runlog.settings") ?? "{}") as Record<
      string,
      unknown
    >;
  }

  it("keeps a chosen theme across visits", async () => {
    const first = await storeWith(undefined);
    first.getState().setTheme("dark");
    expect(persisted().theme).toBe("dark");

    vi.resetModules();
    const second = await storeWith(undefined);
    expect(second.getState().theme).toBe("dark");
  });

  it("stores nothing for a reader who is matching their system", async () => {
    const store = await storeWith({ theme: "dark" });
    store.getState().setTheme(undefined);
    // `JSON.stringify` drops the undefined, so what is kept is again only what
    // was actually chosen — and the next visit follows the system.
    expect(persisted()).not.toHaveProperty("theme");
  });

  it("refuses a stored value that is not one of the two palettes", async () => {
    const store = await storeWith({ theme: "solarized", maxHr: 185 });
    expect(store.getState().theme).toBeUndefined();
    // And leaves the rest of the settings alone.
    expect(store.getState().maxHr).toBe(185);
  });

  it("paints the page as soon as the choice is made", async () => {
    const store = await storeWith(undefined);
    store.getState().setTheme("dark");
    expect(themeAttribute()).toBe("dark");
  });
});
