import { useCallback, useEffect, useMemo, useRef } from "react";
import { hasSeenTour, useTourStore } from "@/state/tourStore";
import {
  isStepAvailable,
  resolveStep,
  stepTargets,
  TOUR_STEPS,
  type TourStep,
} from "./steps";
import {
  approach,
  approachBox,
  inflate,
  placeTooltip,
  unionRect,
  type Box,
  type Point,
} from "./placement";
import styles from "./Tour.module.css";

/**
 * The first-run tour.
 *
 * It opens once, on the first run someone loads, and it is built to be left:
 * Escape closes it, so does clicking anywhere off the panel, and Skip sits in
 * the panel on every step. Nothing is modal about the reading — the page
 * underneath keeps scrolling, and the spotlight follows whatever it is on.
 */
export function Tour() {
  const step = useTourStore((state) => state.step);
  const seenVersion = useTourStore((state) => state.seenVersion);
  const start = useTourStore((state) => state.start);

  // Only on a first visit, and only after the page has had a moment to settle:
  // a tour that opens over a half-laid-out page points at the wrong things.
  useEffect(() => {
    if (hasSeenTour(seenVersion)) return;
    const timer = setTimeout(start, 700);
    return () => clearTimeout(timer);
  }, [seenVersion, start]);

  if (step === null) return null;
  return <TourOverlay index={step} />;
}

