import { defineWidget } from "../contract";
import type { DerivedActivity } from "@/model/activity";
import { HeroFigure, MetricRows } from "@/viz/primitives";
import { formatDistanceShort, formatHeartRate, formatPaceWithUnit } from "@/lib/format";
import { heatContext, windCaveat } from "../weatherContext";
import {
  decouplingPct,
  findFatigueOnset,
  LAB_IS_PROVISIONAL,
  MIN_COMPARABLE_MOVING_S,
  movingSamples,
  RESEARCH,
  signedPct,
  splitIntoSegments,
  terrainConfounds,
  WARMUP_S,
  type ChangePoint,
} from "../labHelpers";
import shared from "../shared.module.css";

/**
 * The section's own conclusion.
 *
 * Every other card in the lab answers one question well and leaves the reader
 * to hold eight answers at once. This is the card that says which of them
 * mattered — and specifically whether what gave way was the engine, the stride,
 * both, or neither.
 *
 * That distinction is the useful one. A run where heart rate climbed while the
 * stride held is a pacing or conditions story; a run where the stride shortened
 * while heart rate stayed put is a strength or fatigue story; a run where both
 * went is a different thing again. A finishing time hides all three.
 *
 * It recomputes rather than reading the other cards' results, because a widget
 * that depended on its neighbours having rendered would break silently whenever
 * one of them opted out.
 */

/** Below this the cardiovascular side did not meaningfully change. */
const CARDIO_THRESHOLD_PCT = 3;
/** Below this the stride did not meaningfully change. */
const MECHANICAL_THRESHOLD_PCT = 2;

interface Cardiovascular {
  changePct: number;
  hrDelta: number;
  paceDelta: number;
  firstHr: number;
  lastHr: number;
  firstPace?: number;
  lastPace?: number;
  confounded: boolean;
}

interface Mechanical {
  speedPct: number;
  cadencePct: number;
  stridePct: number;
  driver: "stride" | "cadence" | "neither";
}

type Verdict = "both" | "cardiovascular" | "mechanical" | "neither";

interface Result {
  cardiovascular?: Cardiovascular;
  mechanical?: Mechanical;
  onset?: ChangePoint;
  verdict: Verdict;
  heatClause: string;
  windClause?: string;
}

