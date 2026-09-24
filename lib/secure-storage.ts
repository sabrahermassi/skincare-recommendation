import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { useAppStore } from "@/store/useAppStore";

/**
 * Where the sign-in session lives (#218). The only file allowed to import
 * `expo-secure-store` — see docs/device-storage-policy.md, row 1, and the
 * allowlist in eslint.config.js.
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
 * under the key itself. Exported for the tests.
 */
export const CHUNK_SIZE = 1800;

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
      if (VALID_KEY.test(key) && Number.isInteger(chunks) && (chunks as number) >= 0) manifest[key] = chunks as number;
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

function whenStoreHydrated(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
}

function claimOnce(): Promise<void> {
  claimed ??= (async () => {
    await whenStoreHydrated();
    if (useAppStore.getState().secureStoreClaimed) return;
    const manifest = await readManifest();
    let ok = manifest !== null;
    for (const [key, chunks] of Object.entries(manifest ?? {})) ok = (await removeChunked(key, chunks)) && ok;
    if (ok) ok = await deleteRaw(MANIFEST_KEY);
    if (ok) useAppStore.getState().claimSecureStore();
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
  const count = Math.ceil(value.length / CHUNK_SIZE);
  // The manifest learns about every chunk before it exists, so no crash can
  // leave a chunk nothing knows to delete.
  if (!(key in manifest) || count > recorded) {
    await SecureStore.setItemAsync(MANIFEST_KEY, JSON.stringify({ ...manifest, [key]: Math.max(count, recorded) }), OPTIONS);
  }
  // Drop the old value first so a shorter new one leaves no stale tail.
  await removeChunked(key, recorded);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), OPTIONS);
  }
  // The count goes last: until it is written, a reader sees no value at all.
  await SecureStore.setItemAsync(key, String(count), OPTIONS);
  writtenThisLaunch.add(key);
}

async function removeItem(key: string): Promise<void> {
  checkKey(key);
  await claimOnce();
  const manifest = (await readManifest()) ?? {};
  await removeChunked(key, manifest[key] ?? 0);
  writtenThisLaunch.add(key);
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
