/** Display formatting. The app speaks in minutes per kilometre and metric distance. */

/** Pace above this is shown as a ceiling rather than a number — usually a stop. */
export const PACE_CEILING_SEC_PER_KM = 900;

/** "7:16" from 436 seconds per kilometre. */
export function formatPace(secPerKm: number | undefined): string {
  if (secPerKm === undefined || !Number.isFinite(secPerKm)) return "—";
  if (secPerKm >= PACE_CEILING_SEC_PER_KM) return "15:00+";
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  if (seconds === 60) return `${minutes + 1}:00`;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** "7:16/km" */
export function formatPaceWithUnit(secPerKm: number | undefined): string {
  const pace = formatPace(secPerKm);
  return pace === "—" ? pace : `${pace}/km`;
}

/** "1:04:22" for hours, "20:45" below an hour. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.round(Math.max(0, seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** "1 min 18 sec" — for prose inside observations. */
export function formatDurationWords(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const total = Math.round(Math.max(0, seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} sec`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

/** "10.02 km" — switches to metres below 1 km. */
export function formatDistance(metres: number | undefined): string {
  if (metres === undefined || !Number.isFinite(metres)) return "—";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
}

/** "6.2 km" — one decimal, for positions inside prose. */
export function formatDistanceShort(metres: number | undefined): string {
  if (metres === undefined || !Number.isFinite(metres)) return "—";
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(1)} km`;
}

export function formatElevation(metres: number | undefined): string {
  if (metres === undefined || !Number.isFinite(metres)) return "—";
  return `${Math.round(metres)} m`;
}

export function formatHeartRate(bpm: number | undefined): string {
  if (bpm === undefined || !Number.isFinite(bpm)) return "—";
  return `${Math.round(bpm)} bpm`;
}

export function formatPower(watts: number | undefined): string {
  if (watts === undefined || !Number.isFinite(watts)) return "—";
  return `${Math.round(watts)} W`;
}

export function formatCadence(spm: number | undefined): string {
  if (spm === undefined || !Number.isFinite(spm)) return "—";
  return `${Math.round(spm)} spm`;
}

export function formatGradient(percent: number | undefined): string {
  if (percent === undefined || !Number.isFinite(percent)) return "—";
  return `${percent >= 0 ? "" : "−"}${Math.abs(percent).toFixed(1)}%`;
}

export function formatPercent(fraction: number | undefined, digits = 0): string {
  if (fraction === undefined || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** "+9 bpm" / "−28 s/km" — signed deltas read more clearly with an explicit sign. */
export function formatSigned(value: number, unit: string, digits = 0): string {
  // The sign is taken from the rounded figure rather than the raw one, so a
  // difference too small to show does not print as "−0". A minus sign standing
  // in front of a zero reads as a fall that the number then denies.
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  return `${sign}${Math.abs(rounded).toFixed(digits)} ${unit}`;
}

/**
 * A pace difference, spoken for a sentence.
 *
 * Small gaps read naturally in seconds ("28 seconds per kilometre"), but a gap
 * of several minutes does not — "405 seconds per kilometre" is a number nobody
 * can picture, so past a minute it switches to minutes and seconds.
 */
export function formatPaceDelta(secPerKm: number): string {
  const seconds = Math.abs(Math.round(secPerKm));
  if (seconds < 90) return `${seconds} seconds per kilometre`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  const minutePart = `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  return remainder === 0
    ? `${minutePart} per kilometre`
    : `${minutePart} ${remainder} seconds per kilometre`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatTimeOfDay(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