export const whatChangedWidget = defineWidget<Result>({
  id: "what-changed",
  title: "What changed",
  description:
    "Whether it was the cardiovascular side, the stride, or both that gave way — and where, drawing the rest of this section into one answer.",
  section: "lab",
  status: "beta",
  // Built from figures that are themselves derived and estimated, and it adds a
  // judgement about which of them mattered on top.
  provenance: "estimated",
  requiredMetrics: ["pace"],
  references: [RESEARCH.marathonDurability, RESEARCH.halfMarathonMechanics],

  compute(activity) {
    const cardiovascular = readCardiovascular(activity);
    const mechanical = readMechanical(activity);
    const onset = findFatigueOnset(activity) ?? undefined;

    // With nothing to compare, there is no conclusion to draw. A card that
    // said "nothing changed" on a run it could not read would be worse than
    // no card.
    if (!cardiovascular && !mechanical && !onset) return null;

    const cardioMoved =
      cardiovascular !== undefined &&
      !cardiovascular.confounded &&
      cardiovascular.changePct >= CARDIO_THRESHOLD_PCT;
    const mechanicalMoved =
      mechanical !== undefined && mechanical.driver !== "neither" && mechanical.speedPct < 0;

    return {
      cardiovascular,
      mechanical,
      onset,
      verdict: verdictFrom(cardioMoved, mechanicalMoved),
      heatClause: heatContext(activity).driftClause,
      windClause: activity.weather ? windCaveat(activity) : undefined,
    };
  },

  narrate(result) {
    const { cardiovascular, mechanical, onset, verdict } = result;

    const information = [{ label: "What gave way", value: headline(verdict) }];
    if (cardiovascular) {
      information.push({
        label: "Cardiovascular",
        value: signedPct(-cardiovascular.changePct),
      });
    }
    if (mechanical) {
      information.push({ label: "Speed", value: signedPct(mechanical.speedPct) });
    }

    const observations = [];
    if (cardiovascular) {
      observations.push({
        text: `Heart rate went from ${formatHeartRate(cardiovascular.firstHr)} to ${formatHeartRate(cardiovascular.lastHr)}${
          cardiovascular.firstPace !== undefined && cardiovascular.lastPace !== undefined
            ? ` while pace went from ${formatPaceWithUnit(cardiovascular.firstPace)} to ${formatPaceWithUnit(cardiovascular.lastPace)}`
            : ""
        }, so each metre cost ${Math.abs(cardiovascular.changePct).toFixed(1)}% ${cardiovascular.changePct > 0 ? "more" : "fewer"} heartbeats by the end.`,
      });
    }
    if (mechanical) {
      observations.push({
        text: `Speed changed by ${signedPct(mechanical.speedPct)}, of which ${signedPct(mechanical.cadencePct)} came from turnover and ${signedPct(mechanical.stridePct)} from step length.`,
      });
    }
    if (onset) {
      observations.push({
        text: `The point where the most signals turned together was ${formatDistanceShort(onset.distanceM)}, where ${onset.shifts.length} of them moved on ground that had not changed.`,
        evidence: [
          { label: "Before", startT: onset.before.startT, endT: onset.before.endT },
          { label: "After", startT: onset.after.startT, endT: onset.after.endT },
        ],
      });
    }

    return {
      information,
      observations,
      explanations: [
        {
          text: buildVerdict(result),
          // A judgement assembled from other judgements. It can be no more
          // certain than the least certain of them, and it adds an inference
          // of its own on top.
          confidence: verdict === "neither" ? "low" : "medium",
          relatedMetrics: ["heartRate", "pace", "cadence"],
        },
      ],
      teaching: [
        {
          title: "Why it matters which one gave way",
          text: "A slowdown tells you the run got harder; it does not tell you what ran out. If the cardiovascular side drifted while the stride held, the limit was aerobic — pacing, heat, fuelling, fitness. If the stride shortened while heart rate sat still, the limit was more likely muscular: the legs stopped returning what they were returning earlier. If both went together, that is the ordinary picture of a run that simply went on longer than the current training supports. The three point at different things to change, which is why collapsing them into one 'you tired' is a waste of the data.",
        },
        {
          title: "What this card cannot do",
          text: "It assembles other cards' findings, so it inherits every one of their limits and adds a judgement of its own about which mattered. It cannot tell fatigue from heat, from fuelling, from a hill you forgot about, or from deciding halfway round that today was an easy run. Where a weather lookup is switched on it can at least say whether the conditions were a candidate. Everything else here is a description of what the numbers did, with the most common reason named and the alternatives left standing.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { cardiovascular, mechanical, onset, verdict } = result;

    const rows = [];
    if (cardiovascular) {
      rows.push({
        label: "Cardiovascular cost",
        value: signedPct(-cardiovascular.changePct),
        detail: `${formatHeartRate(cardiovascular.firstHr)} → ${formatHeartRate(cardiovascular.lastHr)}`,
        accent:
          cardiovascular.changePct >= CARDIO_THRESHOLD_PCT
            ? "var(--zone-4)"
            : "var(--zone-2)",
      });
    }
    if (mechanical) {
      rows.push({
        label: "Turnover",
        value: signedPct(mechanical.cadencePct),
        accent:
          Math.abs(mechanical.cadencePct) >= MECHANICAL_THRESHOLD_PCT
            ? "var(--zone-4)"
            : "var(--zone-2)",
      });
      rows.push({
        label: "Step length",
        value: signedPct(mechanical.stridePct),
        accent:
          Math.abs(mechanical.stridePct) >= MECHANICAL_THRESHOLD_PCT
            ? "var(--zone-4)"
            : "var(--zone-2)",
      });
    }
    if (onset) {
      rows.push({
        label: "Signals turned together",
        value: formatDistanceShort(onset.distanceM),
        detail: `${onset.shifts.length} of them`,
      });
    }

    return (
      <div>
        <HeroFigure
          value={headline(verdict)}
          caption={
            verdict === "neither"
              ? "nothing moved far enough to call a change"
              : "is what gave way as the run went on"
          }
          tone={verdict === "neither" ? "positive" : "cautious"}
        />

        <MetricRows rows={rows} />

        <p className={shared.note}>
          Each figure here is the first quarter of the run against the last,
          counting moving time only. The cards above show how each was arrived
          at.
        </p>
      </div>
    );
  },
});

function headline(verdict: Verdict): string {
  switch (verdict) {
    case "both":
      return "Both";
    case "cardiovascular":
      return "The engine";
    case "mechanical":
      return "The stride";
    case "neither":
      return "Neither";
  }
}

function verdictFrom(cardio: boolean, mechanical: boolean): Verdict {
  if (cardio && mechanical) return "both";
  if (cardio) return "cardiovascular";
  if (mechanical) return "mechanical";
  return "neither";
}

/** The paragraph the section exists to be able to write. */
function buildVerdict(result: Result): string {
  const { verdict, onset, mechanical, cardiovascular, heatClause, windClause } = result;
  const where = onset ? ` from about ${formatDistanceShort(onset.distanceM)}` : "";

  // A side that could not be read is not a side that held. Saying otherwise
  // would turn a missing measurement into a finding, which is the one mistake
  // this whole section is arranged to avoid.
  const cardioUnread = cardiovascular === undefined;
  const mechanicalUnread = mechanical === undefined;
  const cardioNote = cardioUnread
    ? " The cardiovascular side could not be read on this run — that comparison needs a longer effort, and the durability card says so by not appearing — so this describes the stride alone rather than showing that the engine held."
    : "";
  const mechanicalNote = mechanicalUnread
    ? " The stride could not be read on this run, because the file carries no cadence, so this describes the cardiovascular side alone rather than showing that the stride held."
    : "";

  const opening = (() => {
    switch (verdict) {
      case "both":
        return `Both sides of the run gave way${where}: the stride shortened or slowed while each metre was also costing more heartbeats. That combination is the ordinary shape of a run that went on longer than current training comfortably supports, rather than of a pacing mistake.`;
      case "cardiovascular":
        return `The cardiovascular side drifted${where}${mechanicalUnread ? "" : " while the stride held its shape"}. ${mechanicalUnread ? "What changed was the price of the running." : "The legs were still doing what they did at the start; what changed was the price of it."} That points at pacing, conditions or aerobic fitness rather than at anything mechanical.${mechanicalNote}`;
      case "mechanical":
        return `The stride gave way${where}${cardioUnread ? "" : " while the cardiovascular cost held roughly steady"}${mechanical?.driver === "stride" ? " — and it was step length that shortened rather than turnover that dropped" : ""}.${cardioUnread ? "" : " A run that slows without heart rate rising to match is more often a muscular limit than an aerobic one."}${cardioNote}`;
      case "neither":
        if (cardioUnread && mechanicalUnread) {
          return `Neither side of this run could be read — the cardiovascular comparison needs a longer effort and the stride needs cadence${onset ? `, so all that can be said is that several signals turned together around ${formatDistanceShort(onset.distanceM)}` : ""}. This card is reporting what is missing, not that nothing happened.`;
        }
        return `Neither the ${cardioUnread ? "stride" : mechanicalUnread ? "cardiovascular cost" : "cardiovascular cost nor the stride"} moved far enough to call a change.${cardioNote}${mechanicalNote} Whatever this run felt like, ${cardioUnread || mechanicalUnread ? "the part that could be read" : "it"} finished in much the same shape it started.`;
    }
  })();

  const conditions =
    verdict === "neither"
      ? ""
      : ` ${heatClause}${windClause ? ` ${windClause}` : ""}`;

  const caveat =
    cardiovascular?.confounded === true
      ? " The two ends of the run were on different enough ground that the cardiovascular figure cannot be separated from the terrain, so that half of this reading is weaker than it looks."
      : "";

  return `${opening}${conditions}${caveat}`;
}

/** First quarter against last, on the same terms the durability card uses. */
function readCardiovascular(activity: DerivedActivity): Cardiovascular | undefined {
  if (movingSamples(activity).length < WARMUP_S + MIN_COMPARABLE_MOVING_S) return undefined;

  const segments = splitIntoSegments(activity, 4, { warmupS: WARMUP_S }).filter(
    (segment) => segment.metresPerBeat !== undefined,
  );
  if (segments.length < 4) return undefined;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const changePct = decouplingPct(first.metresPerBeat!, last.metresPerBeat!);

  return {
    changePct,
    hrDelta: last.hrBpm! - first.hrBpm!,
    paceDelta: (last.paceSecPerKm ?? 0) - (first.paceSecPerKm ?? 0),
    firstHr: first.hrBpm!,
    lastHr: last.hrBpm!,
    firstPace: first.paceSecPerKm,
    lastPace: last.paceSecPerKm,
    confounded: terrainConfounds(first, last, changePct > 0),
  };
}

/** The same split of speed into turnover and step length the stride card makes. */
function readMechanical(activity: DerivedActivity): Mechanical | undefined {
  const segments = splitIntoSegments(activity, 4).filter(
    (segment) =>
      segment.strideLengthM !== undefined &&
      segment.cadenceSpm !== undefined &&
      segment.speedMps !== undefined,
  );
  if (segments.length < 4) return undefined;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const change = (from: number, to: number) => ((to - from) / from) * 100;

  const cadencePct = change(first.cadenceSpm!, last.cadenceSpm!);
  const stridePct = change(first.strideLengthM!, last.strideLengthM!);

  return {
    speedPct: change(first.speedMps!, last.speedMps!),
    cadencePct,
    stridePct,
    driver:
      Math.abs(stridePct) < MECHANICAL_THRESHOLD_PCT &&
      Math.abs(cadencePct) < MECHANICAL_THRESHOLD_PCT
        ? "neither"
        : Math.abs(stridePct) >= Math.abs(cadencePct)
          ? "stride"
          : "cadence",
  };
}

export default whatChangedWidget;
