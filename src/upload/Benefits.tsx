import { useMemo } from "react";
import type { DerivedActivity } from "@/model/activity";
import { erase, type ErasedWidget } from "@/widgets/contract";
import { routeFlythroughWidget } from "@/widgets/routeFlythrough";
import { zoneBubblesWidget } from "@/widgets/zoneBubbles";
import { paceStoryWidget } from "@/widgets/paceStory";
import { heartRateTimelineWidget } from "@/widgets/heartRateTimeline";
import { paceConsistencyWidget } from "@/widgets/paceConsistency";
import { useInView } from "@/shell/useInView";
import { useDemoActivity } from "./useDemoActivity";
import styles from "./Benefits.module.css";

/**
 * What a run looks like once it is read, shown rather than claimed.
 *
 * The hero above makes one promise; these sections are where it is kept in
 * front of the reader before they have handed over a file of their own. Each
 * one mounts the actual widget it names — the same compute function, the same
 * chart component, the same interaction — against the bundled demo run, so
 * this is a screenshot of the product rather than an illustration of it. That
 * is also why the set is short: only widgets that fire on the demo file (no
 * cadence, no meaningful terrain — see the source guide) and that stand on
 * their own without the rest of the page's selection wiring belong here.
 *
 * Sections rather than cards in a row. Side by side each chart got a third of
 * the column and had to be read at a glance to be read at all; down the page
 * each gets half the measure with its claim beside it, which is what the
 * surrounding layout does with every other point it makes. The flythrough is
 * the exception and takes the whole measure: it is an instrument, not a chart.
 *
 * The set leads with the least ordinary thing here, because a reader deciding
 * whether to hand over a file is asking what this does that their watch's own
 * app does not — and "a map you can play" answers that before any wording
 * does. What follows is deliberately plainer: the zones, the heart rate, the
 * pace. A page whose every example is a showpiece is a page that has not shown
 * you the ordinary run you actually came to read.
 *
 * **The flythrough draws OpenStreetMap tiles, which is a request to a third
 * party**, and this is the front door rather than a run someone opened. So it
 * is the one card mounted on arrival rather than with the page.
 *
 * Be clear about what that buys, because it is less than it looks: the section
 * currently sits about 710 px down, which is inside the first screen at every
 * viewport measured, so tiles do load on an ordinary visit. The gate is kept
 * because it is correct if the section ever moves below the fold, not because
 * it makes the front page tile-free today. `docs/PRIVACY.md` says the same
 * thing rather than implying otherwise.
 */

export interface Benefit {
  id: string;
  eyebrow: string;
  headline: string;
  body: string;
  widget: ErasedWidget;
  /**
   * Takes the whole measure instead of sharing it with its copy. For the one
   * card here that is an instrument rather than a chart: a map and three
   * metric lines under it do not survive being given half a column.
   */
  wide?: boolean;
  /**
   * Held back until the reader scrolls to it, rather than mounted with the
   * page. Only the flythrough needs this and the reason is not performance —
   * see the note on map tiles above.
   */
  deferred?: boolean;
}

/** Exported so `benefits.test.tsx` can hold every card to the demo run. */
export const BENEFITS: Benefit[] = [
  {
    id: "flythrough",
    eyebrow: "The whole run, in one instrument",
    headline: "Follow the run as it happened",
    body: "Press play and the marker walks the route while heart rate, pace and elevation keep pace beneath it. The ground already covered stays lit, so a climb in the corner of the map and the heart rate that answered it are one picture rather than two.",
    widget: erase(routeFlythroughWidget),
    wide: true,
    deferred: true,
  },
  {
    id: "zones",
    eyebrow: "Where the effort went",
    headline: "How long you spent in each gear",
    body: "Five heart-rate zones, sized by the time the run actually spent in them. It is the difference between an average that nobody ran and the two efforts that average came from.",
    widget: erase(zoneBubblesWidget),
  },
  {
    id: "heart",
    eyebrow: "Effort, not just speed",
    headline: "What it really cost you",
    body: "Heart rate drawn over the zones behind it, so a number on a chart reads as an effort you can place.",
    widget: erase(heartRateTimelineWidget),
  },
  {
    id: "pace",
    eyebrow: "Not just an average",
    headline: "Where the pace actually moved",
    body: "The fastest and slowest sustained minutes, and exactly where each one fell — rather than one number for the whole run.",
    widget: erase(paceStoryWidget),
  },
  {
    id: "consistency",
    eyebrow: "How even it was",
    headline: "Every ten seconds you ran, in one plot",
    body: "A dot for each ten seconds, against your own median pace for the day. Even running is a band; a run that surged and recovered is a cloud — and which one you did is visible before a single figure is read.",
    widget: erase(paceConsistencyWidget),
  },
];

export function Benefits() {
  const activity = useDemoActivity();

  return (
    <div id="what-you-get" className={styles.group}>
      <p className={styles.note}>
        Every chart below is live, drawn from a real run — the same one the demo
        link opens.
      </p>

      {BENEFITS.map((benefit) => (
        <BenefitSection key={benefit.id} benefit={benefit} activity={activity} />
      ))}
    </div>
  );
}

function BenefitSection({
  benefit,
  activity,
}: {
  benefit: Benefit;
  activity: DerivedActivity | null;
}) {
  // Latches on arrival and never unlatches, so a section that has been reached
  // once stays mounted while the reader scrolls past it and back.
  const [seenRef, seen] = useInView<HTMLElement>();
  const withheld = benefit.deferred === true && !seen;

  const result = useMemo(
    () => (activity && !withheld ? benefit.widget.compute(activity) : null),
    [activity, benefit.widget, withheld],
  );

  return (
    <section
      ref={seenRef}
      className={`${styles.feature} ${benefit.wide === true ? styles.featureWide : ""}`}
    >
      <div className={styles.featureText}>
        <p className={styles.eyebrow}>{benefit.eyebrow}</p>
        <h2 className={styles.headline}>{benefit.headline}</h2>
        <p className={styles.body}>{benefit.body}</p>
      </div>

      {/* The chart is real product output, so it gets the widget's own styles
          rather than a frame this page invents for it — the panel around it is
          the same one every other section on this page puts its evidence in,
          and nothing inside it is ours. */}
      <div className={styles.chart} aria-hidden={result === null}>
        {result !== null && result !== undefined && activity ? (
          <benefit.widget.View result={result as never} activity={activity} />
        ) : (
          <div className={styles.chartPlaceholder} />
        )}
      </div>
    </section>
  );
}
