import { useMemo } from "react";
import type { DerivedActivity, MetricType, Sample } from "@/model/activity";
import { buildPath, linearScale, type XScale } from "@/viz/scales";
import { collect } from "@/lib/stats";

/**
 * Several metrics stacked on one horizontal position.
 *
 * Each metric gets its own band rather than a shared vertical axis, because
 * the question these charts answer is "what was happening here", not "how many
 * beats per minute against how many metres". Sharing the x-position is the
 * whole point: whatever the cursor sits on, every line above and below it
 * describes the same second of the run.
 *
 * Two cards draw this — the timeline and the flythrough — so it lives here
 * rather than in either of them.
 */

export type MetricBandKey = "heartRate" | "pace" | "elevation";

export interface MetricBand {
  key: MetricBandKey;
  label: string;
  color: string;
  height: number;
}

export interface BandRange {
  min: number;
  max: number;
}

export interface BandRanges {
  heartRate?: BandRange;
  pace?: BandRange;
  elevation?: BandRange;
}

const BAND_HEIGHT = 44;
const BAND_GAP = 2;

const DEFINITIONS: { key: MetricBandKey; label: string; color: string; metric: MetricType }[] = [
  { key: "heartRate", label: "Heart rate", color: "var(--metric-heart)", metric: "heartRate" },
  { key: "pace", label: "Pace", color: "var(--metric-pace)", metric: "pace" },
  { key: "elevation", label: "Elevation", color: "var(--metric-elevation)", metric: "elevation" },
];

/** The bands this run can actually fill, in reading order. */
export function metricBands(activity: DerivedActivity): MetricBand[] {
  return DEFINITIONS.filter((definition) =>
    activity.availableMetrics.has(definition.metric),
  ).map(({ key, label, color }) => ({ key, label, color, height: BAND_HEIGHT }));
}

/** The height a track needs to hold a set of bands. */
export function bandsHeight(bands: MetricBand[]): number {
  if (bands.length === 0) return BAND_HEIGHT;
  return bands.length * BAND_HEIGHT + (bands.length - 1) * BAND_GAP;
}

export function bandRanges(activity: DerivedActivity): BandRanges {
  return {
    heartRate: rangeOf(activity.samples, (s) => s.hrBpm),
    pace: rangeOf(activity.samples, (s) => s.paceSecPerKm),
    elevation: rangeOf(activity.samples, (s) => s.elevationM),
  };
}

export function MetricBands({
  activity,
  bands,
  ranges,
  scale,
}: {
  activity: DerivedActivity;
  bands: MetricBand[];
  ranges: BandRanges;
  scale: XScale;
}) {
  let offset = 0;

  return (
    <g>
      {bands.map((band) => {
        const top = offset;
        offset += band.height + BAND_GAP;
        return (
          <SingleBand
            key={band.key}
            band={band}
            activity={activity}
            range={ranges[band.key]}
            scale={scale}
            top={top}
          />
        );
      })}
    </g>
  );
}

/**
 * One metric's line.
 *
 * The path is memoised because the flythrough re-renders this on every frame
 * while it plays, and none of what goes into the path — the run, the width,
 * where the band sits — moves when the cursor does.
 */
function SingleBand({
  band,
  activity,
  range,
  scale,
  top,
}: {
  band: MetricBand;
  activity: DerivedActivity;
  range: BandRange | undefined;
  scale: XScale;
  top: number;
}) {
  const line = useMemo(() => {
    if (!range) return "";
    const inner = band.height - 6;
    const baseline = top + band.height - 3;
    // Pace is inverted: a faster pace is a smaller number but should sit higher.
    const invert = band.key === "pace";
    const y = linearScale(
      invert ? range.max : range.min,
      invert ? range.min : range.max,
      baseline,
      baseline - inner,
    );

    const pick = (sample: Sample): number | undefined =>
      band.key === "heartRate"
        ? sample.hrBpm
        : band.key === "pace"
          ? sample.paceSecPerKm
          : sample.elevationM;

    const step = Math.max(1, Math.floor(activity.samples.length / 900));
    const points: { x: number; y: number | undefined }[] = [];
    for (let i = 0; i < activity.samples.length; i += step) {
      const value = pick(activity.samples[i]);
      points.push({
        x: scale.toPixels(activity.samples[i].t),
        y: value === undefined ? undefined : y(value),
      });
    }
    return buildPath(points);
  }, [activity, band.height, band.key, range, scale, top]);

  if (!range || !line) return null;

  const baseline = top + band.height - 3;
  // Elevation is the only one filled: it reads as ground, and ground is the
  // one of the three that has something underneath it.
  const area =
    band.key === "elevation" ? `${line}L${scale.width} ${baseline}L0 ${baseline}Z` : undefined;

  return (
    <g>
      {area && <path d={area} fill={band.color} fillOpacity={0.16} />}
      <path
        d={line}
        fill="none"
        stroke={band.color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function rangeOf(
  samples: Sample[],
  pick: (sample: Sample) => number | undefined,
): BandRange | undefined {
  const values = collect(samples, pick);
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series still needs a range or the line would sit on the edge.
  if (max - min < 1e-6) return { min: min - 1, max: max + 1 };
  return { min, max };
}
