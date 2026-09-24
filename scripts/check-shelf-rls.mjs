/**
 * Checks migration 0025's access rules against the real staging project, with
 * two real accounts (#219). `supabase/tests/saved_shelf.test.sql` runs the
 * same checks in CI against a stubbed `auth` schema; this is the run that
 * goes through Supabase's own sign-in, JWTs and API, which the stub cannot.
 *
 *   SUPABASE_ENV=staging npm run check:shelf-rls
 *
 * Staging only, and refuses anything else outright — it creates two accounts.
 * They are throwaway (`@example.com`, random password) and deleted at the end,
 * whatever happens; deleting them also checks that an account's shelf goes
 * with it. Needs the staging project's email provider switched on, which is
 * Supabase's default, to sign the two accounts in.
 *
 * Exits non-zero on any failure. Each "cannot" check is paired with a "can"
 * check on the user's own row, so the run fails if the policies are missing,
 * not only if they are too loose — an empty result proves nothing on its own.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

import { connect } from "./lib/db.mjs";

const { db, env, ref } = connect({ write: true });
if (env !== "staging") {
  console.error(`Refusing to run against ${env} (${ref}): this check creates accounts, staging only.`);
  process.exit(1);
}

const failures = [];
function check(ok, message) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${message}`);
  if (!ok) failures.push(message);
}

async function makeUser(label) {
  const email = `rls-check-${label}-${randomBytes(6).toString("hex")}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`could not create user ${label}: ${error.message}`);

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`could not sign in user ${label}: ${signInError.message}`);
  return { id: data.user.id, client };
}

/** Everything A tries against B's rows on one table, plus A's own row. */
async function probe(table, keyColumn, a, b) {
  console.log(`\n${table}`);
  const own = `${table}-own-${randomBytes(3).toString("hex")}`;
  const theirs = `${table}-theirs-${randomBytes(3).toString("hex")}`;

  // B's row, written by B through the API.
  const seeded = await b.client.from(table).insert({ [keyColumn]: theirs });
  check(!seeded.error, `B can save to their own shelf${seeded.error ? ` (${seeded.error.message})` : ""}`);

  // A's own row, with user_id left to the column default.
  const mine = await a.client.from(table).insert({ [keyColumn]: own }).select("user_id");
  check(!mine.error && mine.data?.[0]?.user_id === a.id, "A can save, and user_id defaults to A");

  const visible = await a.client.from(table).select(`user_id, ${keyColumn}`);
  check(!visible.error && visible.data.length === 1 && visible.data[0].user_id === a.id,
    "SELECT: A sees exactly A's own row");
  const asked = await a.client.from(table).select(keyColumn).eq("user_id", b.id);
  check(!asked.error && asked.data.length === 0, "SELECT: A cannot read B's row, even by asking for it");

  const planted = await a.client.from(table).insert({ user_id: b.id, [keyColumn]: `${theirs}-planted` });
  check(Boolean(planted.error), "INSERT: A cannot save a row as B");

  const patch = table === "saved_products" ? { note: "overwritten" } : { saved_at: new Date().toISOString() };
  const updated = await a.client.from(table).update(patch).eq("user_id", b.id).select(keyColumn);
  check(!updated.error && updated.data.length === 0, "UPDATE: A cannot change B's row");

  const moved = await a.client.from(table).update({ user_id: b.id }).eq(keyColumn, own).select(keyColumn);
  check(Boolean(moved.error) || moved.data.length === 0, "UPDATE: A cannot hand A's row to B");

  const deleted = await a.client.from(table).delete().eq("user_id", b.id).select(keyColumn);
  check(!deleted.error && deleted.data.length === 0, "DELETE: A cannot delete B's row");

  const stillThere = await db.from(table).select(keyColumn).eq("user_id", b.id);
  check(!stillThere.error && stillThere.data.length === 1, "B's row is exactly as B left it");

  const ownDeleted = await a.client.from(table).delete().eq(keyColumn, own).select(keyColumn);
  check(!ownDeleted.error && ownDeleted.data.length === 1, "DELETE: A can delete A's own row");
}

const users = [];
try {
  const a = await makeUser("a");
  users.push(a);
  const b = await makeUser("b");
  users.push(b);

  await probe("saved_products", "product_id", a, b);
  await probe("saved_ingredients", "inci_name", a, b);
} catch (error) {
  failures.push(String(error.message ?? error));
  console.error(`\n${error.message ?? error}`);
} finally {
  console.log("\ncleanup");
  for (const user of users) {
    const { error } = await db.auth.admin.deleteUser(user.id);
    check(!error, `deleted throwaway account ${user.id}${error ? ` (${error.message})` : ""}`);
    for (const table of ["saved_products", "saved_ingredients"]) {
      const left = await db.from(table).select("user_id").eq("user_id", user.id);
      check(!left.error && left.data.length === 0, `deleting the account removed its ${table} rows`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll access checks passed on staging.");
