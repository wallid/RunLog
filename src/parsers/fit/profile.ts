/**
 * The slice of the FIT global profile this app reads.
 *
 * Field numbers and scaling come from the FIT SDK profile. Only the messages
 * and fields Run Story actually uses are listed — the decoder skips the rest
 * byte-correctly without needing to know what they mean.
 */

export const MESSAGE = {
  FILE_ID: 0,
  SESSION: 18,
  LAP: 19,
  RECORD: 20,
  EVENT: 21,
  ACTIVITY: 34,
  SPORT: 12,
} as const;

/** record (20) */
export const RECORD_FIELD = {
  TIMESTAMP: 253,
  POSITION_LAT: 0,
  POSITION_LONG: 1,
  ALTITUDE: 2,
  HEART_RATE: 3,
  CADENCE: 4,
  DISTANCE: 5,
  SPEED: 6,
  POWER: 7,
  TEMPERATURE: 13,
  ENHANCED_SPEED: 73,
  ENHANCED_ALTITUDE: 78,
} as const;

/** session (18) */
export const SESSION_FIELD = {
  START_TIME: 2,
  TOTAL_ELAPSED_TIME: 7,
  TOTAL_TIMER_TIME: 8,
  TOTAL_DISTANCE: 9,
  TOTAL_CALORIES: 11,
  AVG_SPEED: 14,
  MAX_SPEED: 15,
  AVG_HEART_RATE: 16,
  MAX_HEART_RATE: 17,
  AVG_CADENCE: 18,
  TOTAL_ASCENT: 22,
  TOTAL_DESCENT: 23,
  SPORT: 5,
  AVG_POWER: 20,
  MAX_POWER: 21,
} as const;

/** lap (19) */
export const LAP_FIELD = {
  START_TIME: 2,
  TOTAL_ELAPSED_TIME: 7,
  TOTAL_TIMER_TIME: 8,
  TOTAL_DISTANCE: 9,
} as const;

/** event (21) */
export const EVENT_FIELD = {
  TIMESTAMP: 253,
  EVENT: 0,
  EVENT_TYPE: 1,
} as const;

/** event.event values we care about. */
export const EVENT_TIMER = 0;

/** event.event_type values. */
export const EVENT_TYPE_START = 0;
export const EVENT_TYPE_STOP = 1;
export const EVENT_TYPE_STOP_ALL = 4;

/** Semicircles to degrees: the FIT angular unit is 2^31 semicircles per 180°. */
export const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;

/** Scaling and offsets applied to raw integer field values. */
export const SCALE = {
  /** distance: centimetres */
  DISTANCE: 100,
  /** speed: millimetres per second */
  SPEED: 1000,
  /** altitude: 5 units per metre, offset by 500 m */
  ALTITUDE_DIVISOR: 5,
  ALTITUDE_OFFSET: 500,
  /** timer values: milliseconds */
  TIME: 1000,
} as const;

export function decodeAltitude(raw: number): number {
  return raw / SCALE.ALTITUDE_DIVISOR - SCALE.ALTITUDE_OFFSET;
}

export function decodeSemicircles(raw: number): number {
  return raw * SEMICIRCLE_TO_DEGREES;
}

/** Maps FIT sport enum values to a readable name. */
export function sportName(value: number | undefined): string | undefined {
  switch (value) {
    case 0:
      return "generic";
    case 1:
      return "running";
    case 2:
      return "cycling";
    case 11:
      return "walking";
    case 17:
      return "hiking";
    default:
      return undefined;
  }
}
