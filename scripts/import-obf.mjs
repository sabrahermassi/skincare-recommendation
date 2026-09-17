/**
 * One-off import: Open Beauty Facts → our catalogue.
 *
 * OBF is the only product source we may keep permanently (ODbL for the data,
 * CC-BY-SA for the photos, commercial use explicitly allowed with attribution),
 * so these rows are written with `expires_at = null` and are ours.
 *
 * Run:
 *   node scripts/import-obf.mjs --dry-run      # print what would be written
 *   node scripts/import-obf.mjs                # write to Supabase
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY — including for --dry-run,
 * unlike every other importer here. The plausibility gate below judges a parsed
 * formula against the live `ingredients` dictionary, so without credentials
 * there is no gate, and the count a dry run prints would not be the count a
 * real run writes. That count is the whole point of the dry run.
 *
 * Plain .mjs rather than .ts on purpose: these are throwaway operator tools,
 * not shipped code, and this way they need no build step and no new devDeps.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { guessTypeFromIngredients } from "./lib/guess-type-from-ingredients.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const OBF = "https://world.openbeautyfacts.org";
const USER_AGENT = "for.me/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";
const ATTRIBUTION = "Product data from Open Beauty Facts, used under ODbL.";

/**
 * Whether to store Open Beauty Facts photography.
 *
 * OFF, and this is a data-quality decision rather than a licensing one — the
 * licence (CC-BY-SA) permits it. Every OBF image is a user upload: the API
 * exposes only `uploader`, `uploaded_t` and pixel sizes, with no field
 * distinguishing a clean pack shot from a snapshot of someone holding the
 * bottle in a bathroom. Some are fine, many are review photos, and there is
 * no way to tell them apart programmatically.
 *
 * A catalogue of inconsistent user snapshots looks worse than no photos at
 * all, and `ProductIllustration` already renders a deliberate pastel vessel
 * per product family. Flip this to true only alongside a real source of
 * official product photography.
 */
const USE_SOURCE_PHOTOS = false;

/**
 * How many usable products one run may write, and the hard ceiling on requests
 * it may spend reaching that.
 *
 * Step 4 of the data-strategy plan. The cap is deliberate and temporary: the
 * client still downloads the whole catalogue on first launch and holds it in
 * AsyncStorage, whose Android SQLite ceiling is ~6MB, so the catalogue cannot
 * be allowed to grow without the paging work in steps 7-8 landing first. 500
 * is comfortably inside that budget at the post-step-2 payload size.
 *
 * MAX_REQUESTS exists so a malformed or unchanging response can never loop
 * forever. It is a budget across every category, not per category — hitting
 * it is a signal something is wrong, and the run says so.
 */
const TARGET_ROWS = 500;
const MAX_REQUESTS = 40;
const PAGE_SIZE = 100;

/**
 * Minimum gap between search requests, and how long to sit out a rate limit.
 *
 * Open Beauty Facts documents **10 requests per minute per IP for search**
 * (any `/api/vN/search`, and `/cgi/search.pl`; product reads get 15/min, which
 * this import does not use). That is one request every 6 seconds, and 6.5
 * leaves margin for clock skew and for where the server's window boundary
 * happens to fall.
 *
 * This was 300ms, which is four times over the documented limit. Runs did not
 * trip it only because they finish in about seven requests — under the cap by
 * count, not by rate. A run that walked further, or a higher TARGET_ROWS,
 * would have collected a 429 and aborted the whole import, since `fetchPage`
 * throws and nothing above it retries.
 *
 * The cost is real: a seven-request run goes from roughly two seconds to
 * forty-five, and a full MAX_REQUESTS run would take about four minutes. For
 * an operator script run by hand a few times a year, against a service run by
 * volunteers, that is the right side of the trade.
 *
 * RATE_LIMIT_WINDOW_MS is one full minute because the limit is per minute:
 * having sent nothing for that long, the window has certainly rolled.
 */
