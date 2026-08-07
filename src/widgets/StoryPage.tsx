import type { DerivedActivity } from "@/model/activity";
import type { WidgetGroup } from "./buildWidgets";
import { SECTION_DESCRIPTIONS, sectionAnchorId } from "./contract";
import { WidgetShell } from "./WidgetShell";
import styles from "./StoryPage.module.css";

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
          <section
            key={group.section}
            className={styles.group}
            aria-labelledby={`${anchor}-title`}
          >
            <header
              className={styles.sectionHeader}
              id={anchor}
              data-tour={first ? "section-header" : undefined}
            >
              <h2 id={`${anchor}-title`} className={styles.sectionTitle}>
                {group.label}
              </h2>
              <p className={styles.sectionDescription}>
                {SECTION_DESCRIPTIONS[group.section]}
              </p>
            </header>

            <div className={styles.cards}>
              {group.widgets.map(({ widget, result, narration }, cardIndex) => (
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
              ))}
            </div>
          </section>
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
