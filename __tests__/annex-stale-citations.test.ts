import { readFileSync } from "fs";
import { join } from "path";

import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { HAZARD_SCORE_CAP, matchProduct, resetScoreCache } from "@/lib/matching";
import { contraindications, regulatoryStatus, safetyNoticeFor } from "@/lib/safety";
import { annexCited } from "../scripts/audit-safety-labels.mjs";
import { BORATE_SALT, PART_I, PERBORATE, planWrites, RENUMBERED, safetyFor, safetyFrom, toRows, UNCITED_BORATE_SALTS } from "../scripts/import-inci-dictionary.mjs";

/**
 * #419: rows the dictionary import wrote as "Restricted" from a citation the regulation has since
 * deleted, moved or turned into a ban. Every entry number was read off the consolidated Regulation
 * (EC) No 1223/2009, version 18.05.2026, and CosIng (owner-approved on #419, 7 October 2026).
 */

const rating = (canonical: string, restriction: string) => safetyFor(canonical, { en: restriction });
const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "0032_annex_stale_citations.sql"), "utf8");
/** The statements, without the comments that explain them. */
const statements = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

function row(name: string, safety: Ingredient["safety"], note: string | null): Ingredient {
  return { id: name, name, comedogenic: 0, safety, verified: true, note: note ?? undefined };
}
const written = (name: string, restriction: string) => {
  const r = rating(name, restriction);
  return row(name, r.safety as Ingredient["safety"], r.note ?? null);
};

