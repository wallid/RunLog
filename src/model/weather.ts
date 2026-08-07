/**
 * The conditions a run happened in.
 *
 * This is the only part of the app built from data the runner's own device did
 * not record. It comes from a reanalysis grid — a model of past weather, not a
 * station reading — so everything here is an estimate of what the air was doing
 * near the run, never a measurement of what the runner felt. Two consequences
 * run through the whole module: nothing derived from it may be presented as
 * measured, and the figures are only ever used to offer an alternative
 * explanation, never to assert one.
 */

/** One hour of conditions from the grid. */
export interface WeatherHour {
  /** Start of the hour, in UTC. */
  timeIso: string;
  temperatureC: number;
  /** What the temperature feels like given humidity and wind. */
  apparentTemperatureC?: number;
  humidityPct?: number;
  /** Wind speed at 10 metres, in km/h. Runner height is lower and slower. */
  windSpeedKmh?: number;
  /** Direction the wind blows *from*, degrees clockwise from north. */
  windFromDegrees?: number;
  precipitationMm?: number;
}

export interface RunWeather {
  /** The hours the run overlapped, in order. */
  hours: WeatherHour[];
  /** Means across those hours, which is what the cards read. */
  temperatureC: number;
  apparentTemperatureC?: number;
  humidityPct?: number;
  windSpeedKmh?: number;
  windFromDegrees?: number;
  precipitationMm?: number;
  /**
   * The coordinates actually sent, rounded before they left the machine.
   *
   * Kept so the page can show the runner exactly what was disclosed rather
   * than asking them to take it on trust.
   */
  requestedLat: number;
  requestedLon: number;
  /** Where the grid cell actually sits, which is not where the run was. */
  gridLat?: number;
  gridLon?: number;
  /** Distance from the rounded request to the grid cell, in metres. */
  gridDistanceM?: number;
  provider: string;
}

/**
 * How much the air was likely to be adding to the effort.
 *
 * Bands rather than a number, because the effect of heat on a runner depends on
 * acclimatisation, clothing, shade and how hard they were going — none of which
 * a grid knows. The bands only decide whether heat is worth *offering* as an
 * explanation, never how much of the change it caused.
 */
export type HeatLevel = "cold" | "cool" | "mild" | "warm" | "hot";

export function heatLevel(weather: RunWeather): HeatLevel {
  // Apparent temperature already folds in humidity and wind, so it is the
  // better input where the provider gives one.
  const t = weather.apparentTemperatureC ?? weather.temperatureC;
  if (t < 4) return "cold";
  if (t < 12) return "cool";
  if (t < 19) return "mild";
  if (t < 25) return "warm";
  return "hot";
}

/**
 * Whether the conditions were warm enough to be worth naming alongside fatigue.
 *
 * Cardiovascular drift rises with heat well before anyone would call a day hot,
 * so the threshold sits at the top of "mild" rather than at a temperature that
 * sounds dramatic.
 */
export function heatCouldExplainDrift(weather: RunWeather): boolean {
  const level = heatLevel(weather);
  return level === "warm" || level === "hot";
}

/** Humid enough that sweat evaporates poorly, which is what makes heat costly. */
export function isMuggy(weather: RunWeather): boolean {
  return (
    (weather.humidityPct ?? 0) >= 70 &&
    (weather.apparentTemperatureC ?? weather.temperatureC) >= 16
  );
}

export interface WindComponents {
  /** Positive is wind against you, negative is wind behind you, in km/h. */
  headwindKmh: number;
  /** Absolute crosswind, in km/h. */
  crosswindKmh: number;
}

/**
 * Splits the wind into the part opposing the runner and the part across them.
 *
 * `windFromDegrees` is meteorological: the direction the wind blows *from*. So
 * a north wind (0°) met by a runner heading north (bearing 0°) is a headwind,
 * which is why the cosine takes the difference directly rather than reversing
 * one of them.
 */
export function windComponents(
  windSpeedKmh: number,
  windFromDegrees: number,
  travelBearingDegrees: number,
): WindComponents {
  const delta = ((windFromDegrees - travelBearingDegrees) * Math.PI) / 180;
  return {
    headwindKmh: windSpeedKmh * Math.cos(delta),
    crosswindKmh: Math.abs(windSpeedKmh * Math.sin(delta)),
  };
}

/**
 * Wind at running height, from a figure measured ten metres up.
 *
 * Wind slows near the ground through friction. The usual engineering
 * approximation is a power law; the exponent depends on terrain roughness and
 * is genuinely uncertain, so this is a rough correction that stops the card
 * overstating the wind rather than a claim about the air at chest height.
 */
export function windAtRunnerHeight(windSpeedKmh: number): number {
  const RUNNER_HEIGHT_M = 1.5;
  const MEASUREMENT_HEIGHT_M = 10;
  const ROUGHNESS_EXPONENT = 0.25;
  return windSpeedKmh * (RUNNER_HEIGHT_M / MEASUREMENT_HEIGHT_M) ** ROUGHNESS_EXPONENT;
}

/** The compass point a bearing falls in, for saying a direction out loud. */
export function compassPoint(degrees: number): string {
  const points = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return points[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}
