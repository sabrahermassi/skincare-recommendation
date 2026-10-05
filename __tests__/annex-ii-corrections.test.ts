import { readFileSync } from "fs";
import { join } from "path";

import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { HAZARD_SCORE_CAP, matchProduct, resetScoreCache } from "@/lib/matching";
import {
  contraindications,
  NATURAL_ESSENCE_NOTE_START,
  ORIGIN_DEPENDENT_NOTE_START,
  REFINED_GRADE_NOTE_START,
  regulatoryStatus,
} from "@/lib/safety";
import { annexCited } from "../scripts/audit-safety-labels.mjs";
import { safetyFor, safetyFrom, toRows } from "../scripts/import-inci-dictionary.mjs";

/**
 * Issue 1 of the regulatory-safety work: Annex II rows the import read as flat bans.
 * Entries 358, 764 and 306 were checked against the regulation's text (5 October 2026);
 * 1339, 1375 and 1380 stay prohibited. Each test builds a row exactly as the import now
 * writes it, and sets it beside the row the old import wrote.
 */

const rating = (canonical: string, restriction: string) => safetyFor(canonical, { en: restriction });

function row(name: string, safety: Ingredient["safety"], note: string | null): Ingredient {
  return { id: name, name, comedogenic: 0, safety, verified: true, note: note ?? undefined };
}

/** What the import wrote before: every Annex II citation a flat ban. */
const oldRow = (name: string, restriction: string) => {
  const flat = safetyFrom({ en: restriction } as never);
  return row(name, flat.safety as Ingredient["safety"], flat.note);
};

const writtenRow = (name: string, restriction: string) => {
  const written = rating(name, restriction);
  return row(name, written.safety as Ingredient["safety"], written.note ?? null);
};

const OTHERS = ["aqua", "glycerin", "cetearyl alcohol", "dimethicone", "panthenol", "tocopherol"].map((n) => row(n, "safe", null));

/** A plain cream with one ingredient of interest third from the top. */
const cream = (ingredient: Ingredient): Pick<ProductWithIngredients, "type" | "ingredients"> => ({
  type: "moisturizer",
  ingredients: [OTHERS[0], OTHERS[1], ingredient, ...OTHERS.slice(2)],
});

const DRY: SkinProfile = { concerns: ["dehydrated"], baseSkinType: "dry", sensitivity: "some", pregnancyStatus: null };

const score = (ingredient: Ingredient) => {
  resetScoreCache();
  return matchProduct(cream(ingredient), DRY);
};
const hazards = (ingredient: Ingredient) => contraindications(cream(ingredient).ingredients, DRY).filter((w) => w.severity === "hazard");

describe("natural essences under Annex II/358 (citrus, rue)", () => {
  it("are written safe, with a note that says what the entry limits", () => {
    for (const restriction of ["II/358", "II/358 R", "II/358 R1"]) {
      const written = rating("citrus limon fruit extract", restriction);
      expect(written.safety).toBe("safe");
      expect(written.note).toMatch(/^Natural essence\. EU Annex II\/358 limits furocoumarins .* not the ingredient itself$/);
      expect(written.note?.startsWith(NATURAL_ESSENCE_NOTE_START)).toBe(true);
    }
  });

  it("no longer cap a product at poor", () => {
    const before = score(oldRow("citrus limon fruit extract", "II/358 R1"));
    expect(hazards(oldRow("citrus limon fruit extract", "II/358 R1"))).toHaveLength(1);
    expect(before.score).toBeLessThanOrEqual(HAZARD_SCORE_CAP);
    expect(before.verdict).toBe("poor");

    const after = score(writtenRow("citrus limon fruit extract", "II/358 R1"));
    expect(hazards(writtenRow("citrus limon fruit extract", "II/358 R1"))).toEqual([]);
    expect(after.score).toBeGreaterThan(HAZARD_SCORE_CAP);
    expect(after.verdict).not.toBe("poor");
  });

  it("read as 'Allowed, with a limit on furocoumarins' on the ingredient page", () => {
    expect(regulatoryStatus(writtenRow("citrus limon fruit extract", "II/358 R1"))).toBe("Allowed, with a limit on furocoumarins");
  });

  it("keep a second citation: cumin's II/358 R1 III/156 is a restriction, not a ban", () => {
    expect(rating("cuminum cyminum fruit extract", "II/358 R1 III/156")).toEqual({ safety: "caution", note: "Restricted use (EU Annex III/156)" });
  });

  it("leave an entry that also cites another Annex II number as the ban it was", () => {
    expect(rating("something else", "II/358 II/12").safety).toBe("avoid");
  });
});

describe("alkanes under Annex II/764", () => {
  it("are written safe, as refined grades, like petrolatum", () => {
    for (const name of ["c14 19 alkane", "c15 19 alkane", "c18 21 alkane"]) {
      const written = rating(name, "II/764");
      expect(written.safety).toBe("safe");
      expect(written.note).toMatch(/^Allowed when fully refined\. .*\(EU Annex II\/764\)$/);
      expect(regulatoryStatus(writtenRow(name, "II/764"))).toBe("Allowed when refined");
      expect(written.note?.startsWith(REFINED_GRADE_NOTE_START)).toBe(true);
    }
  });

  it("no longer cap a product at poor", () => {
    expect(hazards(oldRow("c15 19 alkane", "II/764"))).toHaveLength(1);
    expect(hazards(writtenRow("c15 19 alkane", "II/764"))).toEqual([]);
    expect(score(writtenRow("c15 19 alkane", "II/764")).score).toBeGreaterThan(HAZARD_SCORE_CAP);
  });
});

