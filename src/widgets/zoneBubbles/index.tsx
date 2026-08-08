import { defineWidget } from "../contract";
import type { HrZone } from "@/model/activity";
import { ALL_ZONES, zoneBoundsBpm, zoneDefinition } from "@/model/zones";
import { BubbleRow, Legend } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import { findRuns, MIN_MEANINGFUL_ZONE_RUN_S, ZONE_COLORS } from "../helpers";
import { formatDuration, formatDurationWords, formatPercent } from "@/lib/format";
import shared from "../shared.module.css";

/**
 * How the run's effort was distributed across zones.
 *
 * Bubble area carries the time, so the shape of the effort is visible before
 * any number is read. Selecting a bubble highlights every section of the run
 * spent in that zone.
 */

interface ZoneStat {
  zone: HrZone;
  seconds: number;
  fraction: number;
  entries: number;
  longestRunS: number;
  firstT?: number;
  lastT?: number;
  fromBpm: number;
  toBpm: number;
}

interface Result {
  zones: ZoneStat[];
  totalSeconds: number;
  dominant: ZoneStat;
}

export const zoneBubblesWidget = defineWidget<Result>({
  id: "heart-rate-zones",
  title: "Heart-rate zones",
  description: "Where the effort of this run actually sat.",
  section: "heart",
  requiredMetrics: ["heartRate", "hrZone"],

  compute(activity) {
    const maxHr = activity.maxHrUsed;
    if (!maxHr) return null;

    const runs = findRuns(activity.samples, (s) => s.hrZone);
    const totalSeconds = Object.values(activity.summary.zoneTime).reduce((a, b) => a + b, 0);
    if (totalSeconds === 0) return null;

    const zones: ZoneStat[] = ALL_ZONES.map((zone) => {
      const zoneRuns = runs.filter((run) => run.value === zone);
      // Only stretches long enough to be a change of effort count as entries.
      // Heart rate wandering across a boundary produces one-second crossings by
      // the dozen, and counting those turns a single sustained effort into
      // fourteen of them. The time in the zone is unaffected — those seconds
      // were really spent there; it is calling each of them an entry that is
      // wrong.
      const sustained = zoneRuns.filter(
        (run) => run.durationS >= MIN_MEANINGFUL_ZONE_RUN_S,
      );
      const seconds = activity.summary.zoneTime[zone];
      const bounds = zoneBoundsBpm(zone, maxHr);
      return {
        zone,
        seconds,
        fraction: seconds / totalSeconds,
        entries: sustained.length,
        longestRunS: zoneRuns.reduce((best, run) => Math.max(best, run.durationS), 0),
        firstT: zoneRuns[0]?.startT,
        lastT: zoneRuns[zoneRuns.length - 1]?.endT,
        fromBpm: bounds.from,
        toBpm: bounds.to,
      };
    }).filter((stat) => stat.seconds > 0);

    if (zones.length === 0) return null;

    const dominant = zones.reduce((a, b) => (b.seconds > a.seconds ? b : a));
    return { zones, totalSeconds, dominant };
  },

  narrate(result, activity) {
    const { dominant } = result;
    const sorted = [...result.zones].sort((a, b) => b.seconds - a.seconds);
    const second = sorted[1];

    const observations = [
      {
        text: `${formatPercent(dominant.fraction)} of the recorded heart rate sat in Zone ${dominant.zone}${
          second
            ? `, with ${formatPercent(second.fraction)} in Zone ${second.zone}`
            : ""
        }.`,
      },
    ];

    const highZones = result.zones.filter((z) => z.zone >= 4);
    const highSeconds = highZones.reduce((a, z) => a + z.seconds, 0);
    if (highSeconds > 0) {
      const entries = highZones.reduce((a, z) => a + z.entries, 0);
      observations.push({
        text: `${formatDurationWords(highSeconds)} was spent in Zone 4 or above${
          entries > 0
            ? `, across ${entries} ${entries === 1 ? "stretch" : "separate stretches"} of at least ${MIN_MEANINGFUL_ZONE_RUN_S} seconds`
            : `, though never for ${MIN_MEANINGFUL_ZONE_RUN_S} seconds together — heart rate crossed the boundary repeatedly rather than settling above it`
        }.`,
      });
    }

    return {
      information: result.zones.map((zone) => ({
        label: `Zone ${zone.zone}`,
        value: formatDuration(zone.seconds),
        note: `${zone.fromBpm}–${zone.toBpm} bpm`,
      })),
      observations,
      explanations: activity.maxHrIsEstimated
        ? [
            {
              text: `These boundaries come from an estimated maximum of ${activity.maxHrUsed} bpm. If your real maximum is higher, this run sat in lower zones than shown here.`,
              confidence: "low" as const,
              relatedMetrics: ["heartRate" as const, "hrZone" as const],
            },
          ]
        : [],
      teaching: [
        {
          title: "What a heart-rate zone is",
          text: "Zones divide the range between rest and your maximum into bands, so effort can be described without quoting a number. They are a convention rather than a physiological boundary, and they only mean anything once the maximum they are based on is close to your real one.",
        },
      ],
    };
  },

  View({ result }) {
    const highlight = useSelectionStore((state) => state.highlight);
    const setHighlight = useSelectionStore((state) => state.setHighlight);

    const selectedZone = highlight?.kind === "zone" ? highlight.zone : undefined;

    return (
      <div>
        <BubbleRow
          bubbles={result.zones.map((zone) => ({
            id: String(zone.zone),
            label: `Zone ${zone.zone}`,
            value: zone.seconds,
            valueLabel: formatDuration(zone.seconds),
            subLabel: formatPercent(zone.fraction),
            color: ZONE_COLORS[zone.zone],
            selected: selectedZone === zone.zone,
          }))}
          onSelect={(id) => {
            const zone = Number(id);
            setHighlight(selectedZone === zone ? null : { kind: "zone", zone });
          }}
        />

        <Legend
          items={result.zones.map((zone) => ({
            label: `Zone ${zone.zone} · ${zone.fromBpm}–${zone.toBpm} bpm`,
            color: ZONE_COLORS[zone.zone],
          }))}
        />

        <p className={shared.note}>
          {selectedZone
            ? `Zone ${selectedZone} is highlighted across the page. ${zoneDefinition(selectedZone as HrZone).description}`
            : "Select a zone to highlight those sections on the timeline and route."}
        </p>
      </div>
    );
  },
});

export default zoneBubblesWidget;
