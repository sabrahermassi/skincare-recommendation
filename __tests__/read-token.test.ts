import { webcrypto } from "node:crypto";

import { READ_TOKEN_TTL_MS, readTokenDeadline, signReadToken, verifyReadToken } from "@/supabase/functions/_shared/read-token";

// jest's React Native environment has no Web Crypto of its own; Node's is the
// same implementation the Edge Function runs on.
beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
});

const SECRET = "test-secret";
const NAMES = ["aqua", "glycerin", "niacinamide", "panthenol"];
const NOW = 1_800_000_000_000;

describe("the proof that a list was read", () => {
  it("accepts the list it was signed for", async () => {
    const token = await signReadToken(NAMES, SECRET, NOW);

    expect(await verifyReadToken(token, NAMES, SECRET, NOW + 1000)).toBe(true);
  });

  it("refuses a list that was edited after the read", async () => {
    const token = await signReadToken(NAMES, SECRET, NOW);

    expect(await verifyReadToken(token, [...NAMES, "retinol"], SECRET, NOW)).toBe(false);
    expect(await verifyReadToken(token, [...NAMES].reverse(), SECRET, NOW)).toBe(false);
  });

  it("refuses a token signed with another secret", async () => {
    const token = await signReadToken(NAMES, "someone-elses-secret", NOW);

    expect(await verifyReadToken(token, NAMES, SECRET, NOW)).toBe(false);
  });

  it("refuses an expired token", async () => {
    const token = await signReadToken(NAMES, SECRET, NOW);

    expect(await verifyReadToken(token, NAMES, SECRET, NOW + READ_TOKEN_TTL_MS + 1)).toBe(false);
  });

  it("cannot be extended by rewriting the deadline", async () => {
    const token = await signReadToken(NAMES, SECRET, NOW);
    const signature = token.split(".")[1];

    expect(await verifyReadToken(`${NOW + 10 * READ_TOKEN_TTL_MS}.${signature}`, NAMES, SECRET, NOW)).toBe(false);
  });

  it("reports the deadline it was signed with", async () => {
    const token = await signReadToken(NAMES, SECRET, NOW);

    expect(readTokenDeadline(token)).toBe(NOW + READ_TOKEN_TTL_MS);
  });

  it.each(["", "garbage", "123.", ".abc", "123.zz", "123.abc", "1.2.3"])("refuses the malformed token %p", async (token: string) => {
    expect(await verifyReadToken(token, NAMES, SECRET, NOW)).toBe(false);
  });
});
