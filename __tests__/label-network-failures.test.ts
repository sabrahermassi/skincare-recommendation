/**
 * #188: `readLabel` must not blame the photo (or
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

import { readLabel } from "@/data/api";

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
  it("skips a malformed entry in the server's reply instead of throwing (#152)", async () => {
    mockInvoke.mockResolvedValue({
      data: { ingredients: [{ inci_name: "AQUA" }, null, { inci_name: 7 }, { inci_name: "GLYCERIN" }], recognised: 2, total: 2 },
      error: null,
    });
    expect(await readLabel("x")).toEqual({ ok: true, ingredients: ["AQUA", "GLYCERIN"], matches: [null, null], recognised: 2, total: 2 });
  });

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
    expect(await readLabel("x")).toEqual({ ok: false, reason: "too_little_text" });

    mockInvoke.mockResolvedValue({ data: null, error: errorWithStatus(422, { error: "low_confidence" }) });
    expect(await readLabel("x")).toEqual({ ok: false, reason: "unrecognised_names" });
  });
});
