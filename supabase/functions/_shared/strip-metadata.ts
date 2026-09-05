// Remove every metadata container from an image, keeping the picture itself
// byte-for-byte.
//
// A phone camera writes GPS coordinates, a device identifier and a capture
// timestamp into the file it produces. `label-ocr` hands that file to Google
// Cloud Vision, so without this the user's home address crosses a third-party
// boundary attached to a photo of a shampoo bottle. Nothing is stored, which
// is why the leak is in transit rather than at rest — see `docs/threat-model.md`.
//
// This rewrites the container structure rather than decoding and re-encoding
// pixels. That is a deliberate trade: a full re-encode (issue #21) would also
// defeat decoder exploits, but it needs a WASM codec and real CPU inside a
// Deno isolate that has already died on its compute limit once. Walking the
// markers is O(n) memcpy, needs no dependency, and removes EXIF/XMP/IPTC
// completely — which is the whole of issue #22.
//
// Deliberately free of imports and of Deno globals: `lib/image-metadata.ts`
// re-exports this exact file to the React Native client, so one implementation
// runs on Deno, Hermes, the browser and Jest. Do not reach for `Deno.*`,
// `Buffer`, or a node: import here.

export type ImageFormat = "jpeg" | "png";

export type StripResult =
  | { ok: true; format: ImageFormat; bytes: Uint8Array }
  | { ok: false; reason: "unsupported_format" | "malformed" };

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The format, decided from the leading bytes and nothing else.
 *
 * Never from a declared MIME type or a file extension: both are supplied by
 * whoever sent the bytes, and `label-ocr` is unauthenticated. A caller that
 * claims "image/jpeg" over a HEIC file would otherwise get its metadata
 * forwarded untouched, because the JPEG walker bails on the first byte and
 * something has to decide what happens next.
 */
export function sniffFormat(bytes: Uint8Array): ImageFormat | null {
  if (startsWith(bytes, JPEG_MAGIC)) return "jpeg";
  if (startsWith(bytes, PNG_MAGIC)) return "png";
  return null;
}

/**
 * Strip all metadata from `bytes`, or explain why it could not.
 *
 * An unrecognised container is refused rather than passed through. Refusing
 * is the safe default: forwarding a format we cannot walk is exactly the case
 * where metadata survives, and our own client only ever produces JPEG.
 */
export function stripImageMetadata(bytes: Uint8Array): StripResult {
  const format = sniffFormat(bytes);
  if (format === null) return { ok: false, reason: "unsupported_format" };
  return format === "jpeg" ? stripJpeg(bytes) : stripPng(bytes);
}

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

// ── JPEG ────────────────────────────────────────────────────────────────────

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const COM = 0xfe;
const APP0 = 0xe0;
const APP14 = 0xee;
const APP15 = 0xef;
const RST0 = 0xd0;
const RST7 = 0xd7;
const TEM = 0x01;

/**
 * A canonical JFIF APP0, emitted in place of whatever APP0 the file arrived
 * with: length 16, "JFIF\0", version 1.02, no density units, 1x1 aspect, no
 * thumbnail. Every APPn is dropped wholesale below, and while a JPEG with no
 * APP0 at all is perfectly legal, decoders in the wild are far better
 * exercised against a conventional JFIF header than against a bare stream —
 * 18 bytes buys that while carrying no metadata forward.
 */
const JFIF_APP0 = [
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01,
  0x00, 0x00,
];

/** "Adobe", the payload prefix identifying an APP14 colour-transform marker. */
const ADOBE = [0x41, 0x64, 0x6f, 0x62, 0x65];

/**
 * The real Adobe APP14 payload is always exactly this long: the 5-byte
 * "Adobe" tag plus DCTEncodeVersion(2) + APP14Flags0(2) + APP14Flags1(2) +
 * ColorTransform(1). Anything longer is not a colour-transform declaration —
 * it is extra bytes appended after a genuine "Adobe" prefix, which an
 * `>=` length check would let through unexamined.
 */
const ADOBE_APP14_LENGTH = 12;

