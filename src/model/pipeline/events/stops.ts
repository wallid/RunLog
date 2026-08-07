import type { ActivityEvent, Sample } from "../../activity";
import { detectWalkingCandidates } from "../derive";
import { collect, mean } from "@/lib/stats";

/**
 * Stops and possible walking sections.
 *
 * Stopping is directly observable from speed. Walking is not — without cadence
 * there is no way to distinguish a walk from a very slow run, so those sections
 * are always reported as possibilities.
 */

/** Pauses shorter than this are noise rather than events worth narrating. */
const MIN_REPORTED_STOP_S = 5;

export function detectStops(samples: Sample[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let start = -1;

  for (let i = 0; i <= samples.length; i++) {
    const stopped = i < samples.length && !samples[i].moving;
    if (stopped) {
      if (start < 0) start = i;
      continue;
    }
    if (start < 0) continue;

    const durationS = i - start;
    if (durationS >= MIN_REPORTED_STOP_S) {
      const window = samples.slice(start, i);
      const hrValues = collect(window, (s) => s.hrBpm);
      const hrStart = hrValues[0];
      const hrEnd = hrValues[hrValues.length - 1];

      events.push({
        id: `stop-${window[0].t}`,
        type: "stop",
        startT: window[0].t,
        endT: window[window.length - 1].t,
        startDistanceM: window[0].distanceM,
        endDistanceM: window[window.length - 1].distanceM,
        confidence: "high",
        metrics: {
          durationS,
          hrDropBpm: hrStart !== undefined && hrEnd !== undefined ? hrStart - hrEnd : NaN,
          hrAtStart: hrStart ?? NaN,
          hrAtEnd: hrEnd ?? NaN,
        },
        label: "Stop",
      });
    }
    start = -1;
  }

  if (events.length > 0) {
    let longest = events[0];
    for (const event of events) {
      if (event.metrics.durationS > longest.metrics.durationS) longest = event;
    }
    if (events.length > 1) longest.label = "Longest stop";
  }

  return events;
}

export function detectWalking(samples: Sample[]): ActivityEvent[] {
  return detectWalkingCandidates(samples).map((section) => {
    const window = samples.slice(section.start, section.end + 1);
    const paces = collect(window, (s) => s.paceSecPerKm);
    const hr = collect(window, (s) => s.hrBpm);
    return {
      id: `walk-${window[0].t}`,
      type: "walk" as const,
      startT: window[0].t,
      endT: window[window.length - 1].t,
      startDistanceM: window[0].distanceM,
      endDistanceM: window[window.length - 1].distanceM,
      // Without cadence this can only ever be a possibility.
      confidence: "low" as const,
      metrics: {
        durationS: window[window.length - 1].t - window[0].t,
        avgPaceSecPerKm: paces.length > 0 ? mean(paces) : NaN,
        avgHr: hr.length > 0 ? mean(hr) : NaN,
        lengthM: window[window.length - 1].distanceM - window[0].distanceM,
      },
      label: "Possible walking",
    };
  });
}
