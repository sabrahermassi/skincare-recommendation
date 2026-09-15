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
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run.
 *
 * Plain .mjs rather than .ts on purpose: these are throwaway operator tools,
 * not shipped code, and this way they need no build step and no new devDeps.
 */

import { createClient } from "@supabase/supabase-js";

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
 * Measured coverage is roughly 10-14 records per major K-beauty brand, so this
 * sweeps by brand rather than trying to page the whole 74k catalogue: it keeps
 * the request count small and the results relevant.
 */
const BRANDS = [
  "cosrx", "beauty of joseon", "skin1004", "anua", "innisfree", "laneige",
  "etude house", "missha", "some by mi", "purito", "isntree", "round lab",
  "dr jart", "sulwhasoo", "banila co", "klairs", "iunik", "pyunkang yul",
  "torriden", "mixsoon", "numbuzin", "goodal", "medicube", "abib",
  "hanyul", "amorepacific", "the face shop", "nature republic",
  // A few non-Korean brands, since the app covers US/JP/EU too.
  "cerave", "la roche posay", "the ordinary", "hada labo", "bioderma", "avene",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchBrand(brand) {
  const url = `${OBF}/cgi/search.pl?search_terms=${encodeURIComponent(brand)}&json=1&page_size=50`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return [];
  const body = await res.json();
  return body.products ?? [];
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

function parseInci(text) {
  return text
    .split(/[,;]/)
    .map(normalise)
    .filter((p) => p.length > 1 && p.length < 120)
    .map((inci_name, position) => ({ inci_name, position }));
}

/**
 * Keep in step with `guessType` in supabase/functions/product-lookup — the
 * two run on different runtimes (Node here, Deno there) so they cannot share
 * a module, and a product typed one way at import and another way on a live
 * scan is a real inconsistency, not a cosmetic one: `contactWeight` reads it.
 *
 * The patterns were English-only, which is why "Schuimende Reinigingsgel",
 * "nettoyant moussant visage" and "Huile lavante" were all typed as serums
 * and then scored as leave-on products.
 */
function guessType(tags, text) {
  const hay = `${(tags ?? []).join(" ")} ${text}`.toLowerCase();
  const table = [
    [/hand.?cream|crème mains|handcreme/, "hand-cream"],
    [/body.?(wash|gel)|shower|douche|duschgel/, "body-wash"],
    [/body.?(lotion|milk|butter)|body ?lotion|lait corporel/, "body-lotion"],
    [
      /cleanser|foam|cleansing|micellar|nettoyant|lavante?|reinigings|schuimende|limpiador|detergente|waschgel|syndet/,
      "cleanser",
    ],
    [/sun|spf|uv|solaire|zonnebrand/, "sunscreen"],
    [/toner|tonic|lotion tonique/, "toner"],
    [/essence/, "essence"],
    [/ampoule/, "ampoule"],
    [/serum|sérum/, "serum"],
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
 * it. About a third of OBF rows fail this, which is expected.
 */
function toRow(p) {
  const name = (p.product_name ?? "").trim();
  const inci = (p.ingredients_text ?? "").trim();
  if (!name || !inci || !p.code) return null;

  const ingredients = parseInci(inci);
  if (ingredients.length < 2) return null;

  return {
    product: {
      id: `obf-${p.code}`,
      barcode: p.code,
      brand: (p.brands ?? "Unknown").split(",")[0].trim(),
      name,
      type: guessType(p.categories_tags, name),
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
  const rows = new Map();
  let seen = 0;
  // The watermark this run reaches: the newest `last_modified_t` across every
  // product OBF returned, kept or not. A rejected row (no name, no formula) is
  // still evidence of how far into OBF's data this run looked — only the
  // catalogue write should be conditional on usability, not the bookmark.
  let newestModifiedAt = null;

  for (const brand of BRANDS) {
    const products = await searchBrand(brand);
    seen += products.length;
    let kept = 0;
    for (const p of products) {
      if (typeof p.last_modified_t === "number") {
        newestModifiedAt = Math.max(newestModifiedAt ?? 0, p.last_modified_t);
      }
      const row = toRow(p);
      if (row && !rows.has(row.product.id)) {
        rows.set(row.product.id, row);
        kept += 1;
      }
    }
    console.log(`  ${brand.padEnd(20)} ${String(products.length).padStart(3)} found  ${String(kept).padStart(3)} usable`);
    await sleep(300); // be a good citizen against a volunteer-run service
  }

  const all = [...rows.values()];
  const withImage = all.filter((r) => r.product.image_url).length;
  if (!USE_SOURCE_PHOTOS) console.log("  (photos disabled — see USE_SOURCE_PHOTOS)");
  console.log(
    `\n${seen} records seen, ${all.length} usable (${withImage} with a photo), ` +
      `${new Set(all.flatMap((r) => r.ingredients.map((i) => i.inci_name))).size} distinct ingredients`
  );

  if (DRY_RUN) {
    console.log(`--dry-run: would record watermark "${newestModifiedAt ?? "null"}" for source "obf".`);
    console.log("\n--dry-run: nothing written. Sample:");
    for (const r of all.slice(0, 3)) {
      console.log(`  ${r.product.brand} — ${r.product.name}`);
      console.log(`    type=${r.product.type} area=${r.product.area} photo=${r.product.image_url ? "yes" : "no"}`);
      console.log(`    ${r.ingredients.length} ingredients: ${r.ingredients.slice(0, 5).map((i) => i.inci_name).join(", ")}…`);
    }
    return;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Every write below is checked and fails loudly, narrowly for the reason
  // the block after them exists: `sync_bookmarks` is a promise that a run
  // recorded here actually wrote what it claims to. supabase-js resolves
  // `{ data, error }` on a database-level failure rather than throwing — a
  // bad row, an RLS violation, a dropped connection returned as a normal
  // response — so an unchecked call here would let a partially-failed
  // catalogue write reach the bookmark and record success. Throwing hands it
  // to the existing top-level `main().catch()` below, so nothing here needs
  // its own exit call.
  //
  // This is deliberately not a wider fix. Making the delete-then-insert pair
  // below atomic — the RPC that already exists for exactly this,
  // `replace_product_with_ingredients` — and gating what a widened import is
  // allowed to write are both step 4/5's job, planned as one bundled unit for
  // a reason: a bigger import without the gates is a worse catalogue, not a
  // bigger one. Checking these results only stops this table from lying
  // about which of the two happened.
  const distinct = [...new Set(all.flatMap((r) => r.ingredients.map((i) => i.inci_name)))];
  // Unrated rather than guessed: a fabricated comedogenic score would be
  // indistinguishable from a measured one.
  const { error: ingredientsError } = await db.from("ingredients").upsert(
    distinct.map((inci_name) => ({
      inci_name,
      // Not "curated" — an unreviewed stub so `product_ingredients` has a
      // name to point at, same as the two Edge Functions. See migration 0007.
      source: "unmatched",
      safety: "safe",
      verified: false,
      note: "No published rating for this ingredient yet.",
    })),
    { onConflict: "inci_name", ignoreDuplicates: true }
  );
  if (ingredientsError) throw new Error(`ingredients upsert failed: ${ingredientsError.message}`);

  const { error: productsError } = await db
    .from("products")
    .upsert(all.map((r) => r.product), { onConflict: "id" });
  if (productsError) throw new Error(`products upsert failed: ${productsError.message}`);

  const joins = all.flatMap((r) =>
    r.ingredients.map((i) => ({
      product_id: r.product.id,
      inci_name: i.inci_name,
      position: i.position,
    }))
  );
  const { error: deleteError } = await db
    .from("product_ingredients")
    .delete()
    .in("product_id", all.map((r) => r.product.id));
  if (deleteError) throw new Error(`product_ingredients delete failed: ${deleteError.message}`);

  for (let i = 0; i < joins.length; i += 500) {
    const { error: insertError } = await db
      .from("product_ingredients")
      .insert(joins.slice(i, i + 500));
    if (insertError) {
      throw new Error(`product_ingredients insert failed at batch ${i / 500}: ${insertError.message}`);
    }
  }

  console.log(`\nWrote ${all.length} products and ${joins.length} ingredient links.`);

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