function TourOverlay({ index }: { index: number }) {
  const goTo = useTourStore((state) => state.goTo);
  const end = useTourStore((state) => state.end);

  const step = TOUR_STEPS[index];
  const panelRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  const targets = useMemo(() => stepTargets(step), [step]);

  // Which steps this page can actually show, so the dots count the tour the
  // reader is getting rather than the one that was written.
  const available = TOUR_STEPS.filter((candidate) => isStepAvailable(candidate));
  const position = available.indexOf(step);
  const isLast = position === available.length - 1;

  const move = useCallback(
    (direction: 1 | -1) => {
      const next = resolveStep(index, direction, (candidate) => isStepAvailable(candidate));
      if (next === null) end();
      else goTo(next);
    },
    [index, goTo, end],
  );

  // A step whose target has gone — the window narrowed and took the rail with
  // it — is passed over rather than left pointing at nothing.
  useEffect(() => {
    if (!step.target || targets.length > 0) return;
    const fallback =
      resolveStep(index, 1, (candidate) => isStepAvailable(candidate)) ??
      resolveStep(index, -1, (candidate) => isStepAvailable(candidate));
    if (fallback === null) end();
    else goTo(fallback);
  }, [step, targets, index, goTo, end]);

  // Bring the target into view before lighting it up. The panel is focused
  // rather than a button inside it, so the step is read out in full.
  useEffect(() => {
    const box = unionRect(targets);
    if (box) scrollIntoComfortableView(box);
    panelRef.current?.focus({ preventScroll: true });
  }, [targets]);

  useSpotlight(spotlightRef, panelRef, targets, step);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        end();
      } else if (event.key === "ArrowRight") {
        move(1);
      } else if (event.key === "ArrowLeft") {
        move(-1);
      } else if (event.key === "Tab") {
        keepFocusInside(event, panelRef.current);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [move, end]);

  return (
    <div className={styles.root}>
      {/* Swallows clicks meant for the page underneath, and closes on one:
          someone reaching past the tour has finished with it. */}
      <div className={styles.blocker} onClick={end} aria-hidden="true" />
      <div ref={spotlightRef} className={styles.spotlight} aria-hidden="true" />

      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        // The page behind is dimmed and takes no clicks while this is up.
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        data-centred={step.target ? undefined : true}
      >
        {/* Keyed on the step so the text fades in rather than swapping. */}
        <div key={step.id} className={styles.content}>
          <p className={styles.eyebrow}>A quick tour</p>
          <h2 id="tour-title" className={styles.title}>
            {step.title}
          </h2>
          <p id="tour-body" className={styles.body}>
            {step.body}
          </p>
        </div>

        <div className={styles.dots} aria-hidden="true">
          {available.map((candidate, dot) => (
            <span
              key={candidate.id}
              className={styles.dot}
              data-current={dot === position ? true : undefined}
            />
          ))}
        </div>

        <div className={styles.controls}>
          <button type="button" className={styles.skip} onClick={end}>
            {position === 0 ? "No thanks" : "Skip the rest"}
          </button>
          <div className={styles.forward}>
            {position > 0 && (
              <button type="button" className={styles.back} onClick={() => move(-1)}>
                Back
              </button>
            )}
            <button type="button" className={styles.next} onClick={() => move(1)}>
              {position === 0 ? "Show me around" : isLast ? "Got it" : "Next"}
            </button>
          </div>
        </div>

        {/* Said once, on the way in, rather than on every step. */}
        {position === 0 && (
          <p className={styles.hint}>Escape closes this at any point.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Moves the spotlight and the panel, every frame, outside React.
 *
 * The measurement has to happen continuously rather than once per step: the
 * page under the tour still scrolls, cards resize as their charts settle, and a
 * spotlight that lags its target by even a little reads as broken. Positions
 * are eased towards the measurement, which glides the shape from one step to
 * the next and then sits exactly on it.
 *
 * The current geometry lives in a ref rather than the effect, so it survives a
 * step change and the new step is glided to instead of jumped to.
 */
function useSpotlight(
  spotlightRef: React.RefObject<HTMLDivElement | null>,
  panelRef: React.RefObject<HTMLDivElement | null>,
  targets: HTMLElement[],
  step: TourStep,
) {
  const geometry = useRef<{ spot: Box | null; panel: Point | null }>({
    spot: null,
    panel: null,
  });

  useEffect(() => {
    const spotlight = spotlightRef.current;
    const panel = panelRef.current;
    if (!spotlight || !panel) return;

    // With motion turned down there is no glide: everything is placed outright.
    const ease = prefersReducedMotion() ? 1 : 0.22;
    // Once the easing has settled the same values would be written on every
    // frame; a repaint of a shadow the size of the window is not worth it.
    const written = new Map<string, string>();
    const write = (
      element: HTMLElement,
      property: "transform" | "width" | "height",
      value: string,
    ) => {
      const key = `${property}:${element === spotlight ? "s" : "p"}`;
      if (written.get(key) === value) return;
      written.set(key, value);
      element.style[property] = value;
    };
    let frame = requestAnimationFrame(tick);

    function tick() {
      frame = requestAnimationFrame(tick);
      if (!spotlight || !panel) return;

      const view = { w: window.innerWidth, h: window.innerHeight };
      const measured = unionRect(targets);
      const goal = measured ? inflate(measured, step.padding ?? 8) : null;

      // A step pointing at nothing still has to dim the page, so it becomes a
      // hole with no size at the centre of the window. The first real target
      // then opens out of that point instead of appearing from nowhere.
      const shape = goal ?? { x: view.w / 2, y: view.h / 2, w: 0, h: 0 };
      const next = approachBox(geometry.current.spot ?? shape, shape, ease);
      geometry.current.spot = next;
      write(spotlight, "transform", `translate3d(${next.x}px, ${next.y}px, 0)`);
      write(spotlight, "width", `${Math.max(0, next.w)}px`);
      write(spotlight, "height", `${Math.max(0, next.h)}px`);
      const lit = goal !== null;
      if (lit !== (spotlight.dataset.lit === "true")) {
        if (lit) spotlight.dataset.lit = "true";
        else delete spotlight.dataset.lit;
      }

      // Measured live, because the panel's height changes with its text.
      const size = panel.getBoundingClientRect();
      const goalPoint = placeTooltip(goal, { w: size.width, h: size.height }, view, step.placement);
      const from = geometry.current.panel ?? goalPoint;
      const nextPoint = {
        x: approach(from.x, goalPoint.x, ease),
        y: approach(from.y, goalPoint.y, ease),
      };
      geometry.current.panel = nextPoint;
      write(
        panel,
        "transform",
        `translate3d(${Math.round(nextPoint.x)}px, ${Math.round(nextPoint.y)}px, 0)`,
      );
    }

    return () => cancelAnimationFrame(frame);
  }, [spotlightRef, panelRef, targets, step]);
}

/**
 * Scrolls a target into a comfortable part of the window, and leaves it alone
 * if it is already there — a tour that scrolls on every step loses the reader's
 * place in the page for no reason.
 */
function scrollIntoComfortableView(box: Box): void {
  const margin = 96;
  const viewHeight = window.innerHeight;
  if (box.y >= margin && box.y + box.h <= viewHeight - margin) return;

  // Something taller than the window is aligned to its top; anything else is
  // centred, which leaves room for the panel on either side of it.
  const top =
    box.h > viewHeight - margin * 2
      ? window.scrollY + box.y - margin
      : window.scrollY + box.y + box.h / 2 - viewHeight / 2;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Keeps Tab inside the panel while the tour is up.
 *
 * The page behind is dimmed and unclickable, so letting focus wander into it
 * would strand a keyboard reader somewhere they cannot see.
 */
function keepFocusInside(event: KeyboardEvent, panel: HTMLDivElement | null): void {
  if (!panel) return;
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>("button:not([disabled])"));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!panel.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
