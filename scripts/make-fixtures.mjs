/**
 * Builds the test fixtures.
 *
 * The fixtures are synthetic on purpose. A GPS track is a record of where
 * somebody actually was, and a public repository is a poor place to keep one —
 * so rather than commit a real recording, this writes files that exercise the
 * same parser paths from invented data. The route is a loop in Greenwich Park,
 * chosen because it is obviously a landmark rather than anybody's front door.
 *
 * The FIT output is a real FIT 2.0 file: proper header, definition messages,
 * invalid-value sentinels for the fields a watch writes intermittently, and
 * correct CRCs. That matters — a fixture that only satisfied this project's own
 * decoder would stop the tests from catching the day the decoder drifts away
 * from the format.
 *
 *   node scripts/make-fixtures.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../fixtures");
const DEMO = resolve(HERE, "../public/demo");

/** FIT counts seconds from 1989-12-31T00:00:00Z. */
const FIT_EPOCH_OFFSET_S = 631_065_600;
const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180;

const START = new Date("2026-08-06T11:49:29Z");
/** Points at 1 Hz. The GPX test pins this exact count. */
const SAMPLES = 1245;

/** A loop in Greenwich Park, sized so one lap is roughly the run's distance. */
const CENTRE = { lat: 51.4769, lon: -0.0005 };
const LOOP_RADIUS_M = 477;

/**
 * One second of an invented run.
 *
 * Every series is smooth and slow-moving. That is deliberate: the FIT writes
 * heart rate every few seconds while the GPX carries it on every point, and a
 * test asserts the two agree on the range. A signal that turned sharply would
 * have its peak fall between the FIT's samples and the two would disagree.
 */
function sampleAt(t) {
  const speedMps = 2.41 + 0.28 * Math.sin(t / 190) + 0.1 * Math.sin(t / 47);
  return {
    t,
    speedMps,
    heartRate: Math.round(118 + 24 * Math.sin((2 * Math.PI * t) / 600) + (8 * t) / SAMPLES),
    powerW: Math.round(212 + 38 * Math.sin((2 * Math.PI * t) / 540) + 6 * Math.sin(t / 31)),
    cadenceSpm: Math.round(168 + 6 * Math.sin((2 * Math.PI * t) / 480) + 2 * Math.sin(t / 29)),
    elevationM: 24 + 18 * Math.sin((2 * Math.PI * t) / 700) + 3 * Math.sin(t / 61),
  };
}

/** Walks the loop, so bearings vary the way a real route's do. */
function buildTrack() {
  const points = [];
  let distanceM = 0;
  for (let t = 0; t < SAMPLES; t++) {
    const s = sampleAt(t);
    const angle = distanceM / LOOP_RADIUS_M;
    const lat = CENTRE.lat + (LOOP_RADIUS_M * Math.cos(angle)) / 111_320;
    const lon =
      CENTRE.lon +
      (LOOP_RADIUS_M * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
    points.push({ ...s, lat, lon, distanceM });
    distanceM += s.speedMps;
  }
  return points;
}

// ── FIT encoding ────────────────────────────────────────────────────────────

const CRC_TABLE = [
  0x0000, 0xcc01, 0xd801, 0x1400, 0xf001, 0x3c00, 0x2800, 0xe401, 0xa001, 0x6c00, 0x7800,
  0xb401, 0x5000, 0x9c01, 0x8801, 0x4400,
];

function fitCrc(bytes) {
  let crc = 0;
  for (const byte of bytes) {
    let tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[byte & 0xf];
    tmp = CRC_TABLE[crc & 0xf];
    crc = (crc >> 4) & 0x0fff;
    crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xf];
  }
  return crc & 0xffff;
}

/** Base types, by the number that goes in a definition message. */
const T = {
  enum: { id: 0x00, size: 1, invalid: 0xff, put: (b, o, v) => b.writeUInt8(v, o) },
  uint8: { id: 0x02, size: 1, invalid: 0xff, put: (b, o, v) => b.writeUInt8(v, o) },
  uint16: { id: 0x84, size: 2, invalid: 0xffff, put: (b, o, v) => b.writeUInt16LE(v, o) },
  uint32: {
    id: 0x86,
    size: 4,
    invalid: 0xffffffff,
    put: (b, o, v) => b.writeUInt32LE(v >>> 0, o),
  },
  sint32: { id: 0x85, size: 4, invalid: 0x7fffffff, put: (b, o, v) => b.writeInt32LE(v, o) },
};

class FitWriter {
  constructor() {
    this.chunks = [];
  }

