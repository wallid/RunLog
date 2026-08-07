import { ParseError, type RawActivity, type RawSample } from "../types";

/**
 * GPX 1.1 track parser.
 *
 * Handles the two extension dialects that matter in practice: Garmin's
 * TrackPointExtension (heart rate, cadence) and Strava's plain <power> element.
 * Namespace prefixes vary between exporters (`gpxtpx:`, `ns3:`, none), so
 * elements are matched on local name rather than qualified name.
 */
export function parseGpx(text: string): RawActivity {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new ParseError("This file could not be read as GPX. It may be corrupted.");
  }

  const warnings: string[] = [];
  const trackPoints = Array.from(doc.getElementsByTagName("*")).filter(
    (el) => localName(el) === "trkpt",
  );

  if (trackPoints.length === 0) {
    throw new ParseError("No track points were found in this GPX file.");
  }

  const samples: RawSample[] = [];
  let missingTimeCount = 0;

  for (const point of trackPoints) {
    const timeText = childText(point, "time");
    if (!timeText) {
      missingTimeCount++;
      continue;
    }
    const time = new Date(timeText);
    if (Number.isNaN(time.getTime())) {
      missingTimeCount++;
      continue;
    }

    const sample: RawSample = { time };

    const lat = Number(point.getAttribute("lat"));
    const lon = Number(point.getAttribute("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      sample.lat = lat;
      sample.lon = lon;
    }

    const ele = numberOrUndefined(childText(point, "ele"));
    if (ele !== undefined) sample.elevationM = ele;

    // Extensions live under <extensions>, sometimes nested one level deeper in
    // <TrackPointExtension>. Searching descendants by local name covers both.
    const extensions = firstChildByLocalName(point, "extensions");
    if (extensions) {
      const hr = descendantNumber(extensions, "hr");
      if (hr !== undefined) sample.hrBpm = hr;

      const cadence = descendantNumber(extensions, "cad");
      if (cadence !== undefined) {
        // Garmin records running cadence as revolutions per minute (one leg).
        sample.cadenceSpm = cadence < 130 ? cadence * 2 : cadence;
      }

      const power = descendantNumber(extensions, "power") ?? descendantNumber(extensions, "PowerInWatts");
      if (power !== undefined) sample.powerW = power;

      const speed = descendantNumber(extensions, "speed");
      if (speed !== undefined) sample.speedMps = speed;
    }

    samples.push(sample);
  }

  if (samples.length === 0) {
    throw new ParseError("No track points in this GPX file have usable timestamps.");
  }

  if (missingTimeCount > 0) {
    warnings.push(
      `${missingTimeCount} track ${missingTimeCount === 1 ? "point was" : "points were"} skipped because they had no timestamp.`,
    );
  }

  samples.sort((a, b) => a.time.getTime() - b.time.getTime());

  const trackName = firstTextByLocalName(doc, "trk", "name");
  const trackType = firstTextByLocalName(doc, "trk", "type");

  return {
    source: "gpx",
    name: trackName ?? undefined,
    sport: trackType ?? undefined,
    startedAt: samples[0].time,
    samples,
    timerEvents: [],
    laps: [],
    warnings,
  };
}

function localName(el: Element): string {
  return el.localName ?? el.nodeName.replace(/^.*:/, "");
}

function firstChildByLocalName(parent: Element, name: string): Element | undefined {
  for (const child of Array.from(parent.children)) {
    if (localName(child) === name) return child;
  }
  return undefined;
}

function childText(parent: Element, name: string): string | undefined {
  const child = firstChildByLocalName(parent, name);
  return child?.textContent?.trim() || undefined;
}

/** Searches all descendants for the first element with this local name. */
function descendantNumber(root: Element, name: string): number | undefined {
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const el = stack.pop()!;
    for (const child of Array.from(el.children)) {
      if (localName(child) === name) {
        return numberOrUndefined(child.textContent?.trim());
      }
      stack.push(child);
    }
  }
  return undefined;
}

function firstTextByLocalName(
  doc: Document,
  parentName: string,
  childName: string,
): string | undefined {
  const parent = Array.from(doc.getElementsByTagName("*")).find(
    (el) => localName(el) === parentName,
  );
  return parent ? childText(parent, childName) : undefined;
}

function numberOrUndefined(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}
