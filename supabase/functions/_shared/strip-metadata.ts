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
  | { ok: true; format: ImageFormat; bytes: Uint8Array; width: number; height: number }
  | { ok: false; reason: "unsupported_format" | "malformed" | "too_large" };

/**
 * Ceiling on total pixels, and the whole decompression-bomb defence.
 *
 * A bomb is small on disk and enormous once decoded — a 64000x64000 PNG is a
 * few KB of run-length-friendly data and 4,096 megapixels of memory for
 * whoever opens it. The defence is that the dimensions are declared in the
 * header, so the cost of checking is bounded by the header rather than by
 * what the file claims to expand to. Nothing here ever decodes.
 *
 * 50 MP sits above every mainstream phone (48 MP sensors are the current high
 * end, and the default capture is nearer 12 MP) and decisively below a bomb.
 * A genuine photo that large would also be far past `MAX_IMAGE_CHARS` in
 * `label-ocr`, so this cap costs no real capture anything.
 */
const MAX_PIXELS = 50_000_000;

/**
 * Ceiling on either side on its own.
 *
 * The pixel cap alone would admit 1 x 30,000,000, which is cheap to encode,
 * absurd as a photograph, and the shape that finds edge cases in decoders
 * that assume a sane aspect ratio.
 */
const MAX_DIMENSION = 20_000;

function withinCaps(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) return false;
  return width * height <= MAX_PIXELS;
}

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
 * Strip all metadata from `bytes`, prove the result is genuinely a
 * well-formed image within the size caps, or explain why it is not.
 *
 * An unrecognised container is refused rather than passed through. Refusing
 * is the safe default: forwarding a format we cannot walk is exactly the case
 * where metadata survives, and our own client only ever produces JPEG.
 *
 * Note what this deliberately does NOT do: decode and re-encode the pixels.
 * The two things a re-encode is usually credited with — dropping embedded
 * payloads and killing polyglot files — already fall out of the structural
 * rewrite below. What it would uniquely add is protection against an image
 * crafted to exploit a decoder, and we have no decoder: these bytes are
 * walked here and handed to Google Cloud Vision. Re-encoding would mean
 * opening the file ourselves first, moving that risk off Google's hardened
 * decoder and onto this isolate. See `docs/threat-model.md`.
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
 * Whether this marker is a frame header, which is what declares the image's
 * dimensions.
 *
 * `SOF0`-`SOF15` occupy 0xC0-0xCF, but three values in that range are not
 * frame headers at all and must not be read as one: 0xC4 is a Huffman table,
 * 0xC8 is reserved, and 0xCC is an arithmetic-coding conditioning table.
 * Treating a Huffman table's first bytes as a width is how a parser ends up
 * reporting nonsense dimensions for a perfectly ordinary photo.
 */
function isFrameHeader(marker: number): boolean {
  if (marker < 0xc0 || marker > 0xcf) return false;
  return marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

/**
 * Output is never larger than the input plus the synthesized JFIF APP0: this
 * only ever drops segments, and adds those 18 bytes. Preallocating to that
 * bound lets the whole walk write into one `Uint8Array` through a cursor.
 *
 * The alternative — accumulating into a plain `number[]` and converting at
 * the end — is what this originally did, and it cost roughly eight times the
 * image in peak memory: a boxed JS array holds about 8 bytes per element, and
 * the conversion allocates the real buffer alongside it. On a 4 MB photo that
 * is ~36 MB per request, with nothing bounding how many requests are in
 * flight at once. Bounding the pipeline's own resource use is exactly what
 * this issue is about, so it would be odd to leave that in place.
 */
function stripJpeg(bytes: Uint8Array): StripResult {
  const out = new Uint8Array(bytes.length + JFIF_APP0.length);
  let n = 0;
  out[n++] = 0xff;
  out[n++] = SOI;
  for (const b of JFIF_APP0) out[n++] = b;

  // A file is only accepted once it has proved it is really an image: a frame
  // header declaring its dimensions, and at least one scan of pixel data.
  // Magic bytes alone are trivially spoofed by prefixing FFD8FF to an
  // archive, so "type determined from content" has to mean the structure,
  // not the first three bytes.
  let width = 0;
  let height = 0;
  let sawScan = false;

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
      out[n++] = 0xff;
      out[n++] = EOI;
      return finishJpeg(out, n, width, height, sawScan);
    }

    const lengthAt = markerAt + 2;
    if (lengthAt + 1 >= bytes.length) return { ok: false, reason: "malformed" };
    const length = (bytes[lengthAt] << 8) | bytes[lengthAt + 1];
    // The length field counts itself, so anything under 2 cannot be walked.
    if (length < 2) return { ok: false, reason: "malformed" };
    const segmentEnd = lengthAt + length;
    if (segmentEnd > bytes.length) return { ok: false, reason: "malformed" };

    if (isFrameHeader(marker)) {
      // precision(1), height(2), width(2), components(1).
      const payload = lengthAt + 2;
      if (payload + 5 > bytes.length) return { ok: false, reason: "malformed" };
      height = (bytes[payload + 1] << 8) | bytes[payload + 2];
      width = (bytes[payload + 3] << 8) | bytes[payload + 4];
      // Refused here rather than after the copy: the point of reading the
      // header is to reject a bomb before spending anything on its body.
      if (!withinCaps(width, height)) return { ok: false, reason: "too_large" };
    }

    if (isMetadataMarker(marker, bytes, lengthAt + 2, segmentEnd)) {
      i = segmentEnd;
      continue;
    }

    for (let k = markerAt; k < segmentEnd; k++) out[n++] = bytes[k];

    if (marker === SOS) {
      sawScan = true;
      // Entropy-coded data follows with no length of its own, so it has to be
      // scanned for the next real marker. A progressive JPEG has several
      // scans, so this returns to the marker loop rather than running to EOF.
      const copied = copyEntropyData(bytes, segmentEnd, out, n);
      n = copied.written;
      i = copied.next;
      continue;
    }

    i = segmentEnd;
  }

  // Ran off the end without an EOI. Real cameras do produce truncated files
  // (a full card, an interrupted write) and the OCR only needs whatever scan
  // lines arrived, so closing the stream beats rejecting the photo.
  out[n++] = 0xff;
  out[n++] = EOI;
  return finishJpeg(out, n, width, height, sawScan);
}

