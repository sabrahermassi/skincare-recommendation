// Decide what happens to a barcode-less scan — step 5b's row-accrual
// answer (Option 2 in the data-strategy plan): a label photographed
// without a barcode is shown its verdict like any other scan, then offered
// a choice afterward, "scan the barcode too?" This is that choice, made
// real:
//
//   attach-barcode — the row becomes permanent and findable by anyone.
//   discard        — the row is deleted outright.
//
// The third case, walking away without answering either, is not handled
// here at all: `label-ocr` writes a barcode-less row with a 24h
// `expires_at`, and the existing hourly `evict-expired-products` job
// (0002_eviction_schedule.sql) cleans it up on its own if nobody ever
// calls this function. See migration 0014 and `label-ocr`'s own
// `OCR_GRACE_PERIOD_MS` comment for the rest of that story.
//
// Unauthenticated, like every other scan endpoint in this app. Two layers
// scope what a caller can do:
//
//   `source = 'ocr' and barcode is null` on every query — this stops the
//   function being usable against an imported product or a scan that
//   already has a barcode, whatever id is passed in.
//
//   a per-scan token, checked against `scan_tokens` (migration 0015) — the
//   filter above only limits WHAT KIND of row can be touched, not WHO gets
//   to touch it. `products` is publicly readable, so an id-only check would
//   let anyone enumerate every barcode-less scan currently on its grace
//   timer and hijack or discard someone else's — including permanently
//   attaching a wrong barcode to their formula, which would then poison
//   every future lookup of that barcode via `label-ocr`'s own
//   `productForBarcode` short-circuit. Found in review on PR #109.

import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  callerKey,
  json,
  preflight,
  consumeRateLimit,
  type RateLimit,
} from "../_shared/http.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Same shape as label-ocr's own limit — this is the same "person in a
 *  shop deciding what to do with a scan" traffic, just the second step of
 *  it. */
const RATE_LIMIT: RateLimit = { windowSeconds: 300, maxRequests: 10 };

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PRODUCT_SELECT = `id, barcode, brand, name, type, area, description, image_url, volume,
   price_krw, in_stock, suitable_for, targets, source, attribution,
   product_ingredients ( position, ingredients ( inci_name, comedogenic, safety, note, verified, functions ) )`;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Body must be JSON" }, 400);
  }

  const { action, productId, token } = body;
  if (typeof productId !== "string" || productId.length === 0) {
    return json(req, { error: "productId is required" }, 400);
  }
  if (action !== "attach-barcode" && action !== "discard") {
    return json(req, { error: 'action must be "attach-barcode" or "discard"' }, 400);
  }
  if (typeof token !== "string" || token.length === 0) {
    return json(req, { error: "token is required" }, 400);
  }

  if (!(await consumeRateLimit(db, "resolve-scan", callerKey(req), RATE_LIMIT))) {
    return json(req, { error: "Too many requests" }, 429);
  }

  // Proof of ownership — see the file header. `not_found` rather than a
  // more specific "forbidden" for a mismatch too: this is not a place to
  // help a caller distinguish "wrong token" from "row already gone", since
  // both should look identical to anyone who does not already hold the
  // right token.
  const { data: tokenRow } = await db
    .from("scan_tokens")
    .select("token")
    .eq("product_id", productId)
    .maybeSingle();
  if (!tokenRow || tokenRow.token !== token) {
    return json(req, { error: "not_found" }, 404);
  }

  if (action === "discard") {
    // Scoped by the same clause as attach-barcode below — see the file
    // header for why this filter is the whole security boundary, not an
    // optimisation. `delete().eq(...)` reports how many rows matched via
    // `count`, which is what tells a caller "already gone" apart from
    // "gone now" without a second read.
    const { error, count } = await db
      .from("products")
      .delete({ count: "exact" })
      .eq("id", productId)
      .eq("source", "ocr")
      .is("barcode", null);
    if (error) {
      console.error("resolve-scan discard failed:", error);
      return json(req, { error: "Could not discard the scan" }, 502);
    }
    return json(req, { discarded: (count ?? 0) > 0 }, 200);
  }

  // action === "attach-barcode"
  const { barcode } = body;
  // Same rule label-ocr validates a barcode against — kept in step so a
  // barcode this function accepts is always one label-ocr would too.
  if (typeof barcode !== "string" || !/^\d{8,14}$/.test(barcode)) {
    return json(req, { error: "barcode must be 8-14 digits" }, 400);
  }

  const { data: collision } = await db
    .from("products")
    .select("id")
    .eq("barcode", barcode)
    .maybeSingle();
  if (collision) {
    if (collision.id !== productId) {
      // A genuine conflict, not a decline: this row is left exactly as it
      // was (still on its grace timer) rather than discarded, since the
      // person did try to do the right thing. The client surfaces this
      // and can offer a retry with a different scan.
      return json(
        req,
        { error: "barcode_taken", message: "This barcode is already linked to another product." },
        409
      );
    }
    // Same product, same barcode, already attached — a retry racing the
    // token deletion below (two requests in flight before the first one's
    // delete commits), or a double-tap before the first response landed.
    // Found in review on PR #109: without this branch a retry read as a
    // conflict with itself. Treat it as success and hand back the same
    // product a fresh attach would have.
    const { data: product, error: readError } = await db
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("id", productId)
      .maybeSingle();
    if (readError || !product) {
      console.error("resolve-scan idempotent readback failed:", readError);
      return json(req, { error: "Could not read back the product" }, 502);
    }
    return json(req, { product }, 200);
  }

  // Selects the full row on the update itself instead of a separate
  // readback after — one fewer round trip, and one fewer window where the
  // barcode is committed but a follow-up read could still fail and report
  // a false 502. Found in review on PR #109.
  const { error: updateError, data: updated } = await db
    .from("products")
    .update({ barcode, expires_at: null })
    .eq("id", productId)
    .eq("source", "ocr")
    .is("barcode", null)
    .select(PRODUCT_SELECT)
    .maybeSingle();
  if (updateError) {
    // 23505 = unique_violation. The collision check above can't fully
    // serialise two concurrent attach-barcode calls for the same barcode
    // on different rows — both can pass it before either commits. The
    // constraint is what actually decides that race; whichever request
    // loses it gets the same barcode_taken response the check above would
    // have given it outright. Found in review on PR #109.
    if (updateError.code === "23505") {
      return json(
        req,
        { error: "barcode_taken", message: "This barcode is already linked to another product." },
        409
      );
    }
    console.error("resolve-scan attach-barcode failed:", updateError);
    return json(req, { error: "Could not attach the barcode" }, 502);
  }
  if (!updated) {
    // Either the id doesn't exist, or it isn't a barcode-less ocr row (the
    // scope clause above excluded it) — including the case where it was
    // already evicted by the grace-period job. Same status either way:
    // there is nothing left here for the client to attach to.
    return json(req, { error: "not_found" }, 404);
  }

  // The row is permanent now, so the token that used to gate resolving it
  // has nothing left to protect. A discard's equivalent cleanup needs no
  // code of its own — deleting the product cascades onto its scan_tokens
  // row via the foreign key (migration 0015).
  await db.from("scan_tokens").delete().eq("product_id", productId);

  return json(req, { product: updated }, 200);
});
