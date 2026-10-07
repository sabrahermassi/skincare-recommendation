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

  it("never fires for an entry with no verified date: hydroquinone stays on the list, silent", () => {
    expect(SAFETY_NOTICE_ENTRIES.some((entry) => entry.entry === 1339 && entry.verified === null)).toBe(true);
    expect(safetyNoticeFor(HYDROQUINONE, true)).toBeNull();
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
    const hits = safetyNoticeHits([HICC, ISOBUTYLPARABEN, HYDROQUINONE, avoid("hydroxyisohexyl 3-cyclohexene carboxaldehyde", HICC_NOTE)], true);
    expect(hits.map((hit) => hit.ingredient.name)).toEqual(["hydroxyisohexyl 3-cyclohexene carboxaldehyde", "isobutylparaben"]);
  });
});

describe("the notice, with the flag off", () => {
  it("says nothing for any ingredient or product", () => {
    expect(safetyNoticeFor(HICC, false)).toBeNull();
    expect(safetyNoticeHits([HICC, ISOBUTYLPARABEN, HYDROQUINONE], false)).toEqual([]);
  });
});
