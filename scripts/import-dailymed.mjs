/**
 * Import US sunscreens from DailyMed.
 *
 * Step 10 of the data-strategy plan, and the narrowest source on it: US
 * sunscreens only, but authoritative ones. DailyMed is published by the
 * National Library of Medicine, Structured Product Labeling content is a work
 * of the US government and carries no copyright, so these rows are written
 * with `expires_at = null` and are ours outright — the same footing as Open
 * Beauty Facts and unlike the `inci_api` tier, which expires hourly.
 *
 * Why sunscreens specifically: in the US they are regulated as over-the-counter
 * drugs, so every one of them has an SPL with a structured label. That is the
 * whole reason this source exists for a skincare app — there is no DailyMed
 * entry for a moisturiser.
 *
 * Run:
 *   node scripts/import-dailymed.mjs --dry-run      # print what would be written
 *   node scripts/import-dailymed.mjs                # write to Supabase
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, including for --dry-run —
 * same reason as the OBF importer: the plausibility gate judges a parsed
 * formula against the live dictionary, so without it the count a dry run
 * prints is not the count a real run writes.
 *
 * Needs migration 0013 applied. `product_source` has no 'dailymed' value
 * before it, and every write fails on an enum violation.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { normalise, parseInci } from "./lib/inci-parse.mjs";
import { fetchAliases } from "./lib/aliases.mjs";
import { fetchStoredFormulas, isParserRefresh } from "./lib/formula-diff.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const DAILYMED = "https://dailymed.nlm.nih.gov/dailymed/services/v2";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const ATTRIBUTION =
  "Label data from DailyMed (U.S. National Library of Medicine), public domain.";

/**
 * How many products one run may write, and the request ceiling it may spend.
 *
 * Smaller than the OBF import's 500 on purpose: this is an addition to a
 * catalogue, not the catalogue itself, and DailyMed costs one request per
 * product — the search returns identity only, so every formula is a second
 * fetch. 200 products is roughly 210 requests.
 *
 * The same cap reasoning applies as everywhere else on this plan: the client
 * still holds the whole catalogue, and `DISK_BUDGET_BYTES` in
 * `data/catalogue-cache.ts` bounds what a device can keep. This must not be
 * the thing that pushes it over.
 */
const TARGET_ROWS = 200;
const MAX_REQUESTS = 400;
const PAGE_SIZE = 50;

/**
 * Gap between DailyMed requests.
 *
 * DailyMed publishes no numeric rate limit — its terms ask for "reasonable"
 * automated use and nothing more specific. With no documented figure to
 * respect, this errs well clear: ~1.3 requests a second is slower than a
 * person clicking through the site and nowhere near anything that could be
 * mistaken for a load test. A full run is then a few minutes, which for a
 * source that publishes daily and an importer run by hand costs nothing worth
 * saving.
 *
 * Contrast with the OBF importer, where the interval is derived from a
 * published 10-requests-per-minute limit rather than chosen.
 */
const REQUEST_INTERVAL_MS = 750;

/** See the same constant in `scripts/import-obf.mjs`. */
const MIN_KNOWN_INGREDIENT_RATIO = 0.6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * How long a single DailyMed request may hang before this script gives up on
 * it and treats it as failed. DailyMed publishes no SLA; long enough for a
 * slow but real response, short enough that a stalled connection cannot hang
 * a run that would otherwise finish in minutes.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Physical HTTP attempts spent this run, across every fetch and every retry
 * of it — a module-level counter rather than one threaded through as a
 * parameter, because a retry inside `fetchWithRetry` spends a request too.
 * Counting anywhere but where the fetch actually happens either double-counts
 * the happy path or, as review found, undercounts a retried one: a run that
 * degrades and retries every request could spend twice `MAX_REQUESTS` in
 * real attempts while this stayed at half that.
 */
let requestsSpent = 0;

/**
 * `fetch`, with a timeout and one retry for a failure that looks transient —
 * a network error, an abort, or a 5xx. Same shape as the OBF importer's 429
 * retry: once, after a short wait, and a second failure in a row is treated
 * as real rather than retried again, so a page 50 pages into a run cannot
 * turn a five-minute import into an indefinite one.
 *
 * `read` runs *inside* the timed span, not after `fetchWithRetry` returns —
 * `fetch()`'s own promise settles once headers arrive, so a timeout that only
 * wrapped the call above would let DailyMed stall forever while streaming the
 * body, and a body that fails to parse would bypass the retry entirely. Both
 * get the same handling by reading here.
 */
