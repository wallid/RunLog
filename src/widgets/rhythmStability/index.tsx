import { defineWidget } from "../contract";
import type { Sample } from "@/model/activity";
import { mean, stdev } from "@/lib/stats";
import { runningCadenceOf } from "@/model/pipeline/events/cadence";
import { MetricRows, ProportionBars } from "@/viz/primitives";
import { LAB_IS_PROVISIONAL, movingSamples, RESEARCH } from "../labHelpers";
import shared from "../shared.module.css";

/**
 * How steady the rhythm was, second to second.
 *
 * Every other card in this section asks whether something changed across the
 * run. This asks something orthogonal: how much it wobbled while it was
 * happening. A runner can hold an identical average cadence through two runs
 * and have one of them be metronomic and the other ragged, and only this
 * separates them.
 *
 * Variability is measured *inside* thirty-second windows and then averaged, not
 * across the whole run. That distinction is the whole method: variability
 * measured across the run would mostly be reporting the drift the durability
 * cards already cover, whereas variability within a window is the roughness
 * that drift is riding on.
 *
 * There is deliberately no overall score. A single number out of a hundred
 * would need thresholds for what counts as steady, and no such threshold exists
 * that is not invented — it depends on the runner, the terrain and the pace.
 * So the card reports each measurement's own figure, ranks them against each
 * other, and says plainly that the comparison worth making needs runs this app
 * cannot yet hold.
 */

/** Long enough to hold a rhythm, short enough that drift is not what is measured. */
const WINDOW_S = 30;

/** Fewer windows than this and the average of them says little. */
const MIN_WINDOWS = 8;

interface Track {
  key: string;
  label: string;
  /** Mean within-window coefficient of variation, as a percentage. */
  cvPct: number;
  windows: number;
  unit: string;
  average: number;
}

interface Result {
  tracks: Track[];
  steadiest: Track;
  loosest: Track;
}

