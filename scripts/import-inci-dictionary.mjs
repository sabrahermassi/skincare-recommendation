/**
 * One-off import: the INCI dictionary, from the Open Beauty Facts ingredient
 * taxonomy. This is what makes `ingredients.verified` mean something.
 *
 *   node scripts/import-inci-dictionary.mjs --dry-run
 *   node scripts/import-inci-dictionary.mjs
 *   node scripts/import-inci-dictionary.mjs --prune
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run. With the
 * keys set, --dry-run reads the table and prints the real plan, including what
 * --prune would remove. A write also needs SUPABASE_ENV=staging or production
 * — production also requires --prod on the command line.
 *
 * --prune clears out names an earlier run wrote that this run no longer
 * produces (the old name rule turned POLY(DIMER GRAPESEED OIL) into "poly").
 * A name no product uses is deleted; one a product still uses goes back to
 * being an unverified stub, so it stops lending a wrong rating to that formula.
 *
 * WHY NOT COSING DIRECTLY: CosIng's site is a single-page app whose export
 * only exists as a button behind its own session — every REST path returns the
 * HTML shell, and it refuses an empty search, so there is no scriptable full
 * download. This taxonomy is CosIng's content in one ODbL JSON file: of its
 * 22,270 entries, 99% carry a CosIng reference number, 98% list INCI
 * functions, 50% a CAS number, and 1,219 carry the regulatory annex
 * restriction. `scripts/import-cosing.mjs` still works if you ever obtain the
 * official CSV by hand, but nothing requires it.
 */

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { fetchHttps } from "./lib/fetch-https.mjs";
import { parseFunctions } from "./lib/normalise-function.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";
import { applyPrune, assertNotTooMany, inBatches, planPruneAgainst } from "./lib/prune-stale.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");
const TAXONOMY = "https://static.openbeautyfacts.org/data/taxonomies/ingredients.json";
const ATTRIBUTION_NOTE = "Ingredient reference from Open Beauty Facts / EU CosIng.";

/**
 * Labels outside the EU use common names where CosIng uses the Latin INCI
 * term, so a US or Korean label saying "Water" would otherwise fail to match
 * `AQUA` and be shown as unrecognised. Only the handful that actually diverge.
 */
const COMMON_NAME_ALIASES = {
  aqua: ["water", "eau", "purified water", "distilled water"],
  "parfum": ["fragrance"],
  "sodium chloride": ["salt"],
  "tocopheryl acetate": ["vitamin e acetate"],
  "ascorbic acid": ["vitamin c"],
  "retinol": ["vitamin a"],
  "cocos nucifera oil": ["coconut oil"],
  "butyrospermum parkii butter": ["shea butter"],
  "simmondsia chinensis seed oil": ["jojoba oil"],
  "aloe barbadensis leaf juice": ["aloe vera juice"],
};

/**
 * Same normalisation the label parser uses. Only for `labelForms` below: it is
 * what a scanned label's text becomes, so it is how a label will ask for a row.
 */
function normalise(raw) {
  return raw
    .normalize("NFKC")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+|[^a-z0-9)\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー]+$/gu, "");
}

/**
 * Normalise an authoritative dictionary name without discarding chemistry.
 *
 * Deliberately not the label parser's `normalise()` above. The label parser
 * drops bracketed text, so a label printing "Tris(nonylphenyl)phosphite" asks
 * for "tris phosphite"; `toRows` adds that spelling as well, but only when one
 * ingredient alone reads that way.
 */