async function fetchWithRetry(url, description, read, retried = false) {
  requestsSpent += 1;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });

    if (res.status >= 500) {
      throw Object.assign(new Error(`${description} returned ${res.status} ${res.statusText}`), {
        retryable: true,
      });
    }
    if (!res.ok) {
      throw Object.assign(new Error(`${description} returned ${res.status} ${res.statusText}`), {
        retryable: false,
      });
    }

    return await read(res);
  } catch (err) {
    // Retrying past the budget would spend a request the run has no room
    // for — better to fail with the real error than with a budget message.
    const canRetry = err.retryable !== false && !retried && requestsSpent < MAX_REQUESTS;
    if (!canRetry) throw err;

    const reason = err.name === "AbortError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : err.message;
    console.warn(`\n  ! ${description} failed (${reason}). Waiting and retrying once.`);
    await sleep(REQUEST_INTERVAL_MS);
    return fetchWithRetry(url, description, read, true);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One page of sunscreen SPL summaries: setid, title, publication date.
 *
 * Identity only — the summary carries no ingredients, which is why each kept
 * product costs a second request below.
 */
async function fetchPage(page) {
  const url = `${DAILYMED}/spls.json?drug_name=sunscreen&pagesize=${PAGE_SIZE}&page=${page}`;
  const body = await fetchWithRetry(url, `DailyMed page ${page}`, (res) => res.json());
  if (!Array.isArray(body.data)) {
    throw new Error(`DailyMed page ${page} returned no data array — the endpoint shape may have changed`);
  }
  return body.data;
}

/**
 * The full label for one SPL, as XML.
 *
 * `.json` on this endpoint answers 415; the XML is the only representation
 * carrying the ingredient list. `packaging.json` has the *active* ingredients
 * structured, but actives are the UV filters alone — the rest of the formula,
 * which is what scoring reads, is only in the label text.
 */
async function fetchLabel(setid) {
  return fetchWithRetry(`${DAILYMED}/spls/${setid}.xml`, `DailyMed SPL ${setid}`, (res) => res.text());
}

/**
 * Pull the inactive-ingredient list out of an SPL.
 *
 * Deliberately the free-text label line rather than the structured `<name>`
 * elements elsewhere in the document. Those include active moieties — a zinc
 * oxide sunscreen lists both "ZINC OXIDE" and "ZINC CATION" — and they are not
 * in label order. The printed line is a comma-separated INCI list in
 * descending concentration, which is exactly what `parseInci` expects and what
 * position weighting depends on.
 *
 * The *last* marker, not the first: the document contains an "INACTIVE
 * INGREDIENT SECTION" header before the visible line, and matching the first
 * occurrence captures that header instead of the list.
 *
 * Measured on ten live SPLs: eight yield a comma-separated list. The other two
 * print their ingredients with no separator at all ("Purified Water Aloe
 * Barbadensis Leaf Juice Dicaprylyl Carbonate"), which collapses to a single
 * over-length token and is refused by the gates below. That is the right
 * outcome — there are 5,801 sunscreen SPLs and no reason to guess at
 * boundaries.
 */
function inactiveIngredients(xml) {
  const flat = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const marks = [...flat.matchAll(/inactive\s+ingredients?\b[:\s]*/gi)];
  if (marks.length === 0) return null;

  const last = marks[marks.length - 1];
  const body = flat
    .slice(last.index + last[0].length)
    // Whatever shares the back of the label. Same idea as the boilerplate stop
    // in `parseInci`, for the sections an SPL specifically carries.
    .split(/\b(?:Questions|Package Label|Principal Display|Other information|Purpose|Warnings|Uses|Directions)\b/i)[0]
    .trim();
  return body.length > 0 ? body : null;
}

/**
 * The US OTC sunscreen filters, keyed by the drug name a label prints and
 * mapped to the INCI name the dictionary holds.
 *
 * This table exists because the two nomenclatures genuinely differ and the
 * dictionary only speaks one of them. Checked against the live dictionary:
 * "avobenzone", "octisalate", "octinoxate" and "ensulizole" are absent as
 * printed, while all four are present under their INCI names. Prepending the
 * drug names raw would have written four unmatched stubs into the shared
 * ingredient table and pushed every chemical sunscreen toward the plausibility
 * gate — importing the filters badly rather than not at all.
 *
 * Safe to hardcode because it is closed and regulated: 21 CFR 352.10 lists the
 * sixteen filters permitted in a US OTC monograph sunscreen, and a new one
 * requires rulemaking. This is not a heuristic that will quietly rot.
 *
 * One entry is not from that monograph. Ecamsule ("Mexoryl SX") reached the
 * US market through its own NDA rather than the OTC monograph — La
 * Roche-Posay's Anthelios SX is the label that surfaced the gap — so it has
 * no CFR citation of its own, but it is a real, currently marketed US
 * sunscreen active. Leaving it out did not make the importer skip those
 * labels; it made `activeIngredients` fail to recognise the one filter that
 * made them sunscreens, which is worse.
 *
 * Fifteen of the seventeen resolve to a name already in the verified
 * dictionary. "trolamine salicylate" and "ecamsule" do not, and are mapped
 * anyway: an unrecognised name costs one stub on the rare product using it,
 * where dropping it would silently lose an active ingredient.
 */
const UV_FILTERS = {
  "aminobenzoic acid": "paba",
  avobenzone: "butyl methoxydibenzoylmethane",
  cinoxate: "cinoxate",
  dioxybenzone: "benzophenone-8",
  ecamsule: "terephthalylidene dicamphor sulfonic acid",
  ensulizole: "phenylbenzimidazole sulfonic acid",
  homosalate: "homosalate",
  meradimate: "menthyl anthranilate",
  octinoxate: "ethylhexyl methoxycinnamate",
  octisalate: "ethylhexyl salicylate",
  octocrylene: "octocrylene",
  oxybenzone: "benzophenone-3",
  "padimate o": "ethylhexyl dimethyl paba",
  sulisobenzone: "benzophenone-4",
  "titanium dioxide": "titanium dioxide",
  "trolamine salicylate": "triethanolamine salicylate",
  "zinc oxide": "zinc oxide",
};

/**
 * The UV filters, read off the SPL title's parenthetical.
 *
 * A sunscreen without its filters is not a sunscreen. DailyMed separates
 * actives from inactives, and an earlier version of this importer stored only
 * the inactive list — so every imported sunscreen arrived missing the
 * ingredients it exists for. `lib/rules.ts` scores zinc oxide and titanium
 * dioxide explicitly for sensitive skin, and `formulaKey` below would have
 * collapsed a mineral and a chemical sunscreen that happened to share a base.
 *
 * The title is tried first because it is already in hand — the search result
 * carries it — and falls back to the label body, which is where the filters
 * live when the title does not name them.
 */
function activeIngredients(title, xml) {
  const fromTitle = filtersIn(title.match(/\(([^)]+)\)/)?.[1]);
  if (fromTitle.length > 0) return fromTitle;

  // Not every title lists its filters. Two real examples: "(SUNSCREEN)" and
  // "(BROAD SPECTRUM SPF30)" — the convention is common, not universal, and a
  // third of kept products were still arriving with no actives once the title
  // path alone was working.
  //
  // The label body carries them under its own heading. Reading it needs one
  // piece of care: "ACTIVE INGREDIENT" is a substring of "INACTIVE
  // INGREDIENT", so an unanchored search finds the inactive list and silently
  // stores it as the actives. The word boundary is what separates them — there
  // is none between the "n" of "Inactive" and the "a" of "active".
  if (!xml) return [];
  const flat = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const marks = [...flat.matchAll(/\bactive\s+ingredients?\b[:\s]*/gi)];
  if (marks.length === 0) return [];

  const body = flat
    .slice(marks[0].index + marks[0][0].length)
    .split(/\b(?:Uses|Warnings|Inactive|Directions)\b/i)[0];
  return filtersByScan(body);
}

