import { useId, type ReactElement } from "react";
import { useSettingsStore } from "@/state/settingsStore";
import type { ThemeChoice } from "@/styles/theme";
import styles from "./ThemeToggle.module.css";

/**
 * Light, dark, or whatever this machine says.
 *
 * Three states rather than two, because the two-state switch every site ships
 * quietly answers a question it was not asked: a reader whose laptop turns dark
 * at sunset wants the page to do the same, and a switch can only remember the
 * last thing they clicked. So "match my system" is a real option and it is the
 * one nobody has to choose — see the note in `settingsStore`.
 *
 * It is radio buttons under the paint. A segmented control is a radio group
 * with the labels drawn as pills, and building it out of the real element is
 * what gets arrow-key movement, the announcement of "2 of 3", and a form
 * control that works before any of this component's CSS has loaded.
 */

interface Choice {
  value: ThemeChoice | undefined;
  label: string;
  icon: ReactElement;
}

const SUN = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="3.1" fill="currentColor" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
      <line
        key={angle}
        x1="8"
        y1="1.6"
        x2="8"
        y2="3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        transform={`rotate(${angle} 8 8)`}
      />
    ))}
  </svg>
);

/* Half lit, half not: the page taking its cue from somewhere else. */
const AUTO = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="5.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
    <path d="M8 2.6a5.4 5.4 0 0 1 0 10.8Z" fill="currentColor" />
  </svg>
);

const MOON = (
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path
      d="M13.2 9.9A5.6 5.6 0 0 1 6.1 2.8a5.7 5.7 0 1 0 7.1 7.1Z"
      fill="currentColor"
    />
  </svg>
);

const CHOICES: Choice[] = [
  { value: "light", label: "Light", icon: SUN },
  { value: undefined, label: "Match my system", icon: AUTO },
  { value: "dark", label: "Dark", icon: MOON },
];

/** A stored choice is a string; "follow the system" has to be a string too, to
    be a radio value at all. Only the round trip uses this name. */
const SYSTEM = "system";

export function ThemeToggle({
  variant = "panel",
}: {
  /** `compact` drops to icons alone, for the landing page's top bar. */
  variant?: "panel" | "compact";
}) {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  // Both surfaces can be mounted in the same document across a navigation, and
  // two radio groups sharing a name would fight over which one is checked.
  const name = useId();

  return (
    <div
      className={styles.group}
      data-variant={variant}
      role="radiogroup"
      aria-label="Appearance"
    >
      {CHOICES.map((choice) => (
        <label
          key={choice.value ?? SYSTEM}
          className={styles.choice}
          title={choice.label}
        >
          <input
            type="radio"
            className={styles.input}
            name={name}
            value={choice.value ?? SYSTEM}
            checked={theme === choice.value}
            onChange={() => setTheme(choice.value)}
          />
          <span className={styles.face}>
            <span className={styles.icon} aria-hidden="true">
              {choice.icon}
            </span>
            {/* Kept in the accessibility tree in both variants — the compact one
                hides it from sight, not from a screen reader, because three
                unlabelled glyphs are three unlabelled glyphs. */}
            <span className={variant === "compact" ? styles.hiddenLabel : styles.label}>
              {choice.label}
            </span>
          </span>
        </label>
      ))}
    </div>
  );
}
