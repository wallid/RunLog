/**
 * What a parser produces before normalisation.
 *
 * Raw samples keep whatever the device recorded — irregular timestamps, missing
 * fields, no derived values. Everything else is the pipeline's job.
 */

export interface RawSample {
  /** Absolute time of the sample. */
  time: Date;
  lat?: number;
  lon?: number;
  elevationM?: number;
  /** Cumulative distance in metres, when the device recorded it. */
  distanceM?: number;
  speedMps?: number;
  hrBpm?: number;
  cadenceSpm?: number;
  powerW?: number;
}

/** A device-reported timer pause, used to corroborate detected stops. */
export interface RawTimerEvent {
  time: Date;
  kind: "start" | "stop";
}

export interface RawLap {
  startTime: Date;
  totalTimerS?: number;
  totalDistanceM?: number;
}

export interface RawActivity {
  source: "fit" | "gpx";
  name?: string;
  sport?: string;
  startedAt: Date;
  samples: RawSample[];
  timerEvents: RawTimerEvent[];
  laps: RawLap[];
  /** Device-reported session totals, preferred over derived ones when present. */
  session?: {
    totalDistanceM?: number;
    totalElapsedS?: number;
    totalTimerS?: number;
    avgHr?: number;
    maxHr?: number;
    avgPowerW?: number;
    maxPowerW?: number;
    avgCadenceSpm?: number;
    totalCalories?: number;
    totalAscentM?: number;
    totalDescentM?: number;
  };
  warnings: string[];
}

/**
 * The two kinds are worth telling apart outside the parsers: a file that was
 * never a FIT or GPX is a reader picking the wrong file, whereas one that
 * announces itself as FIT and then fails to decode is a gap in this decoder.
 * Only the second is a defect worth reporting.
 */
export type ParseFailure = "unsupported" | "malformed";

export class ParseError extends Error {
  readonly kind: ParseFailure;

  constructor(message: string, kind: ParseFailure = "malformed") {
    super(message);
    this.name = "ParseError";
    this.kind = kind;
  }
}
