/**
 * Builds the test fixtures, and the demo run the site ships.
 *
 * There are two ways to run this.
 *
 *   node scripts/make-fixtures.mjs
 *       Invents a run from scratch. Anyone can do this; it needs nothing.
 *
 *   node scripts/make-fixtures.mjs --source path/to/real-run.gpx
 *       Takes a real recording and anonymises it. This is how the committed
 *       fixtures were made, because invented physiology looks invented: heart
 *       rate that never hesitates and a pace line with no texture read as a
 *       chart of a formula, which is a poor advertisement for a page whose
 *       whole claim is that it explains real running.
 *
 * What the anonymising does, and does not do:
 *
 *   - Every coordinate is moved by one fixed offset, so the route lands
 *     somewhere else entirely. Nothing about the running changes: distances,
 *     gradients, pace, cadence and every derived figure are identical, because
 *     all of them depend on differences between points rather than on where
 *     those points are.
 *   - Elevation is shifted by a constant, for the same reason and with the same
 *     absence of effect on anything derived from it.
 *   - The shape of the route survives, and so does the elevation profile. A
 *     determined person with the original could match them. This is a large
 *     reduction in what is disclosed, not a guarantee of anonymity, and it is
 *     the right trade only for a route the owner is content to publish the
 *     shape of.
 *
 * It also smooths. Consumer GPS wanders by a metre or two a second even when a
 * runner does not, and those wobbles reach the page as pace spikes that say
 * nothing about the run. A short rolling mean over position and power removes
 * them while leaving heart rate, cadence and elevation alone, which are already
 * steady enough to read.
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../fixtures");
const DEMO = resolve(HERE, "../public/demo");

/** FIT counts seconds from 1989-12-31T00:00:00Z. */
const FIT_EPOCH_OFFSET_S = 631_065_600;
const SEMICIRCLES_PER_DEGREE = 2 ** 31 / 180;

const START = new Date("2026-08-06T11:49:29Z");

/**
 * Where an anonymised route is moved to.
 *
 * Richmond Park: open ground several kilometres across, so a loop of any
 * ordinary size lands on grass rather than through somebody's kitchen, and a
 * landmark rather than an address.
 */
const TARGET_CENTRE = { lat: 51.4425, lon: -0.2735 };
/** Metres above sea level the anonymised route is made to start from. */
const TARGET_BASE_ELEVATION_M = 48;

/** Seconds of rolling mean applied to position and power. */
const SMOOTHING_S = 5;

// ── Reading a real recording ────────────────────────────────────────────────

function readSourceGpx(path) {
  const xml = readFileSync(path, "utf8");
  const points = [];
  const re = /<trkpt lat="([-0-9.]+)" lon="([-0-9.]+)">([\s\S]*?)<\/trkpt>/g;
  for (const match of xml.matchAll(re)) {
    const block = match[3];
    const pick = (pattern) => {
      const found = block.match(pattern);
      return found ? parseFloat(found[1]) : undefined;
    };
    points.push({
      lat: parseFloat(match[1]),
      lon: parseFloat(match[2]),
      elevationM: pick(/<ele>([-0-9.]+)/),
      heartRate: pick(/gpxtpx:hr>([0-9.]+)/),
      // GPX carries cadence per leg, as FIT does. Doubling happens on the way
      // out, so everything in between is in one unit.
      cadenceSpm: (pick(/gpxtpx:cad>([0-9.]+)/) ?? NaN) * 2,
      powerW: pick(/<power>([0-9.]+)/),
    });
  }
  if (points.length < 100) {
    throw new Error(`Only ${points.length} track points in ${path}; expected a full run.`);
  }
  return points;
}

/** Centred rolling mean, leaving the ends alone rather than shortening them. */
function smooth(values, windowS) {
  const half = Math.floor(windowS / 2);
  return values.map((value, i) => {
    if (value === undefined || Number.isNaN(value)) return value;
    let total = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j];
      if (v === undefined || Number.isNaN(v)) continue;
      total += v;
      count += 1;
    }
    return count > 0 ? total / count : value;
  });
}

/**
 * Moves a route somewhere else and takes the sensor jitter out of it.
 *
 * Adding a fixed offset to latitude and longitude would be wrong, and wrong in
 * a way that is easy to miss. A degree of longitude is 111 km at the equator
 * and narrows towards the poles, so a route shifted from Melbourne to London
 * keeps its numbers and loses a fifth of its width — the run comes out shorter
 * than it was, and every pace on the page is a lie by the same proportion.
 *
 * So the route is converted to metres east and north of its own centre, and
 * those metres are re-projected at the destination. The shape and every
 * distance survive intact; only the place changes.
 */
