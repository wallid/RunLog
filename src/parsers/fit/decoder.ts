import { ParseError } from "../types";

/**
 * A minimal FIT protocol decoder.
 *
 * FIT files are self-describing: every data message is preceded by a definition
 * message that declares each field's number, size and base type. That means a
 * decoder can interpret only the fields it cares about while still skipping
 * everything else byte-correctly — including developer fields it has never seen.
 *
 * Reference: FIT Protocol 2.0 (Garmin).
 */

/** FIT timestamps count seconds from 1989-12-31T00:00:00Z. */
const FIT_EPOCH_OFFSET_S = 631065600;

export interface DecodedMessage {
  globalMessageNumber: number;
  /** Field number to decoded value. Arrays collapse to their first element. */
  fields: Map<number, number>;
}

interface FieldDefinition {
  fieldNumber: number;
  size: number;
  baseTypeNumber: number;
}

interface MessageDefinition {
  globalMessageNumber: number;
  littleEndian: boolean;
  fields: FieldDefinition[];
  /** Total bytes of developer fields, which we skip wholesale. */
  developerBytes: number;
  totalSize: number;
}

interface BaseType {
  size: number;
  invalid: number;
  read: (view: DataView, offset: number, littleEndian: boolean) => number;
  signed: boolean;
}

/**
 * FIT base types, indexed by the low 5 bits of the base-type byte.
 * `invalid` is the sentinel the protocol reserves to mean "no value".
 */
const BASE_TYPES: Record<number, BaseType> = {
  0x00: { size: 1, invalid: 0xff, signed: false, read: (v, o) => v.getUint8(o) }, // enum
  0x01: { size: 1, invalid: 0x7f, signed: true, read: (v, o) => v.getInt8(o) }, // sint8
  0x02: { size: 1, invalid: 0xff, signed: false, read: (v, o) => v.getUint8(o) }, // uint8
  0x83: { size: 2, invalid: 0x7fff, signed: true, read: (v, o, le) => v.getInt16(o, le) },
  0x84: { size: 2, invalid: 0xffff, signed: false, read: (v, o, le) => v.getUint16(o, le) },
  0x85: { size: 4, invalid: 0x7fffffff, signed: true, read: (v, o, le) => v.getInt32(o, le) },
  0x86: { size: 4, invalid: 0xffffffff, signed: false, read: (v, o, le) => v.getUint32(o, le) },
  0x07: { size: 1, invalid: 0x00, signed: false, read: (v, o) => v.getUint8(o) }, // string
  0x88: { size: 4, invalid: 0xffffffff, signed: false, read: (v, o, le) => v.getFloat32(o, le) },
  0x89: { size: 8, invalid: 0xffffffff, signed: false, read: (v, o, le) => v.getFloat64(o, le) },
  0x0a: { size: 1, invalid: 0x00, signed: false, read: (v, o) => v.getUint8(o) }, // uint8z
  0x8b: { size: 2, invalid: 0x0000, signed: false, read: (v, o, le) => v.getUint16(o, le) },
  0x8c: { size: 4, invalid: 0x00000000, signed: false, read: (v, o, le) => v.getUint32(o, le) },
  0x0d: { size: 1, invalid: 0xff, signed: false, read: (v, o) => v.getUint8(o) }, // byte
  0x8e: { size: 8, invalid: 0x7fffffff, signed: true, read: (v, o, le) => Number(v.getBigInt64(o, le)) },
  0x8f: { size: 8, invalid: 0xffffffff, signed: false, read: (v, o, le) => Number(v.getBigUint64(o, le)) },
  0x90: { size: 8, invalid: 0x00000000, signed: false, read: (v, o, le) => Number(v.getBigUint64(o, le)) },
};

function baseTypeFor(baseTypeNumber: number): BaseType | undefined {
  return BASE_TYPES[baseTypeNumber] ?? BASE_TYPES[baseTypeNumber & 0x1f];
}

/**
 * Decodes every data message in a FIT file.
 *
 * Chained files (a second FIT header immediately after the first data section)
 * are decoded as one stream, which is how multi-session exports are stored.
 */
export function decodeFit(buffer: ArrayBuffer): {
  messages: DecodedMessage[];
  warnings: string[];
} {
  const view = new DataView(buffer);
  const messages: DecodedMessage[] = [];
  const warnings: string[] = [];

  let fileStart = 0;
  while (fileStart < buffer.byteLength) {
    const header = readFileHeader(view, fileStart, warnings);
    const dataStart = fileStart + header.headerSize;
    const dataEnd = Math.min(dataStart + header.dataSize, buffer.byteLength);

    if (header.dataSize <= 0 || dataEnd <= dataStart) break;

    decodeDataSection(view, dataStart, dataEnd, messages, warnings);

    // Skip past the data section and its two-byte CRC to any chained file.
    const next = dataEnd + 2;
    if (next >= buffer.byteLength || next <= fileStart) break;
    // A chained file must start with a plausible header; otherwise stop cleanly.
    if (!looksLikeFitHeader(view, next)) break;
    fileStart = next;
  }

  if (messages.length === 0) {
    throw new ParseError("No activity data could be read from this FIT file.");
  }

  return { messages, warnings };
}

function looksLikeFitHeader(view: DataView, offset: number): boolean {
  if (offset + 12 > view.byteLength) return false;
  const headerSize = view.getUint8(offset);
  if (headerSize !== 12 && headerSize !== 14) return false;
  return (
    view.getUint8(offset + 8) === 0x2e && // '.'
    view.getUint8(offset + 9) === 0x46 && // 'F'
    view.getUint8(offset + 10) === 0x49 && // 'I'
    view.getUint8(offset + 11) === 0x54 // 'T'
  );
}

