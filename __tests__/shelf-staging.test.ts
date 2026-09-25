/**
 * The shelf's wire, against the real staging project (#222, #223): the same
 * `pushShelf` / `fetchShelf` the app calls, signed in as real accounts, with
 * the rules in lib/shelf.ts deciding what is pushed. It is the check #222
 * insists on — read back through #223's read path, not "the insert did not
 * error".
 *
 *   SHELF_STAGING_E2E=1 npx jest shelf-staging
 *
 * Skipped unless that variable is set: CI has no staging credentials, and a
 * unit run must stay hermetic. It reads `.env.staging` (never printed),
 * creates two throwaway accounts, and deletes them at the end.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { request } from "https";
import { join } from "path";

import { JOURNAL_STARTED_KEY } from "@/lib/first-page";
import { planPush, shelfAsSaves, type ShelfOp } from "@/lib/shelf";

jest.setTimeout(120_000);

const mockKeychain = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0,
  getItemAsync: async (key: string) => mockKeychain.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockKeychain.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockKeychain.delete(key);
  },
}));

function stagingEnv(): Record<string, string> | null {
  const file = join(__dirname, "..", ".env.staging");
  if (!existsSync(file)) return null;
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    env[t.slice(0, t.indexOf("=")).trim()] = t.slice(t.indexOf("=") + 1).trim();
  }
  return env;
}

/**
 * Under Jest, Expo's runtime replaces `fetch` with its native one, which has
 * no native side here. This is a plain HTTPS fetch for the real network,
 * handed to every client the test builds.
 */
function nodeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => (headers[name] = value));
    const req = request(url, { method: init.method ?? "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const out = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined) out.set(name, Array.isArray(value) ? value.join(", ") : String(value));
        }
        const status = res.statusCode ?? 0;
        const body = [204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks));
        resolve(new Response(body, { status, statusText: res.statusMessage, headers: out }));
      });
    });
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")));
    if (init.body) req.write(init.body as string);
    req.end();
  });
}

const env = process.env.SHELF_STAGING_E2E === "1" ? stagingEnv() : null;
if (env) globalThis.fetch = nodeFetch as typeof fetch;
const run = env?.SUPABASE_ENV === "staging" ? describe : describe.skip;

