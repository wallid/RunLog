import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import type { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { defineWidget } from "../contract";
import type { HrZone } from "@/model/activity";
import { Legend, ScaleLegend } from "@/viz/primitives";
import { useSelectionStore } from "@/state/selectionStore";
import { ZONE_COLORS } from "../helpers";
import { bounds as trackBounds } from "@/lib/geo";
import { collect, median } from "@/lib/stats";
import { formatDistance, formatDistanceShort, formatElevation } from "@/lib/format";
import shared from "../shared.module.css";
import styles from "./RouteMap.module.css";

/**
 * The route on a real map, coloured by effort.
 *
 * The polyline is split into one segment per contiguous zone so the colour
 * carries the same meaning it does everywhere else on the page, and a marker
 * follows the shared cursor so a moment in the data has a place on the ground.
 */

interface Segment {
  positions: LatLngExpression[];
  color: string;
  zone?: HrZone;
}

interface Result {
  segments: Segment[];
  positions: LatLngExpression[];
  bounds: LatLngBoundsExpression;
  colouredBy: "zone" | "pace";
  centre: LatLngExpression;
}

/** Drawing every GPS point is wasted work at map scale. */
const MAX_POINTS = 1200;

export const routeMapWidget = defineWidget<Result>({
  id: "route-map",
  title: "The route",
  description: "Where the run went, coloured by effort.",
  section: "story",
  requiredMetrics: ["position"],

  compute(activity) {
    const located = activity.samples.filter(
      (sample) => sample.lat !== undefined && sample.lon !== undefined,
    );
    if (located.length < 10) return null;

    const box = trackBounds(
      located.map((s) => ({ lat: s.lat!, lon: s.lon! })),
    );
    if (!box) return null;

    const step = Math.max(1, Math.floor(located.length / MAX_POINTS));
    const colouredBy = activity.availableMetrics.has("hrZone") ? "zone" : "pace";
    const medianPace = median(collect(activity.samples, (s) => s.paceSecPerKm));

    const segments: Segment[] = [];
    let current: Segment | null = null;
    let currentKey: string | null = null;
    const positions: LatLngExpression[] = [];

    for (let i = 0; i < located.length; i += step) {
      const sample = located[i];
      const position: LatLngExpression = [sample.lat!, sample.lon!];
      positions.push(position);

      const zone = sample.hrZone;
      const key =
        colouredBy === "zone"
          ? (zone?.toString() ?? "none")
          : paceBucket(sample.paceSecPerKm, medianPace);
      const color =
        colouredBy === "zone"
          ? zone
            ? ZONE_COLORS[zone]
            : "var(--text-muted)"
          : ZONE_COLORS[Number(key) as HrZone] ?? "var(--text-muted)";

      if (current && currentKey === key) {
        current.positions.push(position);
        continue;
      }
      // Repeat the previous point so consecutive segments join without a gap.
      const opening: LatLngExpression[] = current
        ? [current.positions[current.positions.length - 1], position]
        : [position];
      current = { positions: opening, color, zone };
      currentKey = key;
      segments.push(current);
    }

    return {
      segments,
      positions,
      bounds: [
        [box.south, box.west],
        [box.north, box.east],
      ],
      colouredBy,
      centre: [(box.south + box.north) / 2, (box.west + box.east) / 2],
    };
  },

  narrate(_result, activity) {
    const located = activity.samples.filter((s) => s.lat !== undefined);
    const start = located[0];
    const end = located[located.length - 1];
    // Within roughly a hundred metres of the start counts as a loop.
    const isLoop =
      start !== undefined &&
      end !== undefined &&
      Math.abs(start.lat! - end.lat!) < 0.001 &&
      Math.abs(start.lon! - end.lon!) < 0.001;

    return {
      information: [
        { label: "Distance", value: formatDistance(activity.distanceM) },
        {
          label: "Elevation range",
          value:
            activity.summary.minElevationM !== undefined
              ? `${formatElevation(activity.summary.minElevationM)} – ${formatElevation(activity.summary.maxElevationM)}`
              : "—",
        },
        { label: "Shape", value: isLoop ? "Loop" : "Point to point" },
      ],
      observations: [
        {
          text: isLoop
            ? "The run finished within a hundred metres of where it started, so it was effectively a loop."
            : "The run finished away from where it started.",
        },
      ],
      explanations: [],
      teaching: [
        {
          title: "Reading effort on a map",
          text: "Colouring the route by effort rather than drawing a plain line lets you see where the hard parts of a run actually were on the ground. That is often more revealing than the elevation profile, because it shows the corners, surfaces and exposed stretches a profile leaves out.",
        },
      ],
    };
  },

  View({ result, activity }) {
    const cursorT = useSelectionStore((state) => state.cursorT);
    const highlight = useSelectionStore((state) => state.highlight);
    const setCursor = useSelectionStore((state) => state.setCursor);
    const selectedZone = highlight?.kind === "zone" ? highlight.zone : undefined;

    const cursorPosition = useMemo((): LatLngExpression | null => {
      if (cursorT === null) return null;
      const index = Math.max(0, Math.min(activity.samples.length - 1, Math.round(cursorT)));
      const sample = activity.samples[index];
      if (sample?.lat === undefined || sample.lon === undefined) return null;
      return [sample.lat, sample.lon];
    }, [cursorT, activity.samples]);

    const startPosition = result.positions[0];
    const endPosition = result.positions[result.positions.length - 1];

    return (
      <div>
        <div className={styles.mapShell}>
          <MapContainer
            bounds={result.bounds}
            boundsOptions={{ padding: [24, 24] }}
            scrollWheelZoom={false}
            // A map inside a scrolling article is a trap on a phone: a swipe
            // that starts on it pans the map instead of moving the page, and
            // there is no way to tell beforehand which one you will get. The
            // route is already fitted to the frame, so dragging is a
            // convenience rather than the point — it is dropped where the
            // pointer is coarse, and the zoom control still works.
            dragging={!coarsePointer()}
            className={styles.map}
            attributionControl
          >
            <TileLayer
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              maxZoom={19}
            />

            {result.segments.map((segment, index) => (
              <Polyline
                key={index}
                positions={segment.positions}
                pathOptions={{
                  color: segment.color,
                  weight:
                    selectedZone !== undefined && segment.zone === selectedZone ? 7 : 4,
                  opacity:
                    selectedZone !== undefined && segment.zone !== selectedZone ? 0.25 : 0.9,
                  lineCap: "round",
                  lineJoin: "round",
                }}
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

            {cursorPosition && (
              <CircleMarker
                center={cursorPosition}
                radius={8}
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

        {result.colouredBy === "zone" ? (
          <Legend
            label="Line colour shows heart-rate zone"
            items={[
              ...zonesDrawn(result.segments).map((zone) => ({
                label: `Zone ${zone}`,
                color: ZONE_COLORS[zone],
              })),
              ...(result.segments.some((segment) => segment.zone === undefined)
                ? [{ label: "No reading", color: "var(--text-muted)" }]
                : []),
            ]}
          />
        ) : (
          <ScaleLegend
            label="Line colour shows pace"
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
          {cursorT !== null && (
            <>
              <span>
                <span className={styles.dotCursor} aria-hidden="true" /> Cursor
              </span>
              <button type="button" className={styles.clear} onClick={() => setCursor(null)}>
                Hide cursor
              </button>
            </>
          )}
        </div>

        <p className={shared.note}>
          {result.colouredBy === "zone"
            ? "The line uses the same zone colours as the rest of the page."
            : "Pace is compared against this run's own median, not against a target."}{" "}
          {cursorT !== null &&
            `The cursor marker is at ${formatDistanceShort(activity.samples[Math.round(cursorT)]?.distanceM ?? 0)}.`}
        </p>
      </div>
    );
  },
});

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

/**
 * Whether the pointer is a finger rather than a mouse.
 *
 * Guarded for the server, where the widget is rendered in the tests and there
 * is no `matchMedia` — and where the answer would be meaningless anyway.
 */
function coarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** The zones the polyline actually used, so the key lists only those. */
function zonesDrawn(segments: Segment[]): HrZone[] {
  return [
    ...new Set(segments.flatMap((segment) => (segment.zone ? [segment.zone] : []))),
  ].sort();
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

export default routeMapWidget;