  /** A definition message, which declares the shape of the records that follow. */
  define(localType, globalNumber, fields) {
    const header = Buffer.alloc(6 + fields.length * 3);
    header.writeUInt8(0x40 | localType, 0);
    header.writeUInt8(0, 1); // reserved
    header.writeUInt8(0, 2); // little endian
    header.writeUInt16LE(globalNumber, 3);
    header.writeUInt8(fields.length, 5);
    fields.forEach((field, i) => {
      header.writeUInt8(field.number, 6 + i * 3);
      header.writeUInt8(field.type.size, 7 + i * 3);
      header.writeUInt8(field.type.id, 8 + i * 3);
    });
    this.chunks.push(header);
  }

  /**
   * A data message. Values given as undefined are written as the format's
   * invalid sentinel, which is how a watch says "not measured this second"
   * without needing a second definition.
   */
  data(localType, fields, values) {
    const size = fields.reduce((total, f) => total + f.type.size, 0);
    const buffer = Buffer.alloc(1 + size);
    buffer.writeUInt8(localType, 0);
    let offset = 1;
    for (const field of fields) {
      const value = values[field.number];
      field.type.put(buffer, offset, value === undefined ? field.type.invalid : value);
      offset += field.type.size;
    }
    this.chunks.push(buffer);
  }

  /** Header, data, then the CRC over all of it. */
  finish() {
    const body = Buffer.concat(this.chunks);
    const header = Buffer.alloc(14);
    header.writeUInt8(14, 0);
    header.writeUInt8(0x20, 1); // protocol 2.0
    header.writeUInt16LE(2189, 2); // profile version
    header.writeUInt32LE(body.length, 4);
    header.write(".FIT", 8, "ascii");
    header.writeUInt16LE(fitCrc(header.subarray(0, 12)), 12);
    const crc = Buffer.alloc(2);
    crc.writeUInt16LE(fitCrc(body), 0);
    return Buffer.concat([header, body, crc]);
  }
}

const fitTime = (date) => Math.round(date.getTime() / 1000) - FIT_EPOCH_OFFSET_S;
const semicircles = (degrees) => Math.round(degrees * SEMICIRCLES_PER_DEGREE);
const encodeAltitude = (metres) => Math.round((metres + 500) * 5);

function writeFit(points, { withCadence }) {
  const w = new FitWriter();
  const startS = fitTime(START);

  const fileId = [
    { number: 0, type: T.enum }, // type: activity
    { number: 1, type: T.uint16 }, // manufacturer
    { number: 4, type: T.uint32 }, // time_created
  ];
  w.define(0, 0, fileId);
  w.data(0, fileId, { 0: 4, 1: 255, 4: startS });

  const event = [
    { number: 253, type: T.uint32 },
    { number: 0, type: T.uint8 },
    { number: 1, type: T.uint8 },
  ];
  w.define(4, 21, event);
  w.data(4, event, { 253: startS, 0: 0, 1: 0 }); // timer start

  const record = [
    { number: 253, type: T.uint32 },
    { number: 0, type: T.sint32 }, // position_lat
    { number: 1, type: T.sint32 }, // position_long
    { number: 78, type: T.uint32 }, // enhanced_altitude
    { number: 5, type: T.uint32 }, // distance
    { number: 73, type: T.uint32 }, // enhanced_speed
    { number: 3, type: T.uint8 }, // heart_rate
    { number: 7, type: T.uint16 }, // power
    ...(withCadence ? [{ number: 4, type: T.uint8 }] : []),
  ];
  w.define(1, 20, record);

  for (const p of points) {
    w.data(1, record, {
      253: startS + p.t,
      0: semicircles(p.lat),
      1: semicircles(p.lon),
      78: encodeAltitude(p.elevationM),
      // Written every other second, the way a watch batches it. The parser has
      // to cope with a distance series sparser than the record series.
      5: p.t % 2 === 0 ? Math.round(p.distanceM * 100) : undefined,
      73: Math.round(p.speedMps * 1000),
      // Every four seconds, so the series is genuinely sparse before the
      // pipeline interpolates it.
      3: p.t % 4 === 0 ? p.heartRate : undefined,
      7: p.powerW,
      // FIT stores running cadence per leg; the parser doubles it.
      ...(withCadence ? { 4: Math.round(p.cadenceSpm / 2) } : {}),
    });
  }

  const last = points[points.length - 1];
  const totalDistanceM = last.distanceM + last.speedMps;
  const endS = startS + SAMPLES;
  const heartRates = points.map((p) => p.heartRate);
  const powers = points.map((p) => p.powerW);
  const gain = points.reduce(
    (total, p, i) => total + Math.max(0, p.elevationM - (points[i - 1]?.elevationM ?? p.elevationM)),
    0,
  );

  const lap = [
    { number: 253, type: T.uint32 },
    { number: 2, type: T.uint32 },
    { number: 7, type: T.uint32 },
    { number: 8, type: T.uint32 },
    { number: 9, type: T.uint32 },
  ];
  w.define(2, 19, lap);
  w.data(2, lap, {
    253: endS,
    2: startS,
    7: SAMPLES * 1000,
    8: SAMPLES * 1000,
    9: Math.round(totalDistanceM * 100),
  });

  const session = [
    { number: 253, type: T.uint32 },
    { number: 2, type: T.uint32 },
    { number: 5, type: T.enum },
    { number: 7, type: T.uint32 },
    { number: 8, type: T.uint32 },
    { number: 9, type: T.uint32 },
    { number: 11, type: T.uint16 },
    { number: 16, type: T.uint8 },
    { number: 17, type: T.uint8 },
    { number: 20, type: T.uint16 },
    { number: 21, type: T.uint16 },
    { number: 22, type: T.uint16 },
    { number: 23, type: T.uint16 },
  ];
  w.define(3, 18, session);
  w.data(3, session, {
    253: endS,
    2: startS,
    5: 1, // running
    7: SAMPLES * 1000,
    8: SAMPLES * 1000,
    9: Math.round(totalDistanceM * 100),
    11: 212,
    16: Math.round(heartRates.reduce((a, b) => a + b, 0) / heartRates.length),
    17: Math.max(...heartRates),
    20: Math.round(powers.reduce((a, b) => a + b, 0) / powers.length),
    21: Math.max(...powers),
    22: Math.round(gain),
    23: Math.round(gain),
  });

  w.data(4, event, { 253: endS, 0: 0, 1: 4 }); // timer stop_all

  const activity = [
    { number: 253, type: T.uint32 },
    { number: 1, type: T.uint16 },
  ];
  w.define(5, 34, activity);
  w.data(5, activity, { 253: endS, 1: 1 });

  return w.finish();
}

