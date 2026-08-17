import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

/**
 * The star count is fetched here, once per production build, and baked into the
 * bundle as `__GITHUB_STARS__`. See `src/repo.ts` for why it is not fetched
 * from the page instead.
 *
 * Only on `vite build`: dev servers restart constantly and the test run must
 * not depend on the network, so both get `null` and render the link without a
 * figure. A build that cannot reach GitHub gets `null` too — the number is a
 * nicety and no build should fail for it.
 */
async function countStars(): Promise<number | null> {
  try {
    const response = await fetch("https://api.github.com/repos/wallid/RunLog", {
      headers: {
        accept: "application/vnd.github+json",
        // Unauthenticated and rate-limited by IP; a build makes one call.
        "user-agent": "runlog-build",
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { stargazers_count?: unknown };
    return typeof body.stargazers_count === "number"
      ? body.stargazers_count
      : null;
  } catch {
    return null;
  }
}

export default defineConfig(async ({ command }) => ({
  plugins: [react()],
  /**
   * Absolute, not relative.
   *
   * This was `"./"`, which is the right answer for a site served entirely from
   * its root: the bundle resolves wherever it is put, including from a `file://`
   * path. Share links ended that. A page served at `/s/7Qk2xN4v` would resolve
   * `./assets/index.js` against `/s/`, ask for `/s/assets/index.js`, and get
   * nothing — every shared run would be a blank page.
   */
  base: "/",
  define: {
    __GITHUB_STARS__: JSON.stringify(
      command === "build" ? await countStars() : null,
    ),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
