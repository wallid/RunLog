import { defineWidget } from "../contract";
import type { GradientBucket, GradientCategory } from "@/model/activity";
import { NOISE_FLOOR, TERRAIN_COLORS, terrainHrDeviation } from "../helpers";
import { formatDuration, formatHeartRate, formatPaceWithUnit, formatPower } from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./EffortVersusTerrain.module.css";

/**
 * Pace and effort side by side for each kind of ground.
 *
 * This is the widget that answers "was that slow kilometre the hill or me": if
 * pace falls uphill while heart rate rises, the terrain is doing the work.
 */

interface Result {
  buckets: GradientBucket[];
  flat?: GradientBucket;
  uphill?: GradientBucket;
  downhill?: GradientBucket;
  /** Mean bpm above or below the local baseline, per kind of ground. */
  hrDeviation: Partial<Record<GradientCategory, number>>;
}

const LABELS: Record<GradientCategory, string> = {
  uphill: "Uphill",
  flat: "Flat",
  downhill: "Downhill",
};

/** A category with less time than this cannot support a fair comparison. */
const MIN_SECONDS_FOR_COMPARISON = 30;

export const effortVersusTerrainWidget = defineWidget<Result>({
  id: "effort-versus-terrain",
  title: "Effort against terrain",
  description: "Whether the hills explain the changes in pace and heart rate.",
  section: "terrain",
  requiredMetrics: ["gradient", "pace"],

  compute(activity) {
    const buckets = activity.summary.gradientBuckets.filter(
      (bucket) => bucket.timeS >= MIN_SECONDS_FOR_COMPARISON,
    );
    if (buckets.length < 2) return null;

    return {
      buckets,
      flat: buckets.find((b) => b.category === "flat"),
      uphill: buckets.find((b) => b.category === "uphill"),
      downhill: buckets.find((b) => b.category === "downhill"),
      hrDeviation: terrainHrDeviation(activity),
    };
  },

  narrate(result) {
    const { flat, uphill, downhill } = result;
    const observations = [];
    const explanations = [];

    if (flat?.avgPaceSecPerKm && uphill?.avgPaceSecPerKm) {
      const paceDelta = uphill.avgPaceSecPerKm - flat.avgPaceSecPerKm;
      const uphillDeviation = result.hrDeviation.uphill;
      const flatDeviation = result.hrDeviation.flat;
      const hrDelta =
        uphillDeviation !== undefined && flatDeviation !== undefined
          ? uphillDeviation - flatDeviation
          : undefined;

      // Heart rate is quoted against each stretch's own local baseline, not as a
      // raw bucket average. Raw averages compare the part of the run the hills
      // fell in with the part they did not, which on a drifting run says more
      // about the clock than about the ground.
      const hrPhrase =
        hrDelta === undefined || Math.abs(hrDelta) < NOISE_FLOOR.hrBpm
          ? "heart rate was no different from its level around them"
          : `heart rate ran ${Math.abs(Math.round(hrDelta))} bpm ${hrDelta > 0 ? "above" : "below"} its level around them`;

      observations.push({
        // A difference inside the noise of the sensors is not a difference, and
        // saying "0 seconds per kilometre slower" would imply it was measured.
        text:
          Math.abs(paceDelta) < NOISE_FLOOR.paceSecPerKm
            ? `Uphill and flat ground were run at effectively the same pace, while ${hrPhrase}.`
            : `Uphill pace averaged ${Math.abs(Math.round(paceDelta))} seconds per kilometre ${paceDelta > 0 ? "slower" : "faster"} than flat ground, while ${hrPhrase}.`,
      });

      if (paceDelta > NOISE_FLOOR.paceSecPerKm && hrDelta !== undefined && hrDelta > 2) {
        explanations.push({
          text: "Slowing down while working harder is what climbing normally looks like: the pace difference reflects the ground rather than a drop in effort.",
          confidence: "high" as const,
          relatedMetrics: ["gradient" as const, "pace" as const, "heartRate" as const],
        });
      } else if (paceDelta > NOISE_FLOOR.paceSecPerKm && hrDelta !== undefined && hrDelta <= 0) {
        explanations.push({
          text: "Pace fell uphill without heart rate rising above its level around those stretches, which suggests effort was eased on the climbs rather than held.",
          confidence: "medium" as const,
          relatedMetrics: ["gradient" as const, "pace" as const, "heartRate" as const],
        });
      }
    }

    if (downhill?.avgPaceSecPerKm && flat?.avgPaceSecPerKm) {
      const delta = flat.avgPaceSecPerKm - downhill.avgPaceSecPerKm;
      if (Math.abs(delta) >= NOISE_FLOOR.paceSecPerKm) {
        observations.push({
          text: `Downhill running was ${Math.abs(Math.round(delta))} seconds per kilometre ${delta > 0 ? "faster" : "slower"} than flat.`,
        });
      }
    }

    // Neither comparison firing is itself the finding: the ground this run
    // covered did not separate into kinds that ran differently.
    if (observations.length === 0) {
      observations.push({
        text: `Pace was within ${NOISE_FLOOR.paceSecPerKm} seconds per kilometre across every kind of ground this run covered, so the terrain did not separate into stretches that ran differently.`,
      });
    }

    return {
      information: result.buckets.map((bucket) => ({
        label: LABELS[bucket.category],
        value: formatPaceWithUnit(bucket.avgPaceSecPerKm),
        note: formatDuration(bucket.timeS),
      })),
      observations,
      explanations,
      teaching: [
        {
          title: "Comparing like with like",
          text: "Comparing every kilometre against every other one mixes terrain into the answer. Grouping by gradient first means an uphill kilometre is measured against other uphill running, which is the only way to see whether effort actually changed.",
        },
      ],
    };
  },

  View({ result }) {
    const ordered = (["downhill", "flat", "uphill"] as const)
      .map((category) => result.buckets.find((b) => b.category === category))
      .filter((bucket): bucket is GradientBucket => bucket !== undefined);

    const maxTime = Math.max(...ordered.map((b) => b.timeS), 1);

    return (
      <div>
        <div className={styles.columns}>
          {ordered.map((bucket) => (
            <div key={bucket.category} className={styles.column}>
              <div className={styles.columnHead}>
                <span
                  className={styles.swatch}
                  style={{ background: TERRAIN_COLORS[bucket.category] }}
                  aria-hidden="true"
                />
                <span className={styles.columnTitle}>{LABELS[bucket.category]}</span>
              </div>

              {/* Bar height carries how much of the run each category was, so a
                  comparison built on very little time looks like very little. */}
              <div className={styles.timeBarTrack} aria-hidden="true">
                <div
                  className={styles.timeBar}
                  style={{
                    height: `${Math.max(6, (bucket.timeS / maxTime) * 100)}%`,
                    background: TERRAIN_COLORS[bucket.category],
                  }}
                />
              </div>
              <p className={`${styles.time} numeric`}>{formatDuration(bucket.timeS)}</p>

              <dl className={styles.metrics}>
                <div>
                  <dt>Pace</dt>
                  <dd className="numeric">{formatPaceWithUnit(bucket.avgPaceSecPerKm)}</dd>
                </div>
                {bucket.avgHr !== undefined && (
                  <div>
                    <dt>Heart rate</dt>
                    <dd className="numeric">{formatHeartRate(bucket.avgHr)}</dd>
                  </div>
                )}
                {bucket.avgPowerW !== undefined && (
                  <div>
                    <dt>Power</dt>
                    <dd className="numeric">{formatPower(bucket.avgPowerW)}</dd>
                  </div>
                )}
                {bucket.avgCadenceSpm !== undefined && (
                  <div>
                    <dt>Cadence</dt>
                    <dd className="numeric">{Math.round(bucket.avgCadenceSpm)} spm</dd>
                  </div>
                )}
              </dl>
            </div>
          ))}
        </div>

        <p className={shared.note}>
          Categories with less than thirty seconds of running are left out, because an
          average over a handful of seconds says more about noise than about terrain.
        </p>
      </div>
    );
  },
});

export default effortVersusTerrainWidget;