// ── GPX encoding ────────────────────────────────────────────────────────────

function writeGpx(points, { name, withCadence, withPower }) {
  const head = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Run Log fixture generator"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata>
    <time>${START.toISOString().replace(".000", "")}</time>
  </metadata>
  <trk>
    <name>${name}</name>
    <type>running</type>
    <trkseg>`;

  const body = points
    .map((p) => {
      const time = new Date(START.getTime() + p.t * 1000).toISOString().replace(".000", "");
      const extensions = [
        `<gpxtpx:TrackPointExtension><gpxtpx:hr>${p.heartRate}</gpxtpx:hr>${
          withCadence ? `<gpxtpx:cad>${Math.round(p.cadenceSpm / 2)}</gpxtpx:cad>` : ""
        }</gpxtpx:TrackPointExtension>`,
        withPower ? `<power>${p.powerW}</power>` : "",
      ].join("");
      return `
      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">
        <ele>${p.elevationM.toFixed(1)}</ele>
        <time>${time}</time>
        <extensions>${extensions}</extensions>
      </trkpt>`;
    })
    .join("");

  return `${head}${body}
    </trkseg>
  </trk>
</gpx>
`;
}

// ── Write them ──────────────────────────────────────────────────────────────

const points = buildTrack();

mkdirSync(FIXTURES, { recursive: true });
mkdirSync(DEMO, { recursive: true });

const lunchFit = writeFit(points, { withCadence: false });
writeFileSync(resolve(FIXTURES, "Lunch_Run.fit"), lunchFit);
// The demo the site ships is the same file, so what a visitor sees is what the
// tests exercise.
writeFileSync(resolve(DEMO, "Lunch_Run.fit"), lunchFit);
writeFileSync(
  resolve(FIXTURES, "Lunch_Run.gpx"),
  writeGpx(points, { name: "Lunch Run", withCadence: false, withPower: true }),
);
writeFileSync(
  resolve(FIXTURES, "Cadence_Run.gpx"),
  writeGpx(points, { name: "Cadence Run", withCadence: true, withPower: true }),
);

const totalKm = (points.at(-1).distanceM / 1000).toFixed(2);
console.log(`Wrote fixtures: ${SAMPLES} points, ${totalKm} km, loop in Greenwich Park.`);
console.log(`  fixtures/Lunch_Run.fit    ${lunchFit.length} bytes`);
console.log(`  fixtures/Lunch_Run.gpx`);
console.log(`  fixtures/Cadence_Run.gpx`);
console.log(`  public/demo/Lunch_Run.fit`);
