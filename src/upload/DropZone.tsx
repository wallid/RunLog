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
import { SUPPORT_URL } from "@/support";
import { REPO_URL, STARS, formatStars, starsWorthShowing } from "@/repo";
import styles from "./DropZone.module.css";

/**
 * The way in.
 *
 * A centred column that scrolls, in the shape llama.app uses: a thin rule of a
 * header, then a hero that is nothing but the claim and the one thing to do
 * about it, then alternating sections that each make one point and show it.
 *
 * The hero holds a single action. Everything that used to stand beside it —
 * the three value claims, the export guide — now sits below as its own
 * section, because the layout this follows spends its top screen on one
 * sentence and one control rather than on three columns of peers. The claims
 * lost nothing in the move: each is now a section wide enough to show the
 * thing it claims, which the old bulleted list could only assert.
 *
 * Handing the file over is deliberately hard to get wrong — a drop anywhere on
 * the window counts, so does a paste, so does clicking the box — because the
 * step before it is already the awkward one, and the source guide below is
 * there for exactly that reason. Anyone with no file at all takes the demo
 * link under the box, which is where this layout puts a second route.
 *
 * The file is read locally and never uploaded anywhere, which is worth saying
 * plainly on the screen where a runner hands over their data — it is the last
 * section for that reason. The only thing that ever leaves is a crash report,
 * which carries none of it: see observability/scrub for what is stripped, and
 * Settings for the switch.
 */

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
      {/* A rule of a header: the mark, two places to go, and what this is.
          Nothing on the left is the way in — that is the hero's job, and a
          second call to action there would only compete with it. The coffee
          link is on the trailing edge for the same reason: it is the one thing
          up here that leaves the page, so it sits as far from the drop box as
          the bar allows, next to the line it qualifies. */}
      <header className={styles.bar}>
        <nav className={styles.nav}>
          <span className={styles.wordmark}>
            <span className={styles.mark} aria-hidden="true" />
            Run Log
          </span>
          <span className={styles.navRule} aria-hidden="true" />
          <a className={styles.navLink} href="#what-you-get">
            What you get
          </a>
          <a className={styles.navLink} href="#sources">
            Your watch
          </a>
        </nav>
        <div className={styles.barEnd}>
          <span className={styles.barNote}>Open source · runs in your browser</span>

          {/* The line to the left claims this is open source; this is the
              claim's receipt, so it sits next to it. The count rides along only
              once there is enough of it to be worth reading — see repo.ts. */}
          <a
            className={styles.repoLink}
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span className={styles.repoLabel}>GitHub</span>
            {starsWorthShowing(STARS) && (
              <span className={styles.stars}>
                <StarIcon />
                {formatStars(STARS)}
              </span>
            )}
          </a>

          {/* The words go on a narrow screen and the cup stays, because the
              two in-page links beside it have nowhere else to be. The label is
              on the anchor rather than in the text, so what is announced does
              not change with the viewport. */}
          <a
            className={styles.barSupport}
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Buy me a coffee"
          >
            <span className={styles.barSupportText}>Buy me a coffee</span>
            <span aria-hidden="true">☕</span>
          </a>
        </div>
      </header>

      <main className={styles.page}>
        {/*
          One claim, one sentence under it, one control. The old hero put three
          columns on this screen and sized itself never to scroll; this one is
          the top of a page that is meant to be read downwards, so it is allowed
          to breathe and the rest is allowed to hang below it.
        */}
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h1 className={styles.title}>
              Your run, explained. Free, private &amp; entirely in your browser.
            </h1>
            <p className={styles.lede}>
              Drop in a file from your watch and read what actually happened —
              what changed, where, and what might account for it. No account, no
              upload, no limits.
            </p>
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
                {/* The box is the target as well as the label for it, so a
                    click anywhere on it opens the picker — which is why the
                    action on the right is a span rather than a second button
                    nested inside this one. */}
                <button
                  type="button"
                  className={styles.dropBox}
                  onClick={() => inputRef.current?.click()}
                  disabled={busy}
                >
                  <span className={styles.dropText}>
                    {busy
                      ? "Reading your run…"
                      : "Drop your .fit or .gpx file here"}
                  </span>
                  <span className={styles.dropAction}>Choose a file</span>
                </button>

                {/* The second and third routes in, at the weight this layout
                    gives an alternative: a line of small print with the verb
                    underlined. */}
                <p className={styles.alternatives}>
                  <span>
                    No file to hand?{" "}
                    <button
                      type="button"
                      className={styles.textLink}
                      onClick={() => void loadDemo()}
                      disabled={busy}
                    >
                      See a demo run
                    </button>
                  </span>
                  <span className={styles.altRule} aria-hidden="true" />
                  <span>
                    Cannot find your export?{" "}
                    <a className={styles.textLink} href="#sources">
                      Where to look
                    </a>
                  </span>
                </p>

                {/* Progress for a drop of several files, which has no picker to
                    report into. */}
                {importing && (
                  <p className={styles.error} role="status">
                    Reading run {importing.done} of {importing.total}…
                  </p>
                )}

                {/* A reader with runs already kept here is not on a first
                    visit. The list is the thing they came back for, so it sits
                    directly under the box rather than waiting below the fold. */}
                {hasLibrary && (
                  <div className={styles.library}>
                    <RunList
                      variant="landing"
                      onOpen={(id) => void openFromLibrary(id)}
                    />
                  </div>
                )}
              </>
            )}

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </div>
        </section>

        {/* Each claim the hero could have bulleted, given a section wide enough
            to show the thing it claims instead. */}
        <div className={styles.sections}>
          <Benefits />

          <section className={styles.feature} id="sources">
            <div className={styles.featureText}>
              <h2 className={styles.featureHeading}>
                Whatever you already run with.
              </h2>
              <p className={styles.featureBody}>
                Apple, Strava, Garmin, Coros — a FIT or GPX file from any of
                them, one at a time, several at once, or the whole export zip
                without unzipping it first. Getting the file out is the step
                that actually stops people, so the route for each is here rather
                than in a README.
              </p>
            </div>

            {/* The chips are this section's picture as well as its control —
                five marks that can be told apart at a glance, which is what the
                grid of logos would have been, except that pressing one answers
                the question instead of only illustrating it. */}
            <div className={styles.featureVisual}>
              <SourceGuide />
            </div>
          </section>

          <section className={styles.feature}>
            <div className={styles.featureText}>
              <h2 className={styles.featureHeading}>Nothing is uploaded.</h2>
              <p className={styles.featureBody}>
                No account, no server, no telemetry. Your files are read in this
                browser, kept in this browser, and never leave this machine —
                remove them whenever you like. The page works with the network
                off, and that is the honest test of the claim.
              </p>
            </div>

            {/* The panel this layout would fill with a code block, filled
                instead with the one list that matters here — and it is empty on
                purpose. */}
            <div className={styles.featureVisual}>
              <div className={styles.factPanel}>
                <p className={styles.factLabel}>Leaves this machine</p>
                <ul className={styles.factList}>
                  <li className={styles.factNone}>Nothing.</li>
                </ul>
                <p className={styles.factNote}>
                  Optional, and off unless you turn it on: a weather lookup for
                  the run (rounded coordinates only) and a crash report with
                  your data stripped out.
                </p>
              </div>
            </div>
          </section>
        </div>

        <SocialProof />

        {/* Below the proof strip, where the small print belongs: the page above
            makes claims about what a reader gets, so it ends by saying what it
            is not. */}
        <footer className={styles.landingFooter}>
          <p>{DISCLAIMER}</p>
          {/* The page above promises no account, no upload and no limits, and
              means it. This is the only place it asks for anything, and it
              asks after the promise rather than beside it. */}
          <p className={styles.landingSupport}>
            Free, and no plans to be anything else.{" "}
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer noopener">
              Buy me a coffee ☕
            </a>
          </p>
        </footer>
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
 * The star a GitHub badge counts, drawn rather than typed.
 *
 * The glyph ★ lands at a different weight and baseline in every font this page
 * might fall back to, and this one has to sit level with a number beside it.
 */
function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" className={styles.starIcon} aria-hidden="true">
      <path
        d="M8 1.7l1.9 4 4.4.6-3.2 3.1.8 4.4L8 11.7l-3.9 2.1.8-4.4L1.7 6.3l4.4-.6z"
        fill="currentColor"
      />
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
