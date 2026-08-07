import { defineWidget } from "../contract";
import type { DerivedActivity, Split } from "@/model/activity";
import {
  compassPoint,
  windAtRunnerHeight,
  windComponents,
  type RunWeather,
} from "@/model/weather";
import { bearingDegrees } from "@/lib/geo";
import { HeroFigure, MetricRows, ProportionBars } from "@/viz/primitives";
import { formatDuration, formatPaceWithUnit } from "@/lib/format";
import { LAB_IS_PROVISIONAL, RESEARCH } from "../labHelpers";
import shared from "../shared.module.css";

/**
 * Which way you were facing when the wind blew.
 *
 * A route is not a direction — it is a hundred directions, and the same wind is
 * a headwind on the way out and a tailwind on the way back. Averaging it across
 * the whole run gives roughly zero on any loop, which is exactly why a single
 * "wind: 18 km/h" figure explains nothing about a run.
 *
 * So this works kilometre by kilometre: the bearing of each split against the
 * direction the wind was coming from, giving the part of the wind that was
 * actually opposing the runner over that stretch. That is the figure that can
 * be set beside a slow kilometre, and it is the one the stride card needs in
 * order to stop hedging about headwinds.
 */

/** Below this the wind is not worth naming as an influence on a split. */
const MEANINGFUL_HEADWIND_KMH = 6;

interface SplitWind {
  split: Split;
  bearingDegrees: number;
  /** Positive is wind against you, in km/h at running height. */
  headwindKmh: number;
  crosswindKmh: number;
}

interface Result {
  weather: RunWeather;
  windSpeedKmh: number;
  windFromDegrees: number;
  splits: SplitWind[];
  intoWind: SplitWind[];
  behind: SplitWind[];
  /** The most into-the-wind kilometre, when one stands out. */
  hardest?: SplitWind;
  easiest?: SplitWind;
}

export const windOnRouteWidget = defineWidget<Result>({
  id: "wind-on-route",
  title: "Wind on the route",
  description:
    "The part of the wind that was actually against you, kilometre by kilometre, from the direction each one faced.",
  section: "lab",
  status: "beta",
  // The wind comes from a weather model on a coarse grid, and is corrected from
  // ten metres to running height by an approximation. Nothing here was measured
  // anywhere near the runner.
  provenance: "estimated",
  requiredMetrics: ["position", "distance"],
  references: [RESEARCH.economyMetaAnalysis],

  compute(activity) {
    const weather = activity.weather;
    if (!weather) return null;
    if (weather.windSpeedKmh === undefined || weather.windFromDegrees === undefined) {
      return null;
    }

    const windSpeedKmh = windAtRunnerHeight(weather.windSpeedKmh);
    // A breeze is not a story, and the bearing noise on a slow GPS would
    // dominate it anyway.
    if (windSpeedKmh < 3) return null;

    const splits: SplitWind[] = [];
    for (const split of activity.splits) {
      const bearing = splitBearing(activity, split);
      if (bearing === undefined) continue;
      const components = windComponents(windSpeedKmh, weather.windFromDegrees, bearing);
      splits.push({
        split,
        bearingDegrees: bearing,
        headwindKmh: components.headwindKmh,
        crosswindKmh: components.crosswindKmh,
      });
    }

    // One kilometre is a direction, not a route; the card needs a few to say
    // anything about how the wind was met.
    if (splits.length < 2) return null;

    const intoWind = splits.filter((s) => s.headwindKmh >= MEANINGFUL_HEADWIND_KMH);
    const behind = splits.filter((s) => s.headwindKmh <= -MEANINGFUL_HEADWIND_KMH);
    const sorted = [...splits].sort((a, b) => b.headwindKmh - a.headwindKmh);

    return {
      weather,
      windSpeedKmh,
      windFromDegrees: weather.windFromDegrees,
      splits,
      intoWind,
      behind,
      hardest: sorted[0].headwindKmh >= MEANINGFUL_HEADWIND_KMH ? sorted[0] : undefined,
      easiest:
        sorted[sorted.length - 1].headwindKmh <= -MEANINGFUL_HEADWIND_KMH
          ? sorted[sorted.length - 1]
          : undefined,
    };
  },

  narrate(result) {
    const { weather, windSpeedKmh, hardest, easiest, intoWind, behind } = result;
    const from = compassPoint(result.windFromDegrees);

    const observations = [
      {
        text: `The wind was coming from the ${from} at about ${Math.round(weather.windSpeedKmh!)} km/h ten metres up, which is roughly ${Math.round(windSpeedKmh)} km/h at running height.`,
      },
      {
        text: `Of ${result.splits.length} kilometres, ${intoWind.length} faced into it and ${behind.length} had it behind.`,
      },
    ];

    if (hardest && easiest) {
      observations.push({
        text: `Kilometre ${hardest.split.index} ran most directly into it at ${formatPaceWithUnit(hardest.split.paceSecPerKm)}, and kilometre ${easiest.split.index} had the most behind it at ${formatPaceWithUnit(easiest.split.paceSecPerKm)}.`,
      });
    }

    return {
      information: [
        {
          label: "Wind",
          value: `${Math.round(windSpeedKmh)} km/h`,
          note: `from the ${from}, at running height`,
        },
        { label: "Into the wind", value: `${intoWind.length} km` },
        { label: "Wind behind", value: `${behind.length} km` },
      ],

      observations,

      explanations: [buildExplanation(result)],

      teaching: [
        {
          title: "Why an average wind speed tells you nothing",
          text: "On an out-and-back or a loop, the wind that fought you on the way out pushes you home, and the average across the run comes to about zero. That average is what most apps would show. The useful figure is directional: how much of the wind was against you on each part of the route, which is what turns a mysteriously slow kilometre into an explained one.",
        },
        {
          title: "How rough this figure is",
          text: "The wind comes from a weather model on a grid several kilometres wide, reported hourly, at ten metres above the ground. It is scaled down to running height by a standard approximation, but buildings, trees, walls and valleys change wind far more than that correction does — a sheltered lane and an exposed seafront in the same grid cell get the same number here. Read it as the weather of the area, not the air you were running through.",
        },
        LAB_IS_PROVISIONAL,
      ],
    };
  },

  View({ result }) {
    const { splits, hardest, windSpeedKmh } = result;
    const scale = Math.max(windSpeedKmh, 1);

    return (
      <div>
        <HeroFigure
          value={`${Math.round(windSpeedKmh)} km/h`}
          caption={`from the ${compassPoint(result.windFromDegrees)}, at running height`}
          tone={result.intoWind.length > result.behind.length ? "cautious" : "neutral"}
        />

        <p className={shared.trackLabel}>Wind against you, kilometre by kilometre</p>
        <ProportionBars
          rows={splits.map((entry) => ({
            id: `km-${entry.split.index}`,
            label: `Kilometre ${entry.split.index}`,
            // Only the opposing part fills a bar; a tailwind reads as an empty
            // one rather than as a bar pointing the other way, which a single
            // row of bars cannot honestly show.
            fraction: Math.max(0, entry.headwindKmh) / scale,
            valueLabel:
              entry.headwindKmh >= 0
                ? `${Math.round(entry.headwindKmh)} against`
                : `${Math.round(-entry.headwindKmh)} behind`,
            color:
              entry.headwindKmh >= MEANINGFUL_HEADWIND_KMH
                ? "var(--zone-4)"
                : entry.headwindKmh <= -MEANINGFUL_HEADWIND_KMH
                  ? "var(--zone-2)"
                  : "var(--border-strong)",
            detail: `${formatPaceWithUnit(entry.split.paceSecPerKm)} · heading ${compassPoint(entry.bearingDegrees)}`,
          }))}
        />

        {hardest && (
          <MetricRows
            rows={[
              {
                label: "Most into the wind",
                value: `Kilometre ${hardest.split.index}`,
                detail: `${Math.round(hardest.headwindKmh)} km/h against`,
              },
              {
                label: "Its pace",
                value: formatPaceWithUnit(hardest.split.paceSecPerKm),
                detail: formatDuration(hardest.split.durationS),
              },
            ]}
          />
        )}

        <p className={shared.note}>
          Each kilometre's direction is the bearing from where it started to
          where it ended, so a kilometre that doubled back counts as the net
          direction rather than the ground actually covered.
        </p>
      </div>
    );
  },
});