const SEARCH_INTERVAL_MS = 6_500;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * The categories this import pages, most specific first.
 *
 * This is the relevance filter, and it exists because the first widened run
 * did not have one. Dropping the 34 hand-typed brands removed a constraint
 * nobody had written down: every one of those brands sold skincare, so the
 * sweep could not return anything else. Replacing it with
 * `states:ingredients-completed` alone swapped a relevance filter for a
 * completeness one, and the result was a 500-row catalogue of deodorant,
 * shampoo, toothpaste and dish soap — measured, 352 of 549 passing rows were
 * products this app has no way to score.
 *
 * Filtering server-side rather than discarding after the fact, because OBF
 * supports it and the density difference is the whole cost model: the counts
 * below carry `ingredients-completed` already, and every row they return is
 * skincare by OBF's own categorisation.
 *
 *   en:face          844      en:skin-care      27
 *   en:suncare       410      en:creams         24
 *   en:cleansers     195      en:moisturizers   11
 *
 * Roughly 1,500 before overlap, against a 500 cap — enough supply to be
 * selective, which is what lets the gates below stay strict.
 *
 * The trade is untagged products: about half of OBF's completed rows carry no
 * category at all, and those are now unreachable. That is the right side to
 * err on. An untagged row cannot be shown to be skincare, and with three times
 * the needed supply already tagged, guessing costs more than it gains.
 */
const CATEGORIES = [
  "en:face",
  "en:suncare",
  "en:cleansers",
  "en:skin-care",
  "en:creams",
  "en:moisturizers",
];

/**
 * How much of a parsed formula must be names the dictionary already knows for
 * the row to be believable.
 *
 * Step 5's one gate that genuinely scales with import volume, which is why it
 * ships here rather than with the rest of step 5. A real INCI list is almost
 * entirely real INCI names; a row that mostly misses a 36k-name dictionary is
 * a marketing paragraph, an OCR smear, or a comma-separated sentence in a
 * language the parser split on the wrong character. Below this threshold the
 * row is rejected outright rather than written and left to score badly.
 *
 * 0.6 is measured, not guessed. Against the live dictionary — 35,805 verified
 * names, which is what `fetchKnownIngredients` reads and why that filter
 * matters — over 1,218 sampled products: the median real formula scores 0.94,
 * so the threshold sits far below anything genuine, and what it rejects reads
 * as junk — a French dish soap, a Romanian dental leaflet, two foods, a box of
 * tampons, and several OCR smears.
 *
 * Do not raise it without re-measuring. The 0.60-0.80 band is almost entirely
 * *good* products — Korean sunscreens, an Italian face mask, shampoos — that
 * miss the dictionary on OCR artifacts ("phenylbenzimida zole"), multi-language
 * fields ("aqua/acqua/eau") and names a 36k dictionary simply lacks. Moving to
 * 0.8 would throw away the K-beauty rows this catalogue exists for.
 *
 * Lowering it is not obviously safe either: precision is worth more than
 * recall here, because with 20,174 candidates behind a 500-row cap a rejected
 * good product costs nothing — another takes its slot.
 *
 * Considered and rejected: matching leniently against an "organic "-stripped
 * form, since "organic coconut oil" misses a dictionary that holds "coconut
 * oil". Measured, it rescues 1 row of 79 — not worth either the leniency or
 * the divergence from `lib/inci.ts`'s `normalise`, which this file's copy must
 * stay in step with.
 */
const MIN_KNOWN_INGREDIENT_RATIO = 0.6;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One page of products that OBF itself considers to have a complete ingredient
 * list.
 *
 * This replaced a sweep of 34 hand-typed brand names, one page each. Two
 * problems with that: the catalogue could never contain a brand nobody had
 * thought to type, and a plain search returns everything OBF holds for the
 * brand — measured at ~31% usable, the rest lacking a name or a formula.
 *
 * Filtering on `states:ingredients-completed` fixes both. Measured against the
 * live API: 75,104 products total, 20,174 carrying that state, and 90% of 400
 * sampled from it passing the name/formula/parse gates — against ~31% for the
 * old brand sweep. So the filtered subset is both far larger than 34 brands
 * and about three times as dense.
 *
 * Intersected with one category at a time (see CATEGORIES), because
 * completeness alone is not relevance: OBF's completed rows are dominated by
 * hygiene — toothpaste, mouthwash, shower gel, deodorant — and this app scores
 * skincare.
 *
 * `api/v2/search` rather than the older `cgi/search.pl`, for `fields`: without
 * it a page carries every field OBF holds, including nutrition and packaging
 * trees this import ignores. Asking for the nine fields below took a 100-row
 * page from megabytes to ~68KB. Note that search.pl also needs
 * `action=process` to answer in JSON at all — without it, it returns the HTML
 * page and `res.ok` is still true, which is a silent failure worth avoiding.
 */
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "quantity",
  "categories_tags",
  "ingredients_text",
  "image_url",
  "last_modified_t",
].join(",");

