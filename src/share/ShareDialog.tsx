import { useEffect, useRef, useState } from "react";
import type { DerivedActivity } from "@/model/activity";
import { useShareStore, linkUrl, type SharedLink } from "@/state/shareStore";
import { TRIM_METRES, type RouteChoice } from "./document";
import { cardFileName, drawShareCard } from "./card";
import { formatDate } from "@/lib/format";
import styles from "./ShareDialog.module.css";

/**
 * Where a runner decides to publish.
 *
 * Every other disclosure this app makes is small and bounded — a rounded
 * coordinate to a weather grid, the visible text to a translator. This one is
 * the whole run, and the dialog is written on the assumption that the reader
 * has been told four times already that nothing is uploaded. So it says what
 * changes, in the first sentence, before offering the button.
 *
 * The three things it will not do:
 *
 * - **It does not pre-tick anything the runner did not choose.** The route
 *   choice is a decision, and it is made every time rather than remembered,
 *   because "what I was willing to share last March" is not consent for today's
 *   run past today's front door.
 * - **It does not overclaim the encryption.** The run is sealed with a key the
 *   server never sees, and that is worth saying — but a link is a bearer token,
 *   and anybody it reaches can read the run. Saying only the first half would
 *   leave a reader feeling protected against the risk that actually applies.
 * - **It does not hide the withdraw button behind a settings page.** It sits
 *   under the link, from the moment the link exists.
 */
export function ShareDialog({
  activity,
  onClose,
}: {
  activity: DerivedActivity;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const status = useShareStore((state) => state.status);
  const error = useShareStore((state) => state.error);
  const current = useShareStore((state) => state.current);
  const createShare = useShareStore((state) => state.createShare);
  const reset = useShareStore((state) => state.reset);
  const existing = useShareStore((state) => state.links).filter(
    (link) => link.runId === activity.id && link.id !== current?.id,
  );

  const eventCount = activity.annotations?.length ?? 0;
  const hasWeather = activity.weather !== undefined;
  const hasRoute = activity.availableMetrics.has("position");

  const [route, setRoute] = useState<RouteChoice>("full");
  const [events, setEvents] = useState(true);
  const [weather, setWeather] = useState(true);

  // `showModal` rather than the `open` attribute: it is the only one that
  // traps focus, makes the rest of the page inert and wires up Escape — all
  // things this dialog would otherwise have to reimplement badly.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  }, []);

  // Leaving the dialog puts the store back to its opening state, so reopening
  // it does not present a link made from choices the reader has forgotten.
  const close = () => {
    reset();
    onClose();
  };

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={close}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 className={styles.title}>Share this run</h2>
          <button
            type="button"
            className={styles.close}
            onClick={close}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        {current ? (
          <LinkPanel link={current} onDone={close} />
        ) : (
          <>
            <p className={styles.preamble}>
              This is the one thing in Run Log that puts your data on a server.
              Everything else happens in this browser; sharing cannot. The run is
              encrypted here first, and the key to it lives in the link rather
              than on the server — so we cannot read what you share, but{" "}
              <strong>anyone who gets the link can</strong>. Treat it as
              publishing to whoever it reaches.
            </p>

            {hasRoute && (
              <fieldset className={styles.group}>
                <legend className={styles.legend}>The map</legend>
                <p className={styles.groupHelp}>
                  A GPS trace says where you were. If this run starts and ends at
                  home, the full route says where you live.
                </p>
                <RouteOption
                  value="full"
                  checked={route === "full"}
                  onChange={setRoute}
                  label="Share the whole route"
                  help="The map as recorded, door to door."
                />
                <RouteOption
                  value="trimmed"
                  checked={route === "trimmed"}
                  onChange={setRoute}
                  label={`Hide the first and last ${TRIM_METRES} m`}
                  help="The map starts down the road and ends there too. Pace, heart rate and everything else are untouched — only the position is withheld at the ends."
                />
                <RouteOption
                  value="none"
                  checked={route === "none"}
                  onChange={setRoute}
                  label="No map at all"
                  help="The charts, the splits and the figures go; where they happened does not."
                />
              </fieldset>
            )}

            <fieldset className={styles.group}>
              <legend className={styles.legend}>What else goes with it</legend>

              <Toggle
                checked={events && eventCount > 0}
                disabled={eventCount === 0}
                onChange={setEvents}
                label={
                  eventCount === 0
                    ? "You have not added any events to this run"
                    : `Your ${eventCount === 1 ? "event" : `${eventCount} events`} — gels, cramps, readings`
                }
                help={
                  eventCount === 0
                    ? "Events you add on the timeline would travel with a share."
                    : "Including the notes you typed on them."
                }
              />

              <Toggle
                checked={weather && hasWeather}
                disabled={!hasWeather}
                onChange={setWeather}
                label="The weather you looked up"
                help={
                  hasWeather
                    ? "The conditions, and the rounded coordinate they were fetched for."
                    : "You have not looked up the weather for this run."
                }
              />
            </fieldset>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={status === "working"}
                onClick={() => {
                  void createShare({
                    route: hasRoute ? route : "none",
                    events: events && eventCount > 0,
                    weather: weather && hasWeather,
                  });
                }}
              >
                {status === "working" ? "Encrypting and uploading…" : "Create a link"}
              </button>
            </div>
          </>
        )}

        <SaveImage activity={activity} />

        {existing.length > 0 && <PreviousLinks links={existing} />}
      </div>
    </dialog>
  );
}

