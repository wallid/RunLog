import { defineWidget } from "../contract";
import type { DerivedActivity, Sample } from "@/model/activity";
import { HeroFigure, MetricRows } from "@/viz/primitives";
import { collect, linearSlope, mean } from "@/lib/stats";
import {
  formatCadence,
  formatDuration,
  formatHeartRate,
  formatPaceWithUnit,
  formatPower,
} from "@/lib/format";
import { listPhrase, NOISE_FLOOR } from "../helpers";
import { LAB_IS_PROVISIONAL, RESEARCH } from "../labHelpers";
import shared from "../shared.module.css";

/**
 * How this runner answers a hill.
 *
 * The terrain section already reports what the climbs cost. This asks a
 * different question: given the same gradient, what does *this* runner change?
 * Two runners losing identical time on a climb can be doing entirely different
 * things — one shortens the stride and keeps the rhythm, the other holds the
 * stride and drops the turnover — and that difference is stable enough across
 * runs to be worth calling a fingerprint.
 *
 * Bands are finer than the flat/uphill/downhill split the terrain section uses,
 * and every figure is a difference from the runner's own flat ground rather
 * than an absolute, because the absolute is mostly a statement about how fit
 * they are that day.
 */

/** Percent gradient. A gentle rise and a wall are not the same question. */
const EDGES = [-25, -6, -2, 2, 6, 25];

/** The band's name as a heading, and the same thing said inside a sentence. */
const BAND_NAMES = [
  { label: "Steep descent", plural: "steep descents" },
  { label: "Gentle descent", plural: "gentle descents" },
  { label: "Flat", plural: "the flat" },
  { label: "Gentle climb", plural: "gentle climbs" },
  { label: "Steep climb", plural: "steep climbs" },
];

/** The index of the band holding level ground, which everything is read against. */
const FLAT_BAND = 2;

/** A band holding less than this is where the runner happened to be, not a pattern. */
const MIN_BAND_SECONDS = 40;

/** Beyond this the pace–gradient relationship bends and a straight line lies. */
const SLOPE_GRADIENT_LIMIT = 12;

/** Slower than this is walking, and it is an outlier on a running fit. */
const SLOWEST_PACE_FITTED = 900;

interface Band {
  index: number;
  label: string;
  /** The band named the way it reads inside a sentence. */
  plural: string;
  from: number;
  to: number;
  seconds: number;
  paceSecPerKm: number;
  hrBpm?: number;
  powerW?: number;
  cadenceSpm?: number;
  /** Differences from the flat band, in each metric's own unit. */
  paceDelta?: number;
  hrDelta?: number;
  powerDelta?: number;
  cadenceDelta?: number;
}

interface Result {
  bands: Band[];
  flat: Band;
  /** Seconds per kilometre lost per 1% of gradient, fitted across the run. */
  costPerGradientPct: number;
  climb?: Band;
  descent?: Band;
}

