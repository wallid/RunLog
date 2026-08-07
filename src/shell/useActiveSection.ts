import { useEffect, useState } from "react";

/**
 * Tracks which section is currently being read.
 *
 * The active section is the last one whose top has passed the reading line — a
 * band just below the masthead. An intersection-based version highlights
 * whichever section merely overlaps that band, which lets a section that is
 * scrolling out of view keep the highlight while the reader is already looking
 * at the next one.
 */
export function useActiveSection(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  // A stable key so the effect does not re-run whenever the caller happens to
  // rebuild the array.
  const key = ids.join("|");

  useEffect(() => {
    const sectionIds = key.length > 0 ? key.split("|") : [];
    if (sectionIds.length === 0) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const readingLine = headerOffset() + 24;

      let current = sectionIds[0];
      for (const id of sectionIds) {
        const element = document.getElementById(id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= readingLine) current = id;
        else break;
      }

      // At the foot of the page the last section may never reach the reading
      // line, so being at the bottom means the last section is what's on screen.
      const atBottom =
        window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
      if (atBottom) current = sectionIds[sectionIds.length - 1];

      setActiveId(current);
    };

    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key]);

  return activeId;
}

/** The masthead's height, read from the token that also reserves the space. */
function headerOffset(): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(
    "--header-height",
  );
  const rem = parseFloat(value);
  return Number.isFinite(rem) ? rem * 16 : 72;
}
