import { readFileSync } from "fs";
import { join } from "path";

import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { HAZARD_SCORE_CAP, matchProduct, resetScoreCache } from "@/lib/matching";
import { contraindications, regulatoryStatus, SAFETY_NOTICE_ENTRIES, safetyNoticeFor } from "@/lib/safety";
import { planWrites, safetyFor, SAFROLE_ESSENCE_SOURCE, toRows, UNCITED_BANS } from "../scripts/import-inci-dictionary.mjs";

/**
 * #468, from the audit of 7 October 2026: two Annex II bans the dictionary showed as allowed, and
 * the safrole entry (360) read as a flat ban on the essences it only limits. Every fact was read
 * off the consolidated Regulation (EC) No 1223/2009, version 18.05.2026, and CosIng.
 */

const FOUR_MBC_NOTE =
  "Prohibited in cosmetics (EU Annex II/1730: not to be placed on the EU market since 1 May 2025 and not to be sold there since 1 May 2026; older stock may still be around)";
const D4_NOTE = "Prohibited in cosmetics (EU Annex II/1388)";
const SAFROLE_NOTE =
  "Natural essence. EU Annex II/360 limits safrole in the finished product (100 ppm; 50 ppm in dental and oral hygiene products; none in toothpaste made for children), not the ingredient itself";

const rating = (canonical: string, restriction: string) => safetyFor(canonical, restriction ? { en: restriction } : undefined);
const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "0035_annex_ii_bans_and_safrole.sql"), "utf8");
/** The statements, without the comments that explain them. */
const statements = sql.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");

function row(name: string, safety: Ingredient["safety"], note: string | null): Ingredient {
  return { id: name, name, comedogenic: 0, safety, verified: true, note: note ?? undefined };
}
const written = (name: string, restriction: string) => {
  const r = rating(name, restriction);
  return row(name, r.safety as Ingredient["safety"], r.note ?? null);
};

describe("a ban the dictionary showed as allowed", () => {
  it.each([
    ["4-methylbenzylidene camphor", "VI/18", FOUR_MBC_NOTE],
    ["4 methylbenzylidene camphor", "VI/18", FOUR_MBC_NOTE],
    ["4-methylbenzylidene camphor", "Annex VI/18", FOUR_MBC_NOTE],
    ["cyclotetrasiloxane", "", D4_NOTE],
  ])("%s citing %j is prohibited", (name: string, citation: string, note: string) => {
    expect(rating(name, citation)).toEqual({ safety: "avoid", note });
  });

  it("goes by the name and the citation it was checked for, never a guess", () => {
    // Another UV filter's own Annex VI entry is an ordinary citation.
    expect(rating("ethylhexyl methoxycinnamate", "VI/12").safety).toBe("safe");
    // 4-MBC under a citation nobody reviewed keeps whatever that citation says.
    expect(rating("4-methylbenzylidene camphor", "VI/19").note).toBe("EU Annex VI/19");
    // Cyclomethicone may hold D4, and is a mixture the entry does not name.
    expect(UNCITED_BANS.has("cyclomethicone")).toBe(false);
    expect(rating("cyclomethicone", "").safety).toBe("safe");
    expect(rating("cyclopentasiloxane", "").safety).toBe("safe");
  });

  it("is a hazard for everyone: the score caps and the sheet says Prohibited", () => {
    const profile: SkinProfile = { concerns: ["dullness"], baseSkinType: "normal", sensitivity: "none", pregnancyStatus: null };
    const filler = ["water", "glycerin", "propanediol", "carbomer", "panthenol"].map((name) => row(name, "safe", null));
    for (const banned of [written("4-methylbenzylidene camphor", "VI/18"), written("cyclotetrasiloxane", "")]) {
      resetScoreCache();
      const product = { type: "sunscreen", ingredients: [...filler, banned] } as unknown as ProductWithIngredients;
      expect(matchProduct(product, profile).score).toBeLessThanOrEqual(HAZARD_SCORE_CAP);
      expect(contraindications([banned], profile).some((w) => w.severity === "hazard")).toBe(true);
      expect(regulatoryStatus(banned)).toBe("Prohibited");
    }
  });

  it("does not fire the safety notice: the entries wait for the owner", () => {
    for (const entry of [1730, 1388, 1703, 1721, 1575]) {
      expect(SAFETY_NOTICE_ENTRIES.find((e) => e.entry === entry)).toMatchObject({ verified: null, verifiedBy: null });
    }
    expect(safetyNoticeFor(written("4-methylbenzylidene camphor", "VI/18"), true)).toBeNull();
    expect(safetyNoticeFor(written("cyclotetrasiloxane", ""), true)).toBeNull();
  });
});

