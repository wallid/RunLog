import { ParseError, type RawActivity } from "./types";

export { ParseError };
export type { RawActivity, RawSample } from "./types";

/**
 * Reads an uploaded activity file.
 *
 * The format is detected from the content rather than the extension, because
 * exports are routinely renamed. FIT files start with a header whose bytes 8-11
 * spell `.FIT`; GPX is XML.
 */
export async function parseFile(file: File | Blob, fileName?: string): Promise<RawActivity> {
  const buffer = await file.arrayBuffer();
  const format = detectFormat(buffer, fileName);

  if (format === "fit") {
    const { parseFit } = await import("./fit/parseFit");
    return parseFit(buffer);
  }

  if (format === "gpx") {
    const { parseGpx } = await import("./gpx/parseGpx");
    const text = new TextDecoder("utf-8").decode(buffer);
    return parseGpx(text);
  }

  throw new ParseError(
    "This file is not a FIT or GPX activity. Export your run as .fit or .gpx and try again.",
    "unsupported",
  );
}

export function detectFormat(
  buffer: ArrayBuffer,
  fileName?: string,
): "fit" | "gpx" | "unknown" {
  const bytes = new Uint8Array(buffer);

  if (bytes.length >= 12) {
    const headerSize = bytes[0];
    const signature = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if ((headerSize === 12 || headerSize === 14) && signature === ".FIT") return "fit";
  }

  // Look past any byte-order mark or leading whitespace for an XML declaration.
  const head = new TextDecoder("utf-8").decode(bytes.slice(0, 512)).trimStart();
  if (head.startsWith("<?xml") || head.startsWith("<gpx")) {
    return head.includes("<gpx") || head.includes("<trk") ? "gpx" : "unknown";
  }

  const lower = fileName?.toLowerCase() ?? "";
  if (lower.endsWith(".fit")) return "fit";
  if (lower.endsWith(".gpx")) return "gpx";

  return "unknown";
}
