/**
 * Reading a run out of an export archive.
 *
 * What a runner actually has on disk is rarely a bare FIT file. Apple Health
 * hands back one zip containing every route it has ever recorded; Strava's bulk
 * export is a zip of individually gzipped activities. Asking someone to unpack
 * those by hand before they can look at a single run is most of the friction in
 * getting started, so the archive is read here instead.
 *
 * Entries are listed from the zip's central directory and only the one chosen
 * is ever decompressed, which is what keeps a four-hundred-run Health export
 * from being read into memory to show a list. Inflating is done by the
 * platform's own DecompressionStream, so none of this costs a dependency.
 */

export interface ArchiveEntry {
  /** Path inside the archive; unique, and what the choice is keyed on. */
  path: string;
  /** The leaf name, which is the part a reader recognises. */
  name: string;
  /** Uncompressed size in bytes, before any inner gzip is undone. */
  size: number;
  /** Decompresses this entry, undoing an inner `.gz` if there is one. */
  read: () => Promise<Blob>;
}

/** The activity files worth offering, including Strava's gzipped ones. */
const ACTIVITY_NAME = /\.(fit|gpx)(\.gz)?$/i;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_DIRECTORY = 0x06054b50;
const ZIP64_DIRECTORY = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;

const STORED = 0;
const DEFLATED = 8;

/**
 * Lists the activities inside an archive, or returns null if the file is not
 * one — in which case the caller should read it as an activity directly.
 *
 * A bare `.gz` is treated as an archive of exactly one entry, so a file pulled
 * out of a Strava export by hand still opens.
 */
export async function readArchive(file: Blob, fileName: string): Promise<ArchiveEntry[] | null> {
  const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (magic.length < 2) return null;

  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    const name = fileName.replace(/\.gz$/i, "");
    return [
      {
        path: name,
        name: leafOf(name),
        size: file.size,
        read: () => decompress(file, "gzip"),
      },
    ];
  }

  // "PK\3\4" — a zip always opens on a local file header.
  if (!(magic[0] === 0x50 && magic[1] === 0x4b && magic[2] === 0x03 && magic[3] === 0x04)) {
    return null;
  }

  const entries = await readZipDirectory(file);
  return entries
    .filter((entry) => isActivity(entry.path))
    // Apple names routes by date and Strava by ascending activity id, so
    // descending order puts the most recent run first under both schemes.
    .sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }));
}

function isActivity(path: string): boolean {
  if (path.endsWith("/")) return false;
  // Finder writes a shadow copy of every file into archives it makes.
  if (path.startsWith("__MACOSX/")) return false;
  if (leafOf(path).startsWith(".")) return false;
  return ACTIVITY_NAME.test(path);
}

function leafOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/**
 * Walks the zip's central directory.
 *
 * The directory lives at the end of the file, which is what makes listing an
 * archive cheap: two small reads rather than a pass over every entry.
 */