function readFileHeader(
  view: DataView,
  offset: number,
  warnings: string[],
): { headerSize: number; dataSize: number } {
  if (offset + 12 > view.byteLength) {
    throw new ParseError("This FIT file is too short to contain a valid header.");
  }
  const headerSize = view.getUint8(offset);
  if (headerSize !== 12 && headerSize !== 14) {
    throw new ParseError("This file does not look like a FIT file.", "unsupported");
  }
  if (!looksLikeFitHeader(view, offset)) {
    // The '.FIT' signature is technically optional in the 12-byte header.
    if (offset === 0) warnings.push("The FIT signature was missing; reading anyway.");
  }
  const dataSize = view.getUint32(offset + 4, true);
  return { headerSize, dataSize };
}

function decodeDataSection(
  view: DataView,
  start: number,
  end: number,
  messages: DecodedMessage[],
  warnings: string[],
): void {
  /** Local message type (0-15) to its active definition. */
  const definitions = new Map<number, MessageDefinition>();
  let position = start;
  /** Most recent full timestamp, needed to expand compressed-timestamp headers. */
  let lastTimestamp: number | undefined;

  while (position < end) {
    const recordHeader = view.getUint8(position);
    position += 1;

    const isCompressedTimestamp = (recordHeader & 0x80) !== 0;

    if (isCompressedTimestamp) {
      const localType = (recordHeader >> 5) & 0x03;
      const timeOffset = recordHeader & 0x1f;
      const definition = definitions.get(localType);
      if (!definition) {
        warnings.push("A FIT record referenced an unknown message type and was skipped.");
        break;
      }
      if (position + definition.totalSize > end) break;
      const message = readDataMessage(view, position, definition);
      position += definition.totalSize;

      // The 5-bit offset replaces the low bits of the running timestamp and
      // rolls over every 32 seconds.
      if (lastTimestamp !== undefined) {
        const previousOffset = lastTimestamp & 0x1f;
        const rollover = timeOffset < previousOffset ? 0x20 : 0;
        lastTimestamp = lastTimestamp - previousOffset + timeOffset + rollover;
        message.fields.set(FIELD_TIMESTAMP, lastTimestamp);
      }
      messages.push(message);
      continue;
    }

    const localType = recordHeader & 0x0f;
    const isDefinition = (recordHeader & 0x40) !== 0;

    if (isDefinition) {
      const hasDeveloperFields = (recordHeader & 0x20) !== 0;
      const definition = readDefinitionMessage(view, position, hasDeveloperFields, end);
      if (!definition) break;
      definitions.set(localType, definition.definition);
      position = definition.nextPosition;
      continue;
    }

    const definition = definitions.get(localType);
    if (!definition) {
      warnings.push("A FIT record referenced an unknown message type and was skipped.");
      break;
    }
    if (position + definition.totalSize > end) break;
    const message = readDataMessage(view, position, definition);
    position += definition.totalSize;

    const timestamp = message.fields.get(FIELD_TIMESTAMP);
    if (timestamp !== undefined) lastTimestamp = timestamp;

    messages.push(message);
  }
}

function readDefinitionMessage(
  view: DataView,
  position: number,
  hasDeveloperFields: boolean,
  end: number,
): { definition: MessageDefinition; nextPosition: number } | undefined {
  if (position + 5 > end) return undefined;
  // Byte 0 is reserved.
  const littleEndian = view.getUint8(position + 1) === 0;
  const globalMessageNumber = view.getUint16(position + 2, littleEndian);
  const fieldCount = view.getUint8(position + 4);

  let cursor = position + 5;
  if (cursor + fieldCount * 3 > end) return undefined;

  const fields: FieldDefinition[] = [];
  for (let i = 0; i < fieldCount; i++) {
    fields.push({
      fieldNumber: view.getUint8(cursor),
      size: view.getUint8(cursor + 1),
      baseTypeNumber: view.getUint8(cursor + 2),
    });
    cursor += 3;
  }

  // Developer fields carry application-defined data. We only need their sizes so
  // the byte stream stays aligned.
  let developerBytes = 0;
  if (hasDeveloperFields) {
    if (cursor >= end) return undefined;
    const developerFieldCount = view.getUint8(cursor);
    cursor += 1;
    if (cursor + developerFieldCount * 3 > end) return undefined;
    for (let i = 0; i < developerFieldCount; i++) {
      developerBytes += view.getUint8(cursor + 1);
      cursor += 3;
    }
  }

  const totalSize = fields.reduce((acc, f) => acc + f.size, 0) + developerBytes;

  return {
    definition: { globalMessageNumber, littleEndian, fields, developerBytes, totalSize },
    nextPosition: cursor,
  };
}

function readDataMessage(
  view: DataView,
  position: number,
  definition: MessageDefinition,
): DecodedMessage {
  const fields = new Map<number, number>();
  let cursor = position;

  for (const field of definition.fields) {
    const baseType = baseTypeFor(field.baseTypeNumber);
    if (!baseType || baseType.size === 0 || field.size % baseType.size !== 0) {
      cursor += field.size;
      continue;
    }
    // Arrays are stored as repeated values; the first element is what we need
    // for every field this app reads.
    const raw = baseType.read(view, cursor, definition.littleEndian);
    if (raw !== baseType.invalid) fields.set(field.fieldNumber, raw);
    cursor += field.size;
  }

  return { globalMessageNumber: definition.globalMessageNumber, fields };
}

/** Field 253 is `timestamp` on every message type that has one. */
export const FIELD_TIMESTAMP = 253;

export function fitTimestampToDate(value: number): Date {
  return new Date((value + FIT_EPOCH_OFFSET_S) * 1000);
}
