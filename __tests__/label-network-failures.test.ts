/**
 * #188: `readLabel` and `saveScannedProduct` must not blame the photo (or
 * the ingredient list) for a network/server problem. These mock the
 * Supabase client directly — `data/api.ts` falls back to the sample catalog
 * with no credentials configured, which is exactly the path that must be
 * bypassed to exercise the real `functions.invoke` error branches.
 */
const mockInvoke = jest.fn();
jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
  LOOKUP_FUNCTION: "product-lookup",
  OCR_FUNCTION: "label-ocr",
}));

import { fetchProductByBarcode, readLabel, saveScannedProduct } from "@/data/api";

function errorWithStatus(status: number, body?: unknown) {
  return {
    context: {
      status,
      json: body === undefined ? undefined : async () => body,
    },
  };
}

function offlineError() {
  return new TypeError("Network request failed");
}

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("readLabel", () => {
  it("reports a genuine connection failure as network_error, not unreadable", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: offlineError() });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "network_error" });
  });

  it("reports an unclassified 5xx (502) as network_error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(502) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "network_error" });
  });

  it("still reports 503 as the distinct, ops-fixable server_unavailable", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(503) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "server_unavailable" });
  });

  it("still reports 413/415 as a photo problem, not a network one", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(413) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "unreadable" });

    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(415) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "unreadable" });
  });

  it("still reports 429 as rate_limited", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(429) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("still tells apart the two 422 cases (#185), unaffected by the network split", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(422, { error: "not_enough_text" }) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "too_little_text", rawText: undefined });

    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(422, { error: "low_confidence" }) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "unrecognised_names", rawText: undefined });
  });
});

describe("saveScannedProduct", () => {
  const input = { barcode: "8801234567890", name: "Test", ingredients: ["water"], readToken: "tok" };

  it("reports a genuine connection failure as network_error, not the generic failed", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: offlineError() });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "network_error" });
  });

  it("reports an unclassified 5xx as network_error", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(500) });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "network_error" });
  });

  it("still tells apart rate-limited, unreadable_list and expired", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(429) });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "rate_limited" });

    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(422) });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "unreadable_list" });

    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(403) });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "expired" });
  });

  // The core #188 fix: the write already committed (data.product is
  // present), but the client can't parse it. This must return a failure —
  // never throw — and it must be distinguishable from a network failure so
  // the caller doesn't offer a plain retry against a now-consumed token.
  it("does not throw on a malformed but present save response, and reports it as already_saved", async () => {
    mockInvoke.mockResolvedValue({ data: { product: {} }, error: null });
    await expect(saveScannedProduct(input)).resolves.toEqual({ ok: false, reason: "already_saved" });
  });

  it("still reports no product at all as the generic failed, not already_saved", async () => {
    mockInvoke.mockResolvedValue({ data: {}, error: null });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "failed" });
  });

  // Caught in review on #258: the barcode-first flow that lands on this
  // screen already ran fetchProductByBarcode once and cached a miss for
  // this exact barcode. Without evicting that on already_saved, the
  // recovery lookup add-product.tsx's "Show me that product" makes would
  // read the stale cached miss straight back and never reach the network —
  // silently reproducing the bug this PR fixes.
  it("evicts the barcode's cached miss on already_saved, so a follow-up lookup reaches the network again", async () => {
    // The barcode-first flow's own lookup, before the photo was taken.
    mockInvoke.mockResolvedValueOnce({ data: null, error: errorWithStatus(404) });
    expect(await fetchProductByBarcode(input.barcode)).toEqual({ ok: true, value: null });

    // The save succeeds server-side, but the response can't be parsed.
    mockInvoke.mockResolvedValueOnce({ data: { product: {} }, error: null });
    expect(await saveScannedProduct(input)).toEqual({ ok: false, reason: "already_saved" });

    // The recovery lookup must hit the network again, not the stale miss.
    mockInvoke.mockResolvedValueOnce({ data: null, error: errorWithStatus(404) });
    await fetchProductByBarcode(input.barcode);
    expect(mockInvoke).toHaveBeenCalledTimes(3);
  });
});
