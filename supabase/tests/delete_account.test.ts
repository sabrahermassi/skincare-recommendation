// Account deletion's decisions (#224), with fake dependencies: who gets
// deleted, and when nothing may be. The staging run against the deployed
// function is in scripts/check-delete-account.mjs.
import { assert, assertEquals } from "jsr:@std/assert@1";

import { appleClientSecret, revokeAppleGrant, type AppleKeys } from "../functions/delete-account/apple.ts";
import {
  handleDeleteAccount,
  type AccountUser,
  type AppleRevocation,
  type DeleteAccountDeps,
} from "../functions/delete-account/handler.ts";

const JANE: AccountUser = { id: "jane-id", appleLinked: false };
const APPLE_JANE: AccountUser = { id: "apple-jane-id", appleLinked: true };

function fakes(user: AccountUser | null, revocation: AppleRevocation = "revoked") {
  const deleted: string[] = [];
  const revoked: string[] = [];
  const deps: DeleteAccountDeps = {
    userFromToken: (token) => Promise.resolve(token === "valid-token" ? user : null),
    revokeApple: (code) => {
      revoked.push(code);
      return Promise.resolve(revocation);
    },
    deleteUser: (id) => {
      deleted.push(id);
      return Promise.resolve(true);
    },
  };
  return { deps, deleted, revoked };
}

function post(body: unknown, token?: string): Request {
  return new Request("https://example.test/delete-account", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

Deno.test("no token deletes nothing", async () => {
  const { deps, deleted } = fakes(JANE);
  const reply = await handleDeleteAccount(post({ user_id: "jane-id" }), deps);
  assertEquals(reply.status, 401);
  assertEquals(deleted, []);
});

Deno.test("a forged or expired token deletes nothing", async () => {
  const { deps, deleted } = fakes(JANE);
  const reply = await handleDeleteAccount(post({}, "forged.token.value"), deps);
  assertEquals(reply.status, 401);
  assertEquals(deleted, []);
});

Deno.test("identity comes from the token, never the body", async () => {
  const { deps, deleted } = fakes(JANE);
  const reply = await handleDeleteAccount(post({ user_id: "someone-else", id: "someone-else" }, "valid-token"), deps);
  assertEquals(reply.status, 200);
  assertEquals(deleted, ["jane-id"]);
});

Deno.test("only POST deletes", async () => {
  const { deps, deleted } = fakes(JANE);
  const reply = await handleDeleteAccount(
    new Request("https://example.test/delete-account", { method: "GET", headers: { authorization: "Bearer valid-token" } }),
    deps,
  );
  assertEquals(reply.status, 405);
  assertEquals(deleted, []);
});

Deno.test("an Apple account is not deleted without a fresh Apple code", async () => {
  const { deps, deleted } = fakes(APPLE_JANE);
  const reply = await handleDeleteAccount(post({}, "valid-token"), deps);
  assertEquals(reply, { status: 400, body: { error: "apple_reauth_required" } });
  assertEquals(deleted, []);
});

Deno.test("an Apple account is not deleted when the grant cannot be revoked", async () => {
  for (const [revocation, status, error] of [
    ["not-configured", 503, "apple_not_configured"],
    ["failed", 502, "apple_revoke_failed"],
  ] as const) {
    const { deps, deleted } = fakes(APPLE_JANE, revocation);
    const reply = await handleDeleteAccount(post({ appleAuthorizationCode: "c0de" }, "valid-token"), deps);
    assertEquals(reply, { status, body: { error } });
    assertEquals(deleted, []);
  }
});

Deno.test("an Apple account is deleted once its grant is revoked", async () => {
  const { deps, deleted, revoked } = fakes(APPLE_JANE);
  const reply = await handleDeleteAccount(post({ appleAuthorizationCode: "c0de" }, "valid-token"), deps);
  assertEquals(reply, { status: 200, body: { deleted: true } });
  assertEquals(revoked, ["c0de"]);
  assertEquals(deleted, ["apple-jane-id"]);
});

// ── Apple's side ────────────────────────────────────────────────────────────

async function testKeys(): Promise<{ keys: AppleKeys; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----`;
  return {
    keys: { teamId: "TEAM123", keyId: "KEY123", clientId: "com.example.forme", privateKey: pem },
    publicKey: pair.publicKey,
  };
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

Deno.test("the client secret is an ES256 JWT Apple can verify", async () => {
  const { keys, publicKey } = await testKeys();
  const jwt = await appleClientSecret(keys, 1_790_000_000);
  const [header, payload, signature] = jwt.split(".");
  assertEquals(JSON.parse(new TextDecoder().decode(fromBase64url(header))), { alg: "ES256", kid: "KEY123" });
  assertEquals(JSON.parse(new TextDecoder().decode(fromBase64url(payload))), {
    iss: "TEAM123",
    iat: 1_790_000_000,
    exp: 1_790_000_300,
    aud: "https://appleid.apple.com",
    sub: "com.example.forme",
  });
  assert(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64url(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    ),
  );
});

Deno.test("revocation exchanges the code, then revokes the refresh token", async () => {
  const { keys } = await testKeys();
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fakeFetch = ((url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    const ok = url.endsWith("/auth/token")
      ? new Response(JSON.stringify({ access_token: "a", refresh_token: "r" }), { status: 200 })
      : new Response(null, { status: 200 });
    return Promise.resolve(ok);
  }) as typeof fetch;

  assertEquals(await revokeAppleGrant(keys, "c0de", fakeFetch), "revoked");
  assertEquals(calls.map((c) => c.url), ["https://appleid.apple.com/auth/token", "https://appleid.apple.com/auth/revoke"]);
  assertEquals(calls[0].body.get("code"), "c0de");
  assertEquals(calls[1].body.get("token"), "r");
  assertEquals(calls[1].body.get("token_type_hint"), "refresh_token");
});

Deno.test("revocation reports a refusal or missing keys instead of pretending", async () => {
  const { keys } = await testKeys();
  const refused = (() => Promise.resolve(new Response("{}", { status: 400 }))) as typeof fetch;
  assertEquals(await revokeAppleGrant(keys, "c0de", refused), "failed");
  assertEquals(await revokeAppleGrant(null, "c0de", refused), "not-configured");
});
