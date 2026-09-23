import { readLabel } from "@/data/api";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";
import { clearLabelRead, heldLabelRead } from "@/lib/pending-label";
import { failureCopy, readLabelPhoto } from "@/lib/read-label-photo";

jest.mock("@/data/api", () => ({ readLabel: jest.fn() }));
jest.mock("@/lib/image-metadata", () => ({ stripBase64ImageMetadata: jest.fn() }));

// Structural cast rather than `jest.Mock`: the jest namespace is not in scope here (see jest-globals.d.ts).
type MockFn = {
  mockResolvedValue(value: unknown): void;
  mockRejectedValue(value: unknown): void;
  mockReturnValue(value: unknown): void;
};
const analyse = readLabel as unknown as MockFn;
const strip = stripBase64ImageMetadata as unknown as MockFn;

const readOk = (over: Record<string, unknown> = {}) => ({
  ok: true,
  ingredients: ["water", "glycerin"],
  recognised: 5,
  total: 6,
  readToken: "tok",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  clearLabelRead();
  strip.mockReturnValue({ ok: true, base64: "CLEAN" });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

/**
 * The one place a photographed or chosen ingredient list is cleaned, sent and turned
 * into "open this product" or "here is what went wrong", shared by the label camera
 * and the two permission screens that offer a chosen photo.
 */
describe("readLabelPhoto", () => {
  it("sends the cleaned image, never the original", async () => {
    analyse.mockResolvedValue(readOk());
    await readLabelPhoto("ORIGINAL", "8801234567890");
    expect(analyse).toHaveBeenCalledWith("CLEAN");
  });

  it("fails closed when the image cannot be cleaned, without sending anything", async () => {
    strip.mockReturnValue({ ok: false, reason: "too_large" });
    expect(await readLabelPhoto("ORIGINAL")).toMatchObject({
      kind: "failed",
      message: "That photo is too large to read.",
      retryable: true,
    });

    strip.mockReturnValue({ ok: false, reason: "unparseable" });
    expect(await readLabelPhoto("ORIGINAL")).toMatchObject({
      kind: "failed",
      message: "We couldn't read that image.",
      retryable: true,
    });
    expect(analyse).not.toHaveBeenCalled();
  });

  it("treats a read that recognised nothing as a photo of something else", async () => {
    analyse.mockResolvedValue(readOk({ recognised: 0 }));
    expect(await readLabelPhoto("x")).toMatchObject({ kind: "failed", message: "That doesn't look like an ingredient list." });

    analyse.mockResolvedValue(readOk({ total: 0, recognised: 0 }));
    expect(await readLabelPhoto("x")).toMatchObject({ kind: "failed", retryable: true });
  });

  it("holds a good read, with its barcode and proof, for the add-product screen", async () => {
    analyse.mockResolvedValue(readOk());
    expect(await readLabelPhoto("x", "8801234567890")).toEqual({ kind: "read" });
    expect(heldLabelRead()).toEqual({
      ingredients: ["water", "glycerin"],
      readToken: "tok",
      barcode: "8801234567890",
      receivedAt: expect.any(Number),
    });
  });

  it("holds nothing when the read fails", async () => {
    analyse.mockResolvedValue({ ok: false, reason: "unreadable" });
    await readLabelPhoto("x");
    expect(heldLabelRead()).toBeNull();
  });

  it("turns a failed read into its copy, keeping whether it can be retried", async () => {
    analyse.mockResolvedValue({ ok: false, reason: "not_configured" });
    expect(await readLabelPhoto("x")).toMatchObject({ kind: "failed", retryable: false });

    analyse.mockResolvedValue({ ok: false, reason: "rate_limited" });
    expect(await readLabelPhoto("x")).toMatchObject({ kind: "failed", retryable: true });
  });

  it("lets a rejected request reach the caller, which owns the generic message", async () => {
    analyse.mockRejectedValue(new Error("network"));
    await expect(readLabelPhoto("x")).rejects.toThrow("network");
  });
});

describe("failureCopy", () => {
  it.each(["too_little_text", "rate_limited", "server_unavailable", "unreadable"] as const)(
    "%s can be retried",
    (reason: "too_little_text" | "rate_limited" | "server_unavailable" | "unreadable") => {
      expect(failureCopy(reason, false).retryable).toBe(true);
    }
  );

  it("does not offer a retry for a build with no credentials, which would fail the same way every time", () => {
    expect(failureCopy("not_configured", false).retryable).toBe(false);
  });

  it("does not send someone with a barcode in hand back to the barcode", () => {
    expect(failureCopy("server_unavailable", true).hint).toBe("Look the product up in Browse, or try again later.");
    expect(failureCopy("server_unavailable", false).hint).toBe("Try the barcode instead, or look the product up in Browse.");
    expect(failureCopy("not_configured", true).hint).toBe("Look the product up in Browse instead.");
  });
});
