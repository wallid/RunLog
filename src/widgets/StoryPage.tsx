import { Fragment } from "react";
import type { DerivedActivity } from "@/model/activity";
import type { WidgetGroup } from "./buildWidgets";
import { SECTION_DESCRIPTIONS, sectionAnchorId } from "./contract";
import { useInView } from "@/shell/useInView";
import { AdSlot } from "@/shell/AdSlot";
import { WidgetShell } from "./WidgetShell";
import styles from "./StoryPage.module.css";

/**
 * An ad slot follows every second section, and never the last one: often
 * enough to be worth selling, sparse enough that the page still reads as a
 * run's story with ads in it rather than the reverse. Which sections a run
 * produces varies by file, so the cadence is positional, not by section name.
 */
function adSlotAfter(groupIndex: number, groupCount: number): boolean {
  return groupIndex % 2 === 1 && groupIndex < groupCount - 1;
}

/**
 * The scrolling column the whole run is read in.
 *
 * The page is built from the same groups the contents rail is built from, so
 * the two cannot disagree about which sections exist. Each group is introduced
 * by a header saying what that run of cards is about, which is what turns a
 * twenty-card scroll into a document with parts.
 */
export function StoryPage({
  activity,
  groups,
}: {
  activity: DerivedActivity;
  groups: WidgetGroup[];
}) {
  return (
    <div className={styles.page}>
      {groups.map((group, groupIndex) => {
        const anchor = sectionAnchorId(group.section);
        // The first section and its first card are what the first-run tour is
        // explained on. Marking them here keeps the tour pointing at whichever
        // section a given file happened to support.
        const first = groupIndex === 0;
        return (
          <Fragment key={group.section}>
            <section
              className={styles.group}
              aria-labelledby={`${anchor}-title`}
            >
              <SectionHeader
                anchor={anchor}
                label={group.label}
                description={SECTION_DESCRIPTIONS[group.section]}
                tourAnchor={first}
              />

              <div className={styles.cards}>
                {group.widgets.map(
                  ({ widget, result, narration }, cardIndex) => (
                    <WidgetShell
                      key={widget.id}
                      id={widget.id}
                      title={widget.title}
                      description={widget.description}
                      status={widget.status}
                      narration={narration}
                      references={widget.references}
                      provenance={widget.provenance}
                      tourAnchor={first && cardIndex === 0}
                    >
                      <widget.View result={result} activity={activity} />
                    </WidgetShell>
                  ),
                )}
              </div>
            </section>

            {adSlotAfter(groupIndex, groups.length) && <AdSlot />}
          </Fragment>
        );
      })}

      {groups.length === 0 && (
        <p className={styles.empty}>
          This file did not contain enough data to build a run story.
        </p>
      )}
    </div>
  );
}

/**
 * The title that introduces a run of cards.
 *
 * It arrives the same way the cards below it do, so a new part of the page
 * announces itself as one movement rather than as a static heading with
 * animated things underneath.
 */
function SectionHeader({
  anchor,
  label,
  description,
  tourAnchor,
}: {
  anchor: string;
  label: string;
  description: string;
  tourAnchor: boolean;
}) {
  const [revealRef, revealed] = useInView<HTMLElement>();

  return (
    <header
      className={styles.sectionHeader}
      id={anchor}
      ref={revealRef}
      data-reveal={revealed ? "true" : "false"}
      data-tour={tourAnchor ? "section-header" : undefined}
    >
      <h2 id={`${anchor}-title`} className={styles.sectionTitle}>
        {label}
      </h2>
      <p className={styles.sectionDescription}>{description}</p>
    </header>
  );
}
