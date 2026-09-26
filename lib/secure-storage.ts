import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Where the sign-in session lives (#218), and on a phone the skin profile
 * (#189). The only file allowed to import `expo-secure-store` — see
 * docs/device-storage-policy.md and the allowlist in eslint.config.js.
 *
 * iOS: Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so a token never rides out
 * in an iCloud backup or onto a restored phone. Android: Keystore, with the
 * config plugin's backup rules excluding it. Web: `expo-secure-store` has no
 * web implementation, and Supabase's own web fallback is `localStorage`, so
 * web gets a plain in-memory map instead — the session ends with the tab, on
 * purpose.
 */

/** The storage shape `@supabase/auth-js` accepts for `auth.storage`. */
export type SessionStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Some iOS releases refuse a single value above about 2KB, and a Supabase
 * session — two tokens plus the user record — is usually larger. So a value
 * is split across numbered keys (`key.0`, `key.1`, …), with the count stored
 * under the key itself. The limit is in stored bytes, so this is too: a
 * chunk holds at most this many UTF-8 bytes. Exported for the tests.
 */
export const CHUNK_SIZE = 1800;

/** UTF-8 length of one code point. */
function utf8Bytes(codePoint: number): number {
  return codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
}

/**
 * Splits a value into chunks of at most `CHUNK_SIZE` UTF-8 bytes, never
 * inside a character (#270 review): a session's user record can carry a
 * name in CJK or an emoji, which is 3–4 bytes a character, and slicing by
 * string length would both overshoot the limit and cut an emoji's two
 * halves into different chunks. Exported for the tests.
 */
export function splitForKeychain(value: string): string[] {
  const chunks: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of value) {
    const size = utf8Bytes(char.codePointAt(0)!);
    if (bytes + size > CHUNK_SIZE) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Every key this module has written, each with the most chunks ever stored
 * under it. Secure storage cannot list its own keys, so this is how a
 * reinstall finds everything to delete — and how a clean-up finds every chunk
 * even when a value's own count was never written or cannot be read (a crash
 * between writing the chunks and writing the count). Exported for the tests.
 */
export const MANIFEST_KEY = "forme.secure.keys";

type Manifest = Record<string, number>;

/** expo-secure-store accepts only these characters in a key. */
const VALID_KEY = /^[A-Za-z0-9._-]+$/;

function checkKey(key: string): void {
  if (!VALID_KEY.test(key)) throw new Error(`secure-storage: invalid key "${key}"`);
}

/**
 * A read that fails — after an Android restore-from-backup, Keystore entries
 * can no longer be decrypted and the read throws — is a miss, not a crash.
 * Signing in again is the right outcome; failing to launch is not.
 */
async function readRaw(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    return null;
  }
}

/** Whether the item is gone afterwards. Deleting a missing item succeeds. */
async function deleteRaw(key: string): Promise<boolean> {
  try {
    await SecureStore.deleteItemAsync(key, OPTIONS);
    return true;
  } catch {
    return false;
  }
}

/** `null` when the manifest exists but cannot be read or parsed. */
async function readManifest(): Promise<Manifest | null> {
  let raw: string | null;
  try {
    raw = await SecureStore.getItemAsync(MANIFEST_KEY, OPTIONS);
  } catch {
    return null;
  }
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const manifest: Manifest = {};
    for (const [key, chunks] of Object.entries(parsed)) {
      // One bad entry makes the whole list untrustworthy: skipping it would
      // let a reinstall purge "everything" while missing exactly the key the
      // entry named, and then trust what that key still holds (#270 review).
      if (!VALID_KEY.test(key) || !Number.isInteger(chunks) || (chunks as number) < 0) return null;
      manifest[key] = chunks as number;
    }
    return manifest;
  } catch {
    return null;
  }
}

/**
 * Deletes a value: its count first, so a reader sees nothing from that
 * moment, then every chunk up to the larger of its own count and the most
 * the manifest says were ever written. Returns whether every delete landed.
 */
