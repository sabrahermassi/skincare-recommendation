/**
 * Asks a deployed environment's Edge Functions whether a hostile web page
 * would be let in (#241). Accounts exist, so a browser from an origin that
 * isn't on `ALLOWED_ORIGINS` must get no CORS allowance at all — not `*`,
 * and not its own origin echoed back.
 *
 *   SUPABASE_ENV=staging npm run check:cors
 *
 * Read-only: one preflight per function, the request a browser makes before
 * any call, so nothing runs and nothing is written. Safe against production.
 * Exits non-zero when any function would let the page in.
 */

import { connect } from "./lib/db.mjs";

const FUNCTIONS = ["product-lookup", "label-ocr", "delete-account"];
const HOSTILE_ORIGIN = "https://not-for-me.example";

const { env, ref } = connect({ write: false });
const base = process.env.SUPABASE_URL;

let failed = 0;
for (const name of FUNCTIONS) {
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "OPTIONS",
    headers: {
      Origin: HOSTILE_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type, apikey",
    },
  });
  const allowed = res.headers.get("access-control-allow-origin");
  const open = allowed === "*" || allowed === HOSTILE_ORIGIN;
  console.log(`${open ? "  FAIL" : "  ok  "} ${name}: ${allowed ? `allows ${allowed}` : "no allowance"} (HTTP ${res.status})`);
  if (open) failed += 1;
}

if (failed > 0) {
  console.error(`\n${failed} function(s) on ${env} (${ref}) would answer a page from any origin. Set ALLOWED_ORIGINS.`);
  process.exit(1);
}
console.log(`\nEvery function on ${env} (${ref}) refuses an unlisted origin.`);