function anonymise(points) {
  const toRad = Math.PI / 180;
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const centreLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centreLon = (Math.min(...lons) + Math.max(...lons)) / 2;

  const METRES_PER_DEGREE = 111_320;
  const moved = points.map((p) => {
    const northM = (p.lat - centreLat) * METRES_PER_DEGREE;
    const eastM = (p.lon - centreLon) * METRES_PER_DEGREE * Math.cos(centreLat * toRad);
    const lat = TARGET_CENTRE.lat + northM / METRES_PER_DEGREE;
    return {
      lat,
      lon: TARGET_CENTRE.lon + eastM / (METRES_PER_DEGREE * Math.cos(lat * toRad)),
    };
  });

  const elevations = points.map((p) => p.elevationM ?? 0);
  const dElevation = TARGET_BASE_ELEVATION_M - Math.min(...elevations);

  const smoothedLat = smooth(moved.map((p) => p.lat), SMOOTHING_S);
  const smoothedLon = smooth(moved.map((p) => p.lon), SMOOTHING_S);
  const smoothedPower = smooth(points.map((p) => p.powerW), SMOOTHING_S);

  return points.map((p, i) => ({
    t: i,
    lat: smoothedLat[i],
    lon: smoothedLon[i],
    elevationM: (p.elevationM ?? 0) + dElevation,
    heartRate: Math.round(p.heartRate ?? 0),
    cadenceSpm: Number.isNaN(p.cadenceSpm) ? undefined : p.cadenceSpm,
    powerW: smoothedPower[i] === undefined ? undefined : Math.round(smoothedPower[i]),
  }));
}

// ── Inventing one instead ───────────────────────────────────────────────────

const SYNTHETIC_SAMPLES = 1245;
const SYNTHETIC_CENTRE = TARGET_CENTRE;
const SYNTHETIC_RADIUS_M = 477;

