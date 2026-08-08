// Deliberately not happy-dom: this file reads stored runs back out, and a
// happy-dom Blob does not survive the structured clone IndexedDB keeps it with.
// Nothing here needs a DOM — the FIT parser is pure — so it runs under node,
// where a Blob is the platform's own and round-trips as it does in a browser.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearRuns, deleteRun } from "@/library/db";
import { useActivityStore } from "./activityStore";
import { useLibraryStore } from "./libraryStore";
import { useSelectionStore } from "./selectionStore";

/**
 * Opening runs, and moving between them.
 *
 * The case worth pinning down is the failed switch. A reader partway through
 * one run who asks for another must not lose the one they had because the one
 * they asked for has gone — that turns a stale list entry into an empty page.
 */

const FIT = readFileSync(resolve(__dirname, "../../fixtures/Lunch_Run.fit"));

function fitFile(name = "Lunch_Run.fit"): File {
  return new File([FIT as BlobPart], name);
}

const activity = () => useActivityStore.getState();
const library = () => useLibraryStore.getState();

/**
 * Waits for the background save.
 *
 * Keeping a run is deliberately not awaited by the code that opens it — see the
 * note in `ingest` — so a test that wants to see the library settled has to
 * wait for it rather than assume a fixed number of ticks will do.
 */
async function until(condition: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise((done) => setTimeout(done, 5));
  }
  throw new Error(`Timed out waiting for ${what}.`);
}

const kept = (count: number) =>
  until(() => library().entries.length === count, `${count} kept ${count === 1 ? "run" : "runs"}`);

describe("reading a run", () => {
  beforeEach(async () => {
    await clearRuns();
    useLibraryStore.setState({
      status: "ready",
      entries: [],
      importing: null,
      saveNotice: null,
      lastOpenedId: null,
    });
    useActivityStore.getState().reset();
  });

  it("keeps a run that has just been opened", async () => {
    await activity().loadFile(fitFile());
    await kept(1);

    expect(activity().status).toBe("ready");
    // Reopening it later is the point of keeping it, so the row has to be
    // pointed at the run that was actually read.
    expect(library().lastOpenedId).toBe(library().entries[0].id);
  });

  it("reads a kept run back out of the library", async () => {
    await activity().loadFile(fitFile());
    await kept(1);
    const [entry] = library().entries;
    const opened = activity().activity;

    activity().reset();
    expect(activity().activity).toBeNull();

    await activity().openFromLibrary(entry.id);

    expect(activity().status).toBe("ready");
    expect(activity().activity?.id).toBe(opened?.id);
  });

  it("does not keep a second copy of a run opened twice", async () => {
    await activity().loadFile(fitFile());
    await kept(1);
    await activity().loadFile(fitFile("Lunch_Run copy.fit"));
    await kept(1);

    // The same bytes under a different name is the same run.
    expect(library().entries).toHaveLength(1);
  });

  it("leaves the run on screen when the one asked for has gone", async () => {
    await activity().loadFile(fitFile());
    await kept(1);
    const [entry] = library().entries;
    const reading = activity().activity;

    // The list is a snapshot; the run behind a row can be removed in another
    // tab between the list being drawn and a row being pressed.
    await deleteRun(entry.id);
    await activity().openFromLibrary(entry.id);

    expect(activity().status).toBe("ready");
    expect(activity().activity).toBe(reading);
    expect(activity().error).toContain("no longer stored");
  });

  it("clears the reader's place in the last run when another is opened", async () => {
    await activity().loadFile(fitFile());
    await kept(1);
    const [entry] = library().entries;

    useSelectionStore.getState().setCursor(120);
    await activity().openFromLibrary(entry.id);

    // Positions are elapsed seconds of whichever run is open, so carrying one
    // across a switch would point at a moment in a different run.
    expect(useSelectionStore.getState().cursorT).toBeNull();
  });

  it("does not keep the demo, which is not the reader's run", async () => {
    // Served rather than stubbed away, so the demo really is read and really
    // does reach the point where an uploaded run would be filed.
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(FIT as BlobPart);
    try {
      await activity().loadDemo();
      expect(activity().status).toBe("ready");

      // Long enough that a save would have landed if one had been started.
      await new Promise((done) => setTimeout(done, 50));
      expect(library().entries).toEqual([]);
      expect(library().lastOpenedId).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
