#!/usr/bin/env node
/**
 * Regenerate the screenshots the README uses.
 *
 * A README that only describes an interactive page asks the reader to imagine
 * it. These are captured from the real build against the demo run, so they
 * cannot drift into showing a version of the page that no longer exists: run
 * the script after a change and the pictures either still match or the diff
 * makes it obvious they do not.
 *
 * Usage:  npm run screenshots
 *
 * The script builds, serves `dist/` on its own port, and drives Chromium
 * through the same route a first-time visitor takes — open the demo, wait for
 * the run to render, then photograph named sections by their anchor. Anchors
 * are widget ids from `src/widgets/registry.ts`; a renamed widget makes this
 * fail loudly rather than silently capturing the wrong card.
 */

import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4183;
const ORIGIN = `http://localhost:${PORT}`;
const OUT = "docs/screenshots";

/**
 * Two device pixels per CSS pixel. GitHub serves the README at roughly half
 * the width these are captured at, so a 1x capture would be resampled down to
 * something soft; 2x lands on the pixel grid.
 */
const SCALE = 2;
const VIEWPORT = { width: 1280, height: 860 };

/**
 * What to photograph. `anchor` is the element id — a widget id, or the id a
 * section header carries. `full` captures the whole page rather than the one
 * element, which is what the landing page wants.
 */
const SHOTS = [
  { name: "landing", full: true },
  { name: "overview", anchor: "run-summary" },
  { name: "timeline", anchor: "interactive-timeline" },
  { name: "map", anchor: "route-map" },
  // A stable card, chosen over a beta one because it is the structure every
  // widget shares — figures, figure, observation, explanation — in one frame.
  { name: "card", anchor: "pace-consistency" },
  { name: "splits", anchor: "splits" },
  { name: "teaching", anchor: "learning-summary" },
];

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const server = await serve();
  const browser = await chromium.launch();

  try {
    const page = await (
      await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: SCALE,
        // The page reads the clock to greet a first visit; pinning the locale
        // keeps dates and decimal separators identical between machines.
        locale: "en-GB",
        timezoneId: "Europe/London",
      })
    ).newPage();

    // The first-run walkthrough dims the page and would sit over every shot.
    // Claiming to have seen a far-future version suppresses it without
    // reaching into the store's internals.
    await page.addInitScript(() => {
      localStorage.setItem("runlog.tour", JSON.stringify({ seenVersion: 9999 }));
    });

    await page.goto(ORIGIN, { waitUntil: "networkidle" });
    await settle(page);
    await shoot(page, SHOTS[0]);

    await page.getByRole("button", { name: /see a demo run/i }).click();
    await page.waitForSelector("#run-story", { timeout: 30_000 });
    await settle(page);

    for (const shot of SHOTS.slice(1)) await shoot(page, shot);
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${SHOTS.length} screenshots written to ${OUT}/`);
}

/**
 * Photograph one target.
 *
 * Element shots are scrolled into view first: the cards animate in on reveal,
 * and an element captured while still below the fold photographs mid-fade.
 */
async function shoot(page, { name, anchor, full }) {
  const file = `${OUT}/${name}.png`;

  if (full) {
    await page.screenshot({ path: file, fullPage: false });
  } else {
    const target = page.locator(`#${anchor}`);
    if ((await target.count()) === 0) {
      throw new Error(
        `No element with id "${anchor}" — a widget id changed, so ${name}.png ` +
          `would have been captured from the wrong card. Fix SHOTS in this file.`,
      );
    }
    await target.scrollIntoViewIfNeeded();
    await settle(page);
    await target.screenshot({ path: file });
  }

  console.log(`  ✓ ${name}`);
}

/**
 * Wait for the page to stop moving.
 *
 * Cards fade and slide in on reveal, the map fills in tile by tile, and the
 * SVG figures draw themselves. None of that is observable through a single
 * promise, so this waits for fonts, then for the browser to go two frames
 * without work, then a fixed beat for the CSS transitions.
 */
async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState("networkidle").catch(() => {});
  await sleep(900);
}

/** Serve the built site, resolving once it answers. */
async function serve() {
  const server = spawn(
    "npx",
    ["vite", "preview", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore" },
  );

  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(ORIGIN);
      if (response.ok) return server;
    } catch {
      // Not up yet.
    }
    await sleep(250);
  }

  server.kill();
  throw new Error(`Preview server never answered on ${ORIGIN}`);
}

await main();
