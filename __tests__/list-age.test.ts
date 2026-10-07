import type { Ingredient } from "@/data/types";
import { LIST_AGE_COPY, listAgeNotice, listAgeSentence, listAgeText } from "@/lib/list-age";

/**
 * #446: what the product screen says about how old a barcode result's
 * ingredient list is. The date is when the list was photographed, never when
 * we last read the row.
 */

const NOW = Date.parse("2026-10-07T12:00:00Z");
const safe = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
const avoid = (name: string, note: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "avoid", verified: true, note });
const LILIAL = avoid("butylphenyl methylpropional", "Prohibited in cosmetics (EU Annex II/1666, since 1 March 2022)");
const HYDROQUINONE = avoid("hydroquinone", "Prohibited in cosmetics (EU Annex II/1339 III/14)");

const product = (overrides: object = {}) => ({
  id: "obf-20532734",
  source: "obf",
  ingredientsPhotographedAt: "2018-04-08T17:29:34.000Z" as string | null | undefined,
  ingredients: [safe("aqua"), safe("glycerin")],
  ...overrides,
});

describe("listAgeNotice", () => {
  it("gives the year for any dated list, old or recent: no age alone is a warning", () => {
    expect(listAgeNotice(product(), NOW, false)).toEqual({ kind: "dated", year: 2018 });
    expect(listAgeNotice(product({ ingredientsPhotographedAt: "2026-07-01T00:00:00Z" }), NOW, false)).toEqual({ kind: "dated", year: 2026 });
  });

  it("takes the year in UTC, so it does not change with the phone's time zone", () => {
    expect(listAgeNotice(product({ ingredientsPhotographedAt: "2020-12-31T23:30:00Z" }), NOW, false)).toEqual({ kind: "dated", year: 2020 });
  });

  it("says nothing when the source has no photo of the list, a date that is not one, or one in the future", () => {
    expect(listAgeNotice(product({ ingredientsPhotographedAt: null }), NOW, false)).toBeNull();
    expect(listAgeNotice(product({ ingredientsPhotographedAt: "soon" }), NOW, false)).toBeNull();
    expect(listAgeNotice(product({ ingredientsPhotographedAt: "2027-01-01T00:00:00Z" }), NOW, false)).toBeNull();
  });

  it("says nothing when nobody asked for the date: a row from before it existed", () => {
    expect(listAgeNotice(product({ ingredientsPhotographedAt: undefined }), NOW, true)).toBeNull();
  });

  it("only speaks about Open Beauty Facts' copy: never a label scan or a sample product", () => {
    expect(listAgeNotice(product({ id: "ocr-123", source: "ocr" }), NOW, true)).toBeNull();
    expect(listAgeNotice(product({ id: "cosrx-snail-essence", source: undefined, ingredientsPhotographedAt: null }), NOW, true)).toBeNull();
    // A scan answered by a function that sends no `source`: the id says it.
    expect(listAgeNotice(product({ source: undefined }), NOW, false)).toEqual({ kind: "dated", year: 2018 });
  });

  describe("a list holding an ingredient the EU safety notice applies to", () => {
    const withLilial = (overrides: object = {}) => product({ ingredients: [safe("aqua"), LILIAL, safe("glycerin")], ...overrides });

    it("names it, however recent or unknown the photo, with the safety notice on", () => {
      expect(listAgeNotice(withLilial(), NOW, true)).toEqual({ kind: "banned", ingredient: "Butylphenyl Methylpropional" });
      expect(listAgeNotice(withLilial({ ingredientsPhotographedAt: "2026-09-01T00:00:00Z" }), NOW, true)).toEqual({ kind: "banned", ingredient: "Butylphenyl Methylpropional" });
      expect(listAgeNotice(withLilial({ ingredientsPhotographedAt: null }), NOW, true)).toEqual({ kind: "banned", ingredient: "Butylphenyl Methylpropional" });
    });

    it("falls back to the plain date with the safety notice off: no claim about the regulation is made", () => {
      expect(listAgeNotice(withLilial(), NOW, false)).toEqual({ kind: "dated", year: 2018 });
      expect(listAgeNotice(withLilial({ ingredientsPhotographedAt: null }), NOW, false)).toBeNull();
    });

    it("never calls an ingredient banned on the dictionary's word alone", () => {
      // `avoid` with no Annex II entry, and an entry the owner has not verified.
      const unsourced = product({ ingredients: [avoid("isopropyl myristate", "Often flagged for clogging pores")] });
      expect(listAgeNotice(unsourced, NOW, true)).toEqual({ kind: "dated", year: 2018 });
      expect(listAgeNotice(product({ ingredients: [HYDROQUINONE] }), NOW, true)).toEqual({ kind: "dated", year: 2018 });
    });
  });
});

describe("the words", () => {
  it("are a plain date, and the banned sentence ending on the label scan", () => {
    expect(listAgeSentence({ kind: "dated", year: 2018 })).toBe("Ingredient list from 2018.");
    expect(listAgeSentence({ kind: "banned", ingredient: "Butylphenyl Methylpropional" })).toBe(
      "This list contains Butylphenyl Methylpropional, which the EU has banned. Your bottle may have a newer formula. Scan the label to check."
    );
  });

  it("split the banned sentence around the words that open the scan", () => {
    expect(listAgeText({ kind: "banned", ingredient: "X" }).action).toBe(LIST_AGE_COPY.action);
  });
});
