import { ParseError, type RawActivity, type RawLap, type RawSample, type RawTimerEvent } from "../types";
import { decodeFit, fitTimestampToDate, type DecodedMessage } from "./decoder";
import {
  decodeAltitude,
  decodeSemicircles,
  EVENT_FIELD,
  EVENT_TIMER,
  EVENT_TYPE_START,
  LAP_FIELD,
  MESSAGE,
  RECORD_FIELD,
  SCALE,
  SESSION_FIELD,
  sportName,
} from "./profile";

/** Turns a decoded FIT message stream into the source-independent raw activity. */
export function parseFit(buffer: ArrayBuffer): RawActivity {
  const { messages, warnings } = decodeFit(buffer);

  const samples: RawSample[] = [];
  const timerEvents: RawTimerEvent[] = [];
  const laps: RawLap[] = [];
  let session: RawActivity["session"];
  let sport: string | undefined;

  for (const message of messages) {
    switch (message.globalMessageNumber) {
      case MESSAGE.RECORD: {
        const sample = readRecord(message);
        if (sample) samples.push(sample);
        break;
      }
      case MESSAGE.SESSION: {
        session = readSession(message);
        sport = sportName(message.fields.get(SESSION_FIELD.SPORT)) ?? sport;
        break;
      }
      case MESSAGE.LAP: {
        const lap = readLap(message);
        if (lap) laps.push(lap);
        break;
      }
      case MESSAGE.EVENT: {
        const event = readTimerEvent(message);
        if (event) timerEvents.push(event);
        break;
      }
      default:
        break;
    }
  }

  if (samples.length === 0) {
    throw new ParseError("This FIT file contains no track records.");
  }

  samples.sort((a, b) => a.time.getTime() - b.time.getTime());
  timerEvents.sort((a, b) => a.time.getTime() - b.time.getTime());

  return {
    source: "fit",
    sport,
    startedAt: samples[0].time,
    samples,
    timerEvents,
    laps,
    session,
    warnings,
  };
}

function readRecord(message: DecodedMessage): RawSample | undefined {
  const timestamp = message.fields.get(RECORD_FIELD.TIMESTAMP);
  if (timestamp === undefined) return undefined;

  const sample: RawSample = { time: fitTimestampToDate(timestamp) };

  const lat = message.fields.get(RECORD_FIELD.POSITION_LAT);
  const lon = message.fields.get(RECORD_FIELD.POSITION_LONG);
  if (lat !== undefined && lon !== undefined) {
    sample.lat = decodeSemicircles(lat);
    sample.lon = decodeSemicircles(lon);
  }

  // The enhanced fields carry the same quantity with more range; prefer them.
  const altitude =
    message.fields.get(RECORD_FIELD.ENHANCED_ALTITUDE) ??
    message.fields.get(RECORD_FIELD.ALTITUDE);
  if (altitude !== undefined) sample.elevationM = decodeAltitude(altitude);

  const distance = message.fields.get(RECORD_FIELD.DISTANCE);
  if (distance !== undefined) sample.distanceM = distance / SCALE.DISTANCE;

  const speed =
    message.fields.get(RECORD_FIELD.ENHANCED_SPEED) ?? message.fields.get(RECORD_FIELD.SPEED);
  if (speed !== undefined) sample.speedMps = speed / SCALE.SPEED;

  const hr = message.fields.get(RECORD_FIELD.HEART_RATE);
  if (hr !== undefined) sample.hrBpm = hr;

  const cadence = message.fields.get(RECORD_FIELD.CADENCE);
  // FIT records running cadence per leg; runners think in total steps per minute.
  if (cadence !== undefined) sample.cadenceSpm = cadence * 2;

  const power = message.fields.get(RECORD_FIELD.POWER);
  if (power !== undefined) sample.powerW = power;

  return sample;
}

function readSession(message: DecodedMessage): RawActivity["session"] {
  const f = message.fields;
  const scaled = (key: number, divisor: number) => {
    const value = f.get(key);
    return value === undefined ? undefined : value / divisor;
  };
  return {
    totalDistanceM: scaled(SESSION_FIELD.TOTAL_DISTANCE, SCALE.DISTANCE),
    totalElapsedS: scaled(SESSION_FIELD.TOTAL_ELAPSED_TIME, SCALE.TIME),
    totalTimerS: scaled(SESSION_FIELD.TOTAL_TIMER_TIME, SCALE.TIME),
    avgHr: f.get(SESSION_FIELD.AVG_HEART_RATE),
    maxHr: f.get(SESSION_FIELD.MAX_HEART_RATE),
    avgPowerW: f.get(SESSION_FIELD.AVG_POWER),
    maxPowerW: f.get(SESSION_FIELD.MAX_POWER),
    avgCadenceSpm: (() => {
      const value = f.get(SESSION_FIELD.AVG_CADENCE);
      return value === undefined ? undefined : value * 2;
    })(),
    totalCalories: f.get(SESSION_FIELD.TOTAL_CALORIES),
    totalAscentM: f.get(SESSION_FIELD.TOTAL_ASCENT),
    totalDescentM: f.get(SESSION_FIELD.TOTAL_DESCENT),
  };
}

function readLap(message: DecodedMessage): RawLap | undefined {
  const start = message.fields.get(LAP_FIELD.START_TIME);
  if (start === undefined) return undefined;
  const totalTimer = message.fields.get(LAP_FIELD.TOTAL_TIMER_TIME);
  const totalDistance = message.fields.get(LAP_FIELD.TOTAL_DISTANCE);
  return {
    startTime: fitTimestampToDate(start),
    totalTimerS: totalTimer === undefined ? undefined : totalTimer / SCALE.TIME,
    totalDistanceM: totalDistance === undefined ? undefined : totalDistance / SCALE.DISTANCE,
  };
}

function readTimerEvent(message: DecodedMessage): RawTimerEvent | undefined {
  if (message.fields.get(EVENT_FIELD.EVENT) !== EVENT_TIMER) return undefined;
  const timestamp = message.fields.get(EVENT_FIELD.TIMESTAMP);
  const eventType = message.fields.get(EVENT_FIELD.EVENT_TYPE);
  if (timestamp === undefined || eventType === undefined) return undefined;
  return {
    time: fitTimestampToDate(timestamp),
    kind: eventType === EVENT_TYPE_START ? "start" : "stop",
  };
}