export const rhythmStabilityWidget = defineWidget<Result>({
  id: "rhythm-stability",
  title: "Rhythm stability",
  description:
    "How much cadence, step length and output wobbled from second to second, measured inside short windows so that drift across the run is not what is being reported.",
  section: "lab",
  status: "beta",
  // Cadence is recorded; step length is arithmetic on it; the variability
  // figures are ordinary statistics on both. Nothing is modelled — but power,
  // where present, is, which is why this sits at derived rather than measured.
  provenance: "derived",
  requiredMetrics: ["cadence"],
  references: [RESEARCH.economyMetaAnalysis, RESEARCH.marathonDurability],

  compute(activity) {
    const samples = movingSamples(activity);

    const tracks: Track[] = [];
    const add = (
      key: string,
      label: string,
      unit: string,
      pick: (sample: Sample) => number | undefined,
    ) => {
      const track = variabilityOf(samples, pick);
      if (track) tracks.push({ key, label, unit, ...track });
    };

    add("cadence", "Cadence", "spm", runningCadenceOf);
    add("stride", "Step length", "m", stepLengthOf);
    add("power", "Power", "W", (sample) => sample.powerW);

    if (tracks.length === 0) return null;

    const ranked = [...tracks].sort((a, b) => a.cvPct - b.cvPct);
    return { tracks, steadiest: ranked[0], loosest: ranked[ranked.length - 1] };
  },

  narrate(result) {
    const { tracks, steadiest, loosest } = result;
    const single = tracks.length === 1;

    return {
      information: tracks.map((track) => ({
        label: track.label,
        value: `${track.cvPct.toFixed(1)}%`,
        note: "variation within 30 s",
      })),

      observations: [
        {
          text: `Measured inside thirty-second windows, ${tracks
            .map((track) => `${track.label.toLowerCase()} varied by ${track.cvPct.toFixed(1)}%`)
            .join(", ")}.`,
        },
        ...(single
          ? []
          : [
              {
                text: `${steadiest.label} was the steadiest of the ${tracks.length} and ${loosest.label.toLowerCase()} the most variable.`,
              },
            ]),
      ],

      explanations: [
        {
          text: single
            ? `There is one measurement here to describe, so there is nothing to rank it against. The figure is worth keeping rather than reading: it becomes meaningful when there is a second run to set beside it.`
            : `Within this run, ${loosest.label.toLowerCase()} moved around roughly ${(loosest.cvPct / Math.max(0.1, steadiest.cvPct)).toFixed(1)} times as much as ${steadiest.label.toLowerCase()}. That ordering is worth noting, but no figure here can be called good or bad: what counts as a steady rhythm differs by runner, pace and ground, and establishing yours would take ten or twenty runs — which this app cannot yet hold, because it reads one run at a time.`,
          // Deliberately capped: without a personal baseline this is an
          // observation about one run and not evidence of anything.
          confidence: "low",
          relatedMetrics: ["cadence"],
        },
      ],

      teaching: [
        {
          title: "Wobble is not drift",
          text: "These are two different faults and they need separating. Drift is the slow slide across a run that the durability cards measure — cadence at the end lower than at the start. Wobble is how unsettled the rhythm was moment to moment while that was happening. A run can drift badly while staying perfectly smooth, or hold its average while being ragged the whole way. Measuring variation inside short windows and averaging those is what isolates the second from the first.",
        },
        {
          title: "Why there is no score out of a hundred",
          text: "It would be easy to fold these into one figure and call it 91. Doing so would require deciding what counts as steady, and that threshold does not exist outside a particular runner on particular ground — a trail run through woodland is legitimately more variable than a track session, and neither is worse running. A score would hide that judgement inside a number that looks objective. Your own figures across many runs are the only honest comparison, which is the version worth building next.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { tracks } = result;
    const scale = Math.max(...tracks.map((track) => track.cvPct), 1);

    return (
      <div>
        <p className={shared.trackLabel}>Variation within thirty seconds</p>
        <ProportionBars
          rows={tracks.map((track) => ({
            id: track.key,
            label: track.label,
            fraction: track.cvPct / scale,
            valueLabel: `${track.cvPct.toFixed(1)}%`,
            color:
              track.key === "cadence"
                ? "var(--zone-4)"
                : track.key === "stride"
                  ? "var(--zone-2)"
                  : "var(--zone-5)",
            detail: `${track.windows} windows`,
          }))}
        />

        <MetricRows
          rows={tracks.map((track) => ({
            label: `${track.label} average`,
            value: `${track.average.toFixed(track.unit === "m" ? 2 : 0)} ${track.unit}`,
            detail: `± ${((track.cvPct / 100) * track.average).toFixed(track.unit === "m" ? 2 : 1)} ${track.unit} within a window`,
          }))}
        />

        <p className={shared.note}>
          Bars are scaled against the largest figure on this card, so their
          lengths compare the three measurements with each other and mean
          nothing on their own.
        </p>
      </div>
    );
  },
});

/** Metres of ground per step at a single second, from speed and step rate. */
function stepLengthOf(sample: Sample): number | undefined {
  const cadence = runningCadenceOf(sample);
  if (cadence === undefined || cadence <= 0) return undefined;
  if (sample.speedMps === undefined) return undefined;
  return (sample.speedMps * 60) / cadence;
}

/**
 * Mean within-window coefficient of variation.
 *
 * Each window is scored on its own and the scores averaged, so a run that was
 * steady throughout and a run that was steady in halves at different levels
 * come out the same — which is correct, because the difference between them is
 * drift, and drift belongs to a different card.
 */
function variabilityOf(
  samples: Sample[],
  pick: (sample: Sample) => number | undefined,
): { cvPct: number; windows: number; average: number } | null {
  const coefficients: number[] = [];
  const all: number[] = [];

  for (let start = 0; start + WINDOW_S <= samples.length; start += WINDOW_S) {
    const values: number[] = [];
    for (let i = start; i < start + WINDOW_S; i++) {
      const value = pick(samples[i]);
      if (value !== undefined && Number.isFinite(value)) values.push(value);
    }
    // A window the sensor half missed describes the gap, not the rhythm.
    if (values.length < WINDOW_S * 0.8) continue;

    const windowMean = mean(values);
    if (!Number.isFinite(windowMean) || windowMean <= 0) continue;
    coefficients.push((stdev(values) / windowMean) * 100);
    all.push(...values);
  }

  if (coefficients.length < MIN_WINDOWS) return null;
  return {
    cvPct: mean(coefficients),
    windows: coefficients.length,
    average: mean(all),
  };
}

export default rhythmStabilityWidget;
