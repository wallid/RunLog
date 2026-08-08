// @vitest-environment happy-dom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clearRuns, getRunBlob, listRuns } from "@/library/db";
// The stored bytes are checked in library/db.test.ts rather than here: this
// file needs a DOM to parse GPX, and under happy-dom a Blob does not survive
// the structured clone that IndexedDB stores it with.
import type { ImportItem } from "@/library/import";
import { useLibraryStore } from "./libraryStore";

/**
 * Importing a collection.
 *
 * The behaviour worth pinning down is what happens to the runs *around* a
 * problem: an export of several years' running will contain something this
 * parser cannot read, and the reader's other three hundred runs must not be
 * lost to it. Same for a re-import, which is the ordinary way to add the four
 * runs recorded since last time.
 */

const FIXTURES = resolve(__dirname, "../../fixtures");
const FIT = readFileSync(resolve(FIXTURES, "Lunch_Run.fit"));
const GPX = readFileSync(resolve(FIXTURES, "Lunch_Run.gpx"));

function item(name: string, bytes: Uint8Array | string): ImportItem {
  return { name, read: async () => new Blob([bytes as BlobPart]) };
}

const fit = (name = "Lunch_Run.fit") => item(name, FIT);
const gpx = (name = "Lunch_Run.gpx") => item(name, GPX);
const junk = (name = "notes.txt") => item(name, "this was never an activity");

const store = () => useLibraryStore.getState();

describe("the run library", () => {
  beforeEach(async () => {
    await clearRuns();
    useLibraryStore.setState({
      status: "ready",
      entries: [],
      importing: null,
      saveNotice: null,
      lastOpenedId: null,
    });
  });

  it("keeps every run in a drop", async () => {
    await store().importAll([fit(), gpx()]);

    expect(store().entries).toHaveLength(2);
    expect(store().importing).toBeNull();
  });

  /**
   * Said on the way out whatever happened. Once the progress line goes, an
   * import that kept four hundred runs looks exactly like one that never ran,
   * and a reader who cannot tell will press the button again.
   */
  it("says what it did, not only what went wrong", async () => {
    await store().importAll([fit(), gpx()]);
    expect(store().saveNotice).toBe("2 runs kept.");

    await store().importAll([fit(), gpx()]);
    expect(store().saveNotice).toBe("Nothing new to keep · 2 runs already here.");
  });

  it("recognises a re-import instead of keeping a second copy", async () => {
    await store().importAll([fit(), gpx()]);
    await store().importAll([fit(), gpx()]);

    // The same export dropped twice is one library, not two.
    expect(store().entries).toHaveLength(2);
  });

  it("keeps the runs around a file it cannot read", async () => {
    await store().importAll([fit(), junk(), gpx()]);

    expect(store().entries).toHaveLength(2);
    // The count is reported, because in an export of hundreds it is the only
    // part of the failure a reader can do anything about.
    expect(store().saveNotice).toContain("1 could not be read");
  });

  it("describes a kept run well enough to list it without reparsing", async () => {
    await store().importAll([fit()]);

    const [entry] = store().entries;
    expect(entry.source).toBe("fit");
    expect(entry.distanceM).toBeGreaterThan(1000);
    expect(entry.elapsedS).toBeGreaterThan(60);
    expect(entry.startedAt).toBeGreaterThan(0);
  });

  it("stops when the reader asks it to, keeping what it already read", async () => {
    const seen: string[] = [];
    const watched = (name: string, bytes: Uint8Array): ImportItem => ({
      name,
      read: async () => {
        seen.push(name);
        // Stopping is a decision made partway through a long import, so it is
        // pressed after some runs have already been read, not before any have.
        if (seen.length === 1) store().cancelImport();
        return new Blob([bytes as BlobPart]);
      },
    });

    await store().importAll([
      watched("a.fit", FIT),
      watched("b.gpx", GPX),
      watched("c.fit", FIT),
    ]);

    expect(seen).toEqual(["a.fit"]);
    expect(store().entries).toHaveLength(1);
    expect(store().importing).toBeNull();
    expect(store().saveNotice).toBe("1 run kept · stopped with 2 left.");
  });

  it("removes one run without disturbing the rest", async () => {
    await store().importAll([fit(), gpx()]);
    const doomed = store().entries[0];

    await store().remove(doomed.id);

    expect(store().entries).toHaveLength(1);
    expect(store().entries[0].id).not.toBe(doomed.id);
    expect(await getRunBlob(doomed.id)).toBeNull();
  });

  it("leaves nothing behind when the reader clears it out", async () => {
    await store().importAll([fit(), gpx()]);
    store().markOpened(store().entries[0].id);

    await store().clearAll();

    expect(store().entries).toEqual([]);
    expect(store().lastOpenedId).toBeNull();
    expect(await listRuns()).toEqual([]);
  });

  it("forgets a removed run was the last one opened", async () => {
    await store().importAll([fit()]);
    const [entry] = store().entries;
    store().markOpened(entry.id);

    await store().remove(entry.id);

    expect(store().lastOpenedId).toBeNull();
  });

  it("does nothing at all where there is nowhere to keep runs", async () => {
    useLibraryStore.setState({ status: "unavailable" });

    await store().importAll([fit()]);

    // A browser that refuses storage still reads runs; it simply has no library,
    // and nothing here may turn that into an error the reader has to deal with.
    expect(store().entries).toEqual([]);
    expect(store().importing).toBeNull();
    expect(store().saveNotice).toBeNull();
  });
});
