/**
 * The repository, and how many people have starred it.
 *
 * Kept beside `contact.ts` and `support.ts` for the same reason they are: the
 * destination is a fact about the project rather than about a component.
 *
 * **The count is read when the site is built, not when it is visited.** Asking
 * api.github.com from the page would put a request to a third party on every
 * visit, which is exactly the objection `support.ts` raises to Buy Me a
 * Coffee's embedded button — it would see every visitor, and the section above
 * the footer promises that nothing leaves the machine unless you ask for it. A
 * number baked into the bundle costs the reader nothing and goes stale only
 * between deploys, which for a figure that moves a star at a time is no cost at
 * all. If the build cannot reach GitHub the number is simply absent; the link
 * stands without it.
 *
 * **The number is hidden until there are enough of them to be worth showing.**
 * A star count is on the page as evidence that other people found this useful,
 * and at nought or three it is evidence of the opposite — the badge llama.app
 * carries works because it reads 123.5K. So the link is always there and the
 * count joins it at `STARS_SHOWN_FROM`. Lower that constant to 0 to show the
 * figure whatever it says.
 */

export const REPO_URL = "https://github.com/wallid/RunLog";

/**
 * Replaced at build time by `define` in `vite.config.ts`, which resolves it to
 * `null` in dev and under test so that neither has to reach the network.
 */
declare const __GITHUB_STARS__: number | null;

export const STARS: number | null =
  typeof __GITHUB_STARS__ === "number" ? __GITHUB_STARS__ : null;

/** Below this the link is shown on its own. See the note above. */
export const STARS_SHOWN_FROM = 10;

/**
 * Whether there is a figure, and whether it is one worth printing.
 *
 * A type guard rather than a boolean so the caller that passes the check can
 * hand the same value to `formatStars` without a second null check.
 */
export function starsWorthShowing(count: number | null): count is number {
  return count !== null && count >= STARS_SHOWN_FROM;
}

/**
 * The count as a badge prints it: whole below a thousand, then thousands to one
 * decimal place, with a trailing `.0` dropped rather than shown.
 *
 * A badge is read at a glance and sits in a header that has no room to grow, so
 * past a thousand the exact figure is worth less than the width it costs.
 */
export function formatStars(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${trimZero(count / 1_000)}K`;
  return `${trimZero(count / 1_000_000)}M`;
}

function trimZero(value: number): string {
  // `toFixed` rounds, which is what a badge wants: 1,999 reads as 2K.
  return value.toFixed(1).replace(/\.0$/, "");
}
