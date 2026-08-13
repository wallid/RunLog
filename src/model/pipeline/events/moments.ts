import type { ActivityEvent, Sample, Split, StoryMoment } from "../../activity";
import { formatDistanceShort, formatDurationWords, formatPaceWithUnit } from "@/lib/format";
import { collect, mean } from "@/lib/stats";

/**
 * Chooses the few moments worth telling the story around.
 *
 * Every candidate is scored on how far it departs from the rest of the run and
 * how long it lasted, then the highest-scoring non-overlapping moments are kept.
 * The aim is three to five, because a list of everything is not a story.
 */

const MAX_MOMENTS = 5;
const MIN_MOMENTS = 3;
/** Two moments overlapping by more than this fraction are the same moment. */
const OVERLAP_TOLERANCE = 0.5;
/**
 * On a run where little happened, the settled stretch covers almost everything,
 * so the fallback moments are only rejected when they are near-duplicates.
 */
const FILLER_OVERLAP_TOLERANCE = 0.85;

type Candidate = Omit<StoryMoment, "order">;

export function buildMoments(
  samples: Sample[],
  events: ActivityEvent[],
  splits: Split[],
): StoryMoment[] {
  const candidates: Candidate[] = [];

  for (const event of events) {
    const candidate = candidateFromEvent(event, samples);
    if (candidate) candidates.push(candidate);
  }

  const settled = candidateForSettledRhythm(samples, splits, events);
  if (settled) candidates.push(settled);

  candidates.sort((a, b) => b.salience - a.salience);

  const chosen: Candidate[] = [];
  for (const candidate of candidates) {
    if (chosen.length >= MAX_MOMENTS) break;
    if (chosen.some((existing) => overlaps(existing, candidate))) continue;
    chosen.push(candidate);
  }

  // A run with nothing dramatic still deserves a story, so fall back to the
  // opening and closing sections rather than showing nothing.
  if (chosen.length < MIN_MOMENTS) {
    for (const filler of fillerCandidates(samples, splits)) {
      if (chosen.length >= MIN_MOMENTS) break;
      if (chosen.some((existing) => overlaps(existing, filler, FILLER_OVERLAP_TOLERANCE))) {
        continue;
      }
      chosen.push(filler);
    }
  }

  chosen.sort((a, b) => a.startT - b.startT);
  return chosen.map((candidate, index) => ({ ...candidate, order: index + 1 }));
}

function candidateFromEvent(event: ActivityEvent, samples: Sample[]): Candidate | undefined {
  const durationS = Math.max(1, event.endT - event.startT);
  // Longer events carry more of the run's story, but with diminishing weight.
  const durationWeight = Math.min(1.5, Math.log10(durationS + 1) / 2);
  const base = {
    id: `moment-${event.id}`,
    startT: event.startT,
    endT: event.endT,
    startDistanceM: event.startDistanceM,
    endDistanceM: event.endDistanceM,
    eventId: event.id,
    confidence: event.confidence,
  };

  switch (event.type) {
    case "climb": {
      const gain = event.metrics.elevationChangeM;
      return {
        ...base,
        label: event.label,
        description: `${formatDistanceShort(event.metrics.lengthM)} climbing ${Math.round(gain)} m from ${formatDistanceShort(event.startDistanceM)}.`,
        salience: gain * 1.2 * durationWeight,
      };
    }
    case "descent": {
      const loss = Math.abs(event.metrics.elevationChangeM);
      return {
        ...base,
        label: event.label,
        description: `${formatDistanceShort(event.metrics.lengthM)} descending ${Math.round(loss)} m from ${formatDistanceShort(event.startDistanceM)}.`,
        salience: loss * 0.7 * durationWeight,
      };
    }
    case "fastStart":
      return {
        ...base,
        label: "Fast opening",
        description: `The first kilometre was ${Math.round(event.metrics.differencePct)}% faster than the middle of the run.`,
        salience: event.metrics.differencePct * 3,
      };
    case "strongFinish": {
      const delta = event.metrics.paceDeltaSecPerKm;
      return {
        ...base,
        label: event.label,
        description: Number.isFinite(delta) && delta > 0
          ? `Pace improved by ${Math.round(delta)} seconds per kilometre over the final ${formatDistanceShort(event.metrics.lengthM)}.`
          : `Effort rose through the final ${formatDistanceShort(event.metrics.lengthM)}.`,
        salience: 30 + Math.max(0, delta),
      };
    }
    case "stop":
      return {
        ...base,
        label: event.label,
        description: `A ${formatDurationWords(event.metrics.durationS)} pause at ${formatDistanceShort(event.startDistanceM)}.`,
        salience: event.metrics.durationS * 0.8,
      };
    case "hrRecovery":
      return {
        ...base,
        label: "Heart-rate recovery",
        description: `Heart rate fell ${Math.round(event.metrics.recoveryBpm)} bpm within a minute after ${formatDistanceShort(event.startDistanceM)}.`,
        salience: event.metrics.recoveryBpm * 1.5,
      };
    case "walk":
      return {
        ...base,
        label: event.label,
        description: `A ${formatDurationWords(event.metrics.durationS)} slower section at ${formatDistanceShort(event.startDistanceM)}.`,
        salience: event.metrics.durationS * 0.3,
      };
    default: {
      void samples;
      return undefined;
    }
  }
}

