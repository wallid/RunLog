/** Great-circle geometry for GPS tracks. */

const EARTH_RADIUS_M = 6371008.8;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Haversine distance in metres between two coordinates. */
export function haversineMetres(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Initial bearing from `a` to `b`, in degrees clockwise from true north.
 *
 * The forward azimuth, which changes along a great circle — but over the tens
 * of metres between two samples of a run the difference is far below anything
 * that matters here.
 */
export function bearingDegrees(a: LatLon, b: LatLon): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLon = (b.lon - a.lon) * toRad;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const degrees = Math.atan2(y, x) / toRad;
  // atan2 returns −180..180; compass bearings are 0..360.
  return (degrees + 360) % 360;
}

/** Cumulative distance in metres along a track. Result length matches `points`. */
export function cumulativeDistance(points: readonly (LatLon | undefined)[]): number[] {
  const out = new Array<number>(points.length).fill(0);
  let total = 0;
  let previous: LatLon | undefined;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p && previous) total += haversineMetres(previous, p);
    if (p) previous = p;
    out[i] = total;
  }
  return out;
}

/** Bounding box of a track, or null when no point has coordinates. */
export function bounds(
  points: readonly (LatLon | undefined)[],
): { south: number; west: number; north: number; east: number } | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const p of points) {
    if (!p) continue;
    if (p.lat < south) south = p.lat;
    if (p.lat > north) north = p.lat;
    if (p.lon < west) west = p.lon;
    if (p.lon > east) east = p.lon;
  }
  return Number.isFinite(south) ? { south, west, north, east } : null;
}
