// Sign in with Apple token revocation (#224), through Apple's REST API:
// https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens
//
// Apple revokes a token, not a user, and this app never keeps an Apple token
// — sign-in hands Supabase an identity token and nothing else. So the device
// asks the person to confirm with Apple once more at deletion, which yields a
// fresh authorization code; that code is exchanged here for Apple's tokens,
// and the refresh token is revoked. Revoking it ends the app's grant: the
// app disappears from the person's "Apps using Apple ID" list.
//
// Both calls authenticate with a client secret: a short-lived ES256 JWT
// signed with the Sign in with Apple key. The key, its ID, the team ID and
// the app's bundle ID are function secrets, never `EXPO_PUBLIC_` values.

import type { AppleRevocation } from "./handler.ts";

export type AppleKeys = {
  teamId: string;
  keyId: string;
  /** The bundle ID the Apple button signs in for. */
  clientId: string;
  /** The .p8 file's contents, PEM-encoded PKCS#8. */
  privateKey: string;
};

const APPLE = "https://appleid.apple.com";

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const binary = atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, ""));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Apple's client secret. WebCrypto's ECDSA signature is already the raw
 * `r || s` form a JWT uses, so no DER unwrapping is needed. Exported for the
 * test, which checks the signature against the matching public key.
 */
export async function appleClientSecret(keys: AppleKeys, nowSeconds: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(keys.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const encode = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "ES256", kid: keys.keyId })}.${encode({
    iss: keys.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 300,
    aud: APPLE,
    sub: keys.clientId,
  })}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** Reads the four secrets; null when any is missing. */
export function appleKeysFrom(get: (name: string) => string | undefined): AppleKeys | null {
  const teamId = get("APPLE_TEAM_ID");
  const keyId = get("APPLE_KEY_ID");
  const clientId = get("APPLE_CLIENT_ID");
  const privateKey = get("APPLE_PRIVATE_KEY");
  return teamId && keyId && clientId && privateKey ? { teamId, keyId, clientId, privateKey } : null;
}

export async function revokeAppleGrant(
  keys: AppleKeys | null,
  authorizationCode: string,
  fetcher: typeof fetch = fetch,
): Promise<AppleRevocation> {
  if (!keys) return "not-configured";
  try {
    const secret = await appleClientSecret(keys, Math.floor(Date.now() / 1000));

    const tokenResponse = await fetcher(`${APPLE}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: keys.clientId,
        client_secret: secret,
        code: authorizationCode,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) return "failed";
    const tokens = (await tokenResponse.json()) as { refresh_token?: string; access_token?: string };
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!token) return "failed";

    const revoke = await fetcher(`${APPLE}/auth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: keys.clientId,
        client_secret: secret,
        token,
        token_type_hint: tokens.refresh_token ? "refresh_token" : "access_token",
      }),
    });
    return revoke.ok ? "revoked" : "failed";
  } catch {
    return "failed";
  }
}