/**
 * The longest stretch where nothing much happened.
 *
 * Settling into a rhythm is part of the story of most runs, and naming it gives
 * the dramatic moments something to contrast against.
 */
function candidateForSettledRhythm(
  samples: Sample[],
  splits: Split[],
  events: ActivityEvent[],
): Candidate | undefined {
  if (splits.length < 2 || samples.length < 300) return undefined;

  const busy = new Set<number>();
  for (const event of events) {
    if (event.type === "hrRecovery" || event.type === "bestEffort") continue;
    for (let t = Math.floor(event.startT); t <= Math.ceil(event.endT); t++) busy.add(t);
  }

  let bestStart = -1;
  let bestLength = 0;
  let start = -1;
  for (let i = 0; i <= samples.length; i++) {
    const quiet = i < samples.length && !busy.has(samples[i].t) && samples[i].moving;
    if (quiet) {
      if (start < 0) start = i;
      continue;
    }
    if (start >= 0) {
      if (i - start > bestLength) {
        bestLength = i - start;
        bestStart = start;
      }
      start = -1;
    }
  }

  if (bestStart < 0 || bestLength < 180) return undefined;

  const window = samples.slice(bestStart, bestStart + bestLength);
  const paces = collect(window, (s) => s.paceSecPerKm);
  if (paces.length < 60) return undefined;

  const from = window[0];
  const to = window[window.length - 1];

  return {
    id: "moment-settled",
    label: "Settled rhythm",
    description: `Steady running at ${formatPaceWithUnit(mean(paces))} between ${formatDistanceShort(from.distanceM)} and ${formatDistanceShort(to.distanceM)}.`,
    startT: from.t,
    endT: to.t,
    startDistanceM: from.distanceM,
    endDistanceM: to.distanceM,
    confidence: "high",
    salience: bestLength * 0.15,
  };
}

function fillerCandidates(samples: Sample[], splits: Split[]): Candidate[] {
  if (samples.length < 120) return [];
  const fillers: Candidate[] = [];
  // The first seconds are spent accelerating from standing, which says nothing
  // about how the run was paced.
  const ACCELERATION_S = 20;
  const openingEnd = Math.min(samples.length - 1, ACCELERATION_S + 120);
  const opening = samples.slice(ACCELERATION_S, openingEnd + 1);
  const openingPaces = collect(opening, (s) => s.paceSecPerKm);

  if (openingPaces.length > 30) {
    fillers.push({
      id: "moment-opening",
      label: "Opening",
      description: `The run began at ${formatPaceWithUnit(mean(openingPaces))}.`,
      startT: opening[0].t,
      endT: opening[opening.length - 1].t,
      startDistanceM: opening[0].distanceM,
      endDistanceM: opening[opening.length - 1].distanceM,
      confidence: "high",
      salience: 1,
    });
  }

  const closing = samples.slice(Math.max(0, samples.length - 121));
  const closingPaces = collect(closing, (s) => s.paceSecPerKm);
  if (closingPaces.length > 30) {
    fillers.push({
      id: "moment-closing",
      label: "Final stretch",
      description: `The run finished at ${formatPaceWithUnit(mean(closingPaces))}.`,
      startT: closing[0].t,
      endT: closing[closing.length - 1].t,
      startDistanceM: closing[0].distanceM,
      endDistanceM: closing[closing.length - 1].distanceM,
      confidence: "high",
      salience: 1,
    });
  }

  if (splits.length >= 2) {
    const fastest = splits.reduce((a, b) => (b.paceSecPerKm < a.paceSecPerKm ? b : a));
    fillers.push({
      id: "moment-fastest-split",
      label: `Fastest kilometre`,
      description: `Kilometre ${fastest.index} was the quickest at ${formatPaceWithUnit(fastest.paceSecPerKm)}.`,
      startT: fastest.startT,
      endT: fastest.endT,
      startDistanceM: fastest.startDistanceM,
      endDistanceM: fastest.endDistanceM,
      confidence: "high",
      salience: 2,
    });
  }

  return fillers;
}

/**
 * Whether two candidates describe the same stretch of the run.
 *
 * The comparison comes from the shared span over the combined span, so a short
 * moment sitting inside a much longer one still counts as distinct. Measuring
 * against the shorter of the two would make every brief moment a duplicate of
 * any long one that contains it.
 */
function overlaps(a: Candidate, b: Candidate, tolerance = OVERLAP_TOLERANCE): boolean {
  const shared = Math.min(a.endT, b.endT) - Math.max(a.startT, b.startT);
  if (shared <= 0) return false;
  const combined = Math.max(a.endT, b.endT) - Math.min(a.startT, b.startT);
  return combined <= 0 || shared / combined > tolerance;
}