/**
 * Active strengths printed by the Drug Facts panel (21 CFR 201.66(c)(2)).
 * This is product metadata: unlike an ingredient definition, it changes from
 * one label to another. Unknown actives are ignored rather than stored under
 * an invented INCI name.
 */
function declaredActiveIngredients(xml) {
  if (!xml) return [];
  const flat = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const mark = [...flat.matchAll(/\bactive\s+ingredients?\b[:\s]*/gi)][0];
  if (!mark) return [];
  const body = flat
    .slice(mark.index + mark[0].length)
    .split(/\b(?:Uses|Warnings|Inactive|Directions)\b/i)[0];
  const known = { ...UV_FILTERS, "benzoyl peroxide": "benzoyl peroxide" };
  const found = [];
  for (const [drug, ingredient] of Object.entries(known)) {
    const at = standaloneIndexOf(body.toLowerCase(), drug);
    if (at === -1) continue;
    const strength = body.slice(at + drug.length).match(/^\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (!strength) continue;
    found.push({
      at,
      ingredient,
      strengthPercent: Number(strength[1]),
    });
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map(({ ingredient, strengthPercent }) => ({ ingredient, strengthPercent }));
}

/**
 * The filters named anywhere in a fragment, in the order they appear.
 *
 * The body does not punctuate the way a title does. A real Drug Facts panel
 * flattens to "Octisalate 3.0% Sunscreen Octinoxate 7.5% Sunscreen Zinc Oxide
 * 8.0% Sunscreen" — each filter trailed by its strength and its purpose, with
 * no separator anywhere. Splitting that produces one unrecognisable token,
 * which is why the three sunscreens that prompted this fallback still had no
 * actives after it was first written.
 *
 * Scanning for the names instead works whatever the punctuation. It is safe
 * here in a way it would not be generally, for two reasons: `UV_FILTERS` is a
 * closed regulated list of specific chemical names that do not occur by
 * accident, and the caller has already narrowed the text to the active section
 * — so an "Inactive Ingredients: ... Zinc Oxide" further down is out of scope
 * rather than a false positive.
 *
 * Ordered by position so the stored formula matches the label, since INCI
 * order is concentration order and position drives weighting.
 */
function filtersByScan(text) {
  const haystack = text.toLowerCase();
  const found = [];
  for (const [drug, inci] of Object.entries(UV_FILTERS)) {
    const at = standaloneIndexOf(haystack, drug);
    if (at !== -1) found.push({ at, inci });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.inci);
}

/**
 * Where `needle` appears in `haystack` as a whole name, or -1.
 *
 * A plain `indexOf` is not enough, and the comment above this function used to
 * claim otherwise — that these names are specific enough not to occur by
 * accident. One pair falsifies it: "oxybenzone" is a substring of
 * "dioxybenzone", and both are filters in their own right. A label listing
 * Dioxybenzone therefore produced benzophenone-8, which is correct, *and*
 * benzophenone-3, which is not in the product at all.
 *
 * An invented ingredient is worse than a missing one. It is scored, shown to
 * the user as fact, and folded into the formula key that decides whether two
 * products are the same — so it would have quietly changed verdicts on every
 * label carrying the one filter that triggers it.
 *
 * Boundaries are checked by character class rather than a regex: building one
 * per name means escaping, and a `\b` written into this file has twice been
 * eaten in transit and arrived as a literal backspace.
 */
function standaloneIndexOf(haystack, needle) {
  const isLetter = (ch) => ch !== undefined && ch >= "a" && ch <= "z";
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return -1;
    const before = haystack[at - 1];
    const after = haystack[at + needle.length];
    if (!isLetter(before) && !isLetter(after)) return at;
    // Embedded in a longer word — keep looking, since the same label may name
    // it properly further on.
    from = at + 1;
  }
}

/**
 * The recognised UV filters in a fragment, or nothing at all.
 *
 * All-or-nothing on purpose. Titles do not all follow the convention: one real
 * example reads "(TINTED LIP GLOSS WITH SPF 30 SUNSCREEN)", which is a
 * description. Trusting a fragment partially would write that phrase into the
 * catalogue as an ingredient, so a single unrecognised part discards the lot.
 */
function filtersIn(fragment) {
  if (!fragment) return [];

  const parts = fragment
    .split(/[,/]/)
    // "A, B, C, AND D" is ordinary English list punctuation and real titles use
    // it — "AVOBENZONE, HOMOSALATE, OCTISALATE, AND OCTOCRYLENE" is a live
    // example. Without this the conjunction fails to resolve, the all-or-
    // nothing rule below discards the whole list, and a genuine chemical
    // sunscreen is imported with no filters at all.
    .map((part) => normalise(part).replace(/^and\s+/, ""))
    .filter((part) => part.length > 0);
  if (parts.length === 0) return [];

  const mapped = parts.map((part) => UV_FILTERS[part]).filter(Boolean);
  return mapped.length === parts.length ? mapped : [];
}

/**
 * Split an SPL title into the parts we store.
 *
 * DailyMed titles follow one shape: "NAME (ACTIVE INGREDIENTS) DOSAGE FORM
 * [LABELER]". The labeler is the closest thing to a brand — it is the company
 * that registered the product, which for a consumer sunscreen is usually the
 * brand on the bottle and occasionally a contract manufacturer.
 */
function parseTitle(title) {
  const labeler = title.match(/\[([^\]]+)\]\s*$/)?.[1]?.trim() ?? null;
  const withoutLabeler = title.replace(/\s*\[[^\]]+\]\s*$/, "");
  const name = withoutLabeler.replace(/\s*\([^)]*\).*$/, "").trim();
  return { name: name || withoutLabeler.trim(), labeler };
}

