import fs from "node:fs";
import path from "node:path";

import {
  base64FromBytes,
  bytesFromBase64,
  sniffFormat,
  stripBase64ImageMetadata,
  stripImageMetadata,
} from "@/lib/image-metadata";

/**
 * `lib/image-metadata.ts` re-exports `supabase/functions/_shared/strip-metadata.ts`
 * verbatim, so everything below exercises the exact module the Edge Function
 * runs — not a client-side lookalike that could drift from it.
 *
 * Fixtures are built here in code rather than checked in as binaries. A
 * GPS-tagged JPEG committed to the repo is opaque in a diff and unverifiable
 * in review; assembled from labelled byte arrays, the thing under test is
 * legible, and the GPS coordinates the stripper has to remove are visible in
 * the source of the test that asserts they are gone.
 */

// ── Fixture builders ────────────────────────────────────────────────────────

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

/** A marker segment: FF, marker, 2-byte big-endian length (counting itself). */
function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
}

/**
 * A real EXIF APP1 payload: "Exif\0\0", a little-endian TIFF header, one IFD0
 * entry pointing at a GPS IFD, and a GPS IFD carrying a latitude. The
 * coordinate bytes are the point of the fixture — `GPS_LATITUDE_BYTES` below
 * is what must not survive.
 */
const GPS_LATITUDE_BYTES = [0x33, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00];

function exifWithGps(): number[] {
  return [
    ...ascii("Exif"),
    0x00,
    0x00,
    // TIFF header: little-endian, magic 42, IFD0 at offset 8.
    0x49,
    0x49,
    0x2a,
    0x00,
    0x08,
    0x00,
    0x00,
    0x00,
    // IFD0: one entry, tag 0x8825 (GPSInfoIFDPointer), LONG, count 1, → 0x1a.
    0x01,
    0x00,
    0x25,
    0x88,
    0x04,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x1a,
    0x00,
    0x00,
    0x00,
    // Next-IFD offset: none.
    0x00,
    0x00,
    0x00,
    0x00,
    // GPS IFD: one entry, tag 0x0002 (GPSLatitude), RATIONAL, → 0x2c.
    0x01,
    0x00,
    0x02,
    0x00,
    0x05,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x2c,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    // The coordinate itself: 51/1 degrees.
    ...GPS_LATITUDE_BYTES,
  ];
}

const XMP = [...ascii("http://ns.adobe.com/xap/1.0/"), 0x00, ...ascii("<x:xmpmeta/>")];
const IPTC = [...ascii("Photoshop 3.0"), 0x00, 0x38, 0x42, 0x49, 0x4d];

/** Quantisation table — picture data, and so must survive untouched. */
const DQT = segment(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 255) + 1)]);
/** Baseline frame header: 8-bit, 16x16, one component. */
const SOF0 = segment(0xc0, [0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00]);
const SOS_HEADER = segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);

/**
 * Entropy-coded data containing both escape sequences that must be read as
 * data rather than as the end of the scan: FF00 byte stuffing and an FFD0
 * restart marker.
 */
const ENTROPY = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a];

function jpegWithMetadata(): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF"), 0x00, 0x01, 0x02, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    ...segment(0xe1, exifWithGps()),
    ...segment(0xe1, XMP),
    ...segment(0xed, IPTC),
    ...segment(0xfe, ascii("shot on a phone at home")),
    ...DQT,
    ...SOF0,
    ...SOS_HEADER,
    ...ENTROPY,
    0xff,
    0xd9,
  ]);
}

function png(chunks: number[][]): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()]);
}

/** length, type, payload, CRC. The CRC is never recomputed, so any four bytes do. */
function pngChunk(type: string, payload: number[]): number[] {
  const n = payload.length;
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
    ...ascii(type),
    ...payload,
    0xde,
    0xad,
    0xbe,
    0xef,
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function indexOfSequence(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let k = 0; k < needle.length; k++) {
      if (haystack[i + k] !== needle[k]) continue outer;
    }
    return i;
  }
  return -1;
}