describe("an essence cited under the safrole entry", () => {
  it.each([
    "cinnamomum camphora formosana root oil",
    "cinnamomum camphora formosana leaf oil rectified",
    "cinnamomum camphora linalooliferum root extract",
    "sassafras officinale root oil",
    "sassafras officinale bark/root extract",
  ])("%s is allowed, with a note that says what the entry limits", (name: string) => {
    const r = rating(name, "II/360 R3");
    expect(r).toEqual({ safety: "safe", note: SAFROLE_NOTE });
    expect(regulatoryStatus(row(name, "safe", r.note ?? null))).toBe("Allowed, with a limit on safrole");
  });

  it("still says furocoumarins for the entry that limits those", () => {
    const r = rating("ruta graveolens leaf extract", "II/358");
    expect(regulatoryStatus(row("ruta graveolens leaf extract", "safe", r.note ?? null))).toBe("Allowed, with a limit on furocoumarins");
  });

  it("keeps the ban on safrole itself, and on a name nobody checked", () => {
    expect(rating("safrole", "II/360").safety).toBe("avoid");
    expect(rating("ocotea cymbarum oil", "II/360 R3").safety).toBe("avoid");
    expect(SAFROLE_ESSENCE_SOURCE.test("safrole")).toBe(false);
  });

  it("is rated on its other citation when it has one", () => {
    expect(rating("cinnamomum camphora linalooliferum leaf oil", "II/360 R3 III/84")).toEqual({ safety: "caution", note: "Restricted use (EU Annex III/84)" });
  });
});

describe("through the whole import", () => {
  const entry = (restriction: string, inci: string) => ({ ...(restriction ? { inci_restriction: { en: restriction } } : {}), inci: { en: inci }, name: { en: inci }, cas: { en: "1-1-1" } });
  const rows = toRows({
    "en:4-methylbenzylidene-camphor": entry("VI/18", "4-Methylbenzylidene Camphor"),
    "en:cyclotetrasiloxane": entry("", "Cyclotetrasiloxane"),
    "en:sassafras-officinale-root-oil": entry("II/360 R3", "Sassafras Officinale Root Oil"),
  });
  const byName = (name: string) => rows.find((r: { inci_name: string }) => r.inci_name === name);

  it("gives every spelling the corrected rating", () => {
    expect(byName("4-methylbenzylidene camphor")).toMatchObject({ safety: "avoid", note: FOUR_MBC_NOTE });
    expect(byName("4 methylbenzylidene camphor")).toMatchObject({ safety: "avoid", note: FOUR_MBC_NOTE });
    expect(byName("cyclotetrasiloxane")).toMatchObject({ safety: "avoid", note: D4_NOTE });
    expect(byName("sassafras officinale root oil")).toMatchObject({ safety: "safe", note: SAFROLE_NOTE });
  });

  it("gives a CosIng-owned row the ban and its note, and lists a hand-curated one instead of writing it", () => {
    const banned = byName("cyclotetrasiloxane");
    const owned = (source: string) => new Map([["cyclotetrasiloxane", { verified: true, source, safety: "safe", note: null }]]);
    expect(planWrites([banned], owned("cosing")).safetyOnly).toEqual([{ inci_name: "cyclotetrasiloxane", safety: "avoid", note: D4_NOTE, owner: "cosing" }]);
    const curated = planWrites([banned], owned("curated"));
    expect(curated.safetyOnly).toEqual([]);
    expect(curated.reviewByHand).toHaveLength(1);
  });
});

describe("the migration says what the import says", () => {
  it("gives a database that ran the shorter safrole note the full one", () => {
    const catchUp = readFileSync(join(__dirname, "..", "supabase", "migrations", "0037_safrole_note_childrens_toothpaste.sql"), "utf8");
    expect(SAFROLE_NOTE).toContain("none in toothpaste made for children");
    expect(catchUp).toContain(`note = '${SAFROLE_NOTE}'`);
    expect(catchUp).toContain(`and note = '${SAFROLE_NOTE.replace("; none in toothpaste made for children", "")}'`);
  });

  it("writes the same three notes", () => {
    for (const note of [FOUR_MBC_NOTE, D4_NOTE, SAFROLE_NOTE]) expect(statements).toContain(`note = '${note}'`);
  });

  it("uses the import's name pattern for the essences, and names both spellings of 4-MBC", () => {
    expect(statements).toContain(`inci_name ~ '${SAFROLE_ESSENCE_SOURCE.source}'`);
    expect(statements).toContain("inci_name in ('4-methylbenzylidene camphor', '4 methylbenzylidene camphor')");
    expect([...UNCITED_BANS.keys()]).toEqual(["cyclotetrasiloxane"]);
    expect(statements).toContain("inci_name = 'cyclotetrasiloxane'");
  });

  it("only touches a row still carrying the old rating and note, so a second run changes nothing", () => {
    const updates = statements.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
    expect(updates).toHaveLength(3);
    expect(updates[0]).toMatch(/where safety = 'safe'[\s\S]*and note = 'EU Annex VI\/18'/);
    expect(updates[1]).toMatch(/where safety = 'safe'[\s\S]*and source = 'obf'/);
    expect(updates[2]).toMatch(/where safety = 'avoid'[\s\S]*and note = 'Prohibited in cosmetics \(EU Annex II\/360 R3\)'/);
    // The three rows named as still to verify are not written.
    for (const untouched of ["benzophenone", "pentasodium pentetate", "styrene"]) expect(statements).not.toContain(untouched);
  });
});