run("the shelf on staging", () => {
  const url = env?.SUPABASE_URL ?? "";
  const key = env?.SUPABASE_SERVICE_ROLE_KEY ?? "";
  // Built in a hook, not here: a skipped `describe` still runs its body, and
  // with no credentials the client refuses to construct.
  let admin!: ReturnType<typeof createClient>;
  beforeAll(() => {
    admin = createClient(url, key, { auth: { persistSession: false } });
  });
  const created: string[] = [];

  /** A fresh app: its own client module, signed in as `email`. */
  async function deviceFor(email: string, password: string) {
    let api!: typeof import("@/data/api");
    let supabase!: NonNullable<typeof import("@/lib/supabase").supabase>;
    const saved = process.env;
    process.env = { ...saved, EXPO_PUBLIC_SUPABASE_URL: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: key };
    jest.isolateModules(() => {
      supabase = (require("@/lib/supabase") as typeof import("@/lib/supabase")).supabase!;
      api = require("@/data/api") as typeof import("@/data/api");
    });
    process.env = saved;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { api, supabase, userId: data.user.id };
  }

  async function account(label: string, metadata: Record<string, unknown> = {}) {
    const email = `shelf-e2e-${label}-${randomBytes(5).toString("hex")}@example.com`;
    const password = randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw error;
    created.push(data.user.id);
    return { email, password };
  }

  // Every account goes, and a delete that fails fails the run rather than
  // leaving a stray account on staging unnoticed.
  afterAll(async () => {
    const results = await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id)));
    const failed = results.filter((r) => r.error).map((r) => r.error!.message);
    if (failed.length > 0) throw new Error(`could not delete ${failed.length} test account(s): ${failed.join("; ")}`);
  }, 60_000);

  it("carries two phones' shelves into one account, earliest save and formula intact", async () => {
    mockKeychain.clear();
    const jane = await account("jane");
    const phone = await deviceFor(jane.email, jane.password);
    const push = async (device: typeof phone, ops: ShelfOp[]) => {
      const result = await device.api.pushShelf(device.userId, planPush(ops));
      expect(result).toEqual({ ok: true, value: undefined });
    };

    // Phone 1's shelf from before accounts.
    await push(
      phone,
      shelfAsSaves(
        {
          products: [
            { id: "p-serum", savedAt: Date.parse("2026-09-10T10:00:00Z"), formulaFetchedAt: "2026-09-01T00:00:00.000Z" },
            { id: "p-cream", savedAt: Date.parse("2026-09-11T10:00:00Z") },
          ],
          ingredients: ["niacinamide"],
        },
        Date.parse("2026-09-12T00:00:00Z"),
      ),
    );

    // Phone 2, same account, its own older save of the serum and a toner.
    mockKeychain.clear();
    const ipad = await deviceFor(jane.email, jane.password);
    await push(
      ipad,
      shelfAsSaves(
        {
          products: [
            { id: "p-serum", savedAt: Date.parse("2026-09-05T08:00:00Z"), formulaFetchedAt: "2026-08-20T00:00:00.000Z" },
            { id: "p-toner", savedAt: Date.parse("2026-09-06T08:00:00Z") },
          ],
          ingredients: ["panthenol"],
        },
        Date.parse("2026-09-12T00:00:01Z"),
      ),
    );

    const merged = await ipad.api.fetchShelf();
    if (!merged.ok) throw new Error(JSON.stringify(merged.failure));
    const byId = Object.fromEntries(merged.value.products.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual(["p-cream", "p-serum", "p-toner"]);
    // Earliest save wins, and the formula version seen then goes with it.
    expect(byId["p-serum"].savedAt).toBe(Date.parse("2026-09-05T08:00:00Z"));
    expect(byId["p-serum"].formulaFetchedAt).toBe("2026-08-20T00:00:00.000Z");
    expect(merged.value.ingredients).toEqual(["niacinamide", "panthenol"]);

    // A removal on one phone, and a re-save that is a new save.
    await push(ipad, [{ kind: "remove-product", id: "p-cream" }]);
    await push(ipad, [
      { kind: "remove-product", id: "p-toner" },
      { kind: "save-product", id: "p-toner", savedAt: Date.parse("2026-09-20T00:00:00Z") },
    ]);
    const after = await phone.api.fetchShelf();
    if (!after.ok) throw new Error(JSON.stringify(after.failure));
    expect(after.value.products.map((p) => p.id).sort()).toEqual(["p-serum", "p-toner"]);
    expect(after.value.products.find((p) => p.id === "p-toner")!.savedAt).toBe(Date.parse("2026-09-20T00:00:00Z"));

    // A routine step chosen on one phone reads back on the other (#227), and
    // clearing it goes back to the guess.
    await push(ipad, [{ kind: "set-product-step", id: "p-serum", step: 3 }]);
    const tagged = await phone.api.fetchShelf();
    if (!tagged.ok) throw new Error(JSON.stringify(tagged.failure));
    expect(tagged.value.products.find((p) => p.id === "p-serum")!.routineStep).toBe(3);
    await push(phone, [{ kind: "set-product-step", id: "p-serum", step: null }]);
    const cleared = await ipad.api.fetchShelf();
    if (!cleared.ok) throw new Error(JSON.stringify(cleared.failure));
    expect(cleared.value.products.find((p) => p.id === "p-serum")!.routineStep).toBeUndefined();

    // A journal note written on one phone reads back on the other exactly as
    // written — quotes, commas, a line break — and a deletion reads back as
    // no note (#228). The column's own cap refuses a note over 500.
    const note = 'Loved it, "really".\nWould buy again';
    await push(ipad, [{ kind: "set-product-note", id: "p-serum", note }]);
    const noted = await phone.api.fetchShelf();
    if (!noted.ok) throw new Error(JSON.stringify(noted.failure));
    expect(noted.value.products.find((p) => p.id === "p-serum")!.note).toBe(note);
    await push(phone, [{ kind: "set-product-note", id: "p-serum", note: null }]);
    const unnoted = await ipad.api.fetchShelf();
    if (!unnoted.ok) throw new Error(JSON.stringify(unnoted.failure));
    expect(unnoted.value.products.find((p) => p.id === "p-serum")!.note).toBeUndefined();
    const tooLong = await phone.api.pushShelf(
      phone.userId,
      planPush([{ kind: "set-product-note", id: "p-serum", note: "x".repeat(501) }]),
    );
    expect(tooLong.ok).toBe(false);

    // Pushing the same batch twice changes nothing (a retry after a failure).
    const again = shelfAsSaves({ products: [{ id: "p-serum", savedAt: Date.parse("2026-09-10T10:00:00Z") }], ingredients: [] }, 0);
    await push(phone, again);
    await push(phone, again);
    const steady = await phone.api.fetchShelf();
    if (!steady.ok) throw new Error(JSON.stringify(steady.failure));
    expect(steady.value.products.find((p) => p.id === "p-serum")!.savedAt).toBe(Date.parse("2026-09-05T08:00:00Z"));
  });

  // #230: the first-page flag is merged into the account's metadata, so the
  // name and picture Google put there stay — and it reads back on sign-in.
  it("records the first page on the account without touching the rest of its metadata", async () => {
    mockKeychain.clear();
    const kim = await account("kim", { full_name: "Kim Test", avatar_url: "https://example.com/a.png" });
    const device = await deviceFor(kim.email, kim.password);
    const { error } = await device.supabase.auth.updateUser({ data: { [JOURNAL_STARTED_KEY]: "2026-09-24T00:00:00.000Z" } });
    expect(error).toBeNull();
    const { data } = await admin.auth.admin.getUserById(device.userId);
    expect(data.user?.user_metadata).toMatchObject({
      full_name: "Kim Test",
      avatar_url: "https://example.com/a.png",
      [JOURNAL_STARTED_KEY]: "2026-09-24T00:00:00.000Z",
    });
    mockKeychain.clear();
    const again = await deviceFor(kim.email, kim.password);
    const { data: session } = await again.supabase.auth.getSession();
    expect(session.session?.user.user_metadata[JOURNAL_STARTED_KEY]).toBe("2026-09-24T00:00:00.000Z");
  });

  it("never shows one account's shelf to another", async () => {
    mockKeychain.clear();
    const bob = await account("bob");
    const device = await deviceFor(bob.email, bob.password);
    const shelf = await device.api.fetchShelf();
    expect(shelf).toEqual({ ok: true, value: { products: [], ingredients: [] } });
  });
});