export const terrainResponseWidget = defineWidget<Result>({
  id: "terrain-response",
  title: "Terrain response",
  description:
    "What you change when the ground tilts — measured against your own flat running rather than an absolute.",
  section: "lab",
  status: "beta",
  requiredMetrics: ["gradient", "pace"],
  // The band averages are derived, but the headline cost-per-gradient is a
  // least-squares fit.
  provenance: "estimated",
  references: [
    RESEARCH.economyMetaAnalysis,
  ],

  compute(activity) {
    const bands = buildBands(activity);
    const flat = bands.find((band) => band.index === FLAT_BAND);
    // Without flat ground there is no baseline, and every figure here is a
    // difference from one.
    if (!flat) return null;
    if (bands.length < 2) return null;

    for (const band of bands) {
      band.paceDelta = band.paceSecPerKm - flat.paceSecPerKm;
      if (band.hrBpm !== undefined && flat.hrBpm !== undefined) {
        band.hrDelta = band.hrBpm - flat.hrBpm;
      }
      if (band.powerW !== undefined && flat.powerW !== undefined) {
        band.powerDelta = band.powerW - flat.powerW;
      }
      if (band.cadenceSpm !== undefined && flat.cadenceSpm !== undefined) {
        band.cadenceDelta = band.cadenceSpm - flat.cadenceSpm;
      }
    }

    const costPerGradientPct = fitPaceAgainstGradient(activity);
    if (!Number.isFinite(costPerGradientPct)) return null;

    return {
      bands,
      flat,
      costPerGradientPct,
      // The steepest band on each side that the run actually spent time in.
      climb: [...bands].reverse().find((band) => band.index > FLAT_BAND),
      descent: bands.find((band) => band.index < FLAT_BAND),
    };
  },

  narrate(result) {
    const { climb, descent, costPerGradientPct } = result;
    const observations = [
      {
        text: `Across the run, every extra 1% of gradient went with about ${Math.round(Math.abs(costPerGradientPct))} s/km ${costPerGradientPct >= 0 ? "slower" : "faster"} running.`,
      },
    ];

    for (const band of [climb, descent]) {
      if (!band || band.paceDelta === undefined) continue;
      const parts = [
        prose(
          band.paceDelta,
          NOISE_FLOOR.paceSecPerKm,
          "s/km slower",
          "s/km faster",
          "pace",
        ),
      ];
      if (band.hrDelta !== undefined) {
        parts.push(
          prose(band.hrDelta, NOISE_FLOOR.hrBpm, "bpm higher", "bpm lower", "heart rate"),
        );
      }
      if (band.cadenceDelta !== undefined) {
        parts.push(
          prose(
            band.cadenceDelta,
            NOISE_FLOOR.cadenceSpm,
            "steps quicker",
            "steps slower",
            "turnover",
          ),
        );
      }
      observations.push({
        text: `On ${band.plural} you were ${listPhrase(parts)} than on the flat.`,
      });
    }

    return {
      information: [
        {
          label: "Cost of gradient",
          value: `${Math.round(Math.abs(costPerGradientPct))} s/km`,
          note: "per 1% of climb",
        },
        { label: "Bands compared", value: `${result.bands.length}` },
        {
          label: "Flat baseline",
          value: formatPaceWithUnit(result.flat.paceSecPerKm),
        },
      ],

      observations,

      explanations: [buildStrategy(climb)],

      teaching: [
        {
          title: "Reading the gradient cost",
          text: "The figure comes from fitting a straight line through pace against gradient across every moving second of the run, restricted to slopes under 12% where the relationship is roughly straight. It describes this run on this terrain, not a general law about you: a run with only two short rises is fitting a line through very little, and the number will move a lot from run to run until you have several to compare.",
        },
        {
          title: "Shortening the stride or dropping the turnover",
          text: "Climbing slows everyone; what differs is how. A runner who holds cadence within a step or two of flat is shortening the stride and keeping the rhythm, which is the pattern usually taught. A runner whose cadence falls several steps is keeping a long stride and turning it over more slowly, which costs more. Neither is wrong, but knowing which you do is the thing to watch as a run gets long — the second pattern tends to appear as fatigue arrives.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { bands, flat } = result;

    return (
      <div>
        <HeroFigure
          value={`${Math.round(Math.abs(result.costPerGradientPct))} s/km`}
          caption={`${result.costPerGradientPct >= 0 ? "lost" : "gained"} per 1% of gradient, fitted across the whole run`}
          tone="neutral"
        />

        <p className={shared.trackLabel}>Against your own flat running</p>
        <MetricRows
          rows={bands.map((band) => ({
            label: band.label,
            detail: `${band.from}% to ${band.to}% · ${formatDuration(band.seconds)}`,
            value:
              band.index === FLAT_BAND
                ? "baseline"
                : `${band.paceDelta! >= 0 ? "+" : "−"}${Math.round(Math.abs(band.paceDelta!))} s/km`,
          }))}
        />

        <p className={shared.trackLabel}>What else changed there</p>
        <MetricRows
          rows={bands.map((band) => ({
            label: band.label,
            value:
              [
                band.hrDelta !== undefined ? describeDelta(band.hrDelta, "bpm") : null,
                band.cadenceDelta !== undefined
                  ? describeDelta(band.cadenceDelta, "spm")
                  : null,
                band.powerDelta !== undefined
                  ? describeDelta(band.powerDelta, "W")
                  : null,
              ]
                .filter((part) => part !== null)
                .join(" · ") || "—",
          }))}
        />

        <p className={shared.note}>
          The flat baseline is averaged over the whole run, so anything that
          changed as the run went on — tiring, easing off — sits inside it and
          shrinks the differences shown here. Flat is everything between −2% and
          2%, averaging{" "}
          {formatPaceWithUnit(flat.paceSecPerKm)}
          {flat.hrBpm !== undefined ? ` at ${formatHeartRate(flat.hrBpm)}` : ""}
          {flat.powerW !== undefined ? ` and ${formatPower(flat.powerW)}` : ""}
          {flat.cadenceSpm !== undefined ? `, ${formatCadence(flat.cadenceSpm)}` : ""}.
        </p>
      </div>
    );
  },
});

/** Averages every metric within each gradient band, over moving seconds only. */
function buildBands(activity: DerivedActivity): Band[] {
  const bands: Band[] = [];

  for (let i = 0; i < EDGES.length - 1; i++) {
    const from = EDGES[i];
    const to = EDGES[i + 1];
    const inside = activity.samples.filter((sample) => {
      if (!sample.moving) return false;
      const gradient = sample.gradientPct;
      if (gradient === undefined) return false;
      // The top band is closed so the steepest second is not dropped.
      return i === EDGES.length - 2
        ? gradient >= from && gradient <= to
        : gradient >= from && gradient < to;
    });

    if (inside.length < MIN_BAND_SECONDS) continue;

    // Pace comes from mean speed rather than mean pace, so that the slow
    // seconds are not weighted above the ground they covered.
    const speed = optional(inside, (sample) => sample.speedMps);
    if (speed === undefined || speed <= 0.5) continue;

    bands.push({
      index: i,
      label: BAND_NAMES[i].label,
      plural: BAND_NAMES[i].plural,
      from,
      to,
      seconds: inside.length,
      paceSecPerKm: 1000 / speed,
      hrBpm: optional(inside, (sample) => sample.hrBpm),
      powerW: optional(inside, (sample) => sample.powerW),
      cadenceSpm: optional(inside, (sample) => sample.cadenceSpm),
    });
  }

  return bands;
}

function optional(
  samples: Sample[],
  pick: (sample: Sample) => number | undefined,
): number | undefined {
  const values = collect(samples, pick);
  if (values.length < Math.max(20, samples.length * 0.5)) return undefined;
  const value = mean(values);
  return Number.isFinite(value) ? value : undefined;
}

/** Seconds per kilometre per 1% of gradient, over the range where a line fits. */
function fitPaceAgainstGradient(activity: DerivedActivity): number {
  const gradients: number[] = [];
  const paces: number[] = [];

  for (const sample of activity.samples) {
    if (!sample.moving) continue;
    const { gradientPct, paceSecPerKm } = sample;
    if (gradientPct === undefined || paceSecPerKm === undefined) continue;
    if (Math.abs(gradientPct) > SLOPE_GRADIENT_LIMIT) continue;
    // A few seconds of near-walking sit far enough out on the pace axis to
    // drag a least-squares line on their own, so they are left out of the fit.
    if (paceSecPerKm > SLOWEST_PACE_FITTED) continue;
    gradients.push(gradientPct);
    paces.push(paceSecPerKm);
  }

  return linearSlope(gradients, paces);
}

function describeDelta(delta: number | undefined, unit: string): string {
  if (delta === undefined) return "—";
  return `${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(delta))} ${unit}`;
}

/**
 * A difference said the way a runner would say it.
 *
 * Below the metric's noise floor it is said as no difference at all, because
 * "0 s/km slower" is not a smaller version of a finding — it is the absence of
 * one, and printing it as a signed number invites the reader to see a change.
 */
function prose(
  delta: number,
  floor: number,
  up: string,
  down: string,
  noun: string,
): string {
  const magnitude = Math.abs(delta);
  if (magnitude < floor) return `no different in ${noun}`;
  return `${Math.round(magnitude)} ${delta >= 0 ? up : down}`;
}

/**
 * What the climb response says about how this runner climbs.
 *
 * Cadence is the tell. Holding it means the stride shortened; losing it means
 * the stride stayed long and turned over more slowly.
 */
function buildStrategy(climb: Band | undefined) {
  if (!climb) {
    return {
      text: "This run had too little climbing to describe how you answer one — the bands above the flat baseline never held enough running to average.",
      confidence: "low" as const,
      relatedMetrics: ["gradient" as const],
    };
  }

  const slowed =
    climb.paceDelta !== undefined && Math.abs(climb.paceDelta) >= NOISE_FLOOR.paceSecPerKm;
  const cost = slowed
    ? `cost you ${Math.round(Math.abs(climb.paceDelta!))} s/km against your flat running`
    : "did not measurably slow you against your flat running";
  const heart =
    climb.hrDelta !== undefined && Math.abs(climb.hrDelta) >= NOISE_FLOOR.hrBpm
      ? `${slowed ? " and cost" : ", though it still cost"} ${Math.round(Math.abs(climb.hrDelta))} bpm ${climb.hrDelta > 0 ? "more" : "less"}`
      : "";

  if (climb.cadenceDelta === undefined) {
    return {
      text: `Climbing ${cost}${heart}. Without cadence this file cannot say whether that came from a shorter stride or a slower turnover, which is the part worth knowing.`,
      confidence: "medium" as const,
      relatedMetrics: ["gradient" as const, "pace" as const],
    };
  }

  const heldCadence = Math.abs(climb.cadenceDelta) < NOISE_FLOOR.cadenceSpm;

  return {
    text: heldCadence
      ? `Your cadence held within ${NOISE_FLOOR.cadenceSpm} steps of flat while climbing ${cost}, so you answer a climb by shortening the stride and keeping the rhythm.`
      : climb.cadenceDelta < 0
        ? `Cadence fell ${Math.round(Math.abs(climb.cadenceDelta))} steps on the climb as well as pace, so you are holding a longer stride and turning it over more slowly rather than shortening it.`
        : `Cadence rose ${Math.round(climb.cadenceDelta)} steps on the climb, so you shortened the stride further than the slowdown alone required.`,
    confidence: "medium" as const,
    relatedMetrics: ["gradient" as const, "cadence" as const, "pace" as const],
  };
}

export default terrainResponseWidget;