/**
 * The net direction a split travelled.
 *
 * Start to end rather than the path between, because the wind acts on the
 * runner over the whole kilometre and the net heading is what decides how much
 * of it opposed them. A kilometre that went out and came back has almost no net
 * bearing, which is the honest answer: the wind cancelled over it.
 */
function splitBearing(activity: DerivedActivity, split: Split): number | undefined {
  const first = activity.samples.find(
    (sample) => sample.t >= split.startT && sample.lat !== undefined && sample.lon !== undefined,
  );
  const last = [...activity.samples]
    .reverse()
    .find(
      (sample) => sample.t <= split.endT && sample.lat !== undefined && sample.lon !== undefined,
    );
  if (!first?.lat || !first.lon || !last?.lat || !last.lon) return undefined;
  if (first.t >= last.t) return undefined;
  return bearingDegrees(
    { lat: first.lat, lon: first.lon },
    { lat: last.lat, lon: last.lon },
  );
}

function buildExplanation(result: Result) {
  const { hardest, intoWind, splits } = result;

  if (intoWind.length === 0) {
    return {
      text: "No kilometre faced enough of the wind for it to be worth blaming. Whatever else shaped this run, the wind was not a large part of it.",
      confidence: "medium" as const,
      relatedMetrics: ["pace" as const, "position" as const],
    };
  }

  const intoWindPace =
    intoWind.reduce((acc, entry) => acc + entry.split.paceSecPerKm, 0) / intoWind.length;
  const restPace =
    splits.filter((s) => !intoWind.includes(s)).reduce((acc, e) => acc + e.split.paceSecPerKm, 0) /
    Math.max(1, splits.length - intoWind.length);
  const cost = intoWindPace - restPace;

  if (splits.length - intoWind.length === 0) {
    return {
      text: `Every kilometre faced into the wind, so there is no sheltered stretch of this run to compare them against. A point-to-point route into a headwind is the case this card can describe but cannot measure the cost of.`,
      confidence: "low" as const,
      relatedMetrics: ["pace" as const, "position" as const],
    };
  }

  return {
    text:
      cost > 5
        ? `The kilometres facing the wind averaged ${Math.round(cost)} s/km slower than the rest. That gap is the size a headwind of this strength could account for, though it is not proof it did — the exposed kilometres may also have been the hilly ones, or the tired ones.`
        : `The kilometres facing the wind were not meaningfully slower than the rest${hardest ? `, including kilometre ${hardest.split.index}, which ran most directly into it` : ""}. Either the wind was weaker where you were than the grid says, or you were working harder to hold the pace through it — this card cannot tell those apart.`,
    confidence: "medium" as const,
    relatedMetrics: ["pace" as const, "position" as const],
  };
}

export default windOnRouteWidget;
