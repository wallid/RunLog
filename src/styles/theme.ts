/**
 * Which of the two palettes the page is wearing.
 *
 * The choice is stored as light, dark, or nothing at all, and nothing at all is
 * the default: a reader who has never opened Settings gets whichever their
 * operating system is set to, and follows it when it changes — which on most
 * phones and laptops means the page goes dark in the evening on its own. Only
 * an explicit pick is written down, and it then overrides the system for good.
 *
 * All of that comes down to one attribute on the root element, which
 * `tokens.css` keys the dark set off. Everything else on the page reads tokens,
 * so nothing else has to know a theme exists.
 */

export type ThemeChoice = "light" | "dark";

/** The key the pre-paint snippet in `index.html` reads. Kept in step by hand. */
export const THEME_QUERY = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(THEME_QUERY).matches;
}

/** What the page will actually look like, once the system has had its say. */
export function resolveTheme(choice: ThemeChoice | undefined): ThemeChoice {
  return choice ?? (systemPrefersDark() ? "dark" : "light");
}

/**
 * The colour of the browser's own furniture — the address bar on a phone.
 *
 * The light theme keeps the brand orange it has always had. The dark theme
 * cannot: an orange bar above a near-black page reads as a page that failed to
 * load its header, so it takes the page colour instead.
 */
function paintBrowserChrome(theme: ThemeChoice): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#131211" : "#fc5200");
}

/** Puts a resolved theme on the page. */
export function applyTheme(choice: ThemeChoice | undefined): void {
  if (typeof document === "undefined") return;
  const theme = resolveTheme(choice);
  document.documentElement.dataset.theme = theme;
  paintBrowserChrome(theme);
}

/**
 * Follows the operating system for as long as nobody has overridden it.
 *
 * `read` is called rather than captured, so the listener always sees the
 * current choice: a reader who picks dark, then light, then clears it back to
 * "match my system" is followed again without anything being torn down.
 */
export function watchSystemTheme(read: () => ThemeChoice | undefined): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(THEME_QUERY);
  const onChange = () => {
    if (read() === undefined) applyTheme(undefined);
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