/** Title-cased from the shouted form DailyMed publishes. */
function tidy(value) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Spf|Llc|Inc|Ltd|Co|Usa|Uv)\b/g, (w) => w.toUpperCase())
    .trim();
}

/**
 * Products that came back from a sunscreen search without being skincare.
 *
 * Step 4 learned this the expensive way: widening a source without a relevance
 * filter filled the catalogue with deodorant and shampoo, because the new
 * filter selected for *data completeness* and the old hand-written brand list
 * had been quietly supplying relevance all along. The same shape is here —
 * "sunscreen" as a search term matches any SPF product, and lip balms carry
 * SPF.
 *
 * Measured on thirty live labels: four of the twelve kept rows were lip balms
 * or a lip gloss. They have real formulas, but they are not what a face-first
 * skincare catalogue is for, and the app has no lip category to file them
 * under — so they would arrive typed "sunscreen", which is the same
 * wrong-but-confident answer `guessType` was changed to stop giving.
 */
const NOT_SKINCARE = /\blip\s?(?:balm|gloss|stick|treatment)\b/i;

/**
 * Build the row, or a string naming why this SPL was rejected.
 *
 * Same contract as `toRow` in `scripts/import-obf.mjs`, including the
 * plausibility gate — the reasoning behind the 0.6 threshold is written up
 * there and applies unchanged: a parsed formula that mostly misses a
 * 36k-name dictionary is not a rare formula, it is a bad parse.
 */