function stripJpeg(bytes: Uint8Array): StripResult {
  const out: number[] = [0xff, SOI, ...JFIF_APP0];

  let i = 2; // past SOI
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return { ok: false, reason: "malformed" };

    // A marker may be preceded by any number of 0xFF fill bytes.
    let markerAt = i;
    let marker = bytes[markerAt + 1];
    while (marker === 0xff) {
      markerAt += 1;
      marker = bytes[markerAt + 1];
    }
    if (marker === undefined) return { ok: false, reason: "malformed" };

    // Standalone markers carry no length and no payload.
    if (marker === SOI || marker === TEM || (marker >= RST0 && marker <= RST7)) {
      i = markerAt + 2;
      continue;
    }

    // Anything after EOI is not part of the image. Dropping it is how an
    // appended-payload polyglot — a file that is a valid JPEG *and* a valid
    // archive — loses its second half.
    if (marker === EOI) {
      out.push(0xff, EOI);
      return { ok: true, format: "jpeg", bytes: Uint8Array.from(out) };
    }

    const lengthAt = markerAt + 2;
    if (lengthAt + 1 >= bytes.length) return { ok: false, reason: "malformed" };
    const length = (bytes[lengthAt] << 8) | bytes[lengthAt + 1];
    // The length field counts itself, so anything under 2 cannot be walked.
    if (length < 2) return { ok: false, reason: "malformed" };
    const segmentEnd = lengthAt + length;
    if (segmentEnd > bytes.length) return { ok: false, reason: "malformed" };

    if (isMetadataMarker(marker, bytes, lengthAt + 2, segmentEnd)) {
      i = segmentEnd;
      continue;
    }

    for (let k = markerAt; k < segmentEnd; k++) out.push(bytes[k]);

    if (marker === SOS) {
      // Entropy-coded data follows with no length of its own, so it has to be
      // scanned for the next real marker. A progressive JPEG has several
      // scans, so this returns to the marker loop rather than running to EOF.
      i = copyEntropyData(bytes, segmentEnd, out);
      continue;
    }

    i = segmentEnd;
  }

  // Ran off the end without an EOI. Real cameras do produce truncated files
  // (a full card, an interrupted write) and the OCR only needs whatever scan
  // lines arrived, so closing the stream beats rejecting the photo.
  out.push(0xff, EOI);
  return { ok: true, format: "jpeg", bytes: Uint8Array.from(out) };
}

/**
 * Whether this segment is metadata rather than picture.
 *
 * Every APPn and every COM goes. That is one structural rule covering EXIF
 * (APP1), XMP (APP1), IPTC/Photoshop (APP13), ICC and MPF (APP2) and whatever
 * maker notes a vendor invents next — as opposed to an allowlist of
 * known-bad tags, which is a list someone has to keep current forever.
 *
 * APP14 is the single exception, and only when it really is Adobe's: it is a
 * short colour-transform declaration with no personal data in it, and
 * dropping it makes a CMYK/YCCK JPEG decode with inverted colour. Phone
 * cameras do not emit those, but the check is cheaper than the failure.
 */
function isMetadataMarker(
  marker: number,
  bytes: Uint8Array,
  payloadStart: number,
  payloadEnd: number
): boolean {
  if (marker === COM) return true;
  if (marker < APP0 || marker > APP15) return false;
  if (marker === APP14 && payloadEnd - payloadStart === ADOBE_APP14_LENGTH) {
    for (let k = 0; k < ADOBE.length; k++) {
      if (bytes[payloadStart + k] !== ADOBE[k]) return true;
    }
    return false;
  }
  return true;
}

/**
 * Copy entropy-coded scan data verbatim, returning where the next marker
 * starts.
 *
 * Inside a scan, 0xFF begins a marker only when what follows is neither 0x00
 * (byte stuffing, which encodes a literal 0xFF in the compressed data) nor a
 * restart marker. Treating either as the end of the scan would truncate the
 * image at the first run of pixels that happened to encode 0xFF.
 */
function copyEntropyData(bytes: Uint8Array, from: number, out: number[]): number {
  let i = from;
  while (i < bytes.length) {
    if (bytes[i] === 0xff) {
      const next = bytes[i + 1];
      if (next === undefined) break;
      if (next !== 0x00 && !(next >= RST0 && next <= RST7)) return i;
      out.push(bytes[i], next);
      i += 2;
      continue;
    }
    out.push(bytes[i]);
    i += 1;
  }
  return bytes.length;
}

// ── PNG ─────────────────────────────────────────────────────────────────────

/**
 * Standard PNG CRC-32 (ISO 3309 / zlib), table built once. No `zlib` or
 * `crypto` import: this file has to run on Deno, Hermes, the browser and
 * Jest with none of them, same reasoning as the hand-rolled base64 below.
 */
const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC over `bytes[start, end)`, matching what a PNG chunk's CRC field covers. */
function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Chunks that carry picture, not provenance.
 *
 * An allowlist rather than a blocklist, so eXIf, tEXt, zTXt, iTXt, tIME, iCCP
 * and any private chunk a tool invents later are dropped by default. iCCP is
 * out deliberately: a colour profile is not needed to read printed text, and
 * its embedded profile-name string is exactly the kind of free text this
 * function exists to remove. acTL/fcTL/fdAT keep APNG animation intact.
 */
const PNG_KEEP = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "sBIT",
  "bKGD",
  "pHYs",
  "acTL",
  "fcTL",
  "fdAT",
]);

