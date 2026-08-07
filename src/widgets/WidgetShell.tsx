import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type {
  Explanation,
  Narration,
  Provenance,
  Reference,
  WidgetStatus,
} from "./contract";
import { confidenceLabel, PROVENANCE_LABELS } from "./contract";
import { StatRow } from "@/viz/primitives";
import { FeedbackControl } from "./FeedbackControl";
import styles from "./WidgetShell.module.css";

/**
 * The card every widget appears in.
 *
 * The front carries what happened: the numbers, the picture, the observation
 * and any explanation. What the metric *means* lives on the back, behind an
 * information button, because a reader who already knows what cadence is should
 * not have to scroll past the definition on all twenty cards.
 *
 * The order on the front never changes, which is what teaches someone how to
 * read the page.
 */
export function WidgetShell({
  id,
  title,
  description,
  status,
  narration,
  references = [],
  provenance,
  tourAnchor = false,
  children,
}: {
  id: string;
  title: string;
  description: string;
  status: WidgetStatus;
  narration: Narration;
  references?: Reference[];
  provenance?: Provenance;
  /**
   * Marks this card as the one the first-run tour reads from. Exactly one card
   * on the page carries it, so the tour's selectors can name a part of a card
   * without naming a widget.
   */
  tourAnchor?: boolean;
  children: ReactNode;
}) {
  const [flipped, setFlipped] = useState(false);
  const { frontRef, backRef, height } = useFaceHeight(flipped);

  return (
    <section
      className={styles.scene}
      id={id}
      aria-labelledby={`${id}-title`}
      data-tour={tourAnchor ? "card" : undefined}
    >
      <div
        className={styles.flipper}
        data-flipped={flipped}
        style={height ? { height } : undefined}
      >
        <div
          className={`${styles.face} ${styles.front}`}
          ref={frontRef}
          aria-hidden={flipped}
          inert={flipped}
        >
          <header className={styles.header}>
            <div className={styles.titleRow}>
              {/* Below the section header the card title sits at, so the page
                  outline reads as sections containing cards. */}
              <h3 id={`${id}-title`} className={styles.title}>
                {title}
              </h3>
              {status === "beta" && (
                <span className={styles.betaBadge} title="Still being worked on">
                  Beta
                </span>
              )}
              {provenance && (
                <span
                  className={`${styles.provenanceBadge} ${styles[`provenance_${provenance}`]}`}
                  title={PROVENANCE_LABELS[provenance].text}
                >
                  {PROVENANCE_LABELS[provenance].badge}
                </span>
              )}
            </div>
            <button
              type="button"
              className={styles.infoButton}
              onClick={() => setFlipped(true)}
              aria-label={`About ${title}`}
              title={`About ${title}`}
              data-tour-part="info"
            >
              <InfoIcon />
            </button>
          </header>

          {narration.information.length > 0 && (
            <div className={styles.information} data-tour-part="information">
              <StatRow stats={narration.information} />
            </div>
          )}

          <div className={styles.visualisation}>{children}</div>

          {narration.observations.length > 0 && (
            <div className={styles.observations} data-tour-part="observations">
              {narration.observations.map((observation, index) => (
                <p key={index} className={styles.observation}>
                  <span className={styles.observedTag}>Observed</span>
                  {observation.text}
                </p>
              ))}
            </div>
          )}

          {narration.explanations.length > 0 && (
            <div className={styles.explanations} data-tour-part="explanations">
              {narration.explanations.map((explanation, index) => (
                <ExplanationRow key={index} explanation={explanation} />
              ))}
            </div>
          )}
        </div>

        <div
          className={`${styles.face} ${styles.back}`}
          ref={backRef}
          aria-hidden={!flipped}
          inert={!flipped}
        >
          <header className={styles.header}>
            <p className={styles.backLabel}>About this section</p>
            <button
              type="button"
              className={styles.infoButton}
              onClick={() => setFlipped(false)}
              aria-label={`Back to ${title}`}
              title="Back"
            >
              <CloseIcon />
            </button>
          </header>

          <h3 className={styles.backTitle}>{title}</h3>
          {description && <p className={styles.backDescription}>{description}</p>}

          <div className={styles.teachingPoints}>
            {narration.teaching.map((point) => (
              <div key={point.title} className={styles.teachingPoint}>
                <h4 className={styles.teachingTitle}>{point.title}</h4>
                <p className={styles.teachingText}>{point.text}</p>
              </div>
            ))}
          </div>

          {provenance && (
            <div className={styles.provenanceNote}>
              <h4 className={styles.teachingTitle}>
                {PROVENANCE_LABELS[provenance].badge}
              </h4>
              <p className={styles.teachingText}>{PROVENANCE_LABELS[provenance].text}</p>
            </div>
          )}

          {references.length > 0 && (
            <div className={styles.references}>
              <h4 className={styles.referencesTitle}>Where the idea comes from</h4>
              <ul className={styles.referenceList}>
                {references.map((reference) => (
                  <li key={reference.url} className={styles.reference}>
                    <a
                      className={styles.referenceLink}
                      href={reference.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {reference.label}
                    </a>
                    <span className={styles.referenceDetail}>{reference.detail}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.referenceNote}>
                These describe the research the method borrows from. None of them
                tested it on a single run from a wrist-worn device, which is what
                this card does with it.
              </p>
            </div>
          )}

          {status === "beta" && (
            <p className={styles.betaNote}>
              This section is experimental. Its thresholds are still being worked out,
              so treat what it says with more caution than the rest of the page.
            </p>
          )}

          <FeedbackControl widgetId={id} widgetTitle={title} />

          <button
            type="button"
            className={styles.backToCard}
            onClick={() => setFlipped(false)}
          >
            Back to the data
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Keeps the card exactly as tall as whichever face is showing.
 *
 * Both faces are taken out of flow so they can occupy the same space, which
 * means the card would otherwise collapse. Measuring each one and animating
 * between the two heights lets the card grow or shrink as it turns instead of
 * clipping the longer side.
 */
function useFaceHeight(flipped: boolean) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState({ front: 0, back: 0 });

  useLayoutEffect(() => {
    const watch = (element: HTMLDivElement | null, key: "front" | "back") => {
      if (!element) return () => {};
      const observer = new ResizeObserver(([entry]) => {
        const measured =
          entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        setHeights((previous) =>
          Math.abs(previous[key] - measured) < 0.5
            ? previous
            : { ...previous, [key]: measured },
        );
      });
      observer.observe(element);
      return () => observer.disconnect();
    };

    const stopFront = watch(frontRef.current, "front");
    const stopBack = watch(backRef.current, "back");
    return () => {
      stopFront();
      stopBack();
    };
  }, []);

  const active = flipped ? heights.back : heights.front;
  return { frontRef, backRef, height: active > 0 ? active : undefined };
}

function ExplanationRow({ explanation }: { explanation: Explanation }) {
  return (
    <p className={styles.explanation}>
      <span className={`${styles.confidenceTag} ${styles[explanation.confidence]}`}>
        {confidenceLabel(explanation.confidence)}
      </span>
      {explanation.text}
    </p>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="6.25" r="1.05" fill="currentColor" />
      <path
        d="M10 9.25v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