function normaliseDictionaryName(raw) {
  return raw
    // Parentheses are chemically meaningful in official INCI names. The
    // label parser removes parenthetical label annotations, but doing that to
    // the dictionary collapsed POLY(DIMER GRAPESEED OIL) to the false name
    // "poly", and several distinct ingredients onto that same row.
    .replace(/[()]/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function pickEn(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.en ?? Object.values(value)[0] ?? null;
  return null;
}

/** What a scanned label would ask for, for an entry printed with brackets. */
function labelFormOf(entry) {
  const printed = pickEn(entry.inci) ?? pickEn(entry.name);
  if (!printed?.includes("(")) return null;
  const form = normalise(printed);
  return form.length >= 2 ? form : null;
}

/**
 * Shortened spellings more than one taxonomy entry reads as. `import-cosing`
 * asks for this: its own list is a 2016 snapshot, so a spelling only one of
 * its ingredients has can still belong to several here.
 */
function sharedLabelForms(taxonomy) {
  const counts = new Map();
  for (const [key, entry] of Object.entries(taxonomy)) {
    if (!key.startsWith("en:")) continue;
    const form = labelFormOf(entry);
    if (form) counts.set(form, (counts.get(form) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([form]) => form));
}

/** `file` is a saved copy of the taxonomy, for a run with no network. */
async function fetchTaxonomy(file) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  console.log("Downloading the Open Beauty Facts ingredient taxonomy (~12 MB)…");
  // This file decides safety ratings, so no hop of the download may be http.
  const res = await fetchHttps(TAXONOMY);
  if (!res.ok) throw new Error(`Taxonomy download failed: HTTP ${res.status}`);
  return res.json();
}

/**
 * Turns a CosIng annex reference into a safety level.
 *
 *   Annex II  — substances PROHIBITED in cosmetic products      → avoid
 *   Annex III — RESTRICTED, permitted subject to limits         → caution
 *
 * This is the one place the app gets a safety rating from an actual regulator
 * rather than an invented table, so the mapping stays deliberately literal:
 * anything that is not an explicit prohibition or restriction is left `safe`
 * with no claim attached.
 */
function safetyFrom(restriction) {
  const ref = pickEn(restriction);
  if (!ref) return { safety: "safe", note: null };
  const text = String(ref).trim();
  // OBF does not use one spelling here. Alongside "II/416" and "III/61"
  // there are values such as "CMR1B II/656", "Annex III/I/257", and
  // "V/54 III/65". Search the full field.
  // A citation may follow a space, a bracket, or a comma/semicolon with no
  // space ("IV/1,II/329"): missing one of those would read a ban as "safe".
  const cites = (annex) => new RegExp(`(^|[\\s[(,;])\\s*(?:annex\\s+)?${annex}(?:\\/|\\b)`, "i").test(text);
  const prohibited = cites("II");
  // Annexes IV-VI list what IS allowed (colourants, preservatives, UV
  // filters). "IV/66 [III/256] II/1329 as hair dye" is an allowed colourant
  // that is banned for one use — calling it prohibited outright would put a
  // hazard warning on every product it colours. Annex III beside Annex II does
  // NOT soften it: hydroquinone is "II/1339 III/14", banned everywhere except
  // nail products, and must stay "avoid" in a skincare app.
  const allowedSomewhere = cites("IV") || cites("V") || cites("VI");
  if (prohibited && !allowedSomewhere) {
    return { safety: "avoid", note: `Prohibited in cosmetics (EU Annex ${text})` };
  }
  if (prohibited) {
    return { safety: "caution", note: `Prohibited for some uses, allowed for others (EU Annex ${text})` };
  }
  if (cites("III")) {
    return { safety: "caution", note: `Restricted use (EU Annex ${text})` };
  }
  return { safety: "safe", note: `EU Annex ${text}` };
}

/**
 * Annex II entries that ban only an unrefined grade. Petrolatum's entry
 * prohibits it "except if the full refining history is known and it can be
 * shown that the substance from which it is produced is not a carcinogen", so
 * reading it as a flat ban put "avoid" on every balm that lists it (#354).
 *
 * It is `safe`, with a note that says why (#361). `caution` was tried first,
 * but the app reads every `caution` as an EU-restricted irritant: a warning
 * for sensitive skin, an irritation charge on the score and a "to watch"
 * count. Petrolatum is none of those — it is one of the least irritating
 * ingredients there is, and it is not on the restricted list (Annex III). The
 * note deliberately doesn't take one of `safetyFrom`'s shapes, so the
 * safety-label audit doesn't report it as disagreeing with its own citation.
 *
 * Mirrored by supabase/migrations/0028_petrolatum_caution.sql and
 * 0029_petrolatum_safe.sql, which fix the row already written: keep the
 * note's wording the same in all three.
 */
const REFINED_GRADE_EXEMPT = new Set(["petrolatum"]);
const REFINED_GRADE_NOTE =
  "Allowed when fully refined. The EU bans it only when its refining history isn't known";

/**
 * Entry 764 bans heavy hydrocracked distillates only "if they contain > 3 % w/w DMSO
 * extract", which a cosmetic-grade alkane does not (checked against the regulation's text,
 * 5 October 2026). All three taxonomy names cite that one entry. The condition is the DMSO
 * content, not petrolatum's refining history, so the note says that. Mirrored by 0030.
 */
const DMSO_EXEMPT = new Set(["c14 19 alkane", "c15 19 alkane", "c18 21 alkane"]);
const DMSO_NOTE = "Allowed when fully refined. The EU bans it only when it contains more than 3 % DMSO extract";

/**
 * Annex II/358 is the entry for furocoumarins (trioxysalen, 8-methoxypsoralen,
 * 5-methoxypsoralen), "except for normal content in natural essences used", and below
 * 1 mg/kg in sun protection and bronzing products. The taxonomy cites it on the
 * essences themselves (44 entries: citrus, rue, cumin), which the import read as a flat
 * ban, so a lemon extract led 18 staging products with "flagged as best avoided".
 *
 * An entry whose only Annex II citation is 358, and whose name is one of the plants in
 * `NATURAL_ESSENCE_SOURCE`, is written `safe` with a note that says what the entry limits. One that cites something else as well keeps that citation and
 * is rated on it alone (cumin: "II/358 R1 III/156" is a restriction, not a ban).
 * The note doesn't take one of `safetyFrom`'s shapes, so the audit leaves it alone.
 *
 * Mirrored by supabase/migrations/0030_annex_ii_corrections.sql: keep the wording the same.
 */
const NATURAL_ESSENCE_NOTE =
  "Natural essence. EU Annex II/358 limits furocoumarins in the finished product (under 1 mg/kg in sun protection and bronzing products), not the ingredient itself";

/**
 * Cannabidiol is not listed as such in the narcotics convention entry 306 points to, so
 * the Commission treats it as outside that entry, while CBD made from cannabis extract,
 * tincture or resin is inside it (and the EU's safety committee gave a final opinion on
 * CBD in 2025). So it is neither banned nor cleared: `safe`, which charges nothing, with
 * a note that says the rules depend on how it is made (owner, 5 October 2026).
 * Mirrored by 0030_annex_ii_corrections.sql.
 */
const ORIGIN_DEPENDENT = new Set(["cannabidiol"]);
const ORIGIN_DEPENDENT_NOTE = "EU rules depend on how it's made.";

/**
 * HICC (Annex II/1380, Regulation (EU) 2017/1410) is genuinely prohibited. The taxonomy
 * carries the regulation's dates as running text; the sheet says them plainly instead,
 * because old stock may still be around. Rating unchanged. Mirrored by 0030.
 */
const DATED_PROHIBITION = new Map([
  [
    "hydroxyisohexyl 3 cyclohexene carboxaldehyde",
    "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)",
  ],
]);

/**
 * The plants whose essences the 358 correction was checked for (citrus, rue, cumin). Entry 358
 * also prohibits the furocoumarins themselves (methoxsalen, trioxsalen), so the correction
 * needs a name from this list as well as the citation: any other name keeps the ban until
 * it is reviewed. Mirrored by 0030, which tests the same pattern in SQL.
 */
const NATURAL_ESSENCE_SOURCE = /(^|[^a-z])(citrus|ruta|cuminum)([^a-z]|$)/;

/**
 * Stale Annex citations (#419). The OBF taxonomy still cites Annex III entries the regulation has
 * since deleted or moved, so the import wrote a ban as "Restricted use" and cited entries that do
 * not exist. Every fact below was read off the consolidated Regulation (EC) No 1223/2009 (version
 * 18.05.2026) and its amending acts (the owner approved them on #419, 7 October 2026).
 *
 * Mirrored by supabase/migrations/0032_annex_stale_citations.sql: keep the notes the same in both,
 * `__tests__/annex-stale-citations.test.ts` checks it.
 */

/** Annex II, from Regulation (EU) 2021/1902 (applies from 1 March 2022): "2-(4-tert-butylbenzyl) propionaldehyde". Old citation III/83. */
const LILIAL_NOTE = "Prohibited in cosmetics (EU Annex II/1666, since 1 March 2022)";
/** Annex II/1389, moved there from Annex III/7 by Regulation (EU) 2019/831. */
const DICHLOROMETHANE_NOTE = "Prohibited in cosmetics (EU Annex II/1389)";
/**
 * Regulation (EU) 2019/831 deleted Annex III entries 1a and 1b and prohibited boric acid (1395),
 * diboron trioxide (1394) and the whole class of borates, tetraborates, octaborates and boric acid
 * salts and esters (1396, replaced by Regulation (EU) 2019/1966). Matched by INCI name and class,
 * never by CAS: CosIng and the regulation give potassium borate different CAS numbers.
 */
const BORIC_ACID_NOTE = "Prohibited in cosmetics (EU Annex II/1395)";
const DIBORON_TRIOXIDE_NOTE = "Prohibited in cosmetics (EU Annex II/1394)";
const BORATE_SALT_NOTE = "Prohibited in cosmetics (EU Annex II/1396)";
const BORIC_ACID = /^boric acid$/;
const DIBORON_TRIOXIDE = /^(diboron trioxide|boric oxide)$/;
/**
 * A boric acid salt or ester by name. The same pattern runs as a JS regex here and as a Postgres
 * regex in 0032 (no `\b`, which Postgres reads as a backspace): "perborate", "tetrafluoroborate"
 * and "borosilicate" do not match because a letter precedes the stem. "phenyl mercuric borate" does
 * match, and `BORIC_ACID_CITATIONS` is what keeps it out: it never cited 1a or 1b.
 */
const BORATE_SALT = /(^|[^a-z])(borate|tetraborate|octaborate|fructoborate|ascorbylborate|borax)([^a-z]|$)/;
/**
 * Annex II/1397, perborates and peroxoborates: added by Regulation (EU) 2019/831, which deleted
 * Annex III entries 1a and 1b; Regulation (EU) 2026/78 merged 1398 and 1399 into it from 1 May
 * 2026. No exception. Annex III/12 (hydrogen peroxide) excludes 1397 by name, so a perborate
 * citing "III/1a III/12" cites two entries that no longer cover it. Checked on #434, 7 October 2026.
 */
const PERBORATE_NOTE = "Prohibited in cosmetics (EU Annex II/1397)";
const PERBORATE = /(^|[^a-z])perborate([^a-z]|$)/;
const PERBORATE_CITATIONS = new Set(["1a", "1b", "12"]);
/**
 * Boric acid salts or esters the taxonomy gives no citation at all, so nothing in their note
 * says what they are. Each is named in CosIng as II/1396 and covered by that entry's class
 * wording ("boric acid salts and esters, including:"); checked on #434, 7 October 2026. Listed
 * by name, not caught by `BORATE_SALT`, so an uncited row is never banned on a guess.
 */
const UNCITED_BORATE_SALTS = new Set(["magnesium ascorbylborate"]);
/** The Annex III citations an old boric-acid-class row carries: 1a, 1b, and the amine and zinc entries some also cite. */
const BORIC_ACID_CITATIONS = new Set(["1a", "1b", "24", "61"]);

/**
 * Bans the taxonomy does not show as bans (#468, the audit of 7 October 2026). Each was read off
 * the consolidated Regulation (EC) No 1223/2009 (version 18.05.2026) and is listed the same way
 * in CosIng. Mirrored by supabase/migrations/0035_annex_ii_bans_and_safrole.sql.
 *
 * 4-Methylbenzylidene camphor: Annex II/1730, added by Regulation (EU) 2024/996. The taxonomy
 * still cites its old UV-filter entry, Annex VI/18, which that regulation deleted. The dates are
 * the entry's own footnote, said plainly because older stock may still be around.
 */
const FOUR_MBC = /^4[ -]methylbenzylidene camphor$/;
const FOUR_MBC_CITATION = /^(?:annex\s+)?VI\/18$/i;
const FOUR_MBC_NOTE =
  "Prohibited in cosmetics (EU Annex II/1730: not to be placed on the EU market since 1 May 2025 and not to be sold there since 1 May 2026; older stock may still be around)";
/**
 * Octamethylcyclotetrasiloxane (D4): Annex II/1388, added by Regulation (EU) 2019/831. The
 * taxonomy gives it no citation at all. Listed by name, like `UNCITED_BORATE_SALTS`, so an
 * uncited row is never banned on a guess: cyclomethicone, a mixture that may hold D4, is not here.
 */
const UNCITED_BANS = new Map([["cyclotetrasiloxane", "Prohibited in cosmetics (EU Annex II/1388)"]]);

/**
 * Annex II/360 is the entry for safrole, "except for normal content in the natural essences
 * used and provided the concentration does not exceed 100 ppm in the finished product, 50 ppm
 * in products for dental and oral hygiene". The taxonomy cites it ("II/360 R3") on the essences
 * themselves, which the import read as a flat ban. Same shape as the furocoumarin correction
 * above: an entry whose only Annex II citation is 360, and whose name is one of the plants
 * checked, is `safe` with a note that says what the entry limits. Safrole itself keeps the ban.
 */
const SAFROLE_ESSENCE_SOURCE = /(^|[^a-z])(cinnamomum camphora|sassafras)([^a-z]|$)/;
const SAFROLE_ESSENCE_NOTE =
  "Natural essence. EU Annex II/360 limits safrole in the finished product (100 ppm; 50 ppm in dental and oral hygiene products; none in toothpaste made for children), not the ingredient itself";

/** Regulation (EU) 2023/1545 deleted entries 125, 126, 158, 160-163, 165, 167 and 168, merged into 124 (turpentine), 157 (rose ketones) and 88 (limonene). 19 is now 227. */
const RENUMBERED = new Map([
  ["125", "124"], ["126", "124"],
  ["158", "157"], ["160", "157"], ["161", "157"], ["162", "157"], ["163", "157"], ["165", "157"],
  ["167", "88"], ["168", "88"],
  ["19", "227"],
]);
/** Old Part I numbering ("Annex III/I/256 - Directive 2012/21/EU") to the current entry, matched by ingredient name. */
const PART_I = new Map([
  ["255", "200"], ["256", "206"], ["257", "207"], ["258", "208"], ["260", "210"], ["262", "212"],
  ["263", "213"], ["265", "240"], ["266", "251"], ["268", "255"], ["269", "256"], ["270", "258"],
  ["271", "259"], ["272", "260"], ["273", "261"], ["274", "262"], ["275", "263"], ["276", "264"],
]);

/** One Part I citation lost its number upstream ("Annex III/I/EU - Directive 2012/21/EU"): 6-hydroxyindole, which is entry 209. */
const UNNUMBERED_PART_I = { name: /^6[ -]hydroxyindole$/, citation: /^(?:annex\s+)?III\/I\/EU\b/i, entry: "209" };

/** The Annex III entry numbers a citation names, e.g. "III/1a III/61" gives ["1a", "61"], never a Part I number. */
function annexThreeEntries(text) {
  return [...String(text).matchAll(/(?:^|[\s[(,;])\s*(?:annex\s+)?III\/(\d+[a-z]?)(?![\w/])/gi)].map((m) => m[1].toLowerCase());
}

/** A citation with the deleted entries replaced by the ones they became, each entry once. */
function renumberCitation(text) {
  const current = String(text)
    .replace(/(?:annex\s+)?III\/I\/(\d+)(?:\s*-\s*Directive\s+\S+)?/gi, (whole, n) => (PART_I.has(n) ? `III/${PART_I.get(n)}` : whole))
    .replace(/(^|[\s[(,;])((?:annex\s+)?)III\/(\d+)(?![\w/])/gi, (whole, lead, annex, n) =>
      RENUMBERED.has(n) ? `${lead}${annex}III/${RENUMBERED.get(n)}` : whole
    );
  return current.replace(/\b(III\/\d+[a-z]?)(?:\s+\1)+(?![\w/])/gi, "$1");
}

/** The rating a stale citation corrects to, or null when this row is not one of the reviewed cases. */
function staleCitationFix(canonical, text) {
  if (!text && UNCITED_BORATE_SALTS.has(canonical)) return { safety: "avoid", note: BORATE_SALT_NOTE };
  if (!text && UNCITED_BANS.has(canonical)) return { safety: "avoid", note: UNCITED_BANS.get(canonical) };
  if (FOUR_MBC.test(canonical) && FOUR_MBC_CITATION.test(text)) return { safety: "avoid", note: FOUR_MBC_NOTE };
  if (!text || annexTwoEntries(text).length > 0) return null;
  const entries = annexThreeEntries(text);
  const only = (...wanted) => entries.length > 0 && entries.every((e) => wanted.includes(e));
  if (PERBORATE.test(canonical) && entries.length > 0 && entries.every((e) => PERBORATE_CITATIONS.has(e))) {
    return { safety: "avoid", note: PERBORATE_NOTE };
  }
  if (only("83")) return { safety: "avoid", note: LILIAL_NOTE };
  if (only("7")) return { safety: "avoid", note: DICHLOROMETHANE_NOTE };
  if (entries.length > 0 && entries.every((e) => BORIC_ACID_CITATIONS.has(e)) && entries.some((e) => e === "1a" || e === "1b")) {
    if (BORIC_ACID.test(canonical)) return { safety: "avoid", note: BORIC_ACID_NOTE };
    if (DIBORON_TRIOXIDE.test(canonical)) return { safety: "avoid", note: DIBORON_TRIOXIDE_NOTE };
    if (BORATE_SALT.test(canonical) && !/mercur/.test(canonical)) return { safety: "avoid", note: BORATE_SALT_NOTE };
    return null;
  }
  if (UNNUMBERED_PART_I.name.test(canonical) && UNNUMBERED_PART_I.citation.test(text)) {
    return safetyFrom({ en: `III/${UNNUMBERED_PART_I.entry}` });
  }
  const renumbered = renumberCitation(text);
  return renumbered === text ? null : safetyFrom({ en: renumbered });
}

/**
 * The ban notes `staleCitationFix` writes: a CosIng-owned row moving to one of these is a
 * correction, not "stricter". The renumbered notes are not here on purpose: "Restricted use
 * (EU Annex III/88)" is also what an ordinary row citing entry 88 gets, so the note alone does
 * not say a correction happened (`isStaleRenumber` reads the row being replaced instead).
 */
const STALE_FIX_NOTES = new Set([LILIAL_NOTE, DICHLOROMETHANE_NOTE, BORIC_ACID_NOTE, DIBORON_TRIOXIDE_NOTE, BORATE_SALT_NOTE, PERBORATE_NOTE, FOUR_MBC_NOTE, ...UNCITED_BANS.values()]);

/**
 * True when `row` only renumbers the citation `current` already carries: same rating, and the
 * old note names a deleted entry that becomes the new note. Never a change of rating, so a
 * stricter rating another source gave the row is never replaced by this.
 */
function isStaleRenumber(current, row) {
  if (!current.note || !row.note || current.note === row.note || current.safety !== row.safety) return false;
  return renumberCitation(current.note) === row.note;
}

/** The Annex II entry numbers a citation names, e.g. "II/358 R1 III/156" gives ["358"]. */
function annexTwoEntries(text) {
  return [...String(text).matchAll(/(?:^|[\s[(,;])\s*(?:annex\s+)?II\/(\d+)/gi)].map((m) => m[1]);
}

/** `safetyFrom`, with the exemptions and corrections above applied by name or by citation. */
function safetyFor(canonical, restriction) {
  const ref = pickEn(restriction);
  const text = ref ? String(ref).trim() : "";
  const stale = staleCitationFix(canonical, text);
  if (stale) return stale;
  const entries = annexTwoEntries(text);
  if (entries.length > 0 && entries.every((entry) => entry === "358") && NATURAL_ESSENCE_SOURCE.test(canonical)) {
    const rest = text.replace(/(?:\bannex\s+)?\bII\/358\b(\s+R1?\b)?/i, "").trim();
    return rest ? safetyFrom(rest) : { safety: "safe", note: NATURAL_ESSENCE_NOTE };
  }
  if (entries.length > 0 && entries.every((entry) => entry === "360") && SAFROLE_ESSENCE_SOURCE.test(canonical)) {
    const rest = text.replace(/(?:\bannex\s+)?\bII\/360\b(\s+R\d?\b)?/i, "").trim();
    return rest ? safetyFrom(rest) : { safety: "safe", note: SAFROLE_ESSENCE_NOTE };
  }
  const rating = safetyFrom(restriction);
  // A named exemption holds only for the entry it was reviewed against: a taxonomy that
  // adds or swaps a citation (cannabidiol under II/1339) keeps the ban.
  const citesOnly = (entry) => entries.length > 0 && entries.every((e) => e === entry);
  if (rating.safety === "avoid" && ORIGIN_DEPENDENT.has(canonical) && citesOnly("306")) {
    return { safety: "safe", note: ORIGIN_DEPENDENT_NOTE };
  }
  if (rating.safety === "avoid" && DATED_PROHIBITION.has(canonical) && citesOnly("1380")) {
    return { safety: "avoid", note: DATED_PROHIBITION.get(canonical) };
  }
  if (rating.safety === "avoid" && DMSO_EXEMPT.has(canonical) && citesOnly("764")) {
    return { safety: "safe", note: `${DMSO_NOTE} (EU Annex ${text})` };
  }
  if (rating.safety !== "avoid" || !REFINED_GRADE_EXEMPT.has(canonical)) return rating;
  return { safety: "safe", note: `${REFINED_GRADE_NOTE} (EU Annex ${text})` };
}

/**
 * `conflicts` collects every name two entries claim with different data. Such a
 * name is left out rather than stopping the run: the file is someone else's and
 * changes weekly, and one clash upstream must not block every other rating.
 */
function toRows(taxonomy, conflicts = []) {
  const rows = new Map(); // normalised name → row
  const priorities = new Map(); // taxonomy key > its printed name > hand-maintained common alias
  const clashed = new Map(); // name → the priority it was fought over at
  const labelForms = new Map(); // what a scanned label would ask for → every row that reads that way

  for (const [key, entry] of Object.entries(taxonomy)) {
    if (!key.startsWith("en:")) continue;

    const slug = key.slice(3).replace(/-/g, " ");
    // The taxonomy key is the stable, unambiguous spelling. `name` supplies a
    // second spelling where punctuation differs, but must not replace it.
    const canonical = normaliseDictionaryName(slug);
    if (canonical.length < 2) continue;

    const { safety, note } = safetyFor(canonical, entry.inci_restriction);
    // Shared with import-cosing so the same role is never written two ways —
    // this importer used to emit the OBF taxonomy's hyphenated, mixed-case
    // form while CosIng emitted a lowercase spaced one.
    const functions = parseFunctions(pickEn(entry.inci_functions), ",");

    const row = {
      cas_number: pickEn(entry.cas) || null,
      functions,
      safety,
      // Deliberately no `comedogenic`: CosIng rates neither pore-clogging nor
      // irritancy, and filling it in from nothing would put a fabricated
      // number next to genuine regulatory data, where it would look sourced.
      note: note ?? (pickEn(entry.inci_description) || ATTRIBUTION_NOTE).slice(0, 300),
      source: "obf",
      verified: true,
    };

    // Aliases get their own row rather than a synonyms column so that lookup
    // stays a primary-key hit. The table is fully regenerated by re-running
    // this script, so the duplication never drifts.
    const sourceName = normaliseDictionaryName(pickEn(entry.inci) ?? pickEn(entry.name) ?? slug);
    const aliases = new Map([
      ...(COMMON_NAME_ALIASES[canonical] ?? []).map((alias) => [alias, 1]),
      [sourceName, 2],
      // Last, so that when the key and the printed name are the same text it
      // is recorded as the key.
      [canonical, 3],
    ]);
    for (const [alias, priority] of aliases) {
      // A name two printed names fought over can still go to a taxonomy key.
      if (alias.length < 2 || (clashed.get(alias) ?? 0) >= priority) continue;
      const existing = rows.get(alias);
      if (existing) {
        // Silently accepting the first row would attach whichever safety and
        // functions happened to appear first to an ambiguous alias.
        const candidate = { inci_name: alias, ...row };
        if (JSON.stringify(existing) === JSON.stringify(candidate)) continue;
        const existingPriority = priorities.get(alias) ?? 0;
        // A real taxonomy spelling owns its metadata. A convenience alias
        // such as `fragrance` must not overwrite (or block) that real row.
        if (priority > existingPriority) {
          rows.set(alias, candidate);
          priorities.set(alias, priority);
          continue;
        }
        if (priority === existingPriority) {
          // Two entries claim the same name with different data — by key, by
          // printed name, or through the hand-written alias table — and
          // nothing says which is right. Neither gets the name.
          rows.delete(alias);
          priorities.delete(alias);
          clashed.set(alias, priority);
          if (!conflicts.includes(alias)) conflicts.push(alias);
        }
        continue;
      }
      rows.set(alias, { inci_name: alias, ...row });
      priorities.set(alias, priority);
    }

    const form = labelFormOf(entry);
    if (form) labelForms.set(form, [...(labelForms.get(form) ?? []), row]);
  }

  // The label parser drops bracketed text, so "Tris(nonylphenyl)phosphite" on
  // a label asks for "tris phosphite". That spelling gets a row only when one
  // ingredient alone reads that way: ten different ingredients read as "poly",
  // and giving the name to any of them is the false match this file once made.
  for (const [form, owners] of labelForms) {
    if (owners.length !== 1 || rows.has(form) || clashed.has(form)) continue;
    rows.set(form, { inci_name: form, ...owners[0] });
  }

  return [...rows.values()];
}

const STRICTNESS = { safe: 0, caution: 1, avoid: 2 };

/**
 * A row `safetyFor` wrote as one of its reviewed corrections, told by its note: these are
 * never "stricter", so without this a CosIng-owned row (no rating, no note of its own)
 * would keep neither the rating nor the explanation the correction exists to give.
 */
function isReviewedCorrection(row) {
  const note = row.note ?? "";
  return (
    note === NATURAL_ESSENCE_NOTE ||
    note === SAFROLE_ESSENCE_NOTE ||
    note === ORIGIN_DEPENDENT_NOTE ||
    note.startsWith(`${DMSO_NOTE} (`) ||
    note.startsWith(`${REFINED_GRADE_NOTE} (`) ||
    [...DATED_PROHIBITION.values()].includes(note) ||
    STALE_FIX_NOTES.has(note)
  );
}

/**
 * Preserve data another verified source owns. OBF may promote an unverified
 * label stub and refresh rows it imported previously, but it must not replace
 * curated or CosIng values merely because the same name is present.
 *
 * One exception, because the other way round is the dangerous mistake: when
 * the annex rates a name more strictly than the row it is skipping, that is
 * never dropped silently. CosIng rows carry no rating of their own (that import
 * leaves `safety` unset), so they take the annex rating and nothing else.
 * A hand-curated row is somebody's decision; it is listed for them instead.
 */
function planWrites(rows, existing) {
  const fresh = [];
  const promoted = [];
  const refreshed = [];
  const safetyOnly = [];
  const reviewByHand = [];
  let untouched = 0;

  for (const row of rows) {
    const current = existing.get(row.inci_name);
    if (!current) fresh.push(row);
    else if (!current.verified) promoted.push(row);
    else if (current.source === "obf") refreshed.push(row);
    else {
      untouched += 1;
      const corrected = isReviewedCorrection(row) && (current.safety !== row.safety || current.note !== row.note);
      const staleFix = (corrected && STALE_FIX_NOTES.has(row.note)) || isStaleRenumber(current, row);
      if ((corrected && current.source === "cosing") || STRICTNESS[row.safety] > (STRICTNESS[current.safety] ?? 0) || staleFix) {
        const stricter = { inci_name: row.inci_name, safety: row.safety, note: row.note, owner: current.source };
        (current.source === "cosing" ? safetyOnly : reviewByHand).push(stricter);
      }
    }
  }

  return {
    fresh,
    promoted,
    refreshed,
    safetyOnly,
    reviewByHand,
    untouched,
    ingredients: [...fresh, ...promoted, ...refreshed],
  };
}

async function main() {
  const taxonomy = await fetchTaxonomy();
  console.log(`  ${Object.keys(taxonomy).length} taxonomy entries`);

  const conflicts = [];
  const rows = toRows(taxonomy, conflicts);
  const restricted = rows.filter((r) => r.safety !== "safe");
  console.log(
    `  ${rows.length} dictionary names (incl. aliases), ` +
      `${rows.filter((r) => r.cas_number).length} with a CAS number, ` +
      `${restricted.length} carrying an EU annex restriction`
  );
  if (conflicts.length > 0) {
    console.log(`  ${conflicts.length} name(s) claimed by two entries with different data, left out:`);
    for (const name of conflicts.slice(0, 20)) console.log(`    ${name}`);
  }

  // Same shape as import-cosing: a dry run is allowed to proceed with no
  // credentials at all, so the connection is only made when there is
  // something to connect to, or when this run writes and connect() must
  // refuse it outright.
  const haveCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!haveCredentials && DRY_RUN) {
    // Without the table there is no plan to print: every name would read as new.
    console.log("\n--dry-run without keys: the database was not read, so there is no write plan.");
    printSamples(rows, restricted);
    return;
  }

  const { db } = connect({ write: !DRY_RUN });
  const existing = new Map();
  const currentRows = await paginateOrdered(db, "ingredients", {
    select: "inci_name, verified, source, safety, note",
    cursorColumn: "inci_name",
  });
  for (const row of currentRows) existing.set(row.inci_name, row);

  const plan = planWrites(rows, existing);
  console.log(
    `  ${plan.fresh.length} new, ${plan.promoted.length} promoted, ` +
      `${plan.refreshed.length} OBF rows refreshed, ${plan.untouched} other verified rows left alone`
  );
  if (plan.safetyOnly.length > 0) {
    console.log(`  ${plan.safetyOnly.length} CosIng row(s) take the annex rating or its reviewed correction (nothing else changes):`);
    for (const r of plan.safetyOnly.slice(0, 20)) console.log(`    [${r.safety}] ${r.inci_name}`);
  }
  if (plan.reviewByHand.length > 0) {
    console.log(`  ${plan.reviewByHand.length} hand-set row(s) are rated more strictly by the annex. NOT changed, check them:`);
    for (const r of plan.reviewByHand) console.log(`    [${r.safety}] ${r.inci_name} (${r.owner}) — ${r.note}`);
  }

  const prune = await planPruneAgainst(db, rows, existing, "obf");
  console.log(
    `  ${prune.stale.length} name(s) from an earlier run are no longer produced: ` +
      `${prune.remove.length} unused, ${prune.demote.length} still used by a product` +
      (PRUNE ? "" : " (pass --prune to clear them)")
  );
  for (const name of prune.demote.slice(0, 20)) console.log(`    still used: ${name}`);
  if (PRUNE) assertNotTooMany(prune, "OBF");

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    printSamples(rows, restricted);
    return;
  }

  let written = 0;
  await inBatches(plan.ingredients, 500, async (batch) => {
    // Upsert, so names already created unverified by a barcode lookup are
    // promoted in place — the transition this table exists to record.
    const { error } = await db.from("ingredients").upsert(batch, { onConflict: "inci_name" });
    if (error) throw new Error(error.message);
    written += batch.length;
    process.stdout.write(`\r  ${written}/${plan.ingredients.length}`);
  });
  console.log(`\nWrote ${plan.ingredients.length} ingredient names, ${restricted.length} with a real EU safety rating.`);

  for (const { inci_name, safety, note } of plan.safetyOnly) {
    // Guarded on the owner read above, so a row re-sourced meanwhile is left.
    const { error } = await db.from("ingredients").update({ safety, note }).eq("inci_name", inci_name).eq("source", "cosing");
    if (error) throw new Error(error.message);
  }

  if (!PRUNE) return;

  const { removed, demoted } = await applyPrune(db, prune, "obf");
  console.log(`Pruned: ${removed} deleted, ${demoted} returned to unverified.`);
}

function printSamples(rows, restricted) {
  console.log("Regulated substances found, sample:");
  for (const r of restricted.slice(0, 5)) console.log(`  [${r.safety}] ${r.inci_name} — ${r.note}`);
  console.log("\nCommon-name aliases resolve:");
  for (const probe of ["water", "fragrance", "shea butter", "glycerin"]) {
    console.log(`  ${probe.padEnd(14)} ${rows.some((r) => r.inci_name === probe) ? "present" : "MISSING"}`);
  }
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export {
  BORATE_SALT,
  PERBORATE,
  UNCITED_BORATE_SALTS,
  BORIC_ACID_CITATIONS,
  fetchTaxonomy,
  NATURAL_ESSENCE_SOURCE,
  normaliseDictionaryName,
  PART_I,
  planWrites,
  RENUMBERED,
  SAFROLE_ESSENCE_SOURCE,
  UNCITED_BANS,
  safetyFor,
  safetyFrom,
  sharedLabelForms,
  toRows,
};

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