async function removeChunked(key: string, recordedChunks: number): Promise<boolean> {
  const head = Number(await readRaw(key));
  const chunks = Math.max(Number.isInteger(head) ? head : 0, recordedChunks);
  let ok = await deleteRaw(key);
  for (let i = 0; i < chunks; i++) ok = (await deleteRaw(`${key}.${i}`)) && ok;
  return ok;
}

/**
 * Keychain items survive an app being deleted; AsyncStorage does not. Without
 * this, reinstalling the app — or handing the phone to someone who reinstalls
 * it — would bring back the previous owner's session. The store's
 * `secureStoreClaimed` flag lives in AsyncStorage, so it is missing exactly
 * when the app is fresh, and that is when everything this module ever wrote
 * gets deleted. Runs once per launch, before the first read or write.
 *
 * If any delete fails, or the manifest cannot be read, the flag is NOT set, so
 * the next launch tries again — and for this launch, nothing already in the
 * Keychain is trusted: reads return nothing until this launch has written or
 * removed that key itself. A leftover session is never handed back as if it
 * were this install's.
 */
let claimed: Promise<void> | null = null;
let distrustLeftovers = false;
const writtenThisLaunch = new Set<string>();

/**
 * How this file reaches the store's `secureStoreClaimed` flag. The store hands
 * it over at start-up (`connectClaimFlag`, called from store/useAppStore.ts)
 * rather than this file importing the store: the store routes the profile
 * through this file (#189), and an import each way would be a require cycle.
 */
export type ClaimFlag = {
  /** Resolves once the store has read its file, where the flag lives. */
  hydrated: () => Promise<void>;
  isClaimed: () => boolean;
  claim: () => void;
};

let provideClaimFlag!: (flag: ClaimFlag) => void;
const claimFlag = new Promise<ClaimFlag>((resolve) => {
  provideClaimFlag = resolve;
});

export function connectClaimFlag(flag: ClaimFlag): void {
  provideClaimFlag(flag);
}

function claimOnce(): Promise<void> {
  claimed ??= (async () => {
    const flag = await claimFlag;
    await flag.hydrated();
    if (flag.isClaimed()) return;
    const manifest = await readManifest();
    let ok = manifest !== null;
    for (const [key, chunks] of Object.entries(manifest ?? {})) ok = (await removeChunked(key, chunks)) && ok;
    if (ok) ok = await deleteRaw(MANIFEST_KEY);
    if (ok) flag.claim();
    else distrustLeftovers = true;
  })();
  return claimed;
}

/** Tests only: forget that this launch already ran the reinstall check. */
export function resetSecureStorageForTests(): void {
  claimed = null;
  distrustLeftovers = false;
  writtenThisLaunch.clear();
}

/**
 * One value spans several keys, so two overlapping writes — a token refresh
 * landing during sign-out — could interleave chunks. Every operation queues
 * behind the one before it instead.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialised<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function readChunked(key: string): Promise<string | null> {
  checkKey(key);
  await claimOnce();
  if (distrustLeftovers && !writtenThisLaunch.has(key)) return null;
  const head = await readRaw(key);
  if (head === null) return null;
  const count = Number(head);
  if (!Number.isInteger(count) || count < 0) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await readRaw(`${key}.${i}`);
    // A missing chunk means a half-written value. Treat it as no session
    // rather than hand the auth client a truncated token.
    if (part === null) return null;
    parts.push(part);
  }
  return parts.join("");
}

async function writeChunked(key: string, value: string): Promise<void> {
  checkKey(key);
  await claimOnce();
  const manifest = (await readManifest()) ?? {};
  const recorded = manifest[key] ?? 0;
  const chunks = splitForKeychain(value);
  const count = chunks.length;
  // The manifest learns about every chunk before it exists, so no crash can
  // leave a chunk nothing knows to delete.
  if (!(key in manifest) || count > recorded) {
    await SecureStore.setItemAsync(MANIFEST_KEY, JSON.stringify({ ...manifest, [key]: Math.max(count, recorded) }), OPTIONS);
  }
  // Drop the old value first so a shorter new one leaves no stale tail.
  await removeChunked(key, recorded);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, chunks[i], OPTIONS);
  }
  // The count goes last: until it is written, a reader sees no value at all.
  await SecureStore.setItemAsync(key, String(count), OPTIONS);
  writtenThisLaunch.add(key);
}

/**
 * Written over a value's count when its delete fails. It is not a number, so
 * `readChunked` returns nothing for it — the session is unreadable even
 * though its pieces could not be deleted yet. The next write or the next
 * reinstall purge removes them.
 */