function toRow(spl, xml, known, samples, aliases) {
  const { name, labeler } = parseTitle(spl.title ?? "");
  if (!name || !spl.setid) return "no name or setid";
  // Checked against the whole title, not the trimmed name: the giveaway is
  // often in the parenthetical ("(SUNSCREEN SKIN PROTECTANT LIP BALM)").
  if (NOT_SKINCARE.test(spl.title ?? "")) return "not a skincare product";

  const inci = inactiveIngredients(xml);
  if (!inci) return "no inactive-ingredient section";

  // The inactive list is judged on its own, before anything is merged into it.
  //
  // This order is load-bearing and was not obvious. Some SPLs print their
  // inactive ingredients with no separator at all, which parses to one giant
  // token — the gates below are what refuse those. But UV filters are
  // recognised names by construction, so prepending four of them to that
  // single junk token gives five ingredients at four recognised: 0.8, clear of
  // the threshold. The malformed label would sail through the gate it was
  // supposed to fail, and be stored as the filters plus one enormous
  // ingredient with every real inactive lost.
  //
  // Gating the inactive list alone is strictly the stricter test, since merging
  // recognised names can only raise the ratio.
  const inactive = parseInci(inci, known, undefined, aliases);
  if (inactive.length < 2) return "fewer than 2 parsed ingredients";

  const inactiveHits = inactive.filter((i) => known.has(i.inci_name)).length;
  if (inactiveHits / inactive.length < MIN_KNOWN_INGREDIENT_RATIO) {
    if (samples.length < 5) {
      samples.push(
        `${name} — ${inactiveHits}/${inactive.length} recognised: ` +
          inactive.slice(0, 6).map((i) => i.inci_name).join(", ")
      );
    }
    return "formula not recognised by the dictionary";
  }

  // A sunscreen with no recognised UV filter is worse than one this importer
  // never saw at all: it would be typed "sunscreen" and stored with nothing
  // known about the one thing that makes it one, and `formulaKey` would
  // treat it as identical to any other product sharing its inactive base.
  // Every candidate here came from a DailyMed sunscreen search, so a genuine
  // zero is not expected — it means the label names an active `UV_FILTERS`
  // does not recognise (see the note above it) or states its actives in a
  // shape neither the title nor body path handles.
  const actives = activeIngredients(spl.title ?? "", xml);
  if (actives.length === 0) return "no recognised UV filter";
  const strengths = new Map(
    declaredActiveIngredients(xml).map((active) => [active.ingredient, active.strengthPercent])
  );

  // Only now the actives, in front. A US OTC label prints them first on its
  // Drug Facts panel and they sit at 10-25% in a sunscreen, so they belong
  // near the head of a concentration-ordered list. Prepending overstates them
  // slightly against water; dropping them, which is what this did before,
  // understates them completely. `parseInci` deduplicates, so a filter that
  // also appears in the inactive list is kept once at the higher position.
  const ingredients = parseInci([...actives, inci].join(", "), known, undefined, aliases);

  return {
    product: {
      id: `dailymed-${spl.setid}`,
      // No barcode. DailyMed identifies products by NDC, which is not the
      // EAN/UPC a phone camera reads off a bottle, so claiming one would make
      // these rows look scannable when they are not. They are browsable
      // catalogue depth, not scan targets — `isIdentifiable` in data/api.ts
      // hides only barcode-less *OCR* rows, so these still list.
      barcode: null,
      brand: labeler ? tidy(labeler) : "Unknown",
      name: tidy(name),
      // Every product from this source is a sunscreen by construction — that
      // is the search this importer runs — so there is nothing to guess.
      type: "sunscreen",
      area: "face",
      description: null,
      image_url: null,
      volume: null,
      in_stock: true,
      suitable_for: [],
      targets: [],
      source: "dailymed",
      attribution: ATTRIBUTION,
      expires_at: null,
      // Keep the whole leading-active boundary even if a malformed panel made
      // one percentage unreadable. Strength can be unknown; active identity
      // and the inactive-list boundary are still label facts.
      declared_actives: actives.map((ingredient) => ({
        ingredient,
        strengthPercent: strengths.get(ingredient) ?? null,
      })),
    },
    ingredients,
  };
}

