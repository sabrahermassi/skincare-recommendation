/**
 * Checks the deployed `delete-account` function on the staging project
 * (#224): who it will and will not delete. The decisions are unit-tested in
 * supabase/tests/delete_account.test.ts; this is the run against the real
 * gateway, real tokens and the real cascade.
 *
 *   SUPABASE_ENV=staging npm run check:delete-account
 *
 * Staging only, and refuses anything else — it creates and deletes accounts.
 * Uses two throwaway email accounts (Supabase's default email provider must
 * be on, as for check:shelf-rls), so it exercises the non-Apple path; the
 * Apple path needs the Apple keys and a real device.
 */

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

import { connect } from "./lib/db.mjs";

const { db, env, ref } = connect({ write: true });
if (env !== "staging") {
  console.error(`Refusing to run against ${env} (${ref}): this check deletes accounts, staging only.`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const endpoint = `${url}/functions/v1/delete-account`;

const failures = [];
function check(ok, message) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${message}`);
  if (!ok) failures.push(message);
}

const created = [];
async function account(label) {
  const email = `delete-check-${label}-${randomBytes(6).toString("hex")}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`could not create ${label}: ${error.message}`);
  created.push(data.user.id);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`could not sign in ${label}: ${signIn.error.message}`);
  return { id: data.user.id, client, token: signIn.data.session.access_token };
}

async function call(token, body = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return res.status;
}

async function exists(id) {
  const { data } = await db.auth.admin.getUserById(id);
  return Boolean(data?.user);
}

try {
  const jane = await account("jane");
  const bob = await account("bob");
  const saved = await jane.client.from("saved_products").insert({ product_id: "delete-check-product", note: "mine" });
  check(!saved.error, "Jane has a saved product with a note");

  check((await call(null)) === 401, "no token: refused");
  check((await call("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmb3JnZWQifQ.forged")) === 401, "forged token: refused");
  check(await exists(jane.id), "…and Jane still exists");

  const status = await call(jane.token, { user_id: bob.id, id: bob.id });
  check(status === 200, `Jane's own token, body naming Bob: ${status}`);
  check(!(await exists(jane.id)), "Jane's account is gone");
  check(await exists(bob.id), "Bob, named in the body, is untouched");

  const left = await db.from("saved_products").select("product_id").eq("user_id", jane.id);
  check(!left.error && left.data.length === 0, "Jane's saved products went with her account");
} catch (error) {
  failures.push(String(error.message ?? error));
  console.error(error.message ?? error);
} finally {
  for (const id of created) {
    if (await exists(id)) {
      const { error } = await db.auth.admin.deleteUser(id);
      check(!error, `cleaned up ${id}`);
    }
  }
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nThe deployed delete-account function behaved on staging.");
