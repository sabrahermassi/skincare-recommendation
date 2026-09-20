/**
 * Proof that an ingredient list came out of a photo read.
 *
 * Saving a product takes a list from the client, and the endpoint is
 * unauthenticated. Without a proof, anyone could save a made-up list of real
 * ingredient names under any unclaimed barcode and it would stay for good. So a
 * read hands back a token signed over the exact list it returned, and a save
 * must present that token with the same list: the list has to have been read
 * (which costs a rate-limited OCR call), it cannot be edited afterwards, and the
 * proof goes stale after `READ_TOKEN_TTL_MS`.
 *
 * No table and no state: the signature is an HMAC keyed with a server-only
 * secret, so there is nothing to store or clean up. Imports nothing and touches
 * no Deno global, so Node (the tests) and Deno run the same code.
 */

/** Long enough to type a name after a read, short enough that a token is not a standing licence. */
export const READ_TOKEN_TTL_MS = 30 * 60 * 1000;

const encoder = new TextEncoder();

function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** What is signed: the deadline and the list, in order. */
function signedBytes(expiresAt: number, names: readonly string[]): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${expiresAt}\n${names.join("\n")}`);
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** `<deadline in ms>.<hex signature>`, valid only for exactly this list. */
export async function signReadToken(names: readonly string[], secret: string, now = Date.now()): Promise<string> {
  const expiresAt = now + READ_TOKEN_TTL_MS;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), signedBytes(expiresAt, names));
  return `${expiresAt}.${toHex(signature)}`;
}

/** Whether `token` was signed for exactly `names` and has not expired. */
export async function verifyReadToken(
  token: string,
  names: readonly string[],
  secret: string,
  now = Date.now()
): Promise<boolean> {
  const [deadline, hex, ...rest] = token.split(".");
  const expiresAt = Number(deadline);
  if (rest.length > 0 || !Number.isFinite(expiresAt) || expiresAt < now) return false;
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromHex(hex), signedBytes(expiresAt, names));
}
