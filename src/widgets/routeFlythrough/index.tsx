import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { defineWidget } from "../contract";
import type { HrZone } from "@/model/activity";
import { Track } from "@/viz/Track";
import { Legend, ScaleLegend } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import { CursorReadout, sampleAt } from "../CursorReadout";
import {
  bandRanges,
  bandsHeight,
  MetricBands,
  metricBands,
  type BandRanges,
  type MetricBand,
} from "../MetricBands";
import { BAND_COLORS, bandsUsed, ZONE_COLORS, zoneRegions } from "../helpers";
import { bandDefinition, bandZoneRange, zoneWithBand } from "@/model/zones";
import { bounds as trackBounds } from "@/lib/geo";
import { collect, median } from "@/lib/stats";
import { formatDistanceShort, formatDuration } from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./Flythrough.module.css";

/**
 * The route and the timeline as one instrument.
 *
 * The map says where and the chart says when, and on separate cards a reader
 * has to hold one in their head while looking at the other. Here they are the
 * same control: scrubbing the chart walks a marker along the route, and the
 * part of the route already covered stays lit while the rest of it falls back,
 * so the run reads as something being travelled rather than something drawn.
 * Play does the walking for the reader, which is the only way to see the shape
 * of the whole run — where it slowed, where it climbed — as a single motion.
 *
 * The chart carries the same three metrics the timeline card does, over the
 * same effort shading, because the question this card exists to answer is what
 * a place on the ground cost: a climb in the north-east corner is a fact about
 * the route, and a climb the heart rate answered is a fact about the run.
 */

interface Point {
  t: number;
  position: LatLngExpression;
}

interface Leg {
  /** Index into `points` where this leg begins and ends, inclusive. */
  from: number;
  to: number;
  color: string;
  /** Set only when the route is coloured by zone, so the key can list them. */
  zone?: HrZone;
}

interface Result {
  points: Point[];
  legs: Leg[];
  bounds: LatLngBoundsExpression;
  colouredBy: "zone" | "pace";
  /** The metric lines drawn under the map, and the scales they are drawn on. */
  bands: MetricBand[];
  ranges: BandRanges;
  firstT: number;
  lastT: number;
}

/** Drawing every GPS point is wasted work at map scale. */
const MAX_POINTS = 1200;
/** However long the run was, playing it through takes about this long. */
const PLAY_SECONDS = 24;