function stripPng(bytes: Uint8Array): StripResult {
  const out: number[] = [];
  for (let k = 0; k < PNG_MAGIC.length; k++) out.push(bytes[k]);

  let i = PNG_MAGIC.length;
  while (i < bytes.length) {
    // 4-byte big-endian length, 4-byte type, payload, 4-byte CRC. Multiplying
    // rather than shifting for the high byte: `<< 24` is a signed 32-bit
    // operation in JS, so a chunk over 2 GiB would arrive as a negative
    // length and sail past the bounds check below.
    if (i + 12 > bytes.length) return { ok: false, reason: "malformed" };
    const length =
      bytes[i] * 0x1000000 + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
    const chunkEnd = i + 12 + length;
    if (chunkEnd > bytes.length) return { ok: false, reason: "malformed" };

    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);

    // CRC covers the type and payload, not the length field or itself. A
    // mismatch means the chunk was corrupted or tampered with in transit —
    // checked before the chunk is inspected further, dropped or not, since
    // a bad CRC in a chunk we were about to discard is still a sign the
    // whole file cannot be trusted.
    const declaredCrc =
      bytes[chunkEnd - 4] * 0x1000000 +
      (bytes[chunkEnd - 3] << 16) +
      (bytes[chunkEnd - 2] << 8) +
      bytes[chunkEnd - 1];
    if (crc32(bytes, i + 4, chunkEnd - 4) !== declaredCrc) {
      return { ok: false, reason: "malformed" };
    }

    // Chunks are copied whole, CRC included, so nothing needs recomputing.
    if (PNG_KEEP.has(type)) {
      for (let k = i; k < chunkEnd; k++) out.push(bytes[k]);
    }

    // IEND closes the datastream. Anything past it is an appended payload,
    // and the same polyglot argument as JPEG's EOI applies.
    if (type === "IEND") return { ok: true, format: "png", bytes: Uint8Array.from(out) };

    i = chunkEnd;
  }

  // No IEND at all: the datastream never legally ended, so we cannot claim to
  // have seen the whole of it.
  return { ok: false, reason: "malformed" };
}

// ── base64 ──────────────────────────────────────────────────────────────────

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function hasWhitespace(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) return true;
  }
  return false;
}

/**
 * Reverse lookup, built once. -1 marks a byte that is not a base64 digit.
 */
const DECODE_TABLE = (() => {
  const table = new Int8Array(256).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/**
 * Hand-rolled rather than `atob`/`btoa`, `Buffer`, or a polyfill package.
 *
 * This is not paranoia about obscure runtimes — it is the concrete state of
 * the ones this file has to run in. Deno and browsers do provide `atob`, but
 * **Hermes does not**, and neither React Native nor Expo polyfills it: there
 * is no `btoa` anywhere in `react-native`, `@react-native/js-polyfills`, or
 * `expo`. Reaching for it would compile and bundle perfectly happily, then
 * throw `ReferenceError: atob is not defined` the first time someone
 * photographed a label on a real phone. `Buffer` is absent there for the same
 * reason, and a polyfill dependency is not available to the Deno side at all.
 *
 * Forty lines of table lookup removes the entire question.
 */
export function bytesFromBase64(base64: string): Uint8Array | null {
  // Whitespace is legal in transport-encoded base64 and carries no bits, but
  // a camera payload never contains any — and rebuilding a 4 MB string one
  // character at a time to strip nothing was over half the cost of this
  // function. Look first, and copy only if there is something to remove.
  const clean = hasWhitespace(base64) ? base64.replace(/[\s]+/g, "") : base64;

  let end = clean.length;
  while (end > 0 && clean[end - 1] === "=") end -= 1;
  // A 4-character group encodes 3 bytes; a remainder of 1 encodes nothing and
  // cannot occur in valid base64.
  if (end % 4 === 1) return null;

  const bytes = new Uint8Array(Math.floor((end * 3) / 4));
  let out = 0;
  let accumulator = 0;
  let bits = 0;
  for (let i = 0; i < end; i++) {
    const value = DECODE_TABLE[clean.charCodeAt(i)];
    if (value === -1) return null;
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (accumulator >> bits) & 0xff;
    }
  }
  return bytes;
}

/**
 * Output is assembled in chunks and joined rather than appended to one
 * growing string: a 3 MB image encodes to 4 MB of base64, and repeated
 * concatenation at that size is where a naive encoder spends most of its
 * time on an interpreter.
 */
const ENCODE_CHUNK = 8190; // a multiple of 3, so no group straddles a chunk

export function base64FromBytes(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += ENCODE_CHUNK) {
    const end = Math.min(start + ENCODE_CHUNK, bytes.length);
    let chunk = "";
    let i = start;
    for (; i + 2 < end; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      chunk +=
        ALPHABET[(n >> 18) & 63] +
        ALPHABET[(n >> 12) & 63] +
        ALPHABET[(n >> 6) & 63] +
        ALPHABET[n & 63];
    }
    // The final group of the final chunk is the only partial one, and it is
    // padded to four characters.
    if (i < end) {
      const remaining = end - i;
      const n = (bytes[i] << 16) | (remaining > 1 ? bytes[i + 1] << 8 : 0);
      chunk += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
      chunk += remaining > 1 ? ALPHABET[(n >> 6) & 63] : "=";
      chunk += "=";
    }
    chunks.push(chunk);
  }
  return chunks.join("");
}

/**
 * The whole operation as both callers need it: base64 in, stripped base64
 * out, `null` when the payload is not an image we can walk.
 */
export function stripBase64ImageMetadata(base64: string): string | null {
  const bytes = bytesFromBase64(base64);
  if (bytes === null) return null;
  const stripped = stripImageMetadata(bytes);
  if (!stripped.ok) return null;
  return base64FromBytes(stripped.bytes);
}