/**
 * How long `Retry-After` is asking us to wait, in ms, or null if the header is
 * absent or unparseable.
 *
 * The header comes in two forms per RFC 9110 — delay-seconds, or an HTTP date
 * — and OBF has not committed to either, so both are read. A date in the past
 * clamps to zero rather than going negative.
 */
function retryAfterMs(res) {
  const header = res.headers.get("retry-after");
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

async function fetchPage(category, page, retried = false) {
  const url =
    `${OBF}/api/v2/search?categories_tags=${encodeURIComponent(category)}` +
    `&states_tags=en:ingredients-completed` +
    `&fields=${FIELDS}&page_size=${PAGE_SIZE}&page=${page}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

  // Once, and only once. The documented limit is per *minute*, so having sent
  // nothing for a full window we are definitionally clear of it — a second 429
  // after that means something this script cannot fix by waiting again
  // (another process sharing the IP, or a longer-lived block), and retrying
  // into it is just load on a volunteer-run service. So the second one fails
  // loudly instead.
  //
  // `Retry-After` wins when present: that is the server saying exactly how
  // long, and it knows where in the window we are. Without it, a full window
  // is the only interval guaranteed to have rolled.
  if (res.status === 429 && !retried) {
    const wait = retryAfterMs(res) ?? RATE_LIMIT_WINDOW_MS;
    console.warn(
      `\n  ! Rate-limited by OBF on ${category} page ${page}. ` +
        `Waiting ${Math.ceil(wait / 1000)}s and retrying once.`
    );
    await sleep(wait);
    return fetchPage(category, page, true);
  }

  if (!res.ok) {
    throw new Error(
      `OBF ${category} page ${page} returned ${res.status} ${res.statusText}` +
        (res.status === 429
          ? " — still rate-limited after waiting a full window. Check whether " +
            "something else is querying Open Beauty Facts from this address."
          : "")
    );
  }
  const body = await res.json();
  if (!Array.isArray(body.products)) {
    throw new Error(
      `OBF ${category} page ${page} returned no products array — the endpoint shape may have changed`
    );
  }
  return body.products;
}

/**
 * Every INCI name the catalogue already recognises, lower-cased to match what
 * `normalise` produces.
 *
 * Read through the shared `paginateOrdered` rather than a loop of its own: the
 * helper exists because three independent copies of this read had already
 * drifted, and an offset-paged read of a table the Edge Functions write to can
 * silently drop names — which here would mean rejecting good products.
 */
async function fetchKnownIngredients(db) {
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    // `verified` only, matching `fetchDictionary` in
    // supabase/functions/label-ocr, whose comment calls the same restriction
    // load-bearing — and for the same reason, which applies here with more
    // force.
    //
    // Every name this import fails to recognise is written back as an
    // unverified stub so `product_ingredients` has a foreign key to point at
    // (the RPC below does it, migration 0007 names those rows "unread noise").
    // Reading them back in would let one bad run teach the next: a junk name
    // written today counts as a recognised ingredient tomorrow, so a formula
    // full of the previous run's garbage clears the 60% gate and is persisted.
    //
    // The importer is the worst place to leave that open. One OCR scan adds a
    // handful of stubs; one import at TARGET_ROWS adds around 650, so the
    // unverified pool — 476 rows today — would roughly triple on the first
    // run and grow with every one after.
    //
    // Nearly free: measured over 1,218 candidates, verified-only passes 1,110
    // against 1,112 unfiltered, and the median formula scores 0.94 rather than
    // 0.96. The threshold below is unaffected.
    filter: (q) => q.eq("verified", true),
  });
  return new Set(rows.map((r) => r.inci_name.toLowerCase()));
}

function normalise(raw) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
}

/**
 * Kept in step with `parseIngredientBlock`'s delimited path in `lib/inci.ts`,
 * which is the version under test. This copy had drifted: it was a bare
 * `split(/[,;]/)`, missing all four of the steps below.
 *
 * Measured on 549 live rows, 42 of them — 7.6% — carried a first "ingredient"
 * like `"ingredients/ingrédients: aqua"` or
 * `"matorimushin lagos made in nigeria. customer care number: nafdac reg n"`.
 * Both halves of that are damage: a junk name is written into the shared
 * `ingredients` dictionary, and the real first ingredient — the one INCI order
 * says is most concentrated — is swallowed with it.
 */
function parseInci(text) {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");

  // 1 ── Drop everything up to and including an "Ingredients:" heading. Same
  // pattern as lib/inci.ts, Korean forms included.
  const heading = /(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // 2 ── ...and truncate at whatever shares the back of the label. Legal
  // boilerplate and net-quantity marks reliably follow the formula.
  const stop =
    /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법|\b(?:e\s*)?\d{2,4}\s*(?:ml|fl\.?\s?oz|kg|g)\b|\bdistribut(?:ed|ion)\b|\bmanufactured\b|\bfabriqu[ée]\b|\bmade in\b|\bréserv[ée]e\b|\bdépositaires\b)/i.exec(
      block
    );
  if (stop) block = block.slice(0, stop.index);

  // 3 ── Split, protecting a comma between two digits: "1,2-Hexanediol" is one
  // ingredient, and splitting there produced a bare "1" and a "2-hexanediol"
  // that matches nothing — lib/inci.ts calls this the most common bad name in
  // the catalogue, and this copy was still producing it.
  const PLACEHOLDER = "\uE000";
  const protectedText = block.replace(/,(?=\d)/g, (match, offset) =>
    offset > 0 && /\d/.test(block[offset - 1]) ? PLACEHOLDER : match
  );

  const delimited = protectedText
    .split(/[;•·]|,/)
    .map((s) => s.replace(new RegExp(PLACEHOLDER, "g"), ","))
    .map(normalise)
    // 4 ── A token with no letter in it is a quantity or a code, not a name.
    .filter((p) => p.length > 1 && p.length < 120 && /[a-z]/.test(p))
    .map((inci_name, position) => ({ inci_name, position }));

  // 5 ── ...and drop repeats, renumbering as it goes. Both of
  // `parseIngredientBlock`'s return paths end in this; this copy did not,
  // which is the one place it still diverged.
  return dedupe(delimited);
}

/**
 * Kept in step with `dedupe` in `lib/inci.ts`.
 *
 * A name printed twice is one ingredient, and `product_ingredients` is keyed
 * on `(product_id, position)` rather than on the name — so a repeat does not
 * fail the insert, it silently stores a second row. Nothing downstream removes
 * it: neither `data/api.ts` nor `lib/matching.ts` deduplicates, so the scorer
 * applies `positionWeight` to that ingredient twice and weights it heavier
 * than the label warrants.
 *
 * Measured across the 500 rows one run imports: 16 products (3.2%) carry a
 * repeat, 22 join rows of 11,687. Small, but it is wrong in the direction that
 * matters — bilingual EU labels are the common cause, and they repeat the head
 * of the formula, which is exactly where position weight is highest.
 *
 * Positions are reassigned from the surviving order rather than preserved, so
 * the stored list stays 0..n-1 with no gaps, matching what the canonical
 * parser produces.
 */
function dedupe(parsed) {
  const seen = new Set();
  const out = [];
  for (const p of parsed) {
    if (seen.has(p.inci_name)) continue;
    seen.add(p.inci_name);
    out.push({ inci_name: p.inci_name, position: out.length });
  }
  return out;
}

/**
 * Keep in step with `guessType` in supabase/functions/product-lookup — the
 * two run on different runtimes (Node here, Deno there) so they cannot share
 * a module, and a product typed one way at import and another way on a live
 * scan is a real inconsistency, not a cosmetic one: `contactWeight` reads it.
 *
 * The patterns were English-only, which is why "Schuimende Reinigingsgel",
 * "nettoyant moussant visage" and "Huile lavante" were all typed as serums
 * and then scored as leave-on products. The 16 patterns after "hand-cream"
 * follow the same rule: English-only until a real catalogue entry is seen
 * failing in another language.
 *
 * Ordering matters — earlier entries win. "Body butter" used to fall into
 * `body-lotion`'s `butter` alternative, so that's been removed now that
 * `body-butter` is its own type and checked first; `eye-cream` / `night-mask`
 * / `foot-cream` all contain "cream" and have to be checked before the
 * generic `moisturizer` catch-all or they'd never be reached.
 */
function guessType(tags, text) {
  const hay = `${(tags ?? []).join(" ")} ${text}`.toLowerCase();
  const table = [
    [/hand.?cream|crème mains|handcreme/, "hand-cream"],
    [/eye[\s-]?cream/, "eye-cream"],
    [/body.?butter/, "body-butter"],
    [/body.?(wash|gel)|shower|douche|duschgel/, "body-wash"],
    [/body.?scrub|body.?exfoliat/, "body-scrub"],
    [/body.?(lotion|milk)|body ?lotion|lait corporel/, "body-lotion"],
    [/foot[\s-]?(cream|balm)/, "foot-cream"],
    // Above the sunscreen rule on purpose: "Lip Balm SPF 15" is a lip balm,
    // and `spf` below would otherwise claim it first.
    // "lèvres" (fr), "dudak" (tr), "губ" (ru/uk) — all seen failing for real.
    [/lip[\s-]?(balm|butter|care)|l[èe]vres|dudak|губ/, "lip-balm"],
    // Both above the cleanser rule: "Deep Cleansing Shampoo" carries both
    // words, and tags and name share one haystack, so `cleansing` would take
    // it even when the row is tagged `en:shampoos`.
    [/shampoo/, "shampoo"],
    // Not a bare `conditioner`: "Skin Conditioner" is a face product, and it
    // was being given the hair-conditioner label and illustration.
    [/(?<!skin[\s-])conditioner/, "conditioner"],
    [
      /cleanser|foam|cleansing|micellar|nettoyant|lavante?|reinigings|schuimende|limpiador|detergente|waschgel|syndet/,
      "cleanser",
    ],
    [/sun|spf|uv|solaire|zonnebrand/, "sunscreen"],
    [/toner|tonic|lotion tonique/, "toner"],
    [/essence/, "essence"],
    [/ampoule/, "ampoule"],
    // All of these sit above the bare `serum` rule: a "serum sheet mask" or a
    // "serum hair mask" is the specific thing, and `serum` would take it.
    // "sleeping"/"overnight" mask, not a bare "night cream" — that's a real
    // moisturizer, not the K-beauty sleep-mask category.
    [/(sleeping|night|overnight)[\s-]?mask/, "night-mask"],
    [/sheet[\s-]?mask/, "sheet-mask"],
    [/hair[\s-]?mask/, "hair-mask"],
    [/(facial|face)[\s-]?oil/, "facial-oil"],
    [/hair[\s-]?oil/, "hair-oil"],
    [/serum|sérum/, "serum"],
    [/perfume|eau de (parfum|toilette)/, "perfume"],
    [/(facial|face)[\s-]?mist/, "facial-mist"],
    [/deodorant|antiperspirant/, "deodorant"],
    // No "peel pad" here: this type is rinse-off in `contactWeight`, and a
    // leave-on acid pad scored at 0.4 would understate both its actives and
    // its irritants. Those fall through to the ingredient rule instead, which
    // types them "serum" — leave-on, full weight.
    [/exfoliat|scrub/, "exfoliator"],
    [/cream|moisturi[sz]er|lotion|emulsion|crème|creme|crema|gezichtscrème/, "moisturizer"],
  ];
  for (const [re, type] of table) if (re.test(hay)) return type;
  // Parity with the Edge Function's guessType (supabase/functions/product-lookup) —
  // was "serum" in both places, which is how the catalogue ended up with real
  // non-serums (e.g. a foot cream) mistyped and mis-scored.
  return "unknown";
}

/**
 * A record without a name or a formula is worse than no record: it occupies
 * the barcode permanently and stops a better source ever being consulted for
 * it. About a tenth of rows fail this now, down from about a third: the
 * `ingredients-completed` filter this import pages over already excludes most
 * of them at the source, which is most of why it is worth paging.
 *
 * Returns the row, or a string naming why it was rejected — the caller counts
 * those, because "how many were thrown away and for what" is the number that
 * says whether the gates are working or quietly eating the catalogue.
 */
function toRow(p, known, samples) {
  const name = (p.product_name ?? "").trim();
  const inci = (p.ingredients_text ?? "").trim();
  if (!name || !inci || !p.code) return "no name, formula or barcode";

  const ingredients = parseInci(inci);
  if (ingredients.length < 2) return "fewer than 2 parsed ingredients";

  // The plausibility gate. See MIN_KNOWN_INGREDIENT_RATIO.
  const hits = ingredients.filter((i) => known.has(i.inci_name)).length;
  if (hits / ingredients.length < MIN_KNOWN_INGREDIENT_RATIO) {
    // Keep the first few verbatim. Tuning the threshold means looking at what
    // it actually threw away, and needing to edit the script to see that is
    // how a gate ends up tuned by guess.
    if (samples.length < 5) {
      samples.push(
        `${name || "(unnamed)"} — ${hits}/${ingredients.length} recognised: ` +
          ingredients.slice(0, 6).map((i) => i.inci_name).join(", ")
      );
    }
    // A fixed string, not the ratio: the caller groups by this, and a reason
    // carrying "3/47" in it would produce one bucket per product.
    return "formula not recognised by the dictionary";
  }

  // Name/tags first; only falls to the ingredient-based guess when that
  // finds nothing (a product named after its active, e.g. "Lactic Acid 10%",
  // has no format word for guessType to catch) — see
  // guessTypeFromIngredients's own header for why only these two rules.
  const byName = guessType(p.categories_tags, name);
  const type = byName !== "unknown" ? byName : guessTypeFromIngredients(name, ingredients);

  return {
    product: {
      id: `obf-${p.code}`,
      barcode: p.code,
      brand: (p.brands ?? "Unknown").split(",")[0].trim(),
      name,
      type,
      // Required by the `products` table's NOT NULL CHECK constraint, but no
      // longer computed: the client dropped `area` entirely (nothing reads
      // it back — see store/useAppStore.ts's v5 -> v6 migration note), so
      // guessing a real value for it was wasted work.
      area: "face",
      description: null,
      image_url: USE_SOURCE_PHOTOS ? (p.image_url ?? null) : null,
      volume: p.quantity ?? null,
      in_stock: true,
      suitable_for: [],
      targets: [],
      source: "obf",
      attribution: ATTRIBUTION,
      expires_at: null,
    },
    ingredients,
  };
}

async function main() {
  // Credentials up front, for both modes — the gate needs the dictionary, and
  // a dry run that skipped the gate would print a number a real run would not
  // reproduce. See the file header.
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
  console.log(`Dictionary: ${known.size} known ingredient names.\n`);

  const rows = new Map();
  const rejected = new Map();
  const rejectSamples = [];
  let seen = 0;
  let pagesRead = 0;
  // The watermark this run reaches: the newest `last_modified_t` across every
  // product OBF returned, kept or not. A rejected row (no name, no formula) is
  // still evidence of how far into OBF's data this run looked — only the
  // catalogue write should be conditional on usability, not the bookmark.
  //
  // Read this before making the import incremental (steps 7-8). This number is
  // "the newest modification time this run happened to see", NOT "everything
  // older than this is imported". The search returns products in OBF's own
  // order, not by modification time, and this run stops at TARGET_ROWS — so a
  // product modified before this watermark can easily sit on a page nobody
  // fetched. Passing it back as `&last_modified_t>=` would silently skip those
  // forever. An incremental version has to *sort* by modification time first,
  // which is a different query, not a different constant.
  let newestModifiedAt = null;

  // Categories are walked in order, each paged to exhaustion, until the cap is
  // reached. A product tagged with two of them is fetched twice and kept once —
  // the `rows` map is keyed on product id, so the overlap between `en:face` and
  // `en:face-creams` costs requests, not duplicate rows.
  category: for (const category of CATEGORIES) {
    for (let page = 1; ; page += 1) {
      if (rows.size >= TARGET_ROWS) break category;
      if (pagesRead >= MAX_REQUESTS) {
        console.warn(`\n  ! Hit the ${MAX_REQUESTS}-request budget. Stopping early.`);
        break category;
      }

      // Paced before the request rather than after the page, so the gap sits
      // between consecutive requests exactly once and no run pays for a sleep
      // it never uses — the old placement slept, then immediately broke out of
      // the category, wasting one interval per category and one at the cap.
      if (pagesRead > 0) await sleep(SEARCH_INTERVAL_MS);

      const products = await fetchPage(category, page);
      pagesRead += 1;
      if (products.length === 0) break; // this category is exhausted

      seen += products.length;
      let kept = 0;
      let duplicates = 0;
      for (const p of products) {
        if (typeof p.last_modified_t === "number") {
          newestModifiedAt = Math.max(newestModifiedAt ?? 0, p.last_modified_t);
        }
        const row = toRow(p, known, rejectSamples);
        if (typeof row === "string") {
          rejected.set(row, (rejected.get(row) ?? 0) + 1);
          continue;
        }
        if (rows.has(row.product.id)) {
          duplicates += 1;
          continue;
        }
        rows.set(row.product.id, row);
        kept += 1;
        // Checked inside the loop, not just between pages: without this the cap
        // is "500 rounded up to a page boundary" rather than 500.
        if (rows.size >= TARGET_ROWS) break;
      }

      console.log(
        `  ${category.padEnd(16)} p${String(page).padStart(2)}` +
          `  ${String(products.length).padStart(3)} found` +
          `  ${String(kept).padStart(3)} new` +
          `  ${String(duplicates).padStart(3)} dup` +
          `  ${String(rows.size).padStart(3)}/${TARGET_ROWS} total`
      );
      if (products.length < PAGE_SIZE) break; // last page of this category
    }
  }

  const all = [...rows.values()];
  const withImage = all.filter((r) => r.product.image_url).length;
  if (!USE_SOURCE_PHOTOS) console.log("  (photos disabled — see USE_SOURCE_PHOTOS)");
  if (all.length < TARGET_ROWS) {
    console.warn(
      `\n  ! Only ${all.length} of ${TARGET_ROWS} rows after every category was exhausted. ` +
        "Not itself an error — it means the skincare categories are the limit, not the cap.\n" +
        "    Add a category to CATEGORIES if the catalogue needs to be bigger."
    );
  }
  console.log(
    `\n${seen} records seen over ${pagesRead} request(s), ${all.length} usable ` +
      `(${withImage} with a photo), ` +
      `${new Set(all.flatMap((r) => r.ingredients.map((i) => i.inci_name))).size} distinct ingredients`
  );
  // Why the rest were dropped, by reason. A shift here between runs is the
  // earliest signal that either OBF's data or the parser has moved.
  for (const [reason, count] of [...rejected.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  rejected ${String(count).padStart(4)}  ${reason}`);
  }
  if (rejectSamples.length > 0) {
    console.log(`\n  Rejected by the dictionary gate (first ${rejectSamples.length}) — these should read as junk:`);
    for (const sample of rejectSamples) console.log(`    ${sample}`);
  }

  // Nothing usable is a failure, not an empty success — and this is checked
  // before the dry-run return below, not after it, which is where it first
  // sat. A preflight that reports an empty import and still exits 0 hides the
  // exact breakage this guard exists to surface: an API shape change, a
  // renamed state tag, a gate that started rejecting everything. The dry run
  // is the run that is *supposed* to catch those, so it must not be the one
  // run that cannot.
  //
  // Everything diagnostic — the per-page lines, the totals, the rejection
  // breakdown by reason — has already printed by the time this throws, so the
  // operator still gets the full picture, then a non-zero exit.
  //
  // In write mode it also protects the bookmark below: a `last_run_at`
  // refreshed after importing nothing would hide the same breakage behind a
  // healthy-looking timestamp.
  if (all.length === 0) {
    throw new Error(
      `No usable products found across ${pagesRead} page(s) of ${seen} records. ` +
        "Check the OBF endpoint and the gates above." +
        (DRY_RUN ? "" : " Refusing to record a bookmark.")
    );
  }

  if (DRY_RUN) {
    console.log(`\n--dry-run: would record watermark "${newestModifiedAt ?? "null"}" for source "obf".`);
    console.log("--dry-run: nothing written. Sample:");
    for (const r of all.slice(0, 3)) {
      console.log(`  ${r.product.brand} — ${r.product.name}`);
      console.log(`    type=${r.product.type} area=${r.product.area} photo=${r.product.image_url ? "yes" : "no"}`);
      console.log(`    ${r.ingredients.length} ingredients: ${r.ingredients.slice(0, 5).map((i) => i.inci_name).join(", ")}…`);
    }
    return;
  }

  // One transactional call per product, replacing the four hand-rolled write
  // blocks this script used to run: an `ingredients` stub upsert, a `products`
  // upsert, a bulk `product_ingredients` delete, and batched inserts.
  //
  // Those four were the exact shape of issue #40 — the delete commits, an
  // insert fails, and products sit in the catalogue holding zero ingredients
  // while still looking complete to every reader. `product-lookup` and
  // `label-ocr` already moved to this RPC for that reason (migration 0008,
  // then 0009); this script was the last writer still doing it by hand, and at
  // 118 products that was a small risk in a way that 500 is not.
  //
  // The RPC also does two things the hand-rolled version did not. It creates
  // the ingredient stubs itself, in the same transaction as the formula that
  // needs them. And it bumps `products.fetched_at`, which is half the client's
  // freshness key — the old path left it at whatever the first insert set, so
  // a re-imported formula never invalidated a single cached catalogue.
  //
  // The cost is one round trip per product instead of a handful of batched
  // ones. For an operator script run by hand a few times a year, that is the
  // right trade.
  //
  // supabase-js resolves `{ data, error }` on a database-level failure rather
  // than throwing, so every result is checked: an unchecked call would let a
  // partially-failed import reach the bookmark below and record success.
  // Throwing hands it to the top-level `main().catch()`, and the bookmark is
  // then never written — so the next run simply redoes the whole thing, which
  // is the correct recovery and needs no resume logic.
  let written = 0;
  for (const r of all) {
    const { error } = await db.rpc("replace_product_with_ingredients", {
      p_product: r.product,
      p_ingredients: r.ingredients,
      // Unrated rather than guessed: a fabricated comedogenic score would be
      // indistinguishable from a measured one. Same stub note the two Edge
      // Functions pass — see migration 0007.
      p_stub_note: "No published rating for this ingredient yet.",
    });
    if (error) {
      throw new Error(
        `replace_product_with_ingredients failed for ${r.product.id} ` +
          `(${written} of ${all.length} already written): ${error.message}`
      );
    }
    written += 1;
    process.stdout.write(`\r  ${written}/${all.length}`);
  }

  const links = all.reduce((n, r) => n + r.ingredients.length, 0);
  console.log(`\nWrote ${written} products and ${links} ingredient links.`);

  // Step 3 of the data-strategy plan: record how far this run got, so an
  // eventual incremental version has somewhere to resume from, and so a
  // silently-stopped nightly job becomes a query (`last_run_at` gone stale)
  // instead of a catalogue that quietly stops growing with no signal why.
  // One row per source — upserted, not appended — matching what the plan
  // itself asks for: the watermark reached *last time*, singular. Only
  // reachable once every write above has succeeded, per the checks added
  // alongside this: a `last_run_at` written after a silent failure would be
  // worse than no bookmark at all.
  const { error: bookmarkError } = await db.from("sync_bookmarks").upsert(
    {
      source: "obf",
      watermark: newestModifiedAt === null ? null : String(newestModifiedAt),
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "source" }
  );
  if (bookmarkError) throw new Error(`sync_bookmarks upsert failed: ${bookmarkError.message}`);
}

/**
 * Only sweep Open Beauty Facts when this file is what was run.
 *
 * Step 5's done-when is "a deliberately mangled ingredient list is rejected by
 * the dry run", and until now the only way to check that was to run the import
 * and read the output — which needs credentials, hits a volunteer-run API, and
 * proves nothing about the next change. The gates are ordinary functions and
 * deserve an ordinary test; the single thing stopping one was this call
 * running on import.
 *
 * Compared as real paths rather than by comparing `import.meta.url` to
 * `process.argv[1]` directly: the two are different shapes (a file URL and a
 * platform path), and on Windows they also disagree about separators and drive
 * letter case. `realpathSync` on both sides settles all of it.
 */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    // An entry path that no longer resolves is not this file.
    return false;
  }
}

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Exported for `__tests__/import-obf-gates.test.ts`. Deliberately just the
// pure parts — the gates and the parser — so a test never needs a network or a
// service-role key to pin the behaviour this step is measured on.
export { parseInci, toRow, guessType, normalise, MIN_KNOWN_INGREDIENT_RATIO };
