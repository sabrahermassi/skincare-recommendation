// Read an ingredient list off a photographed label, and write it back so the
// next person who scans that barcode gets it instantly.
//
// This is the tier that makes a scan-first app viable. Open Beauty Facts holds
// 37 products tagged South Korea; Olive Young alone lists over 10,000 SKUs. No
// barcode database will close that gap — but the formula is printed on the box
// in the user's hand, and reading it works on any product, any brand, any
// country. Every result is stored against the barcode, so the catalogue grows
// from real use instead of from a bulk import that does not exist.
//
// Google Cloud Vision rather than on-device ML Kit: ML Kit is free and works
// offline, but needs a custom dev build, and SDK 54 was chosen to keep Expo Go
// working. The key stays here, never in the bundle.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";

const VISION_URL = "https://vision.googleapis.com/v1/images:annotate";

/** Generous for a person in a shop, useless for anyone burning the free tier. */
const RATE_LIMIT = { windowSeconds: 300, maxRequests: 10 };

/** Roughly 4 MB of base64 — well past what a legible label photo needs. */
const MAX_IMAGE_CHARS = 5_500_000;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!VISION_API_KEY) return json({ error: "OCR is not configured" }, 503);

  let barcode: string | undefined;
  let imageBase64: string;
  let name: string | undefined;
  let brand: string | undefined;
  try {
    ({ barcode, imageBase64, name, brand } = await req.json());
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return json({ error: "imageBase64 is required" }, 400);
  }
  if (imageBase64.length > MAX_IMAGE_CHARS) {
    return json({ error: "Image too large — retake it closer in" }, 413);
  }
  if (barcode !== undefined && !/^\d{8,14}$/.test(barcode)) {
    return json({ error: "barcode must be 8-14 digits" }, 400);
  }

  if (!(await withinRateLimit(deviceKey(req)))) {
    return json({ error: "Too many requests" }, 429);
  }

  const text = await runOcr(imageBase64);
  if (text === null) return json({ error: "Could not read the image" }, 502);

  const parsed = parseIngredientBlock(text);
  if (parsed.length < 4) {
    // Better to say so than to score a fragment. Four is the same floor the
    // verdict engine uses before it will produce a number at all.
    return json(
      { error: "not_enough_text", found: parsed.length, rawText: text.slice(0, 400) },
      422
    );
  }

  // Only names our dictionary already knows are trusted. The rest are stored
  // unverified, so the UI shows them as unrecognised rather than pretending we
  // assessed them — OCR on a curved bottle produces plenty of nonsense.
  const known = await knownIngredients(parsed.map((p) => p.inci_name));

  const product = {
    id: barcode ? `ocr-${barcode}` : `ocr-${crypto.randomUUID()}`,
    barcode: barcode ?? null,
    brand: (brand ?? "Unknown").trim().slice(0, 120) || "Unknown",
    name: (name ?? "Scanned product").trim().slice(0, 200) || "Scanned product",
    type: "serum",
    area: "face",
    description: null,
    image_url: null,
    volume: null,
    in_stock: true,
    suitable_for: [],
    targets: [],
    source: "ocr",
    attribution: "Ingredients read from the product label.",
    expires_at: null,
  };

  await db.from("ingredients").upsert(
    parsed
      .filter((p) => !known.has(p.inci_name))
      .map((p) => ({
        inci_name: p.inci_name,
        source: "curated",
        safety: "safe",
        verified: false,
        note: "Read from a label, not matched to the ingredient dictionary.",
      })),
    { onConflict: "inci_name", ignoreDuplicates: true }
  );

  await db.from("products").upsert(product, { onConflict: "id" });
  await db.from("product_ingredients").delete().eq("product_id", product.id);
  await db.from("product_ingredients").insert(
    parsed.map((p) => ({
      product_id: product.id,
      inci_name: p.inci_name,
      position: p.position,
    }))
  );

  const { data } = await db
    .from("products")
    .select(
      `id, barcode, brand, name, type, area, description, image_url, volume,
       price_krw, in_stock, suitable_for, targets, attribution,
       product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified ) )`
    )
    .eq("id", product.id)
    .maybeSingle();

  return json({ product: data, recognised: known.size, total: parsed.length }, 200);
});

// ── OCR ─────────────────────────────────────────────────────────────────────

async function runOcr(imageBase64: string): Promise<string | null> {
  const res = await fetch(`${VISION_URL}?key=${VISION_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: imageBase64 },
          // DOCUMENT_TEXT_DETECTION beats TEXT_DETECTION on dense small print
          // set in a block, which is exactly what an INCI panel is.
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["en", "ko"] },
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body?.responses?.[0]?.fullTextAnnotation?.text ?? null;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Pull the INCI list out of whatever else the OCR picked up.
 *
 * Real label photos capture claims, directions and barcodes alongside the
 * formula, so this first tries to isolate the block after an "Ingredients:"
 * heading, and only falls back to the whole text when there isn't one.
 */
export function parseIngredientBlock(text: string): { inci_name: string; position: number }[] {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");

  const heading = /(?:ingredients?|전성분|성분)\s*[:：]?\s*/i.exec(flat);
  let block = heading ? flat.slice(heading.index + heading[0].length) : flat;

  // Stop at the next sentence-like section, which is usually directions or a
  // marketing claim rather than more formula.
  const stop = /(?:\bdirections?\b|\bhow to use\b|\bcaution\b|\bwarning\b|사용법)/i.exec(block);
  if (stop) block = block.slice(0, stop.index);

  return block
    .split(/[,;•·]/)
    .map(normalise)
    .filter((n) => n.length > 1 && n.length < 120 && /[a-z]/.test(n))
    .map((inci_name, position) => ({ inci_name, position }));
}

/** Same normalisation as the import scripts, or the dictionary cannot match. */
function normalise(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
}

async function knownIngredients(names: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < names.length; i += 200) {
    const { data } = await db
      .from("ingredients")
      .select("inci_name")
      .eq("verified", true)
      .in("inci_name", names.slice(i, i + 200));
    for (const row of data ?? []) found.add(row.inci_name as string);
  }
  return found;
}

// ── Plumbing ────────────────────────────────────────────────────────────────

const hits = new Map<string, number[]>();

async function withinRateLimit(key: string): Promise<boolean> {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT.windowSeconds * 1000;
  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= RATE_LIMIT.maxRequests) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

function deviceKey(req: Request): string {
  return (
    req.headers.get("x-device-id") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
