import { useEffect, useRef } from "react";
import { useActivityStore } from "@/state/activityStore";
import { SourceGuide } from "./SourceGuide";
import { ArchivePicker } from "./ArchivePicker";
import { useWindowDrop } from "./useWindowDrop";
import styles from "./DropZone.module.css";

/**
 * The way in.
 *
 * One screen, no scroll: what the page is for on the left, the way to start on
 * the right. The three points are the reasons to hand over a file at all, so
 * they are claims about what the reader gets rather than a description of the
 * software.
 *
 * Handing the file over is deliberately hard to get wrong — a drop anywhere on
 * the window counts, so does a paste, so does clicking the card — because the
 * step before it is already the awkward one, and the guide underneath is there
 * for exactly that reason.
 *
 * The file is read locally and never uploaded anywhere, which is worth saying
 * plainly on the screen where a runner hands over their data — it is the third
 * point for that reason. The only thing that ever leaves is a crash report,
 * which carries none of it: see observability/scrub for what is stripped, and
 * Settings for the switch.
 */

const VALUE_POINTS = [
  {
    title: "Moments, not averages",
    body: "The surges, the fade, the hill that cost you — found in the data and placed on the route.",
  },
  {
    title: "Every claim shows its work",
    body: "Each card separates what your watch measured from what was inferred, and says how confident it is.",
  },
  {
    title: "Nothing is uploaded",
    body: "No account, no server. Your file is read in this browser and never leaves this machine.",
  },
];

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);

  const status = useActivityStore((state) => state.status);
  const error = useActivityStore((state) => state.error);
  const choices = useActivityStore((state) => state.choices);
  const loadFile = useActivityStore((state) => state.loadFile);
  const loadDemo = useActivityStore((state) => state.loadDemo);

  const busy = status === "loading";
  const choosing = status === "choosing" && choices !== null;

  const handleFiles = (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (file && !busy) void loadFile(file);
  };

  const dragging = useWindowDrop(handleFiles);
  usePastedFile(handleFiles);

  return (
    <div className={styles.screen} data-dragging={dragging}>
      <header className={styles.bar}>
        <span className={styles.wordmark}>
          <span className={styles.mark} aria-hidden="true" />
          Run Log
        </span>
        <span className={styles.barNote}>Open source · runs in your browser</span>
      </header>

      <main className={styles.hero}>
        <div className={styles.pitch}>
          <h1 className={styles.title}>Your run, explained.</h1>
          <p className={styles.lede}>
            Drop in a file from your watch and read what actually happened — what
            changed, where, and what might account for it.
          </p>

          <ul className={styles.points}>
            {VALUE_POINTS.map((point) => (
              <li key={point.title} className={styles.point}>
                <h2 className={styles.pointTitle}>{point.title}</h2>
                <p className={styles.pointBody}>{point.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.start}>
          <input
            ref={inputRef}
            type="file"
            accept=".fit,.gpx,.gz,.zip,application/gpx+xml,application/zip"
            className={styles.input}
            onChange={(event) => handleFiles(event.target.files)}
            disabled={busy}
          />

          {choosing ? (
            <ArchivePicker onPickAnother={() => inputRef.current?.click()} />
          ) : (
            <>
              {/* The card is the target as well as the label for it, so a click
                  anywhere on it opens the picker. */}
              <button
                type="button"
                className={styles.dropzone}
                onClick={() => inputRef.current?.click()}
                disabled={busy}
              >
                <span className={styles.dropTitle}>
                  {busy ? "Reading your run…" : "Drop your file anywhere"}
                </span>
                <span className={styles.primary}>Choose a file</span>
                <span className={styles.dropHint}>
                  FIT or GPX — or the whole export zip from Apple Health or Strava.
                  You can paste one too.
                </span>
              </button>

              <button
                type="button"
                className={styles.secondary}
                onClick={() => void loadDemo()}
                disabled={busy}
              >
                Or look at a demo run
              </button>
            </>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          {/* Someone already looking at a list of their own runs has solved the
              problem the guide exists for. */}
          {!choosing && <SourceGuide />}
        </div>
      </main>

      {dragging && (
        <div className={styles.overlay} aria-hidden="true">
          <p className={styles.overlayText}>Drop to read this run</p>
        </div>
      )}
    </div>
  );
}

/**
 * Accepts a file pasted onto the page.
 *
 * On a Mac the shortest route out of Finder is copy, and someone who has just
 * copied their export will try it. There is no cost to it working.
 */
function usePastedFile(onFiles: (files: FileList | null | undefined) => void) {
  const handler = useRef(onFiles);
  handler.current = onFiles;

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        event.preventDefault();
        handler.current(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
}

/** Kept for the tests and callers that render the screen directly. */
export default DropZone;