function buildSyntheticTrack() {
  const points = [];
  let distanceM = 0;
  for (let t = 0; t < SYNTHETIC_SAMPLES; t++) {
    const speedMps = 2.41 + 0.28 * Math.sin(t / 190) + 0.1 * Math.sin(t / 47);
    const angle = distanceM / SYNTHETIC_RADIUS_M;
    const lat = SYNTHETIC_CENTRE.lat + (SYNTHETIC_RADIUS_M * Math.cos(angle)) / 111_320;
    const lon =
      SYNTHETIC_CENTRE.lon +
      (SYNTHETIC_RADIUS_M * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
    points.push({
      t,
      lat,
      lon,
      elevationM: TARGET_BASE_ELEVATION_M + 18 * Math.sin((2 * Math.PI * t) / 700),
      heartRate: Math.round(
        118 + 24 * Math.sin((2 * Math.PI * t) / 600) + (8 * t) / SYNTHETIC_SAMPLES,
      ),
      cadenceSpm: 168 + 6 * Math.sin((2 * Math.PI * t) / 480),
      powerW: Math.round(212 + 38 * Math.sin((2 * Math.PI * t) / 540)),
    });
    distanceM += speedMps;
  }
  return points;
}

// ── Geometry ────────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6371008.8;

function metresBetween(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance and per-second speed, from the track itself. */
function addMotion(points) {
  let distanceM = 0;
  return points.map((p, i) => {
    const step = i === 0 ? 0 : metresBetween(points[i - 1], p);
    distanceM += step;
    return { ...p, distanceM, speedMps: step };
  });
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

  define(localType, globalNumber, fields) {
    const header = Buffer.alloc(6 + fields.length * 3);
    header.writeUInt8(0x40 | localType, 0);
    header.writeUInt8(0, 1);
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

  finish() {
    const body = Buffer.concat(this.chunks);
    const header = Buffer.alloc(14);
    header.writeUInt8(14, 0);
    header.writeUInt8(0x20, 1);
    header.writeUInt16LE(2189, 2);
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
    { number: 0, type: T.enum },
    { number: 1, type: T.uint16 },
    { number: 4, type: T.uint32 },
  ];
  w.define(0, 0, fileId);
  w.data(0, fileId, { 0: 4, 1: 255, 4: startS });

  const event = [
    { number: 253, type: T.uint32 },
    { number: 0, type: T.uint8 },
    { number: 1, type: T.uint8 },
  ];
  w.define(4, 21, event);
  w.data(4, event, { 253: startS, 0: 0, 1: 0 });

  const record = [
    { number: 253, type: T.uint32 },
    { number: 0, type: T.sint32 },
    { number: 1, type: T.sint32 },
    { number: 78, type: T.uint32 },
    { number: 5, type: T.uint32 },
    { number: 73, type: T.uint32 },
    { number: 3, type: T.uint8 },
    { number: 7, type: T.uint16 },
    ...(withCadence ? [{ number: 4, type: T.uint8 }] : []),
  ];
  w.define(1, 20, record);

  for (const p of points) {
    w.data(1, record, {
      253: startS + p.t,
      0: semicircles(p.lat),
      1: semicircles(p.lon),
      78: encodeAltitude(p.elevationM),
      // Written every other second, the way a watch batches it, so the parser
      // has to cope with a distance series sparser than the record series.
      5: p.t % 2 === 0 ? Math.round(p.distanceM * 100) : undefined,
      73: Math.round(p.speedMps * 1000),
      // Every four seconds, so the series is genuinely sparse before the
      // pipeline interpolates it.
      3: p.t % 4 === 0 ? p.heartRate : undefined,
      7: p.powerW,
      ...(withCadence && p.cadenceSpm !== undefined
        ? { 4: Math.round(p.cadenceSpm / 2) }
        : {}),
    });
  }

  const last = points[points.length - 1];
  const endS = startS + points.length;
  const heartRates = points.map((p) => p.heartRate).filter(Boolean);
  const powers = points.map((p) => p.powerW).filter((v) => v !== undefined);
  const cadences = points.map((p) => p.cadenceSpm).filter((v) => v !== undefined);
  const gain = points.reduce(
    (total, p, i) =>
      total + Math.max(0, p.elevationM - (points[i - 1]?.elevationM ?? p.elevationM)),
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
    7: points.length * 1000,
    8: points.length * 1000,
    9: Math.round(last.distanceM * 100),
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
    { number: 18, type: T.uint8 },
    { number: 20, type: T.uint16 },
    { number: 21, type: T.uint16 },
    { number: 22, type: T.uint16 },
    { number: 23, type: T.uint16 },
  ];
  const mean = (a) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  w.define(3, 18, session);
  w.data(3, session, {
    253: endS,
    2: startS,
    5: 1,
    7: points.length * 1000,
    8: points.length * 1000,
    9: Math.round(last.distanceM * 100),
    11: 212,
    16: mean(heartRates),
    17: Math.max(...heartRates),
    18: withCadence && cadences.length ? Math.round(mean(cadences) / 2) : undefined,
    20: mean(powers),
    21: Math.max(...powers),
    22: Math.round(gain),
    23: Math.round(gain),
  });

  w.data(4, event, { 253: endS, 0: 0, 1: 4 });

  const activity = [
    { number: 253, type: T.uint32 },
    { number: 1, type: T.uint16 },
  ];
  w.define(5, 34, activity);
  w.data(5, activity, { 253: endS, 1: 1 });

  return w.finish();
}

// ── GPX encoding ────────────────────────────────────────────────────────────

function writeGpx(points, { name, withCadence }) {
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
      const cad =
        withCadence && p.cadenceSpm !== undefined
          ? `<gpxtpx:cad>${Math.round(p.cadenceSpm / 2)}</gpxtpx:cad>`
          : "";
      const power = p.powerW !== undefined ? `<power>${p.powerW}</power>` : "";
      return `
      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">
        <ele>${p.elevationM.toFixed(1)}</ele>
        <time>${time}</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.heartRate}</gpxtpx:hr>${cad}</gpxtpx:TrackPointExtension>${power}</extensions>
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

const sourceFlag = process.argv.indexOf("--source");
const sourcePath = sourceFlag >= 0 ? process.argv[sourceFlag + 1] : undefined;

const raw = sourcePath
  ? anonymise(readSourceGpx(sourcePath))
  : buildSyntheticTrack().map((p) => ({ ...p }));
const points = addMotion(raw);

mkdirSync(FIXTURES, { recursive: true });
mkdirSync(DEMO, { recursive: true });

const withCadence = points.some((p) => p.cadenceSpm !== undefined);

const demoFit = writeFit(points, { withCadence });
writeFileSync(resolve(FIXTURES, "Lunch_Run.fit"), demoFit);
// The demo the site ships is the same file, so what a visitor sees is what the
// tests exercise.
writeFileSync(resolve(DEMO, "Lunch_Run.fit"), demoFit);
writeFileSync(
  resolve(FIXTURES, "Lunch_Run.gpx"),
  writeGpx(points, { name: "Lunch Run", withCadence }),
);
// Plenty of watches record no cadence at all, and the page has to drop its
// whole cadence section when that happens. This is the fixture that proves it.
writeFileSync(
  resolve(FIXTURES, "No_Cadence.gpx"),
  writeGpx(points, { name: "Lunch Run", withCadence: false }),
);

const totalKm = (points.at(-1).distanceM / 1000).toFixed(2);
const steps = points.slice(1).map((p) => p.speedMps);
const maxStep = Math.max(...steps).toFixed(2);
console.log(
  `${sourcePath ? `Anonymised ${sourcePath}` : "Invented a run"}: ` +
    `${points.length} points, ${totalKm} km, cadence ${withCadence ? "included" : "absent"}.`,
);
console.log(`  largest per-second step: ${maxStep} m (was the source's GPS jitter)`);
console.log(`  fixtures/Lunch_Run.fit    ${demoFit.length} bytes`);
console.log(`  fixtures/Lunch_Run.gpx`);
console.log(`  fixtures/No_Cadence.gpx`);
console.log(`  public/demo/Lunch_Run.fit`);