async function readZipDirectory(file: Blob): Promise<ArchiveEntry[]> {
  // The end record is 22 bytes plus a comment of up to 64KB.
  const tailLength = Math.min(file.size, 66_000);
  const tail = new DataView(await file.slice(file.size - tailLength).arrayBuffer());

  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === END_OF_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ArchiveError("That zip file could not be read.");

  let count = tail.getUint16(end + 10, true);
  let size = tail.getUint32(end + 12, true);
  let offset = tail.getUint32(end + 16, true);

  // The 32-bit fields saturate on large archives and the real figures move to a
  // zip64 record. A Health export of a few years' running reaches this.
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    const locator = end - 20;
    if (locator < 0 || tail.getUint32(locator, true) !== ZIP64_LOCATOR) {
      throw new ArchiveError("That zip file could not be read.");
    }
    const at = Number(tail.getBigUint64(locator + 8, true));
    const record = new DataView(await file.slice(at, at + 56).arrayBuffer());
    if (record.getUint32(0, true) !== ZIP64_DIRECTORY) {
      throw new ArchiveError("That zip file could not be read.");
    }
    count = Number(record.getBigUint64(32, true));
    size = Number(record.getBigUint64(40, true));
    offset = Number(record.getBigUint64(48, true));
  }

  const directory = new DataView(await file.slice(offset, offset + size).arrayBuffer());
  const decoder = new TextDecoder("utf-8");
  const entries: ArchiveEntry[] = [];

  let cursor = 0;
  for (let i = 0; i < count && cursor + 46 <= directory.byteLength; i++) {
    if (directory.getUint32(cursor, true) !== CENTRAL_HEADER) break;

    const method = directory.getUint16(cursor + 10, true);
    const nameLength = directory.getUint16(cursor + 28, true);
    const extraLength = directory.getUint16(cursor + 30, true);
    const commentLength = directory.getUint16(cursor + 32, true);

    let compressedSize = directory.getUint32(cursor + 20, true);
    let uncompressedSize = directory.getUint32(cursor + 24, true);
    let localOffset = directory.getUint32(cursor + 42, true);

    const path = decoder.decode(
      new Uint8Array(directory.buffer, directory.byteOffset + cursor + 46, nameLength),
    );

    // The same saturation, per entry: anything at the 32-bit ceiling has its
    // real value in the zip64 extra field, in a fixed order but only for the
    // fields that actually overflowed.
    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      let extra = cursor + 46 + nameLength;
      const extraEnd = extra + extraLength;
      while (extra + 4 <= extraEnd) {
        const id = directory.getUint16(extra, true);
        const length = directory.getUint16(extra + 2, true);
        if (id === 0x0001) {
          let field = extra + 4;
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(directory.getBigUint64(field, true));
            field += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(directory.getBigUint64(field, true));
            field += 8;
          }
          if (localOffset === 0xffffffff) {
            localOffset = Number(directory.getBigUint64(field, true));
          }
          break;
        }
        extra += 4 + length;
      }
    }

    cursor += 46 + nameLength + extraLength + commentLength;

    entries.push({
      path,
      name: leafOf(path),
      size: uncompressedSize,
      read: () => readZipEntry(file, { localOffset, compressedSize, method, path }),
    });
  }

  return entries;
}

/**
 * Pulls one entry's bytes out.
 *
 * The central directory does not say how long the local header is, so it has to
 * be read to find where the data starts.
 */
async function readZipEntry(
  file: Blob,
  entry: { localOffset: number; compressedSize: number; method: number; path: string },
): Promise<Blob> {
  const header = new DataView(
    await file.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer(),
  );
  if (header.getUint32(0, true) !== LOCAL_HEADER) {
    throw new ArchiveError(`${leafOf(entry.path)} could not be read out of the archive.`);
  }

  const start =
    entry.localOffset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  const raw = file.slice(start, start + entry.compressedSize);

  let data: Blob;
  if (entry.method === STORED) data = raw;
  else if (entry.method === DEFLATED) data = await decompress(raw, "deflate-raw");
  else {
    throw new ArchiveError(
      `${leafOf(entry.path)} uses a compression this browser cannot undo. Unzip it yourself and drop the file in.`,
    );
  }

  // Strava stores each activity gzipped inside the zip, so there is a second
  // layer to undo before it is a FIT or GPX file.
  return /\.gz$/i.test(entry.path) ? decompress(data, "gzip") : data;
}

async function decompress(blob: Blob, format: "gzip" | "deflate-raw"): Promise<Blob> {
  if (typeof DecompressionStream === "undefined") {
    throw new ArchiveError("This browser cannot unpack compressed exports.");
  }
  const stream = blob.stream().pipeThrough(new DecompressionStream(format));
  return new Response(stream).blob();
}

/** A failure to open the container, as opposed to a failure to read a run. */
export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveError";
  }
}
