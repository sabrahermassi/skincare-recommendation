import { manipulateAsync } from "expo-image-manipulator";

import { fitUpload } from "@/lib/fit-upload";
import { MAX_IMAGE_CHARS } from "@/supabase/functions/_shared/image-limits";

jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));

type Resize = { width: number };
const manipulate = manipulateAsync as unknown as {
  mockImplementation(fn: (uri: string, actions: { resize: Resize }[]) => Promise<unknown>): void;
  mock: { calls: [string, { resize: Resize }[], unknown][] };
};

const TOO_BIG = "x".repeat(MAX_IMAGE_CHARS + 1);

/** A fake encoder: the base64 is over the limit above `fitsBelow` pixels wide. */
function encodeFitsBelow(fitsBelow: number) {
  manipulate.mockImplementation(async (_uri, actions) => {
    const width = actions[0].resize.width;
    return { uri: `file:///cache/${width}.jpg`, base64: width < fitsBelow ? "FITS" : TOO_BIG, width };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

/** #251: shrink a label photo until its encoded size fits label-ocr's limit. */
describe("fitUpload", () => {
  it("leaves a photo that already fits untouched", async () => {
    expect(await fitUpload("file:///p.jpg", "SMALL", 2000)).toEqual({ base64: "SMALL", tempUris: [] });
    expect(manipulate.mock.calls).toHaveLength(0);
  });

  it("steps down from the width actually sent until it fits, and hands back what it made", async () => {
    encodeFitsBelow(1200);
    const fitted = await fitUpload("file:///p.jpg", TOO_BIG, 2000);

    expect(manipulate.mock.calls.map((call) => call[1][0].resize.width)).toEqual([1500, 1000]);
    expect(manipulate.mock.calls.every((call) => call[0] === "file:///p.jpg")).toBe(true);
    expect(fitted).toEqual({ base64: "FITS", tempUris: ["file:///cache/1500.jpg", "file:///cache/1000.jpg"] });
  });

  it("stops at the first size that fits", async () => {
    encodeFitsBelow(1600);
    const fitted = await fitUpload("file:///p.jpg", TOO_BIG, 2000);
    expect(manipulate.mock.calls).toHaveLength(1);
    expect(fitted.base64).toBe("FITS");
  });

  it("never goes below the legibility floor (only lowers quality there), and returns its last try when nothing fits", async () => {
    encodeFitsBelow(0);
    const fitted = await fitUpload("file:///p.jpg", TOO_BIG, 1200);
    expect(manipulate.mock.calls.map((call) => call[1][0].resize.width)).toEqual([1000, 1000]);
    expect(manipulate.mock.calls.map((call) => (call[2] as { compress: number }).compress)).toEqual([0.7, 0.6]);
    expect(fitted.base64).toBe(TOO_BIG);
  });

  it("can't shrink a photo of unknown width, so sends it as it is", async () => {
    expect(await fitUpload("file:///p.jpg", TOO_BIG, undefined)).toEqual({ base64: TOO_BIG, tempUris: [] });
  });
});
