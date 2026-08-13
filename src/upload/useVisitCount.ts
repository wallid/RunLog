import { useEffect, useState } from "react";
import { countVisit } from "@/stats";

/**
 * The visit count, for the two places on the landing page that print it.
 *
 * Null until the number arrives, and null forever when it cannot — neither
 * caller shows a placeholder, a zero, or a stale figure, because the only
 * thing worse than no proof is invented proof. `countVisit` makes the report
 * once per page load however many components ask for it, so a badge and a
 * strip on the same screen are one visit and not two.
 */
export function useVisitCount(): number | null {
  const [visits, setVisits] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void countVisit().then((count) => {
      if (!cancelled) setVisits(count);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return visits;
}
