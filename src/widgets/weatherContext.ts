import type { DerivedActivity } from "@/model/activity";
import {
  compassPoint,
  heatCouldExplainDrift,
  heatLevel,
  isMuggy,
  windAtRunnerHeight,
} from "@/model/weather";

/**
 * What the weather lets the other cards stop hedging about.
 *
 * Two cards in this section already name heat and headwind as things they
 * cannot rule out. That caveat is honest but unsatisfying, and it is exactly
 * what a weather lookup can improve — not by proving the conditions caused
 * anything, but by saying whether they were even a candidate. A drift on a cold
 * still morning has one fewer explanation than the same drift at 27°C.
 *
 * The wording is deliberately asymmetric. Warm weather is offered as a possible
 * contributor; cool weather is used to *remove* it as one, which is the
 * stronger and safer of the two claims.
 */

export interface HeatContext {
  /** The clause the durability card ends its explanation with. */
  driftClause: string;
  /** Whether conditions were warm enough to be worth naming. */
  warm: boolean;
}

export function heatContext(activity: DerivedActivity): HeatContext {
  const weather = activity.weather;

  if (!weather) {
    return {
      warm: false,
      driftClause:
        "Accumulating fatigue, heat and dehydration all produce this and cannot be separated from one another here.",
    };
  }

  const level = heatLevel(weather);
  const felt = weather.apparentTemperatureC ?? weather.temperatureC;
  const muggy = isMuggy(weather);

  if (heatCouldExplainDrift(weather)) {
    return {
      warm: true,
      driftClause: `Conditions near the run were ${level} — about ${Math.round(felt)}°C${muggy ? ` and humid at ${Math.round(weather.humidityPct ?? 0)}%, which is the combination that makes heat expensive because sweat evaporates poorly` : ""} — so heat belongs on the list of reasons alongside fatigue and dehydration, and this card cannot separate them.`,
    };
  }

  return {
    warm: false,
    driftClause: `Conditions near the run were ${level}, about ${Math.round(felt)}°C, which makes heat an unlikely contributor and leaves accumulating fatigue and dehydration as the more plausible reasons.`,
  };
}

/**
 * What the stride card can say about wind instead of guessing.
 *
 * Without a lookup it has to list a headwind as an unexcluded possibility. With
 * one it can say how strong the wind actually was, which either keeps that
 * possibility alive with a figure attached or takes it off the table.
 */
export function windCaveat(activity: DerivedActivity): string {
  const weather = activity.weather;
  if (!weather || weather.windSpeedKmh === undefined) {
    return "Running into a headwind or onto softer ground would look the same from here.";
  }

  const atHeight = windAtRunnerHeight(weather.windSpeedKmh);
  if (atHeight < 8) {
    return `The wind near the run was light, around ${Math.round(atHeight)} km/h at running height, so a headwind is an unlikely explanation for it — softer ground still would be.`;
  }

  return `There was a wind of about ${Math.round(atHeight)} km/h from the ${compassPoint(weather.windFromDegrees ?? 0)} at running height, so on the stretches facing it a headwind would produce the same shortening, and the wind card shows which those were.`;
}