export const routeFlythroughWidget = defineWidget<Result>({
  id: "route-flythrough",
  title: "Follow the run",
  description:
    "The route and the timeline joined together: scrub or play, and watch the position move along the map while heart rate, pace and elevation keep up.",
  section: "story",
  requiredMetrics: ["position", "distance"],
  provenance: "measured",

  compute(activity) {
    const located = activity.samples.filter(
      (sample) => sample.lat !== undefined && sample.lon !== undefined,
    );
    if (located.length < 10) return null;

    const box = trackBounds(located.map((s) => ({ lat: s.lat!, lon: s.lon! })));
    if (!box) return null;

    const step = Math.max(1, Math.floor(located.length / MAX_POINTS));
    const colouredBy = activity.availableMetrics.has("hrZone") ? "zone" : "pace";
    const medianPace = median(collect(activity.samples, (s) => s.paceSecPerKm));

    const points: Point[] = [];
    const legs: Leg[] = [];
    let currentKey: string | null = null;

    for (let i = 0; i < located.length; i += step) {
      const sample = located[i];
      points.push({ t: sample.t, position: [sample.lat!, sample.lon!] });
      const index = points.length - 1;

      const key =
        colouredBy === "zone"
          ? (sample.hrZone?.toString() ?? "none")
          : paceBucket(sample.paceSecPerKm, medianPace);

      if (currentKey === key && legs.length > 0) {
        legs[legs.length - 1].to = index;
        continue;
      }
      // Legs overlap by a point so consecutive colours join without a gap.
      legs.push({
        from: Math.max(0, index - 1),
        to: index,
        color:
          key === "none"
            ? "var(--text-muted)"
            : ZONE_COLORS[Number(key) as HrZone] ?? "var(--text-muted)",
        zone: colouredBy === "zone" ? sample.hrZone : undefined,
      });
      currentKey = key;
    }

    return {
      points,
      legs,
      bounds: [
        [box.south, box.west],
        [box.north, box.east],
      ],
      colouredBy,
      bands: metricBands(activity),
      ranges: bandRanges(activity),
      firstT: activity.samples[0]?.t ?? 0,
      lastT: activity.samples[activity.samples.length - 1]?.t ?? 0,
    };
  },

  narrate(result, activity) {
    return {
      information: [
        { label: "Duration", value: formatDuration(activity.elapsedS) },
        { label: "Distance", value: formatDistanceShort(activity.distanceM) },
        {
          label: "Mapped points",
          value: `${result.points.length}`,
          note: "after thinning for the map",
        },
      ],
      observations: [
        {
          text: `Every position on this card is one moment of the run: the marker on the map, the numbers above the chart, and all three lines on it describe the same second. Playing it through takes about ${PLAY_SECONDS} seconds whatever the run lasted.`,
        },
      ],
      explanations: [],
      teaching: [
        {
          title: "Why place and time belong together",
          text: "A profile tells you a climb happened at four kilometres; a map tells you there is a hill in the north-east corner. Neither tells you they are the same hill. Moving one cursor through both is what turns a set of measurements back into a route you ran — and it is usually where the surprises are, because the parts of a run people misremember are the parts they cannot place.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const cursorT = useSelectionStore((state) => state.cursorT);
    const setCursor = useSelectionStore((state) => state.setCursor);
    const [playing, setPlaying] = useState(false);

    // Playback advances the shared cursor in real seconds of the run per real
    // second of wall clock, so a long run simply moves faster. The loop reads
    // the cursor from the store rather than from a subscription: a reader who
    // grabs the profile mid-play drags the playhead with them instead of
    // fighting it.
    const speed = Math.max(1, (result.lastT - result.firstT) / PLAY_SECONDS);
    const speedRef = useRef(speed);
    speedRef.current = speed;

    useEffect(() => {
      if (!playing) return;
      let frame = 0;
      let previous: number | null = null;

      const tick = (now: number) => {
        const elapsed = previous === null ? 0 : (now - previous) / 1000;
        previous = now;
        const current = useSelectionStore.getState().cursorT ?? result.firstT;
        const next = current + elapsed * speedRef.current;
        if (next >= result.lastT) {
          setCursor(result.lastT);
          setPlaying(false);
          return;
        }
        setCursor(next);
        frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }, [playing, result.firstT, result.lastT, setCursor]);

    const play = () => {
      // Reaching the end and pressing play again starts over rather than
      // sitting still at the finish.
      if (cursorT === null || cursorT >= result.lastT - 1) setCursor(result.firstT);
      setPlaying(true);
    };

    // How far along the thinned point list the cursor has reached, or null for
    // no cursor at all — which lights the whole route, so the card at rest
    // looks like a map rather than an unfinished one.
    const covered = useMemo(() => {
      if (cursorT === null) return null;
      let index = 0;
      while (index < result.points.length - 1 && result.points[index + 1].t <= cursorT) {
        index++;
      }
      return index;
    }, [cursorT, result.points]);

    const sample = sampleAt(activity, cursorT);
    const markerPosition: LatLngExpression | null =
      sample?.lat !== undefined && sample.lon !== undefined
        ? [sample.lat, sample.lon]
        : null;

    const allPositions = useMemo(
      () => result.points.map((point) => point.position),
      [result.points],
    );

    const startPosition = allPositions[0];
    const endPosition = allPositions[allPositions.length - 1];

    return (
      <div>
        <div className={styles.mapShell}>
          <MapContainer
            bounds={result.bounds}
            boundsOptions={{ padding: [24, 24] }}
            scrollWheelZoom={false}
            // Same trade as the route card: on a touch screen a swipe that
            // lands on the map would pan it instead of scrolling the article,
            // and the route is already fitted to the frame.
            dragging={!coarsePointer()}
            className={styles.map}
            attributionControl
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            {/* The whole route, faint, so the ground still ahead is visible. */}
            <Polyline
              positions={allPositions}
              pathOptions={{
                color: "var(--text-muted)",
                weight: 3,
                opacity: 0.3,
                lineCap: "round",
                lineJoin: "round",
              }}
            />

            {result.legs.map((leg, index) => (
              <RouteLeg
                key={index}
                positions={allPositions}
                leg={leg}
                to={covered === null ? leg.to : Math.min(leg.to, covered)}
              />
            ))}

            {startPosition && (
              <CircleMarker
                center={startPosition}
                radius={6}
                pathOptions={{
                  color: "var(--surface-card)",
                  fillColor: "var(--confidence-high)",
                  fillOpacity: 1,
                  weight: 2,
                }}
              />
            )}
            {endPosition && (
              <CircleMarker
                center={endPosition}
                radius={6}
                pathOptions={{
                  color: "var(--surface-card)",
                  fillColor: "var(--text-primary)",
                  fillOpacity: 1,
                  weight: 2,
                }}
              />
            )}

            {markerPosition && (
              <CircleMarker
                center={markerPosition}
                radius={9}
                pathOptions={{
                  color: "var(--surface-card)",
                  fillColor: "var(--accent)",
                  fillOpacity: 1,
                  weight: 3,
                }}
              />
            )}

            <FitBounds bounds={result.bounds} />
          </MapContainer>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={styles.play}
            onClick={() => (playing ? setPlaying(false) : play())}
            aria-label={playing ? "Pause the run" : "Play the run"}
          >
            <span className={playing ? styles.pauseIcon : styles.playIcon} aria-hidden="true" />
            {playing ? "Pause" : "Play the run"}
          </button>
          <span className={styles.position}>
            {sample
              ? `${formatDistanceShort(sample.distanceM)} of ${formatDistanceShort(activity.distanceM)}`
              : "Drag the chart, or press play"}
          </span>
          {cursorT !== null && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setPlaying(false);
                setCursor(null);
              }}
            >
              Reset
            </button>
          )}
        </div>

        {result.colouredBy === "zone" ? (
          <Legend
            label="The route on the map is coloured by the zone it was run in"
            items={[
              ...zonesDrawn(result.legs).map((zone) => ({
                label: zoneWithBand(zone),
                color: ZONE_COLORS[zone],
              })),
              ...(result.legs.some((leg) => leg.zone === undefined)
                ? [{ label: "No reading", color: "var(--text-muted)" }]
                : []),
            ]}
          />
        ) : (
          <ScaleLegend
            label="The route on the map is coloured by pace"
            steps={[1, 2, 3, 4, 5].map((step) => ZONE_COLORS[step as HrZone])}
            lowLabel="Slower than median"
            highLabel="Faster than median"
          />
        )}

        <div className={styles.markers}>
          <span>
            <span className={styles.dotStart} aria-hidden="true" /> Start
          </span>
          <span>
            <span className={styles.dotEnd} aria-hidden="true" /> Finish
          </span>
          <span>
            <span className={styles.dotCursor} aria-hidden="true" /> You are here
          </span>
          <span>
            <span className={styles.dotAhead} aria-hidden="true" /> Still to come
          </span>
        </div>

        <CursorReadout
          activity={activity}
          sample={sample}
          idleText="Press play, or drag the chart below, to move along the route."
        />

        <div className={styles.trackSlot}>
          <Track
            activity={activity}
            height={bandsHeight(result.bands)}
            widgetId="route-flythrough"
            showAxis
            ariaLabel="Position along the run. Use arrow keys to move along the route."
            regions={[
              ...zoneRegions(activity),
              // Drawn last of the regions behind the lines, so the covered
              // ground reads on top of the effort washes rather than under
              // them: it is about where the reader is, not about the run.
              ...(cursorT === null
                ? []
                : [
                    {
                      startT: result.firstT,
                      endT: cursorT,
                      color: "color-mix(in srgb, var(--accent) 12%, transparent)",
                      behind: true,
                    },
                  ]),
            ]}
          >
            {(scale) => (
              <MetricBands
                activity={activity}
                bands={result.bands}
                ranges={result.ranges}
                scale={scale}
              />
            )}
          </Track>
        </div>

        <Legend
          label="On the chart: a line per metric, over shading for how hard it was"
          items={[
            ...result.bands.map((band) => ({
              label: band.label,
              color: band.color,
              shape: "line" as const,
            })),
            ...bandsUsed(activity).map((band) => ({
              label: `${bandDefinition(band).name} · ${bandZoneRange(band)}`,
              color: BAND_COLORS[band],
            })),
          ]}
        />

        <p className={shared.note}>
          The three lines share one horizontal position with the map marker, so
          everything on this card describes the same second of the run. The
          cursor is shared with the rest of the page too, and moving it here
          moves it on every other card.
        </p>
      </div>
    );
  },
});

/**
 * One coloured stretch of the route, drawn only as far as the reader has got.
 *
 * The slice is memoised on where it ends because playback re-renders this card
 * on every frame: a leg the cursor has already passed hands Leaflet the exact
 * same array it had last time, so only the leg under the marker is ever
 * rebuilt, rather than all of them sixty times a second.
 */
function RouteLeg({
  positions,
  leg,
  to,
}: {
  positions: LatLngExpression[];
  leg: Leg;
  to: number;
}) {
  const drawn = useMemo(
    () => positions.slice(leg.from, to + 1),
    [positions, leg.from, to],
  );
  if (to <= leg.from) return null;
  return (
    <Polyline
      positions={drawn}
      pathOptions={{
        color: leg.color,
        weight: 5,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round",
      }}
    />
  );
}

/**
 * Keeps the viewport on the route once the container has its real size.
 *
 * Leaflet measures its container on creation, which in a flex column can happen
 * before layout settles, leaving the map zoomed to the wrong place.
 */
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

/** Whether the pointer is a finger rather than a mouse. */
function coarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** The zones the route actually used, so the key lists only those. */
function zonesDrawn(legs: Leg[]): HrZone[] {
  return [...new Set(legs.flatMap((leg) => (leg.zone ? [leg.zone] : [])))].sort();
}

/** Buckets pace into the same five steps the zone ramp uses. */
function paceBucket(pace: number | undefined, medianPace: number): string {
  if (pace === undefined || !Number.isFinite(medianPace)) return "none";
  const ratio = pace / medianPace;
  if (ratio < 0.9) return "5";
  if (ratio < 0.97) return "4";
  if (ratio <= 1.03) return "3";
  if (ratio <= 1.1) return "2";
  return "1";
}

export default routeFlythroughWidget;
