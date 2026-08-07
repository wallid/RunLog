import { describe, expect, it } from "vitest";
import { readArchive } from "./archive";

/**
 * The archive reader, against zips built the way the exporters build them.
 *
 * Apple stores its routes uncompressed inside the export; Strava deflates a
 * file that is itself gzipped. Both shapes are constructed here rather than
 * checked in as fixtures, so the test says what it is exercising.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;

interface ZipFile {
  path: string;
  data: Bytes;
  deflate?: boolean;
}

/** Pinned to a plain buffer: a Blob will not take the SharedArrayBuffer case. */
type Bytes = Uint8Array<ArrayBuffer>;

async function makeZip(files: ZipFile[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const parts: Bytes[] = [];
  const directory: Bytes[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.path) as Bytes;
    const stored = file.deflate ? await deflate(file.data) : file.data;
    const method = file.deflate ? 8 : 0;

    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, LOCAL_HEADER, true);
    header.setUint16(8, method, true);
    header.setUint32(18, stored.length, true);
    header.setUint32(22, file.data.length, true);
    header.setUint16(26, name.length, true);

    const entry = new Uint8Array(header.buffer);
    parts.push(entry, name, stored);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, CENTRAL_HEADER, true);
    central.setUint16(10, method, true);
    central.setUint32(20, stored.length, true);
    central.setUint32(24, file.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    directory.push(new Uint8Array(central.buffer), name);

    offset += entry.length + name.length + stored.length;
  }

  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_OF_DIRECTORY, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, directorySize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...directory, new Uint8Array(end.buffer)]);
}

async function deflate(data: Bytes): Promise<Bytes> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzip(data: Bytes): Promise<Bytes> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const bytes = (text: string): Bytes => new TextEncoder().encode(text) as Bytes;
const textOf = (blob: Blob) => blob.text();

describe("readArchive", () => {
  it("returns null for a file that is not an archive", async () => {
    const gpx = new Blob(["<?xml version='1.0'?><gpx></gpx>"]);
    expect(await readArchive(gpx, "run.gpx")).toBeNull();
  });

  it("reads an Apple Health export, ignoring everything that is not a route", async () => {
    const zip = await makeZip([
      { path: "apple_health_export/export.xml", data: bytes("<HealthData/>") },
      {
        path: "apple_health_export/workout-routes/route_2026-03-16_7.42am.gpx",
        data: bytes("<gpx>march</gpx>"),
      },
      {
        path: "apple_health_export/workout-routes/route_2026-08-01_6.15pm.gpx",
        data: bytes("<gpx>august</gpx>"),
      },
    ]);

    const entries = await readArchive(zip, "export.zip");
    expect(entries).not.toBeNull();
    expect(entries!.map((entry) => entry.name)).toEqual([
      "route_2026-08-01_6.15pm.gpx",
      "route_2026-03-16_7.42am.gpx",
    ]);
    // Most recent first, so the run someone just did is at the top.
    expect(await textOf(await entries![0].read())).toBe("<gpx>august</gpx>");
  });

  it("undoes the deflate a zip applies", async () => {
    const zip = await makeZip([
      { path: "activities/1.gpx", data: bytes("<gpx>deflated</gpx>"), deflate: true },
    ]);
    const entries = await readArchive(zip, "export.zip");
    expect(await textOf(await entries![0].read())).toBe("<gpx>deflated</gpx>");
  });

  it("undoes the second layer on a Strava export, whose activities are gzipped", async () => {
    const zip = await makeZip([
      { path: "activities/8123456789.gpx.gz", data: await gzip(bytes("<gpx>strava</gpx>")) },
    ]);
    const entries = await readArchive(zip, "export.zip");
    expect(entries!.map((entry) => entry.name)).toEqual(["8123456789.gpx.gz"]);
    expect(await textOf(await entries![0].read())).toBe("<gpx>strava</gpx>");
  });

  it("skips the shadow files Finder writes into archives", async () => {
    const zip = await makeZip([
      { path: "__MACOSX/._run.gpx", data: bytes("junk") },
      { path: "routes/.hidden.gpx", data: bytes("junk") },
      { path: "routes/run.gpx", data: bytes("<gpx>real</gpx>") },
    ]);
    const entries = await readArchive(zip, "export.zip");
    expect(entries!.map((entry) => entry.name)).toEqual(["run.gpx"]);
  });

  it("reports an archive with no activities as empty rather than failing", async () => {
    const zip = await makeZip([{ path: "export.xml", data: bytes("<HealthData/>") }]);
    expect(await readArchive(zip, "export.zip")).toEqual([]);
  });

  it("treats a bare gzip as an archive of one, named without the suffix", async () => {
    const file = new Blob([await gzip(bytes("<gpx>single</gpx>"))]);
    const entries = await readArchive(file, "Lunch_Run.gpx.gz");
    expect(entries!.map((entry) => entry.name)).toEqual(["Lunch_Run.gpx"]);
    expect(await textOf(await entries![0].read())).toBe("<gpx>single</gpx>");
  });
});