function finishJpeg(
  out: Uint8Array,
  written: number,
  width: number,
  height: number,
  sawScan: boolean
): StripResult {
  // No frame header means no declared dimensions, and no scan means no pixel
  // data — in either case this is not an image, whatever its first bytes say.
  if (width === 0 || height === 0 || !sawScan) return { ok: false, reason: "malformed" };
  return { ok: true, format: "jpeg", bytes: out.subarray(0, written), width, height };
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
  if (marker === APP14 && payloadEnd - payloadStart >= ADOBE.length) {
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
function copyEntropyData(
  bytes: Uint8Array,
  from: number,
  out: Uint8Array,
  written: number
): { next: number; written: number } {
  let i = from;
  let n = written;
  while (i < bytes.length) {
    if (bytes[i] === 0xff) {
      const next = bytes[i + 1];
      if (next === undefined) break;
      if (next !== 0x00 && !(next >= RST0 && next <= RST7)) return { next: i, written: n };
      out[n++] = bytes[i];
      out[n++] = next;
      i += 2;
      continue;
    }
    out[n++] = bytes[i];
    i += 1;
  }
  return { next: bytes.length, written: n };
}

// ── PNG ─────────────────────────────────────────────────────────────────────

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
  // Only ever drops chunks, so the input length is a safe upper bound.
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let k = 0; k < PNG_MAGIC.length; k++) out[n++] = bytes[k];

  let width = 0;
  let height = 0;
  let sawData = false;

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

    if (type === "IHDR") {
      // IHDR must be the first chunk, and its payload is width(4), height(4),
      // then bit depth and colour type. A second IHDR, or one that is not
      // first, is not a PNG we are willing to reason about.
      if (i !== PNG_MAGIC.length || width !== 0) return { ok: false, reason: "malformed" };
      if (length < 13) return { ok: false, reason: "malformed" };
      const payload = i + 8;
      width =
        bytes[payload] * 0x1000000 +
        (bytes[payload + 1] << 16) +
        (bytes[payload + 2] << 8) +
        bytes[payload + 3];
      height =
        bytes[payload + 4] * 0x1000000 +
        (bytes[payload + 5] << 16) +
        (bytes[payload + 6] << 8) +
        bytes[payload + 7];
      // The bomb check, and the reason it is cheap: a 64000x64000 PNG says so
      // here, in the first 25 bytes, however little it weighs on disk.
      if (!withinCaps(width, height)) return { ok: false, reason: "too_large" };
    } else if (width === 0) {
      // Any chunk before IHDR means the datastream is not a PNG.
      return { ok: false, reason: "malformed" };
    }

    if (type === "IDAT") sawData = true;

    // Chunks are copied whole, CRC included, so nothing needs recomputing.
    if (PNG_KEEP.has(type)) {
      for (let k = i; k < chunkEnd; k++) out[n++] = bytes[k];
    }

    // IEND closes the datastream. Anything past it is an appended payload,
    // and the same polyglot argument as JPEG's EOI applies.
    if (type === "IEND") {
      // No pixel data means this is a container, not a picture.
      if (!sawData) return { ok: false, reason: "malformed" };
      return { ok: true, format: "png", bytes: out.subarray(0, n), width, height };
    }

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

export type Base64StripResult =
  | { ok: true; base64: string; format: ImageFormat; width: number; height: number }
  | { ok: false; reason: "not_base64" | "unsupported_format" | "malformed" | "too_large" };

/**
 * The whole operation as both callers need it: base64 in, sanitised base64
 * out, or a reason.
 *
 * The reason is carried rather than collapsed to `null` because the server
 * owes the caller different answers for different failures — an image that is
 * too large is a 413 and a retake, an unrecognised container is a 415 — and
 * because "we could not read that" and "that was 4,096 megapixels" should not
 * look the same in a log.
 */
export function stripBase64ImageMetadata(base64: string): Base64StripResult {
  const bytes = bytesFromBase64(base64);
  if (bytes === null) return { ok: false, reason: "not_base64" };

  const stripped = stripImageMetadata(bytes);
  if (!stripped.ok) return { ok: false, reason: stripped.reason };

  return {
    ok: true,
    base64: base64FromBytes(stripped.bytes),
    format: stripped.format,
    width: stripped.width,
    height: stripped.height,
  };
}
