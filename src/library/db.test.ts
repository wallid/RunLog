import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRuns,
  deleteRun,
  getRunBlob,
  hasRun,
  libraryAvailable,
  listRuns,
  putRun,
  type RunSummary,
} from "./db";

/**
 * The store the library is kept in.
 *
 * The point worth testing is the split between metadata and files: a list has
 * to be drawable without touching a single stored run, because the alternative
 * is reading a Health export's worth of activity files into memory to show
 * their names.
 */

function summary(id: string, startedAt: number, name = id): RunSummary {
  return {
    id,
    name,
    fileName: `${name}.fit`,
    source: "fit",
    startedAt,
    distanceM: 10_000,
    elapsedS: 3_000,
    addedAt: 1_700_000_000_000,
  };
}

const march = Date.UTC(2026, 2, 16);
const august = Date.UTC(2026, 7, 1);

describe("the run library store", () => {
  beforeEach(async () => {
    await clearRuns();
  });

  it("is available where the browser offers storage", () => {
    expect(libraryAvailable()).toBe(true);
  });

  /**
   * The whole design rests on this: what is kept is the file itself, so opening
   * a run later means re-parsing the original rather than trusting anything
   * derived that was written alongside it.
   */
  it("keeps a run and gives the file back byte for byte", async () => {
    const original = new Uint8Array([0x0e, 0x10, 0x2b, 0x00, 0xff, 0x00, 0x7f]);
    await putRun(summary("a", march), new Blob([original]));

    expect(await hasRun("a")).toBe(true);
    const stored = await getRunBlob("a");
    expect(new Uint8Array(await stored!.arrayBuffer())).toEqual(original);
  });

  it("lists most recent first", async () => {
    await putRun(summary("older", march), new Blob(["one"]));
    await putRun(summary("newer", august), new Blob(["two"]));

    expect((await listRuns()).map((run) => run.id)).toEqual(["newer", "older"]);
  });

  it("lists without reading any stored file", async () => {
    await putRun(summary("a", march), new Blob(["bytes nobody asked for"]));

    // The list carries the fields a row needs and nothing that would have to be
    // decompressed, parsed or held in memory to produce it.
    const [entry] = await listRuns();
    expect(Object.keys(entry).sort()).toEqual(
      ["addedAt", "distanceM", "elapsedS", "fileName", "id", "name", "source", "startedAt"],
    );
  });

  it("reports a run it does not hold rather than failing", async () => {
    expect(await hasRun("never-stored")).toBe(false);
    expect(await getRunBlob("never-stored")).toBeNull();
  });

  it("takes a re-put of the same run as a replacement, not a second copy", async () => {
    await putRun(summary("a", march, "first name"), new Blob(["one"]));
    await putRun(summary("a", march, "second name"), new Blob(["two"]));

    const runs = await listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].name).toBe("second name");
    expect(await (await getRunBlob("a"))!.text()).toBe("two");
  });

  it("removes the file along with the entry, leaving nothing orphaned", async () => {
    await putRun(summary("a", march), new Blob(["one"]));
    await putRun(summary("b", august), new Blob(["two"]));

    await deleteRun("a");

    expect(await listRuns()).toHaveLength(1);
    expect(await getRunBlob("a")).toBeNull();
    expect(await getRunBlob("b")).not.toBeNull();
  });

  it("empties both stores when the reader asks for everything to go", async () => {
    await putRun(summary("a", march), new Blob(["one"]));
    await putRun(summary("b", august), new Blob(["two"]));

    await clearRuns();

    expect(await listRuns()).toEqual([]);
    expect(await getRunBlob("a")).toBeNull();
    expect(await getRunBlob("b")).toBeNull();
  });
});