const REMOVED = "removed";

/**
 * Sign-out's delete. A delete that fails must not leave the session readable
 * on the next launch — that would sign the person back in after they signed
 * out (#270 review). So a failed delete falls back to overwriting the count;
 * if even that fails, the error reaches the caller rather than a quiet
 * success.
 */
async function removeItem(key: string): Promise<void> {
  checkKey(key);
  await claimOnce();
  const manifest = (await readManifest()) ?? {};
  writtenThisLaunch.add(key);
  if (await removeChunked(key, manifest[key] ?? 0)) return;
  await SecureStore.setItemAsync(key, REMOVED, OPTIONS);
}

/**
 * The skin profile on a phone (#189): concerns, skin type, sensitivity and
 * pregnancy status, which is health data. It sits in the Keychain with the
 * session's setting (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`), so it never rides out
 * in a backup, rather than in AsyncStorage's plain-text file. A profile is a
 * couple of hundred bytes, so it is one item, not chunks.
 *
 * It skips `claimOnce` and the manifest on purpose. The store reads it while it
 * hydrates, and `claimOnce` waits for that hydration, so going through it would
 * deadlock; and a reinstall purge that ran after the store had already moved a
 * profile here on an upgrade would delete it. The store covers the reinstall
 * case itself: it reads this item only when its own file exists, which it never
 * does on a fresh install, and its first write replaces or removes a leftover.
 * `formeStorageFor` in store/useAppStore.ts is the only caller.
 */
export const PROFILE_KEY = "forme.profile";

/** `ok: false` when the Keychain refused the read (e.g. a locked phone). */
export type SecureProfileRead = { ok: true; value: string | null } | { ok: false };

export async function readSecureProfile(): Promise<SecureProfileRead> {
  try {
    return { ok: true, value: await SecureStore.getItemAsync(PROFILE_KEY, OPTIONS) };
  } catch {
    return { ok: false };
  }
}

/** Whether the Keychain now holds `value`. */
export async function writeSecureProfile(value: string): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(PROFILE_KEY, value, OPTIONS);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether no profile can be read back afterwards. A delete that fails falls
 * back to overwriting it with a value that isn't a profile, as sign-out does
 * for the session.
 */
export async function removeSecureProfile(): Promise<boolean> {
  if (await deleteRaw(PROFILE_KEY)) return true;
  return writeSecureProfile(REMOVED);
}

const nativeStorage: SessionStorage = {
  getItem: (key) => serialised(() => readChunked(key)),
  setItem: (key, value) => serialised(() => writeChunked(key, value)),
  removeItem: (key) => serialised(() => removeItem(key)),
};

/** Web: memory only, never `localStorage` — see docs/device-storage-policy.md. */
export function createMemoryStorage(): SessionStorage {
  const values = new Map<string, string>();
  return {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

/** Picks the session store for a platform. Exported so the web branch is testable. */
export function authStorageFor(os: typeof Platform.OS): SessionStorage {
  return os === "web" ? createMemoryStorage() : nativeStorage;
}

/** The storage `lib/supabase.ts` hands the auth client. */
export const authStorage: SessionStorage = authStorageFor(Platform.OS);
