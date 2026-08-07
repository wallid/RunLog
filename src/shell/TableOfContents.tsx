import { useMemo } from "react";
import type { WidgetGroup } from "@/widgets/buildWidgets";
import { sectionAnchorId } from "@/widgets/contract";
import { useActiveSection } from "./useActiveSection";
import styles from "./TableOfContents.module.css";

/**
 * The contents rail.
 *
 * A twenty-section page is only readable if you can skip to the part you care
 * about, so this lists exactly what rendered — never a link to a section the
 * data did not support — and marks where the reader currently is.
 *
 * Entries are real anchors rather than scroll handlers, so they work with
 * middle-click, keyboard and the browser's own back button.
 */
export function TableOfContents({
  groups,
  onNavigate,
  variant = "rail",
}: {
  groups: WidgetGroup[];
  /** Lets the compact version close itself once a link is followed. */
  onNavigate?: () => void;
  variant?: "rail" | "panel";
}) {
  const ids = useMemo(
    () => groups.flatMap((group) => group.widgets.map((item) => item.widget.id)),
    [groups],
  );
  const activeId = useActiveSection(ids);

  if (groups.length === 0) return null;

  return (
    <nav
      className={variant === "rail" ? styles.rail : styles.panel}
      aria-label="Sections of this run"
      // The tour points at the rail. The compact panel is behind a button and
      // is not on the page to be pointed at, so it carries no mark.
      data-tour={variant === "rail" ? "contents" : undefined}
    >
      <p className={styles.heading}>Contents</p>

      <ol className={styles.groups}>
        {groups.map((group, index) => (
          <li key={`${group.section}-${index}`} className={styles.group}>
            {/* The label points at the section's own header on the page, so a
                reader can land on what the section is about before its first
                card rather than in the middle of one. */}
            <a
              href={`#${sectionAnchorId(group.section)}`}
              className={styles.groupLabel}
              onClick={onNavigate}
            >
              {group.label}
            </a>
            <ol className={styles.items}>
              {group.widgets.map((item) => {
                const active = item.widget.id === activeId;
                return (
                  <li key={item.widget.id}>
                    <a
                      href={`#${item.widget.id}`}
                      className={`${styles.link} ${active ? styles.active : ""}`}
                      aria-current={active ? "true" : undefined}
                      onClick={onNavigate}
                    >
                      {item.widget.title}
                    </a>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>

      <p className={styles.count}>
        {ids.length} sections built from this file
      </p>
    </nav>
  );
}
