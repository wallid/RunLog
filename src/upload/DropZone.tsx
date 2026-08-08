import { useEffect, useRef } from "react";
import { useActivityStore } from "@/state/activityStore";
import { useLibraryStore } from "@/state/libraryStore";
import { itemForFile } from "@/library/import";
import { RunList } from "@/library/RunList";
import { SourceGuide } from "./SourceGuide";
import { ArchivePicker } from "./ArchivePicker";
import { Benefits } from "./Benefits";
import { SocialProof } from "./SocialProof";
import { useWindowDrop } from "./useWindowDrop";
import { DISCLAIMER } from "@/disclaimer";
import styles from "./DropZone.module.css";

/**
 * The way in.
 *
 * One screen, no scroll, for the part that matters before anything is on
 * screen: what the page is for on the left, the two ways to start in the
 * middle, and where to find a file on the right. The three points are the
 * reasons to hand over a file at all, so they are claims about what the reader
 * gets rather than a description of the software. Below that fold the page
 * makes good on two of those claims with real charts (`Benefits`, drawn from
 * the same demo run the button opens), then closes with the proof strip — the
 * visit count and the testimonials. Both are allowed to exist below the fold
 * because they lengthen nothing above it and are needed by nobody who already
 * has a file in hand.
 *
 * Three columns because a reader arrives holding one of three things —
 * interest, a file, or a file they cannot lay hands on — and none of those is a
 * follow-on from another. The guide was under the drop card and made the column
 * long enough to push the screen past the fold, which is the one thing this
 * layout exists to avoid.
 *
 * Handing the file over is deliberately hard to get wrong — a drop anywhere on
 * the window counts, so does a paste, so does clicking the card — because the
 * step before it is already the awkward one, and the guide underneath is there
 * for exactly that reason. Anyone with no file at all is not stuck either: the
 * demo is its own card beside the drop target rather than a line of small
 * print under it, since on a first visit it is often the more useful of the
 * two.
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
    body: "No account, no server. Your files are read in this browser, kept in this browser, and never leave this machine — remove them whenever you like.",
  },
];

export function DropZone() {
  const inputRef = useRef<HTMLInputElement>(null);

  const status = useActivityStore((state) => state.status);
  const error = useActivityStore((state) => state.error);
  const choices = useActivityStore((state) => state.choices);
  const loadFile = useActivityStore((state) => state.loadFile);
  const loadDemo = useActivityStore((state) => state.loadDemo);
  const openFromLibrary = useActivityStore((state) => state.openFromLibrary);

  const libraryStatus = useLibraryStore((state) => state.status);
  const kept = useLibraryStore((state) => state.entries);
  const importing = useLibraryStore((state) => state.importing);
  const importAll = useLibraryStore((state) => state.importAll);

  const busy = status === "loading";
  const choosing = status === "choosing" && choices !== null;
  // Nothing kept, or nowhere to keep it, and this is the screen it always was.
  const hasLibrary = libraryStatus === "ready" && kept.length > 0;

  /**
   * One file is a run to read; several are a collection to keep.
   *
   * Opening the first of a dozen dropped files and discarding the rest is the
   * behaviour this replaces, and it was never what the drop meant.
   */
  const handleFiles = (files: FileList | null | undefined) => {
    if (!files || files.length === 0 || busy || importing) return;
    if (files.length === 1) {
      void loadFile(files[0]);
      return;
    }
    void importAll(Array.from(files).map(itemForFile));
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
            multiple
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
                  FIT or GPX — one, several at once, or the whole export zip from
                  Apple Health or Strava. You can paste one too.
                </span>
              </button>

              {/* Progress for a drop of several files, which has no picker to
                  report into. */}
              {importing && (
                <p className={styles.error} role="status">
                  Reading run {importing.done} of {importing.total}…
                </p>
              )}

              {/* A reader with runs already kept here is not on a first visit,
                  so the list takes the place the demo held: it is the thing
                  they came back for. */}
              {hasLibrary ? (
                <RunList variant="landing" onOpen={(id) => void openFromLibrary(id)} />
              ) : (
                /* The other way in, given the same weight as the card above it
                   because for most first visits it is the one that applies. */
                <button
                  type="button"
                  className={styles.demoCard}
                  onClick={() => void loadDemo()}
                  disabled={busy}
                >
                  <span className={styles.demoGlyph} aria-hidden="true">
                    <PlayIcon />
                  </span>
                  <span className={styles.demoText}>
                    <span className={styles.demoTitle}>See a demo run</span>
                    <span className={styles.demoHint}>No file needed</span>
                  </span>
                  <span className={styles.demoArrow} aria-hidden="true">
                    →
                  </span>
                </button>
              )}
            </>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Beside the upload rather than under it: the two are answers to
            different questions, and stacking them made a screen that is meant
            to fit into one that scrolls. Someone already looking at a list of
            their own runs has solved the problem the guide exists for, so it
            stands down while the picker is up — the column stays, because
            collapsing it would move the other two. */}
        <div className={styles.guideColumn}>{!choosing && <SourceGuide />}</div>
      </main>

      <Benefits />

      <SocialProof />

      {/* Below the proof strip, where the small print belongs: the screen
          above makes claims about what a reader gets, so the page ends by
          saying what it is not. */}
      <footer className={styles.landingFooter}>
        <p>{DISCLAIMER}</p>
      </footer>

      {dragging && (
        <div className={styles.overlay} aria-hidden="true">
          <p className={styles.overlayText}>Drop to read this run</p>
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path d="M7.5 5.2 15 10l-7.5 4.8Z" fill="currentColor" />
    </svg>
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
