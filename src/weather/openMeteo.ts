import type { RunWeather, WeatherHour } from "@/model/weather";
import { haversineMetres } from "@/lib/geo";

/**
 * The one request this app makes on the runner's behalf.
 *
 * Everything else in Run Log happens on the machine. This does not, so it is
 * built to the rule that governs anything that leaves: off unless asked for,
 * and sending as little as will still answer the question. With crash
 * reporting gone it is the only such thing left in Settings.
 *
 * The rounding is the whole point and is not cosmetic. Coordinates go out at
 * one decimal place, which is a cell roughly eleven kilometres across — coarser
 * than the weather grid itself, so nothing is lost by it. What leaves the
 * machine is "somewhere in this region, in this hour", which cannot be walked
 * back to a front door. The URL builder is pure and separately tested, because
 * a regression here would silently start sending a route.
 */

/** One decimal place: about 11 km of latitude, coarser than the weather grid. */
export const COORDINATE_DECIMALS = 1;

/** Beyond this the archive is the right source; inside it, recent data is. */
const RECENT_DAYS_LIMIT = 90;

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORDINATE_DECIMALS));
}

const HOURLY_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "wind_speed_10m",
  "wind_direction_10m",
  "precipitation",
].join(",");

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Where to ask, given how long ago the run was.
 *
 * The reanalysis archive trails real time, so a run finished this morning is
 * not in it yet. The forecast endpoint keeps a window of recent past days and
 * covers exactly that gap.
 */
export function buildWeatherUrl(
  lat: number,
  lon: number,
  start: Date,
  end: Date,
  now: Date,
): string {
  const roundedLat = roundCoordinate(lat);
  const roundedLon = roundCoordinate(lon);
  const ageDays = (now.getTime() - end.getTime()) / 86_400_000;

  if (ageDays <= RECENT_DAYS_LIMIT) {
    const pastDays = Math.min(RECENT_DAYS_LIMIT, Math.max(1, Math.ceil(ageDays) + 1));
    return (
      `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}` +
      `&past_days=${pastDays}&forecast_days=1&hourly=${HOURLY_FIELDS}&timezone=UTC`
    );
  }

  return (
    `https://archive-api.open-meteo.com/v1/archive?latitude=${roundedLat}&longitude=${roundedLon}` +
    `&start_date=${isoDate(start)}&end_date=${isoDate(end)}&hourly=${HOURLY_FIELDS}&timezone=UTC`
  );
}

interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    relative_humidity_2m?: (number | null)[];
    apparent_temperature?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    precipitation?: (number | null)[];
  };
}

/** The UTC hours a run touched, as `YYYY-MM-DDTHH` strings. */
export function hoursSpanned(start: Date, end: Date): string[] {
  const hours: string[] = [];
  const cursor = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate(),
      start.getUTCHours(),
    ),
  );
  // A run of any length touches at least the hour it began in.
  while (cursor.getTime() <= end.getTime() && hours.length < 24) {
    hours.push(cursor.toISOString().slice(0, 13));
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  return hours.length > 0 ? hours : [start.toISOString().slice(0, 13)];
}

/** Turns a provider response into the hours this run actually overlapped. */
export function parseWeather(
  body: OpenMeteoResponse,
  lat: number,
  lon: number,
  start: Date,
  end: Date,
): RunWeather | null {
  const hourly = body.hourly;
  if (!hourly?.time) return null;

  const wanted = new Set(hoursSpanned(start, end));
  const hours: WeatherHour[] = [];

  for (let i = 0; i < hourly.time.length; i++) {
    const stamp = hourly.time[i];
    if (!wanted.has(stamp.slice(0, 13))) continue;
    const temperature = hourly.temperature_2m?.[i];
    // Without a temperature the hour carries nothing worth showing; the grid
    // returns nulls for hours it has not been filled in for yet.
    if (temperature === null || temperature === undefined) continue;

    hours.push({
      timeIso: stamp,
      temperatureC: temperature,
      apparentTemperatureC: optional(hourly.apparent_temperature?.[i]),
      humidityPct: optional(hourly.relative_humidity_2m?.[i]),
      windSpeedKmh: optional(hourly.wind_speed_10m?.[i]),
      windFromDegrees: optional(hourly.wind_direction_10m?.[i]),
      precipitationMm: optional(hourly.precipitation?.[i]),
    });
  }

  if (hours.length === 0) return null;

  const requestedLat = roundCoordinate(lat);
  const requestedLon = roundCoordinate(lon);
  const gridLat = body.latitude;
  const gridLon = body.longitude;

  return {
    hours,
    temperatureC: mean(hours.map((hour) => hour.temperatureC))!,
    apparentTemperatureC: mean(collect(hours, (hour) => hour.apparentTemperatureC)),
    humidityPct: mean(collect(hours, (hour) => hour.humidityPct)),
    windSpeedKmh: mean(collect(hours, (hour) => hour.windSpeedKmh)),
    // Directions are angles, so they are averaged as vectors — the mean of 350°
    // and 10° is north, not south.
    windFromDegrees: meanAngle(collect(hours, (hour) => hour.windFromDegrees)),
    precipitationMm: sum(collect(hours, (hour) => hour.precipitationMm)),
    requestedLat,
    requestedLon,
    gridLat,
    gridLon,
    gridDistanceM:
      gridLat !== undefined && gridLon !== undefined
        ? haversineMetres(
            { lat: requestedLat, lon: requestedLon },
            { lat: gridLat, lon: gridLon },
          )
        : undefined,
    provider: "Open-Meteo",
  };
}

/**
 * Asks the provider what the air was doing near a run.
 *
 * Returns null on any failure rather than throwing: weather is a nicety, and a
 * page that refused to render because a third party was down would be a worse
 * product than one that quietly says nothing about the wind.
 */
export async function fetchRunWeather(
  lat: number,
  lon: number,
  start: Date,
  end: Date,
  options: { now?: Date; signal?: AbortSignal } = {},
): Promise<RunWeather | null> {
  const url = buildWeatherUrl(lat, lon, start, end, options.now ?? new Date());
  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) return null;
    return parseWeather((await response.json()) as OpenMeteoResponse, lat, lon, start, end);
  } catch {
    return null;
  }
}

function optional(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : value;
}

function collect(hours: WeatherHour[], pick: (hour: WeatherHour) => number | undefined) {
  return hours.map(pick).filter((value): value is number => value !== undefined);
}

function mean(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function sum(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((a, b) => a + b, 0);
}

function meanAngle(degrees: number[]): number | undefined {
  if (degrees.length === 0) return undefined;
  const toRad = Math.PI / 180;
  const x = degrees.reduce((acc, d) => acc + Math.cos(d * toRad), 0);
  const y = degrees.reduce((acc, d) => acc + Math.sin(d * toRad), 0);
  if (x === 0 && y === 0) return undefined;
  return ((Math.atan2(y, x) / toRad) + 360) % 360;
}