describe("cannabidiol (entry 306)", () => {
  const cbd = writtenRow("cannabidiol", "II/306 = Narcotics, natural and synthetic: All substances listed in Tables I and II");

  it("is neither banned nor cleared: safe, with the owner's note", () => {
    expect(cbd.safety).toBe("safe");
    expect(cbd.note).toBe("EU rules depend on how it's made.");
    expect(cbd.note?.startsWith(ORIGIN_DEPENDENT_NOTE_START)).toBe(true);
    expect(regulatoryStatus(cbd)).toBe("Depends on how it's made");
  });

  it("costs no score and raises no warning", () => {
    expect(contraindications(cream(cbd).ingredients, DRY)).toEqual([]);
    const withCbd = score(cbd);
    expect(withCbd.breakdown.irritationPenalty).toBe(0);
    // Exactly what a neutral ingredient in the same place gives.
    expect(withCbd.score).toBe(score(row("aqua", "safe", null)).score);
  });

  it("only cannabidiol itself: other entries citing 306 are untouched", () => {
    expect(rating("cannabis sativa flower extract", "II/306 = Narcotics").safety).toBe("avoid");
  });
});

describe("what stays prohibited", () => {
  it.each([
    ["isobutylparaben", "II/1375"],
    ["hydroquinone", "II/1339 III/14"],
    ["acrylonitrile", "II/682 - CMR1B"],
  ])("%s is still a hazard", (name: string, restriction: string) => {
    expect(rating(name, restriction).safety).toBe("avoid");
    expect(hazards(writtenRow(name, restriction))).toHaveLength(1);
    expect(score(writtenRow(name, restriction)).score).toBeLessThanOrEqual(HAZARD_SCORE_CAP);
    expect(regulatoryStatus(writtenRow(name, restriction))).toBe("Prohibited");
  });

  it("HICC says its dates plainly, and the audit still reads its citation", () => {
    const written = rating("hydroxyisohexyl 3 cyclohexene carboxaldehyde", "II/1380 From 23 August 2019 cosmetic products containing that substance shall not be placed on the Union market.");
    expect(written.safety).toBe("avoid");
    expect(written.note).toContain("not allowed on the EU market since 23 August 2019");
    expect(written.note).toContain("not to be sold there since 23 August 2021");
    expect(written.note).toContain("older stock may still be around");
    // The audit re-derives the label from the note's own citation and must still agree.
    const cited = annexCited(written.note);
    expect(cited).not.toBeNull();
    expect(safetyFrom({ en: cited } as never).safety).toBe("avoid");
  });
});

describe("the audit leaves the corrected notes alone", () => {
  it("reads no citation in a note that is not one of safetyFrom's shapes", () => {
    for (const [name, restriction] of [
      ["citrus limon fruit extract", "II/358 R1"],
      ["c15 19 alkane", "II/764"],
      ["cannabidiol", "II/306 = Narcotics"],
    ]) {
      expect(annexCited(rating(name, restriction).note)).toBeNull();
    }
  });
});

describe("through the whole import", () => {
  const entry = (restriction: string, inci: string, cas = "1-1-1") => ({
    inci_restriction: { en: restriction },
    inci: { en: inci },
    name: { en: inci },
    cas: { en: cas },
  });
  const rows = toRows({
    "en:citrus-limon-fruit-extract": entry("II/358 R1", "Citrus Limon Fruit Extract"),
    "en:c15-19-alkane": entry("II/764", "C15-19 Alkane"),
    "en:cannabidiol": entry("II/306 = Narcotics", "Cannabidiol"),
    "en:hydroxyisohexyl-3-cyclohexene-carboxaldehyde": entry("II/1380 From 23 August 2019 …", "Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde"),
    "en:isobutylparaben": entry("II/1375", "Isobutylparaben"),
  });
  const byName = (name: string) => rows.find((r: { inci_name: string }) => r.inci_name === name);

  it("gives every spelling the corrected rating", () => {
    expect(byName("citrus limon fruit extract")?.safety).toBe("safe");
    expect(byName("c15 19 alkane")?.safety).toBe("safe");
    expect(byName("c15-19 alkane")?.safety).toBe("safe");
    expect(byName("cannabidiol")?.safety).toBe("safe");
    expect(byName("hydroxyisohexyl 3 cyclohexene carboxaldehyde")?.note).toContain("older stock may still be around");
    expect(byName("isobutylparaben")?.safety).toBe("avoid");
  });
});

describe("the migration says what the import says", () => {
  const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "0030_annex_ii_corrections.sql"), "utf8");
  const inSql = (text: string) => expect(sql).toContain(text.replace(/'/g, "''"));

  it("uses the same notes", () => {
    inSql(rating("citrus limon fruit extract", "II/358 R1").note as string);
    inSql(rating("cuminum cyminum fruit extract", "II/358 R1 III/156").note as string);
    inSql(rating("cannabidiol", "II/306").note as string);
    inSql(rating("hydroxyisohexyl 3 cyclohexene carboxaldehyde", "II/1380 …").note as string);
    inSql("Allowed when fully refined. The EU bans it only when its refining history isn't known ");
  });
});