/**
 * The other kind of sharing, and the one that costs nothing.
 *
 * A picture of the run posts to places a link does not go, and it never leaves
 * this browser on the way — it is drawn on a canvas here and saved to the
 * reader's own disk. It is offered alongside the link rather than behind it,
 * because for a good number of people it is the whole of what they wanted, and
 * they should not have to publish a run to a server to find that out.
 *
 * There is no map on it and no coordinate in it. See `card.ts`.
 */
function SaveImage({ activity }: { activity: DerivedActivity }) {
  const [drawing, setDrawing] = useState(false);
  const [failed, setFailed] = useState(false);

  const save = () => {
    setDrawing(true);
    setFailed(false);
    drawShareCard(activity)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = cardFileName(activity);
        anchor.click();
        // Revoked on the next turn: Safari has not finished with the URL by
        // the time `click` returns.
        setTimeout(() => URL.revokeObjectURL(url), 0);
      })
      .catch(() => setFailed(true))
      .finally(() => setDrawing(false));
  };

  return (
    <section className={styles.image}>
      <h3 className={styles.imageTitle}>Or save a picture of it</h3>
      <p className={styles.imageHelp}>
        The figures and one chart, drawn as an image for posting somewhere a link
        will not go. Your events are marked along it. Nothing is uploaded — this
        one is drawn here and saved straight to your device, and it carries no
        map and no coordinates whatever you chose above.
      </p>
      <button
        type="button"
        className={styles.secondary}
        disabled={drawing}
        onClick={save}
      >
        {drawing ? "Drawing…" : "Save image"}
      </button>
      {failed && (
        <p className={styles.error} role="alert">
          The image could not be drawn in this browser.
        </p>
      )}
    </section>
  );
}

function RouteOption({
  value,
  checked,
  onChange,
  label,
  help,
}: {
  value: RouteChoice;
  checked: boolean;
  onChange: (value: RouteChoice) => void;
  label: string;
  help: string;
}) {
  return (
    <label className={styles.option}>
      <input
        type="radio"
        name="share-route"
        className={styles.radio}
        checked={checked}
        onChange={() => onChange(value)}
      />
      <span>
        <span className={styles.optionLabel}>{label}</span>
        <span className={styles.optionHelp}>{help}</span>
      </span>
    </label>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <label className={styles.option} data-disabled={disabled}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <span className={styles.optionLabel}>{label}</span>
        <span className={styles.optionHelp}>{help}</span>
      </span>
    </label>
  );
}

/** The finished link, with the two things to do about it. */
function LinkPanel({ link, onDone }: { link: SharedLink; onDone: () => void }) {
  const revoke = useShareStore((state) => state.revoke);
  const [copied, setCopied] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = linkUrl(link);

  const copy = () => {
    void navigator.clipboard
      .writeText(url)
      .then(() => setCopied(true))
      // A refused clipboard is not worth an error: the field beside the button
      // holds the whole link and is selectable.
      .catch(() => setCopied(false));
  };

  return (
    <div className={styles.result}>
      <p className={styles.resultLead}>
        The link is ready. It works for anyone who has it, and for as long as you
        leave it up.
      </p>

      <div className={styles.linkRow}>
        <input
          className={styles.linkField}
          readOnly
          value={url}
          onFocus={(event) => event.currentTarget.select()}
          aria-label="The share link"
        />
        <button type="button" className={styles.primary} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className={styles.resultNote}>
        The part after the <code>#</code> is the key that unlocks the run, and it
        never reaches our server. Send the whole link — half of it opens nothing.
      </p>

      <div className={styles.withdrawRow}>
        <button
          type="button"
          className={styles.withdraw}
          disabled={withdrawing}
          onClick={() => {
            setWithdrawing(true);
            setFailed(false);
            void revoke(link.id).then((done) => {
              setWithdrawing(false);
              if (done) onDone();
              else setFailed(true);
            });
          }}
        >
          {withdrawing ? "Withdrawing…" : "Withdraw this link"}
        </button>
        <p className={styles.withdrawHelp}>
          Deletes the run from the server. Anyone opening the link afterwards is
          told it was withdrawn. This only works from this browser — the proof
          that the share is yours is kept here and nowhere else, so clearing this
          site's storage gives up the ability to take it down.
        </p>
      </div>

      {failed && (
        <p className={styles.error} role="alert">
          The link could not be withdrawn just now. It is still up; try again in
          a moment.
        </p>
      )}
    </div>
  );
}

/** Links already made from this same run, so none is quietly forgotten. */
function PreviousLinks({ links }: { links: SharedLink[] }) {
  const revoke = useShareStore((state) => state.revoke);

  return (
    <section className={styles.previous}>
      <h3 className={styles.previousTitle}>
        Links you have already made from this run
      </h3>
      <ul className={styles.previousList}>
        {links.map((link) => (
          <li key={link.id} className={styles.previousItem}>
            <span className={styles.previousMeta}>
              {formatDate(new Date(link.createdAt))} ·{" "}
              {link.route === "full"
                ? "whole route"
                : link.route === "trimmed"
                  ? "route trimmed"
                  : "no map"}
            </span>
            <button
              type="button"
              className={styles.previousWithdraw}
              onClick={() => void revoke(link.id)}
            >
              Withdraw
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
