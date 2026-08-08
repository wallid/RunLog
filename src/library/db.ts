/**
 * The runs a reader has kept, stored in this browser.
 *
 * What a runner arrives with is rarely one file — it is a Strava or Apple Health
 * export holding years of running. Reading one run out of it and forgetting the
 * rest means unpacking the same archive again on every visit, so runs are kept
 * here instead.
 *
 * What is stored is the original file, exactly as it came off the watch, and the
 * few fields needed to draw a list. Nothing derived: the model built from a run
 * is a sample per second and would dwarf the file it came from, and re-parsing
 * on open is fast enough that keeping it would be paying storage for nothing.
 *
 * Metadata and files live in separate stores because IndexedDB materialises a
 * whole record to read any of it. One store would mean pulling every stored FIT
 * file into memory to draw a list of names, which is the thing the lazy archive
 * reader in upload/archive exists to avoid.
 *
 * This is the first thing the page keeps between visits that came out of a
 * runner's own data, so every call here has a counterpart that removes it —
 * see deleteRun and clearRuns, both reachable from the interface.
 */

const DB_NAME = "runlog";
const DB_VERSION = 1;
const RUNS = "runs";
const FILES = "files";

/** The fields a run is listed by. Enough to draw a row without a parse. */
export interface RunSummary {
  /** SHA-256 of the stored bytes; see library/import. */
  id: string;
  /** What to call it: the recorded name, or the day lifted out of the file name. */
  name: string;
  fileName: string;
  source: "fit" | "gpx";
  /** Epoch milliseconds. A Date does not survive a structured clone unchanged
   *  in a way worth relying on across schema versions. */
  startedAt: number;
  distanceM: number;
  elapsedS: number;
  addedAt: number;
}

/** Whether this browser offers storage at all. Private windows may not. */
export function libraryAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

let opening: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!libraryAvailable()) {
    return Promise.reject(new Error("This browser has no storage for a run library."));
  }
  if (opening) return opening;

  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      // Switched on the old version rather than checking for each store, so a
      // future version reads as a list of migrations in order rather than a set
      // of conditions that have to be reasoned about together.
      if (event.oldVersion < 1) {
        db.createObjectStore(RUNS, { keyPath: "id" });
        db.createObjectStore(FILES);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // A second tab upgrading the schema would otherwise leave this handle
      // pointing at a version that no longer exists.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error ?? new Error("The run library could not be opened."));
    request.onblocked = () => reject(new Error("The run library is open in another tab."));
  });

  // A failed open must not be cached, or a transient refusal would disable the
  // library for the rest of the visit.
  opening.catch(() => {
    opening = null;
  });

  return opening;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The run library could not be read."));
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The run library could not be written to."));
    tx.onabort = () => reject(tx.error ?? new Error("Saving the run was cancelled."));
  });
}

/** Every stored run, most recent first. Metadata only — no file is read. */
export async function listRuns(): Promise<RunSummary[]> {
  const db = await openDb();
  const tx = db.transaction(RUNS, "readonly");
  const all = await request(tx.objectStore(RUNS).getAll() as IDBRequest<RunSummary[]>);
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

/** Whether this run is already kept, without reading its file back. */
export async function hasRun(id: string): Promise<boolean> {
  const db = await openDb();
  const tx = db.transaction(RUNS, "readonly");
  const count = await request(tx.objectStore(RUNS).count(id));
  return count > 0;
}

/** Keeps a run. Both stores in one transaction, so neither can be left orphaned. */
export async function putRun(summary: RunSummary, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([RUNS, FILES], "readwrite");
  tx.objectStore(RUNS).put(summary);
  tx.objectStore(FILES).put(blob, summary.id);
  await done(tx);
}

/** The original file, or null if it has gone. */
export async function getRunBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  const tx = db.transaction(FILES, "readonly");
  const blob = await request(tx.objectStore(FILES).get(id) as IDBRequest<Blob | undefined>);
  return blob ?? null;
}

export async function deleteRun(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([RUNS, FILES], "readwrite");
  tx.objectStore(RUNS).delete(id);
  tx.objectStore(FILES).delete(id);
  await done(tx);
}

/** Forgets everything. The reader asked for this; it leaves nothing behind. */
export async function clearRuns(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([RUNS, FILES], "readwrite");
  tx.objectStore(RUNS).clear();
  tx.objectStore(FILES).clear();
  await done(tx);
}

/** Drops the cached handle. Tests open a fresh database between cases. */
export function closeLibrary(): void {
  if (!opening) return;
  const pending = opening;
  opening = null;
  void pending.then((db) => db.close()).catch(() => {});
}
