import type { Ingredient } from "@/data/types";
import { annexIIEntries, SAFETY_NOTICE_ENTRIES, safetyNoticeFor, safetyNoticeHits } from "@/lib/safety";

/**
 * #404: the EU safety notice speaks only for the Annex II entries the owner
 * verified, and only with the flag on. These hold that line.
 */

const HICC_NOTE =
  "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)";

function avoid(name: string, note: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "avoid", verified: true, note, ...overrides };
}

const HICC = avoid("hydroxyisohexyl 3-cyclohexene carboxaldehyde", HICC_NOTE);
const ISOBUTYLPARABEN = avoid("isobutylparaben", "Prohibited in cosmetics (EU Annex II/1375)");
const HYDROQUINONE = avoid("hydroquinone", "Prohibited in cosmetics (EU Annex II/1339 III/14)");
// An Annex II row whose entry is not on the verified list (1340, Basic Blue 26).
const UNLISTED = avoid("basic blue 26", "Prohibited in cosmetics (EU Annex II/1340)");

describe("which Annex II entries a note cites", () => {
  it("reads Annex II and never Annex III", () => {
    expect(annexIIEntries("Prohibited in cosmetics (EU Annex II/1339 III/14)")).toEqual([1339]);
    expect(annexIIEntries("Restricted use (EU Annex III/156)")).toEqual([]);
    expect(annexIIEntries("Natural essence. EU Annex II/358 limits furocoumarins in the finished product")).toEqual([358]);
    expect(annexIIEntries("Restricted use (EU Annex Annex III/I/257 - Directive 2012/21/EU)")).toEqual([]);
    expect(annexIIEntries(undefined)).toEqual([]);
  });

  it("reads each entry of a note that cites several", () => {
    expect(annexIIEntries("Prohibited in cosmetics (EU Annex II/1380 II/1375)")).toEqual([1380, 1375]);
  });
});

describe("the notice, with the flag on", () => {
  it("fires for HICC and isobutylparaben, including a salt the dictionary marks the same way", () => {
    expect(safetyNoticeFor(HICC, true)?.entry).toBe(1380);
    expect(safetyNoticeFor(ISOBUTYLPARABEN, true)?.entry).toBe(1375);
    expect(safetyNoticeFor(avoid("sodium isobutylparaben", "Prohibited in cosmetics (EU Annex II/1375)"), true)?.entry).toBe(1375);
  });

  it("carries the verification and, for HICC, its two dates", () => {
    const hicc = safetyNoticeFor(HICC, true)!;
    expect(hicc).toMatchObject({ regulation: "Regulation (EU) 2017/1410", verified: "2026-10-05", verifiedBy: "owner" });
    expect(hicc.dates).toContain("23 August 2019");
    expect(hicc.dates).toContain("23 August 2021");
    expect(safetyNoticeFor(ISOBUTYLPARABEN, true)).toMatchObject({ regulation: "Regulation (EU) No 358/2014", verified: "2026-10-05" });
  });

  it("fires for hydroquinone, verified by the owner on 7 October 2026", () => {
    const hydroquinone = safetyNoticeFor(HYDROQUINONE, true)!;
    expect(hydroquinone).toMatchObject({ entry: 1339, regulation: "Regulation (EU) No 344/2013", verified: "2026-10-07", verifiedBy: "owner" });
    // The row cites both annexes; only the Annex II entry is what the notice goes by.
    expect(annexIIEntries(HYDROQUINONE.note)).toEqual([1339]);
  });

  it("speaks only for hydroquinone under entry 1339: another row a source cited there gets no notice (Codex review)", () => {
    // The importer keeps such a mis-cited row `avoid` (annex-ii-corrections.test.ts); the notice must not call it hydroquinone's entry.
    for (const name of ["cannabidiol", "c15 19 alkane", "hydroxyisohexyl 3 cyclohexene carboxaldehyde"]) {
      expect(safetyNoticeFor(avoid(name, "Prohibited in cosmetics (EU Annex II/1339)"), true)).toBeNull();
    }
    expect(SAFETY_NOTICE_ENTRIES.find((entry) => entry.entry === 1339)?.names).toEqual(["hydroquinone"]);
    // Only an entry that says something true of one substance is tied to a name; the rest go by the entry cited.
    expect(SAFETY_NOTICE_ENTRIES.filter((entry) => entry.names).map((entry) => entry.entry)).toEqual([1339]);
    expect(safetyNoticeFor(avoid("some other spelling", "Prohibited in cosmetics (EU Annex II/1380)"), true)?.entry).toBe(1380);
  });

  it("never fires for an Annex II entry that is not on the list, or one still waiting for its date", () => {
    expect(safetyNoticeFor(UNLISTED, true)).toBeNull();
    // None is waiting today: 1339 was the last. One added without a date must stay silent.
    expect(SAFETY_NOTICE_ENTRIES.filter((entry) => entry.verified === null)).toEqual([]);
    for (const pending of SAFETY_NOTICE_ENTRIES.filter((entry) => entry.verified === null)) {
      expect(safetyNoticeFor(avoid("pending", `Prohibited in cosmetics (EU Annex II/${pending.entry})`), true)).toBeNull();
    }
  });

  it("lists only entries the owner verified, with who verified them", () => {
    for (const entry of SAFETY_NOTICE_ENTRIES.filter((e) => e.verified !== null)) {
      expect(entry.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.verifiedBy).toBe("owner");
      expect(entry.regulation).toBeTruthy();
    }
  });

  it("never fires for 358, 764 or 875, which are not prohibitions, nor for any other Annex II row", () => {
    for (const entry of [358, 764, 875, 681, 682, 904]) {
      expect(SAFETY_NOTICE_ENTRIES.some((listed) => listed.entry === entry)).toBe(false);
      expect(safetyNoticeFor(avoid("something", `Prohibited in cosmetics (EU Annex II/${entry})`), true)).toBeNull();
    }
  });

  it("needs a recognised name the dictionary marks avoid", () => {
    expect(safetyNoticeFor({ ...HICC, verified: false }, true)).toBeNull();
    expect(safetyNoticeFor({ ...HICC, safety: "caution" }, true)).toBeNull();
    expect(safetyNoticeFor({ ...HICC, note: undefined }, true)).toBeNull();
  });

  it("names each ingredient of a product once", () => {
    const hits = safetyNoticeHits([HICC, ISOBUTYLPARABEN, UNLISTED, HYDROQUINONE, avoid("hydroxyisohexyl 3-cyclohexene carboxaldehyde", HICC_NOTE)], true);
    expect(hits.map((hit) => hit.ingredient.name)).toEqual(["hydroxyisohexyl 3-cyclohexene carboxaldehyde", "isobutylparaben", "hydroquinone"]);
  });
});

describe("the notice, with the flag off", () => {
  it("says nothing for any ingredient or product", () => {
    expect(safetyNoticeFor(HICC, false)).toBeNull();
    expect(safetyNoticeHits([HICC, ISOBUTYLPARABEN, HYDROQUINONE], false)).toEqual([]);
  });
});
