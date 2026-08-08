/**
 * Turning a file into something the library can list.
 *
 * Two jobs: deciding what a run *is*, and describing it cheaply enough that
 * adding four hundred of them is bearable.
 *
 * Identity is the hash of the stored bytes. The obvious alternative — the start
 * time and the format, which is what the derived model keys on — cannot tell a
 * re-import from a new run, and re-importing the same export is the single most
 * likely thing a reader will do. Decompression is deterministic, so the same
 * activity pulled twice out of the same zip hashes the same both times and the
 * second import is recognised and skipped.
 *
 * The description is built from the raw parse alone, never from the derived
 * model: buildActivity resamples the whole run to a sample per second, and
 * paying that to learn a distance and a date would make importing an export
 * cost hundreds of times what it needs to.
 */

import type { RawActivity } from "@/parsers/types";
import { haversineMetres } from "@/lib/geo";
import type { RunSummary } from "./db";
import { labelFor } from "./label";

/**
 * Something that can become a library entry.
 *
 * A File satisfies it once wrapped, and an ArchiveEntry already does — which is
 * what lets a drop of loose files and a zip full of runs share one import path.
 */
export interface ImportItem {
  name: string;
  read: () => Promise<Blob>;
}

/** Wraps a dropped file as an import item. */
export function itemForFile(file: File): ImportItem {
  return { name: file.name, read: async () => file };
}

/** SHA-256 of the bytes, hex. The identity of a run in the library. */
export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** What the list needs, taken from the raw parse. */
export function summarizeRaw(raw: RawActivity, fileName: string, id: string): RunSummary {
  return {
    id,
    name: raw.name ?? labelFor(fileName),
    fileName,
    source: raw.source,
    startedAt: raw.startedAt.getTime(),
    distanceM: distanceOf(raw),
    elapsedS: elapsedOf(raw),
    addedAt: Date.now(),
  };
}

/**
 * How far the run went.
 *
 * The device's own total is preferred where there is one, then the cumulative
 * figure it recorded per sample. A GPX from a phone has neither, so the track
 * is walked — which is the expensive path, but it is arithmetic over points
 * already in memory rather than a second pass over the file.
 */
function distanceOf(raw: RawActivity): number {
  const reported = raw.session?.totalDistanceM;
  if (reported !== undefined && Number.isFinite(reported)) return reported;

  for (let i = raw.samples.length - 1; i >= 0; i--) {
    const cumulative = raw.samples[i].distanceM;
    if (cumulative !== undefined && Number.isFinite(cumulative)) return cumulative;
  }

  let total = 0;
  let previous: { lat: number; lon: number } | undefined;
  for (const sample of raw.samples) {
    if (sample.lat === undefined || sample.lon === undefined) continue;
    const point = { lat: sample.lat, lon: sample.lon };
    if (previous) total += haversineMetres(previous, point);
    previous = point;
  }
  return total;
}

/** How long it took, wall clock. */
function elapsedOf(raw: RawActivity): number {
  const reported = raw.session?.totalElapsedS;
  if (reported !== undefined && Number.isFinite(reported)) return reported;

  const first = raw.samples[0];
  const last = raw.samples[raw.samples.length - 1];
  if (!first || !last) return 0;
  return Math.max(0, (last.time.getTime() - first.time.getTime()) / 1000);
}
