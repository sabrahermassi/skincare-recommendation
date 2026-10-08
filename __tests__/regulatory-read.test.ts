/**
 * #456: the app's read of the two regulatory tables. They have a freshness mark of their own, apart
 * from the catalogue's and the dictionary's, and the device keeps what it read under it. Nothing on a
 * screen uses them yet; this is the read and the cache.
 */

type Row = Record<string, unknown>;
const mockTables: Record<string, { rows: Row[]; newest: string | null }> = {};
const mockCalls: string[] = [];
let mockFail = false;

function mockQuery(table: string, columns: string, options?: { count?: string }) {
  const builder: Record<string, unknown> = {};
  let range: [number, number] | null = null;
  const self = () => builder;
  for (const method of ["order", "limit", "abortSignal"]) builder[method] = self;
  builder.range = (from: number, to: number) => {
    range = [from, to];
    return builder;
  };
  builder.then = (resolve: (value: unknown) => void) => {
    const held = mockTables[table];
    if (mockFail) return Promise.resolve({ data: null, error: { message: "down" }, count: null }).then(resolve);
    if (options?.count) {
      mockCalls.push(`mark:${table}`);
      return Promise.resolve({ data: [{ updated_at: held.newest }], error: null, count: held.rows.length }).then(resolve);
    }
    mockCalls.push(`rows:${table}${range ? `:${range[0]}` : ""}`);
    return Promise.resolve({ data: range ? held.rows.slice(range[0], range[1] + 1) : held.rows, error: null, count: null }).then(resolve);
  };
  void columns;
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  LOOKUP_FUNCTION: "product-lookup",
  OCR_FUNCTION: "label-ocr",
  supabase: {
    from: (table: string) => ({ select: (columns: string, options?: { count?: string }) => mockQuery(table, columns, options) }),
    functions: { invoke: jest.fn() },
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import { CATALOGUE_PAGE_SIZE, loadRegulatory } from "@/data/api";
import { readRegulatory, regulatoryMarksMatch, resetCatalogueCache, writeRegulatory } from "@/data/catalogue-cache";

const entryRow = (annex: "II" | "III", entry: string, overrides: Row = {}): Row => ({
  annex,
  entry,
  wording: `Substance ${entry}`,
  inci_name: null,
  cas_numbers: ["1-1-1"],
  ec_numbers: null,
  conditions: annex === "III" ? [{ productType: "Nail products" }] : null,
  members: null,
  mark: "B",
  amended_by: null,
  effective_date: null,
  source_url: "https://publications.europa.eu/resource/cellar/x",
  source_version: "02009R1223-20260518",
  source_hash: "ab",
  last_verified: "2026-05-18",
  status: "active",
  ...overrides,
});

beforeEach(async () => {
  await resetCatalogueCache();
  await AsyncStorage.clear();
  mockCalls.length = 0;
  mockFail = false;
  mockTables.regulatory_entries = { rows: [entryRow("II", "1"), entryRow("III", "14", { inci_name: "Hydroquinone" })], newest: "2026-10-07T10:00:00Z" };
  mockTables.ingredient_regulatory = { rows: [], newest: null };
});

describe("loadRegulatory", () => {
  it("reads both tables, maps them to the app's shape, and keeps them under their mark", async () => {
    const snapshot = await loadRegulatory();

    expect(snapshot.entries.map((e) => `${e.annex}:${e.entry}`)).toEqual(["II:1", "III:14"]);
    expect(snapshot.entries[1]).toMatchObject({ inciName: "Hydroquinone", casNumbers: ["1-1-1"], ecNumbers: [], members: [], sourceVersion: "02009R1223-20260518", lastVerified: "2026-05-18", status: "active" });
    expect(snapshot.mark).toEqual({ entries: { count: 2, newest: "2026-10-07T10:00:00Z" }, links: { count: 0, newest: null } });
    expect(await readRegulatory()).toEqual(snapshot);
  });

  it("reads the mark before the rows, and reads no rows when the mark is the one it holds", async () => {
    await loadRegulatory();
    expect(mockCalls.slice(0, 2).sort()).toEqual(["mark:ingredient_regulatory", "mark:regulatory_entries"]);
    expect(mockCalls.filter((call) => call.startsWith("rows:"))).toHaveLength(2);

    mockCalls.length = 0;
    await loadRegulatory();
    expect(mockCalls.filter((call) => call.startsWith("rows:"))).toEqual([]);
  });

  it("reads the rows again when either table changed, and not for any other table", async () => {
    await loadRegulatory();
    mockCalls.length = 0;
    mockTables.ingredient_regulatory = { rows: [{ inci_name: "hydroquinone", annex: "III", entry: "14", matched_by: "cas", reviewed_by: null, reviewed_at: null }], newest: "2026-10-08T00:00:00Z" };

    const snapshot = await loadRegulatory();

    expect(snapshot.links).toEqual([{ inciName: "hydroquinone", annex: "III", entry: "14", matchedBy: "cas", reviewedBy: null, reviewedAt: null }]);
    expect(mockCalls.filter((call) => call.startsWith("rows:"))).toHaveLength(2);
    // The catalogue and the dictionary were not asked about at all.
    expect(mockCalls.every((call) => /regulatory/.test(call))).toBe(true);
  });

  it("walks every page, so a table longer than one page is not cut off", async () => {
    mockTables.regulatory_entries = { rows: Array.from({ length: CATALOGUE_PAGE_SIZE + 5 }, (_, i) => entryRow("II", String(i + 1))), newest: "2026-10-07T10:00:00Z" };

    const snapshot = await loadRegulatory();

    expect(snapshot.entries).toHaveLength(CATALOGUE_PAGE_SIZE + 5);
    expect(mockCalls.filter((call) => call.startsWith("rows:regulatory_entries"))).toEqual(["rows:regulatory_entries:0", `rows:regulatory_entries:${CATALOGUE_PAGE_SIZE}`]);
  });

  it("serves what it holds when the network fails, and an empty snapshot when it holds nothing", async () => {
    mockFail = true;
    expect((await loadRegulatory()).entries).toEqual([]);

    mockFail = false;
    await loadRegulatory();
    mockFail = true;
    expect((await loadRegulatory()).entries).toHaveLength(2);
  });

  it("does not write when the read fails partway", async () => {
    mockFail = true;
    await loadRegulatory();
    expect(await readRegulatory()).toBeNull();
  });
});

describe("the stored regulatory snapshot", () => {
  const mark = { entries: { count: 1, newest: "a" }, links: { count: 0, newest: null } };

  it("round-trips, and reads nothing from a value of another shape", async () => {
    await writeRegulatory({ mark, entries: [], links: [] });
    expect(await readRegulatory()).toEqual({ mark, entries: [], links: [] });

    await AsyncStorage.setItem("forme-regulatory-v6", JSON.stringify({ mark: { entries: { count: "1" } }, entries: [], links: [] }));
    expect(await readRegulatory()).toBeNull();
    await AsyncStorage.setItem("forme-regulatory-v6", "not json");
    expect(await readRegulatory()).toBeNull();
  });

  it("compares both counts and both newest stamps", () => {
    expect(regulatoryMarksMatch(mark, { ...mark })).toBe(true);
    expect(regulatoryMarksMatch(mark, { ...mark, entries: { count: 2, newest: "a" } })).toBe(false);
    expect(regulatoryMarksMatch(mark, { ...mark, entries: { count: 1, newest: "b" } })).toBe(false);
    expect(regulatoryMarksMatch(mark, { ...mark, links: { count: 1, newest: null } })).toBe(false);
    expect(regulatoryMarksMatch(mark, { ...mark, links: { count: 0, newest: "c" } })).toBe(false);
  });

  it("is cleared with the catalogue cache", async () => {
    await writeRegulatory({ mark, entries: [], links: [] });
    await resetCatalogueCache();
    expect(await readRegulatory()).toBeNull();
  });
});