const contains = (haystack: Uint8Array, needle: number[]) =>
  indexOfSequence(haystack, needle) !== -1;

function stripped(bytes: Uint8Array): Uint8Array {
  const result = stripImageMetadata(bytes);
  if (!result.ok) throw new Error(`expected a strip, got ${result.reason}`);
  return result.bytes;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("sniffFormat", () => {
  it("reads the format from magic bytes, not a declared type", () => {
    expect(sniffFormat(jpegWithMetadata())).toBe("jpeg");
    expect(sniffFormat(png([pngChunk("IEND", [])]))).toBe("png");
  });

  it.each([
    ["GIF", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["WebP", [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
    ["HEIC", [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
    ["not an image at all", ascii("#!/bin/sh\necho hi")],
  ])("returns null for %s", (_label: string, bytes: number[]) => {
    expect(sniffFormat(Uint8Array.from(bytes))).toBeNull();
  });
});

describe("stripImageMetadata: JPEG", () => {
  it("removes the EXIF block, GPS coordinates included", () => {
    const input = jpegWithMetadata();
    expect(contains(input, ascii("Exif"))).toBe(true);
    expect(contains(input, GPS_LATITUDE_BYTES)).toBe(true);

    const out = stripped(input);

    expect(contains(out, ascii("Exif"))).toBe(false);
    expect(contains(out, GPS_LATITUDE_BYTES)).toBe(false);
  });

  it("removes XMP, IPTC and comment segments", () => {
    const out = stripped(jpegWithMetadata());

    expect(contains(out, ascii("http://ns.adobe.com/xap"))).toBe(false);
    expect(contains(out, ascii("Photoshop 3.0"))).toBe(false);
    expect(contains(out, ascii("shot on a phone at home"))).toBe(false);
  });

  it("leaves the picture itself byte-identical", () => {
    const out = stripped(jpegWithMetadata());

    // The frame header, the quantisation table and the whole scan survive
    // exactly as they arrived — this strips metadata, it does not re-encode.
    expect(contains(out, DQT)).toBe(true);
    expect(contains(out, SOF0)).toBe(true);
    expect(contains(out, [...SOS_HEADER, ...ENTROPY])).toBe(true);
  });

  it("emits a well-formed JFIF file", () => {
    const out = stripped(jpegWithMetadata());

    expect(Array.from(out.subarray(0, 2))).toEqual([0xff, 0xd8]);
    expect(Array.from(out.subarray(2, 4))).toEqual([0xff, 0xe0]);
    expect(contains(out.subarray(0, 20), ascii("JFIF"))).toBe(true);
    expect(Array.from(out.subarray(-2))).toEqual([0xff, 0xd9]);
    // Exactly one APP0, not the original plus a synthesized one.
    expect(out.reduce((n, b, i) => (b === 0xe0 && out[i - 1] === 0xff ? n + 1 : n), 0)).toBe(1);
  });

  it("keeps both scans of a progressive JPEG", () => {
    const secondScan = segment(0xda, [0x01, 0x01, 0x00, 0x01, 0x3f, 0x00]);
    const secondEntropy = [0xab, 0xcd, 0xff, 0x00, 0xef];
    const input = Uint8Array.from([
      0xff, 0xd8,
      ...segment(0xe1, exifWithGps()),
      ...SOF0,
      ...SOS_HEADER,
      ...ENTROPY,
      ...secondScan,
      ...secondEntropy,
      0xff, 0xd9,
    ]);

    const out = stripped(input);

    expect(contains(out, [...SOS_HEADER, ...ENTROPY])).toBe(true);
    expect(contains(out, [...secondScan, ...secondEntropy])).toBe(true);
    expect(contains(out, ascii("Exif"))).toBe(false);
  });

  it("drops an appended payload after EOI", () => {
    const tail = ascii("PK a zip archive riding along");
    const input = Uint8Array.from([...jpegWithMetadata(), ...tail]);

    const out = stripped(input);

    expect(contains(out, tail)).toBe(false);
    expect(Array.from(out.subarray(-2))).toEqual([0xff, 0xd9]);
  });

  it("closes a truncated file rather than rejecting the photo", () => {
    const full = jpegWithMetadata();
    const input = full.subarray(0, full.length - 4);

    const out = stripped(input);

    expect(Array.from(out.subarray(-2))).toEqual([0xff, 0xd9]);
  });

  it("keeps an Adobe APP14, which declares colour transform rather than provenance", () => {
    const adobe = segment(0xee, [...ascii("Adobe"), 0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x02]);
    const input = Uint8Array.from([
      0xff, 0xd8,
      ...segment(0xe1, exifWithGps()),
      ...adobe,
      ...SOF0,
      ...SOS_HEADER,
      ...ENTROPY,
      0xff, 0xd9,
    ]);

    const out = stripped(input);

    expect(contains(out, adobe)).toBe(true);
    expect(contains(out, ascii("Exif"))).toBe(false);
  });

  it("drops an APP14 that is not Adobe's", () => {
    const impostor = segment(0xee, ascii("Nikon private note"));
    const input = Uint8Array.from([
      0xff, 0xd8,
      ...impostor,
      ...SOF0,
      ...SOS_HEADER,
      ...ENTROPY,
      0xff, 0xd9,
    ]);

    expect(contains(stripped(input), ascii("Nikon private note"))).toBe(false);
  });
});

describe("stripImageMetadata: PNG", () => {
  const IHDR = pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
  const IDAT = pngChunk("IDAT", [0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);
  const IEND = pngChunk("IEND", []);

  it("removes eXIf, tEXt and iCCP while keeping the image chunks", () => {
    const input = png([
      IHDR,
      pngChunk("eXIf", exifWithGps()),
      pngChunk("tEXt", ascii("Comment taken at home")),
      pngChunk("iCCP", ascii("some device profile")),
      IDAT,
      IEND,
    ]);

    const out = stripped(input);

    expect(contains(out, ascii("eXIf"))).toBe(false);
    expect(contains(out, ascii("taken at home"))).toBe(false);
    expect(contains(out, ascii("some device profile"))).toBe(false);
    expect(contains(out, GPS_LATITUDE_BYTES)).toBe(false);
    expect(contains(out, IHDR)).toBe(true);
    expect(contains(out, IDAT)).toBe(true);
    expect(contains(out, IEND)).toBe(true);
  });

  it("drops an appended payload after IEND", () => {
    const tail = ascii("trailing junk");
    const out = stripped(png([IHDR, IDAT, IEND, tail]));

    expect(contains(out, tail)).toBe(false);
  });

  it("refuses a datastream with no IEND", () => {
    expect(stripImageMetadata(png([IHDR, IDAT]))).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("stripImageMetadata: refusals", () => {
  it.each([
    ["GIF", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ["WebP", [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]],
    ["HEIC", [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]],
    ["empty input", []],
  ])("refuses %s rather than forwarding it unstripped", (_label: string, bytes: number[]) => {
    expect(stripImageMetadata(Uint8Array.from(bytes))).toEqual({
      ok: false,
      reason: "unsupported_format",
    });
  });
});

describe("base64 codec", () => {
  /**
   * Differential against Node's own base64 rather than against itself: a
   * hand-rolled codec that round-trips its own output can still be wrong in a
   * way both halves agree on, and padding is exactly where that happens.
   */
  it("encodes every length from 0 to 300 identically to Node", () => {
    for (let n = 0; n <= 300; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) % 256);
      expect(base64FromBytes(bytes)).toBe(Buffer.from(bytes).toString("base64"));
    }
  });

  it("decodes what Node encodes, across a thousand random buffers", () => {
    for (let t = 0; t < 1000; t++) {
      const n = Math.floor(Math.random() * 500);
      const bytes = Uint8Array.from({ length: n }, () => Math.floor(Math.random() * 256));
      const encoded = Buffer.from(bytes).toString("base64");
      expect(Array.from(bytesFromBase64(encoded)!)).toEqual(Array.from(bytes));
    }
  });

  it("handles a 3 MB payload, the size of a real label photo", () => {
    const bytes = Uint8Array.from({ length: 3_000_000 }, (_, i) => (i * 31) % 256);
    const encoded = base64FromBytes(bytes);

    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
    expect(Buffer.compare(Buffer.from(bytesFromBase64(encoded)!), Buffer.from(bytes))).toBe(0);
  });

  it("tolerates whitespace, and rejects input that is not base64", () => {
    const encoded = Buffer.from("hello world").toString("base64");
    expect(Buffer.from(bytesFromBase64(`${encoded.slice(0, 4)}\n  ${encoded.slice(4)}`)!).toString())
      .toBe("hello world");

    expect(bytesFromBase64("!!!!")).toBeNull();
    // A remainder of one character cannot occur in valid base64.
    expect(bytesFromBase64("abcde")).toBeNull();
  });
});

describe("the shared module stays runnable on every target", () => {
  /**
   * The stripper runs on Deno, on Hermes, in a browser and under Jest, and
   * only one of those is checked by CI. This is the guard for the gap.
   *
   * `atob`/`btoa` are the specific trap, and the reason the codec above is
   * hand-rolled: Hermes does not provide them and neither React Native nor
   * Expo polyfills them, but a bundle referencing them builds and exports
   * perfectly cleanly. The failure surfaces as a ReferenceError the first
   * time someone photographs a label on a real phone — which no test in this
   * repo would have caught, since there are no device tests.
   */
  it("reaches for no runtime global that Hermes lacks", () => {
    const source = fs
      .readFileSync(path.join(__dirname, "..", "supabase", "functions", "_shared", "strip-metadata.ts"), "utf8")
      // Comments name these APIs to explain why they are avoided.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");

    for (const global of ["atob", "btoa", "Buffer", "Deno", "TextDecoder", "TextEncoder"]) {
      expect(source).not.toMatch(new RegExp(`\\b${global}\\b`));
    }
  });

  it("imports nothing, so Metro and Deno can both resolve it", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "supabase", "functions", "_shared", "strip-metadata.ts"),
      "utf8"
    );
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });
});

describe("stripBase64ImageMetadata", () => {
  it("round-trips through base64 and removes the GPS coordinates", () => {
    const out = stripBase64ImageMetadata(base64FromBytes(jpegWithMetadata()));

    expect(out).not.toBeNull();
    expect(contains(bytesFromBase64(out!)!, GPS_LATITUDE_BYTES)).toBe(false);
  });

  it("is idempotent — stripping an already-clean image changes nothing", () => {
    const once = stripBase64ImageMetadata(base64FromBytes(jpegWithMetadata()))!;
    expect(stripBase64ImageMetadata(once)).toBe(once);
  });

  it("survives a payload spanning many encoder chunks", () => {
    // The encoder emits in ~8 KB chunks, so this crosses several — the case
    // where a spread-argument encoder would blow the stack, not merely slow.
    const big = Uint8Array.from([
      0xff, 0xd8,
      ...SOF0,
      ...SOS_HEADER,
      ...Array.from({ length: 40_000 }, (_, i) => (i * 7) % 251),
      0xff, 0xd9,
    ]);

    const out = stripBase64ImageMetadata(base64FromBytes(big));

    expect(out).not.toBeNull();
    expect(bytesFromBase64(out!)!.length).toBeGreaterThan(40_000);
  });

  it("returns null for input that is not base64, and for base64 that is not an image", () => {
    expect(stripBase64ImageMetadata("not base64 at all!!")).toBeNull();
    expect(stripBase64ImageMetadata(base64FromBytes(Uint8Array.from(ascii("hello"))))).toBeNull();
  });
});
