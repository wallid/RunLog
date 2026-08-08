import { useMemo } from "react";
import type { DerivedActivity } from "@/model/activity";
import { erase, type ErasedWidget } from "@/widgets/contract";
import { paceStoryWidget } from "@/widgets/paceStory";
import { heartRateTimelineWidget } from "@/widgets/heartRateTimeline";
import { paceZonesWidget } from "@/widgets/paceZones";
import { useDemoActivity } from "./useDemoActivity";
import styles from "./Benefits.module.css";

/**
 * What a run looks like once it is read, shown rather than claimed.
 *
 * The hero above makes three promises; this section is where two of them are
 * kept in front of the reader before they have handed over a file of their
 * own. Each card mounts the actual widget it names — the same compute
 * function, the same chart component, the same interaction — against the
 * bundled demo run, so this is a screenshot of the product rather than an
 * illustration of it. That is also why the set is short: only widgets that
 * fire on the demo file (no cadence, no meaningful terrain — see the source
 * guide) and that stand on their own without the rest of the page's
 * selection wiring belong here.
 */

interface Benefit {
  id: string;
  eyebrow: string;
  headline: string;
  body: string;
  widget: ErasedWidget;
}

const BENEFITS: Benefit[] = [
  {
    id: "pace",
    eyebrow: "Not just an average",
    headline: "Where the pace actually moved",
    body: "The fastest and slowest sustained minutes, and exactly where each one fell — rather than one number for the whole run.",
    widget: erase(paceStoryWidget),
  },
  {
    id: "heart",
    eyebrow: "Effort, not just speed",
    headline: "What it really cost you",
    body: "Heart rate drawn over the zones behind it, so a number on a chart reads as an effort you can place.",
    widget: erase(heartRateTimelineWidget),
  },
  {
    id: "consistency",
    eyebrow: "How even it was",
    headline: "How much of the run held your pace",
    body: "The share of the run spent near your own median pace for the day — a run's pacing is only meaningful against itself.",
    widget: erase(paceZonesWidget),
  },
];

export function Benefits() {
  const activity = useDemoActivity();

  return (
    <section className={styles.section} aria-labelledby="benefits-heading">
      <div className={styles.intro}>
        <h2 id="benefits-heading" className={styles.heading}>
          See it before you upload anything
        </h2>
        <p className={styles.subhead}>
          Every card below is live, drawn from a real run — the same one the demo
          button opens.
        </p>
      </div>

      <div className={styles.grid}>
        {BENEFITS.map((benefit) => (
          <BenefitCard key={benefit.id} benefit={benefit} activity={activity} />
        ))}
      </div>
    </section>
  );
}

function BenefitCard({
  benefit,
  activity,
}: {
  benefit: Benefit;
  activity: DerivedActivity | null;
}) {
  const result = useMemo(
    () => (activity ? benefit.widget.compute(activity) : null),
    [activity, benefit.widget],
  );

  return (
    <article className={styles.card}>
      <p className={styles.eyebrow}>{benefit.eyebrow}</p>
      <h3 className={styles.cardHeadline}>{benefit.headline}</h3>
      <p className={styles.cardBody}>{benefit.body}</p>

      <div className={styles.chart} aria-hidden={result === null}>
        {result !== null && result !== undefined && activity ? (
          <benefit.widget.View result={result as never} activity={activity} />
        ) : (
          <div className={styles.chartPlaceholder} />
        )}
      </div>
    </article>
  );
}