/** Every verified INCI name — see the same read in `scripts/import-obf.mjs`. */
async function fetchKnownIngredients(db) {
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", true),
  });
  return new Set(rows.map((r) => r.inci_name.toLowerCase()));
}

/**
 * Every formula already sitting in the catalogue under `source = 'dailymed'`,
 * as the same `formulaKey()` shape `main()` builds for a candidate. Dedup
 * within one run is not enough: `seenFormula` starts empty on every
 * invocation, so a labeler DailyMed happens to page to on a later run — one
 * this run never fetched, carrying a formula this source already holds under
 * a different setid — would pass every in-run check and be written as a
 * second product for one bottle. Seeding from what is already persisted is
 * what makes the dedup survive across runs, not just within one.
 *
 * Paged rather than read in one call, and the cursor holds back whichever
 * product is last on a full page rather than splitting it: `product_id`
 * alone does not identify a row here, so a plain `.gt(cursor)` would drop
 * that product's remaining ingredients from this page and never revisit
 * them, since the next page starts strictly after it.
 */
async function fetchPersistedDailymedFormulas(db) {
  // Comfortably above any real formula's ingredient count, so the one case
  // this pagination cannot make progress on — a single product's rows
  // filling an entire page — is not a shape any real label produces.
  const PAGE = 5000;
  const byProduct = new Map();
  let cursor = null;

  for (;;) {
    let query = db
      .from("product_ingredients")
      .select("product_id, position, inci_name, products!inner(source)")
      .eq("products.source", "dailymed")
      .order("product_id", { ascending: true })
      .order("position", { ascending: true })
      .limit(PAGE);
    if (cursor !== null) query = query.gt("product_id", cursor);

    const { data, error } = await query;
    if (error) {
      throw new Error(`product_ingredients (dailymed) page after ${cursor ?? "start"}: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    const full = data.length === PAGE;
    const heldBackId = full ? data[data.length - 1].product_id : null;
    for (const row of data) {
      if (row.product_id === heldBackId) continue;
      if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
      byProduct.get(row.product_id).push(row.inci_name);
    }

    if (!full) break;
    cursor = heldBackId;
  }

  return new Set([...byProduct.values()].map((names) => names.join("|")));
}

/**
 * DailyMed publishes one SPL per labeler per revision, so the same physical
 * product appears many times over — a single sunscreen turned up five times in
 * a ten-row sample. This is what stops a second request being spent on a label
 * already seen, before the formula that would settle it has been fetched.
 *
 * The whole title, not the brand and trimmed name it was keyed on first.
 * `parseTitle` strips the parenthetical and the dosage form, which is exactly
 * where two different sunscreens differ: "A (ZINC OXIDE) CREAM [B]" and
 * "A (AVOBENZONE, OCTOCRYLENE) CREAM [B]" both reduce to "b|a", so the second
 * was skipped here and `formulaKey` — which would have kept them apart — never
 * got to see it. A mineral and a chemical sunscreen are not the same product.
 *
 * Keying on the title rather than an identifier because there is no shared one:
 * setid is per-SPL and NDC is per-package. Two SPLs whose titles agree
 * completely are the same product; anything the title does not settle is left
 * to `formulaKey` after the label is in hand.
 */
function identityKey(title) {
  return (title ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * The formula itself, as a key.
 *
 * Brand and name are not enough. The same bottle is registered by more than
 * one labeler — a brand and its contract manufacturer both file an SPL — and
 * the names differ while the formula does not. Measured on fifty live labels:
 * "Atlantis Laboratories, INC." and "Sqween LLC" both publish an identical
 * twenty-five ingredient list in identical order.
 *
 * Twenty-five ingredients agreeing in order is not coincidence, and for this
 * app two identical formulas are one answer: scoring reads the formula and
 * nothing else, so a second copy adds a row that can only ever say what the
 * first already said.
 *
 * Order is kept in the key rather than sorted away, because INCI order is
 * concentration order — two products with the same names in a different order
 * are genuinely different products and score differently.
 */
function formulaKey(ingredients) {
  return ingredients.map((i) => i.inci_name).join("|");
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required, including for --dry-run:\n" +
        "the plausibility gate reads the live ingredient dictionary."
    );
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const known = await fetchKnownIngredients(db);
  console.log(`Dictionary: ${known.size} verified ingredient names.\n`);

  const aliases = await fetchAliases(db);
  const persistedFormulas = await fetchPersistedDailymedFormulas(db);
  console.log(`Already on file: ${persistedFormulas.size} dailymed formula(s).\n`);

  const rows = new Map();
  const seenIdentity = new Set();
  const seenFormula = new Set(persistedFormulas);
  const rejected = new Map();
  const rejectSamples = [];
  let seen = 0;
  // The newest publication date this run saw, kept in DailyMed's own format.
  // `sync_bookmarks.watermark` is text precisely so each source can record
  // whatever "how far we got" means to it — see migration 0012.
  let newestPublished = null;

  page: for (let page = 1; ; page += 1) {
    if (rows.size >= TARGET_ROWS || requestsSpent >= MAX_REQUESTS) break;

    if (requestsSpent > 0) await sleep(REQUEST_INTERVAL_MS);
    const summaries = await fetchPage(page);
    if (summaries.length === 0) break;

    seen += summaries.length;
    let kept = 0;
    let duplicates = 0;

    for (const spl of summaries) {
      if (rows.size >= TARGET_ROWS) break page;
      if (requestsSpent >= MAX_REQUESTS) {
        console.warn(`\n  ! Hit the ${MAX_REQUESTS}-request budget. Stopping early.`);
        break page;
      }

      if (typeof spl.published_date === "string") {
        const at = Date.parse(spl.published_date);
        if (!Number.isNaN(at) && (newestPublished === null || at > Date.parse(newestPublished))) {
          newestPublished = spl.published_date;
        }
      }

      // Cheapest rejections first, before spending a request on the label.
      const { name } = parseTitle(spl.title ?? "");
      if (!name) {
        rejected.set("no name or setid", (rejected.get("no name or setid") ?? 0) + 1);
        continue;
      }
      const identity = identityKey(spl.title);
      if (seenIdentity.has(identity)) {
        duplicates += 1;
        continue;
      }

      await sleep(REQUEST_INTERVAL_MS);
      const xml = await fetchLabel(spl.setid);

      const row = toRow(spl, xml, known, rejectSamples, aliases);
      if (typeof row === "string") {
        rejected.set(row, (rejected.get(row) ?? 0) + 1);
        // Recorded either way: a duplicate of something rejected is still not
        // worth another request next page.
        seenIdentity.add(identity);
        continue;
      }

      seenIdentity.add(identity);

      // The second pass at the same question, now that the formula is known.
      // See `formulaKey`: different labelers file the same bottle.
      const formula = formulaKey(row.ingredients);
      if (seenFormula.has(formula)) {
        duplicates += 1;
        continue;
      }
      seenFormula.add(formula);

      rows.set(row.product.id, row);
      kept += 1;
    }

    console.log(
      `  page ${String(page).padStart(2)}  ${String(summaries.length).padStart(3)} found` +
        `  ${String(kept).padStart(3)} new` +
        `  ${String(duplicates).padStart(3)} dup` +
        `  ${String(rows.size).padStart(3)}/${TARGET_ROWS} total`
    );
  }

  const all = [...rows.values()];
  console.log(
    `\n${seen} labels seen over ${requestsSpent} request(s), ${all.length} usable, ` +
      `${new Set(all.flatMap((r) => r.ingredients.map((i) => i.inci_name))).size} distinct ingredients`
  );
  for (const [reason, count] of [...rejected.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  rejected ${String(count).padStart(4)}  ${reason}`);
  }
  if (rejectSamples.length > 0) {
    console.log(`\n  Rejected by the dictionary gate (first ${rejectSamples.length}) — these should read as junk:`);
    for (const sample of rejectSamples) console.log(`    ${sample}`);
  }

  // Before the dry-run return, for the same reason as the OBF importer: a
  // preflight that reports an empty import and exits 0 hides exactly the
  // breakage it exists to surface.
  if (all.length === 0) {
    throw new Error(
      `No usable sunscreens found across ${requestsSpent} request(s) of ${seen} labels. ` +
        "Check the DailyMed endpoint and the gates above." +
        (DRY_RUN ? "" : " Refusing to record a bookmark.")
    );
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: would record watermark "${newestPublished ?? "null"}" for source "dailymed".`);
    console.log("--dry-run: nothing written. Sample:");
    for (const r of all.slice(0, 3)) {
      console.log(`  ${r.product.brand} — ${r.product.name}`);
      console.log(`    type=${r.product.type} barcode=none`);
      console.log(`    ${r.ingredients.length} ingredients: ${r.ingredients.slice(0, 5).map((i) => i.inci_name).join(", ")}…`);
    }
    return;
  }

  // One transactional call per product, same as the OBF importer and for the
  // same reason — see issue #40. The RPC creates the ingredient stubs in the
  // same transaction as the formula that needs them, and bumps `fetched_at`.
  //
  // A parser-only difference from the stored list is not a reformulation, so it
  // must not stamp `formula_changed_at` (migration 0021).
  const stored = await fetchStoredFormulas(db, all.map((r) => r.product.id));
  let written = 0;
  for (const r of all) {
    const { error } = await db.rpc("replace_product_with_ingredients", {
      p_product: r.product,
      p_ingredients: r.ingredients,
      p_stub_note: "No published rating for this ingredient yet.",
      // Only sent when true, so a run that never needs it works even before migration 0021 is applied.
      ...(isParserRefresh(stored.get(r.product.id), r.ingredients, known, aliases) ? { p_parser_refresh: true } : {}),
    });
    if (error) {
      throw new Error(
        `replace_product_with_ingredients failed for ${r.product.id} ` +
          `(${written} of ${all.length} already written): ${error.message}` +
          (/invalid input value for enum/.test(error.message)
            ? " — apply migration 0013, which adds 'dailymed' to product_source."
            : "")
      );
    }
    if (r.product.declared_actives.length > 0) {
      const { error: activeError } = await db
        .from("products")
        .update({ declared_actives: r.product.declared_actives })
        .eq("id", r.product.id);
      if (activeError) {
        throw new Error(`declared_actives update failed for ${r.product.id}: ${activeError.message}`);
      }
    }
    written += 1;
    process.stdout.write(`\r  ${written}/${all.length}`);
  }

  const links = all.reduce((n, r) => n + r.ingredients.length, 0);
  console.log(`\nWrote ${written} products and ${links} ingredient links.`);

  const { error: bookmarkError } = await db.from("sync_bookmarks").upsert(
    {
      source: "dailymed",
      watermark: newestPublished,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "source" }
  );
  if (bookmarkError) throw new Error(`sync_bookmarks upsert failed: ${bookmarkError.message}`);
}

/** See the same guard in `scripts/import-obf.mjs`. */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Retired. A DailyMed label carries an NDC, not a barcode, and a product is stored
// only with a name, a barcode and an ingredient list: migration 0022 makes the
// database refuse every row this script builds. Running it says so instead of
// failing on the first write. `main` stays exported, unrun, for the day that changes.
if (invokedDirectly()) {
  console.error(
    "import:dailymed is retired: DailyMed products have no barcode, and a product needs a name, a barcode and an ingredient list (migration 0022). Nothing was written."
  );
  process.exitCode = 1;
}

export { main, inactiveIngredients, activeIngredients, declaredActiveIngredients, parseTitle, tidy, toRow, identityKey, formulaKey };
