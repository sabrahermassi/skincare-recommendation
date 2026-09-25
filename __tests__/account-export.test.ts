/**
 * The account export's reads (#224, #241). The `supabase` client is mocked
 * directly — with no credentials `data/api.ts` never reaches these reads.
 */
type Answer = { data: unknown; error: unknown };
const mockAnswers: Record<string, Answer> = {};

jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: () => ({ abortSignal: () => Promise.resolve(mockAnswers[table]) }),
      }),
    }),
  },
  DELETE_ACCOUNT_FUNCTION: "delete-account",
  LOOKUP_FUNCTION: "product-lookup",
  OCR_FUNCTION: "label-ocr",
}));

import { fetchAccountExport, isMissingTable } from "@/data/api";

beforeEach(() => {
  mockAnswers.saved_products = {
    data: [{ product_id: "p1", saved_at: "2026-09-01T00:00:00Z", formula_fetched_at: null, note: null, routine_step: null }],
    error: null,
  };
  mockAnswers.saved_ingredients = { data: [], error: null };
  mockAnswers.product_authors = { data: [{ product_id: "ocr-1", created_at: "2026-09-02T00:00:00Z" }], error: null };
});

it("includes the products this account added", async () => {
  const result = await fetchAccountExport();
  expect(result.ok && result.value.added).toEqual([{ productId: "ocr-1", addedAt: "2026-09-02T00:00:00Z" }]);
});

// Self-review of #282: a project that hasn't had migration 0026 yet has no
// `product_authors` table, and that used to fail the whole export.
it("still exports the shelf when the authors table doesn't exist yet", async () => {
  mockAnswers.product_authors = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
  const result = await fetchAccountExport();
  expect(result.ok).toBe(true);
  expect(result.ok && result.value.products.map((p) => p.productId)).toEqual(["p1"]);
  expect(result.ok && result.value.added).toEqual([]);
});

it("still fails on any other error reading the authors", async () => {
  mockAnswers.product_authors = { data: null, error: { code: "42501", message: "permission denied" } };
  expect((await fetchAccountExport()).ok).toBe(false);
});

it("recognises both ways a missing table is reported", () => {
  expect(isMissingTable({ code: "PGRST205" })).toBe(true);
  expect(isMissingTable({ code: "42P01" })).toBe(true);
  expect(isMissingTable({ code: "42501" })).toBe(false);
  expect(isMissingTable(null)).toBe(false);
});