describe("a ban the old citation hid", () => {
  it.each([
    ["butylphenyl methylpropional", "III/83", "Prohibited in cosmetics (EU Annex II/1666, since 1 March 2022)"],
    ["boric acid", "III/1a", "Prohibited in cosmetics (EU Annex II/1395)"],
    ["boric acid", "III/1a III/1b", "Prohibited in cosmetics (EU Annex II/1395)"],
    ["diboron trioxide", "III/1b", "Prohibited in cosmetics (EU Annex II/1394)"],
    ["sodium borate", "III/1a III/1b", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["potassium borate", "III/1a III/1b", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["zinc borate", "III/1a III/24", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["mea borate", "III/1a III/61", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["mipa-borate", "III/1a III/61", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["trioctyldodecyl borate", "III/1a", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["calcium fructoborate", "III/1a", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["potassium ascorbylborate", "III/1a", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["disodium tetraborate", "III/1a III/1b", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["borax", "III/1b", "Prohibited in cosmetics (EU Annex II/1396)"],
    ["dichloromethane", "III/7", "Prohibited in cosmetics (EU Annex II/1389)"],
    ["sodium perborate", "III/1a III/12", "Prohibited in cosmetics (EU Annex II/1397)"],
    ["sodium perborate monohydrate", "III/1a III/12", "Prohibited in cosmetics (EU Annex II/1397)"],
    ["magnesium ascorbylborate", "", "Prohibited in cosmetics (EU Annex II/1396)"],
  ])("writes %s (%s) avoid, with the current Annex II entry", (name: string, citation: string, note: string) => {
    expect(rating(name, citation)).toEqual({ safety: "avoid", note });
  });

  it.each([
    ["sodium perborate", "III/1a III/12 III/99"], // a perborate citing something else is not touched
    ["phenyl mercuric borate", "III/17"], // Annex III/17, a different entry
    ["calcium ascorbylborate", ""], // no citation and not reviewed: never banned on a guess
    ["potassium tetrafluoroborate", "III/1a"], // not a boric acid salt or ester
    ["sodium borate", "V/16"], // a borate citing something else is not touched
    ["boric acid", "III/1a III/14"], // an extra citation outside the old boric acid set
    ["zinc oxide", "III/1a"],
  ])("leaves %s (%s) as it was", (name: string, citation: string) => {
    expect(rating(name, citation)).toEqual(safetyFrom({ en: citation } as never));
  });

  it("matches by name and class, not by CAS", () => {
    // Potassium borate: CAS 1332-77-0 in CosIng, 12712-38-8 in the regulation. Neither is read.
    expect(rating("potassium borate", "III/1a III/1b").safety).toBe("avoid");
    expect(BORATE_SALT.test("perborate")).toBe(false);
    expect(BORATE_SALT.test("sodium perborate")).toBe(false);
    expect(BORATE_SALT.test("potassium tetrafluoroborate")).toBe(false);
    expect(BORATE_SALT.test("sodium borate")).toBe(true);
    expect(BORATE_SALT.test("mea-borate")).toBe(true);
  });

  it("is a hazard for everyone: the score caps and the sheet says Prohibited", () => {
    const profile: SkinProfile = { concerns: ["dehydrated"], baseSkinType: "dry", sensitivity: "none", pregnancyStatus: null };
    const others = ["aqua", "glycerin", "cetearyl alcohol", "dimethicone", "panthenol", "tocopherol"].map((n) => row(n, "safe", null));
    for (const [name, citation] of [["butylphenyl methylpropional", "III/83"], ["sodium borate", "III/1a III/1b"], ["boric acid", "III/1a"]]) {
      const ingredient = written(name, citation);
      const cream: Pick<ProductWithIngredients, "type" | "ingredients"> = { type: "moisturizer", ingredients: [others[0], others[1], ingredient, ...others.slice(2)] };
      resetScoreCache();
      expect(matchProduct(cream, profile).score).toBeLessThanOrEqual(HAZARD_SCORE_CAP);
      expect(contraindications(cream.ingredients, profile).filter((w) => w.severity === "hazard")).toHaveLength(1);
      expect(regulatoryStatus(ingredient)).toBe("Prohibited");
    }
  });

  it("never raises a score: Lilial keeps its fragrance charge for sensitive skin once it is a ban", () => {
    // A product already under the cap gains nothing from the cap, so losing the charge would lift it.
    const harsh = ["alcohol denat.", "parfum", "menthol", "sodium lauryl sulfate"].map((n) => row(n, "safe", null));
    const others = ["aqua", "glycerin"].map((n) => row(n, "safe", null));
    for (const sensitivity of ["some", "high", null] as const) {
      const profile: SkinProfile = { concerns: ["redness"], baseSkinType: "normal", sensitivity, pregnancyStatus: null };
      const scoreWith = (lilial: Ingredient) => {
        resetScoreCache();
        return matchProduct({ type: "moisturizer", ingredients: [...others, ...harsh, lilial] }, profile);
      };
      const before = scoreWith(row("butylphenyl methylpropional", "caution", "Restricted use (EU Annex III/83)"));
      const after = scoreWith(written("butylphenyl methylpropional", "III/83"));
      expect(before.score).toBeLessThan(HAZARD_SCORE_CAP);
      expect(after.score).toBeLessThanOrEqual(before.score);
      expect(after.irritants).toContain("butylphenyl methylpropional");
    }
  });

  it("fires the safety notice, with the flag on only, for exactly the verified entries", () => {
    for (const [name, citation, entry] of [
      ["butylphenyl methylpropional", "III/83", 1666],
      ["boric acid", "III/1a", 1395],
      ["diboron trioxide", "III/1b", 1394],
      ["sodium borate", "III/1a III/1b", 1396],
      ["potassium borate", "III/1a III/1b", 1396],
      ["dichloromethane", "III/7", 1389],
      ["sodium perborate", "III/1a III/12", 1397],
    ] as const) {
      expect(safetyNoticeFor(written(name, citation), true)?.entry).toBe(entry);
      expect(safetyNoticeFor(written(name, citation), false)).toBeNull();
    }
    expect(safetyNoticeFor(written("butylphenyl methylpropional", "III/83"), true)?.dates).toContain("1 March 2022");
  });
});

describe("a citation to an entry that no longer exists", () => {
  it.each([
    ["turpentine", "III/124 III/125 III/126", "Restricted use (EU Annex III/124)"],
    ["limonene", "III/88 III/167 III/168", "Restricted use (EU Annex III/88)"],
    ["trans rose ketone 2", "III/158", "Restricted use (EU Annex III/157)"],
    ["rose ketone 3", "III/161", "Restricted use (EU Annex III/157)"],
    ["3 amino 2 4 dichlorophenol", "III/19", "Restricted use (EU Annex III/227)"],
    ["dihydroxyindole", "Annex III/I/257 - Directive 2012/21/EU", "Restricted use (EU Annex III/207)"],
    ["hc yellow no 9", "annex III/I/271 - Directive 2012/21/EU", "Restricted use (EU Annex III/259)"],
    ["tetraaminopyrimidine sulfate", "Annex III/I/255 - Directive 2012/21EU", "Restricted use (EU Annex III/200)"],
    ["hc yellow no 2", "Annex III/I/268 - Directive 2012/21/EU", "Restricted use (EU Annex III/255)"], // 268 is not read as 255 and then again as 200
  ])("writes %s (%s) as still restricted, under the current entry", (name: string, citation: string, note: string) => {
    expect(rating(name, citation)).toEqual({ safety: "caution", note });
  });

  it("reads 6-hydroxyindole's citation, which lost its number upstream, as the entry it is", () => {
    expect(rating("6 hydroxyindole", "Annex III/I/EU - Directive 2012/21/EU").note).toBe("Restricted use (EU Annex III/209)");
    // Only that name: the same malformed text on another name is not guessed at.
    expect(rating("isatin", "Annex III/I/EU - Directive 2012/21/EU").note).toBe("Restricted use (EU Annex Annex III/I/EU - Directive 2012/21/EU)");
  });

  it("leaves an entry that still exists alone", () => {
    // Entries 159 and 164 are rose ketone 5 and still stand: not part of the 2023 deletions.
    expect(rating("rose ketone 5", "III/164").note).toBe("Restricted use (EU Annex III/164)");
    expect(rating("trans rose ketone 5", "III/159").note).toBe("Restricted use (EU Annex III/159)");
    expect(rating("salicylic acid", "III/98")).toEqual({ safety: "caution", note: "Restricted use (EU Annex III/98)" });
    expect(rating("glycerin", "")).toEqual({ safety: "safe", note: null });
  });

  it("reads the number as the entry it is: Part I's 258 is not the current 258", () => {
    expect(rating("5 amino 4 chloro o cresol hcl", "Annex III/I/258 - Directive 2012/21/EU").note).toBe("Restricted use (EU Annex III/208)");
    expect(rating("hc red no 1", "III/258").note).toBe("Restricted use (EU Annex III/258)");
  });
});

describe("the audit agrees with every note written", () => {
  it("reads each citation back to the rating it was given", () => {
    for (const [name, citation] of [
      ["butylphenyl methylpropional", "III/83"],
      ["sodium borate", "III/1a III/1b"],
      ["dichloromethane", "III/7"],
      ["turpentine", "III/124 III/125"],
      ["dihydroxyindole", "Annex III/I/257 - Directive 2012/21/EU"],
    ]) {
      const r = rating(name, citation);
      expect(safetyFrom({ en: annexCited(r.note) } as never).safety).toBe(r.safety);
    }
  });
});

describe("through the whole import", () => {
  const entry = (restriction: string, inci: string) => ({ inci_restriction: { en: restriction }, inci: { en: inci }, name: { en: inci }, cas: { en: "1-1-1" } });
  const rows = toRows({
    "en:boric-acid": entry("III/1a", "Boric Acid"),
    "en:mea-borate": entry("III/1a III/61", "MEA-Borate"),
    "en:sodium-perborate": entry("III/1a III/12", "Sodium Perborate"),
    "en:butylphenyl-methylpropional": entry("III/83", "Butylphenyl Methylpropional"),
    "en:turpentine": entry("III/124 III/125 III/126", "Turpentine"),
  });
  const byName = (name: string) => rows.find((r: { inci_name: string }) => r.inci_name === name);

  it("gives every spelling, alias included, the corrected rating", () => {
    expect(byName("boric acid")).toMatchObject({ safety: "avoid", note: "Prohibited in cosmetics (EU Annex II/1395)" });
    expect(byName("mea borate")?.safety).toBe("avoid");
    expect(byName("mea-borate")?.safety).toBe("avoid");
    expect(byName("butylphenyl methylpropional")?.note).toMatch(/II\/1666, since 1 March 2022/);
    expect(byName("turpentine")?.note).toBe("Restricted use (EU Annex III/124)");
    expect(byName("sodium perborate")).toMatchObject({ safety: "avoid", note: "Prohibited in cosmetics (EU Annex II/1397)" });
  });
});

describe("a re-import over rows another source owns", () => {
  const fixed = { inci_name: "turpentine", safety: "caution", note: "Restricted use (EU Annex III/124)", source: "obf", verified: true };
  const banned = { inci_name: "boric acid", safety: "avoid", note: "Prohibited in cosmetics (EU Annex II/1395)", source: "obf", verified: true };
  const existing = (source: string, safety: string, note: string | null) => new Map([[fixed.inci_name, { verified: true, source, safety, note }]]);

  it("gives a CosIng-owned row the renumbered note, not just a stricter rating", () => {
    const plan = planWrites([fixed], existing("cosing", "caution", "Restricted use (EU Annex III/124 III/125 III/126)"));
    expect(plan.safetyOnly).toEqual([{ inci_name: "turpentine", safety: "caution", note: "Restricted use (EU Annex III/124)", owner: "cosing" }]);
  });

  it("lists, and does not write, a hand-curated row", () => {
    const plan = planWrites([banned], new Map([["boric acid", { verified: true, source: "curated", safety: "caution", note: "Restricted use (EU Annex III/1a)" }]]));
    expect(plan.reviewByHand).toHaveLength(1);
    expect(plan.safetyOnly).toEqual([]);
  });

  it("never replaces another source's rating or note with an ordinary citation of the same entry (Claude review)", () => {
    // "Restricted use (EU Annex III/124)" is also what a row citing entry 124 legitimately gets.
    expect(planWrites([fixed], existing("cosing", "avoid", "Prohibited in cosmetics (EU Annex II/999)")).safetyOnly).toEqual([]);
    expect(planWrites([fixed], existing("cosing", "caution", "A note CosIng wrote")).safetyOnly).toEqual([]);
    expect(planWrites([fixed], existing("cosing", "avoid", "Restricted use (EU Annex III/124 III/125 III/126)")).safetyOnly).toEqual([]);
    expect(planWrites([fixed], existing("curated", "caution", "A note someone wrote")).reviewByHand).toEqual([]);
  });

  it("writes nothing for a row already corrected", () => {
    const plan = planWrites([fixed], existing("cosing", "caution", fixed.note));
    expect(plan.safetyOnly).toEqual([]);
    expect(plan.reviewByHand).toEqual([]);
  });
});

describe("the migration says what the import says", () => {
  /** Every ('old note', 'new note') pair of the renumbering table. */
  const pairs = [...statements.matchAll(/\('(Restricted use (?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)].map((m) => [m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")]);

  it("renumbers each row to the note the import writes for the same citation", () => {
    expect(pairs.length).toBeGreaterThan(25);
    for (const [oldNote, newNote] of pairs) {
      const citation = /^Restricted use \(EU Annex ([\s\S]*)\)$/.exec(oldNote)?.[1] as string;
      expect(rating("6-hydroxyindole", citation)).toEqual({ safety: "caution", note: newNote });
    }
  });

  it("covers every deleted entry and every Part I number the import maps", () => {
    const old = pairs.map(([o]) => o).join("\n");
    for (const entry of RENUMBERED.keys()) expect(old).toContain(`Restricted use (EU Annex III/${entry})`);
    for (const entry of PART_I.keys()) expect(old).toContain(`III/I/${entry} - Directive`);
  });

  it("never maps to a note it also reads, so a second run changes nothing", () => {
    const olds = new Set(pairs.map(([o]) => o));
    for (const [, newNote] of pairs) expect(olds.has(newNote)).toBe(false);
  });

  it("writes the same bans, with the same name pattern", () => {
    for (const note of [
      "Prohibited in cosmetics (EU Annex II/1666, since 1 March 2022)",
      "Prohibited in cosmetics (EU Annex II/1389)",
      "Prohibited in cosmetics (EU Annex II/1395)",
      "Prohibited in cosmetics (EU Annex II/1394)",
      "Prohibited in cosmetics (EU Annex II/1396)",
    ]) {
      expect(sql).toContain(`'${note}'`);
    }
    expect(sql).toContain(`inci_name ~ '${BORATE_SALT.source}'`);
    expect(statements).not.toMatch(/\\b/);
  });

  it("only touches a row still carrying the old note, and never rows citing the perborate entry", () => {
    expect(sql).toContain("where safety = 'caution'");
    expect(statements).toContain("(1[ab]|24|61)");
    expect(statements).not.toMatch(/III\/12(?!\d)/);
  });
});

describe("0034: the boron rows 0032 left, the same way the import writes them", () => {
  const sql34 = readFileSync(join(__dirname, "..", "supabase", "migrations", "0034_annex_boron_followup.sql"), "utf8");
  const statements34 = sql34.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

  it("bans a perborate by the importer's own name pattern and old citation", () => {
    expect(statements34).toContain(`inci_name ~ '${PERBORATE.source}'`);
    expect(statements34).toContain("note = 'Restricted use (EU Annex III/1a III/12)'");
    expect(statements34).toContain(`'${rating("sodium perborate", "III/1a III/12").note}'`);
    expect(statements34).not.toMatch(/\\b/);
  });

  it("bans each uncited borate salt the import names, with the import's note", () => {
    for (const name of UNCITED_BORATE_SALTS) {
      expect(statements34).toContain(`inci_name = '${name}'`);
      expect(statements34).toContain(`'${rating(name, "").note}'`);
    }
  });

  it("gives phenyl mercuric borate the note its Annex V/17 citation gets, and keeps it safe", () => {
    expect(rating("phenyl mercuric borate", "V/17")).toEqual({ safety: "safe", note: "EU Annex V/17" });
    expect(statements34).toContain("set note = 'EU Annex V/17'");
    expect(statements34).not.toMatch(/phenyl mercuric borate'[\s\S]*safety = 'avoid'/);
  });
});
