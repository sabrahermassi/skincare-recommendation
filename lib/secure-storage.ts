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
 * is split across numbered keys, with the count stored under the key itself.
 * Exported for the tests.
 */
export const CHUNK_SIZE = 1800;

/**
 * Every key this module has written, so a reinstall can delete them all:
 * secure storage cannot list its own keys.
 */
const MANIFEST_KEY = "forme.secure.keys";

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

async function deleteRaw(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key, OPTIONS);
  } catch {
    // Nothing to delete, or nothing readable to delete. Either way it is gone.
  }
}

async function readManifest(): Promise<string[]> {
  const raw = await readRaw(MANIFEST_KEY);
  if (!raw) return [];
  try {
    const keys: unknown = JSON.parse(raw);
    return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

async function removeChunked(key: string): Promise<void> {
  const count = Number(await readRaw(key));
  await deleteRaw(key);
  for (let i = 0; i < (Number.isInteger(count) ? count : 0); i++) await deleteRaw(`${key}.${i}`);
}

/**
 * Keychain items survive an app being deleted; AsyncStorage does not. Without
 * this, reinstalling the app — or handing the phone to someone who reinstalls
 * it — would bring back the previous owner's session. The store's
 * `secureStoreClaimed` flag lives in AsyncStorage, so it is missing exactly
 * when the app is fresh, and that is when everything this module ever wrote
 * gets deleted. Runs once per launch, before the first read or write.
 */
let claimed: Promise<void> | null = null;

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
    for (const key of await readManifest()) await removeChunked(key);
    await deleteRaw(MANIFEST_KEY);
    useAppStore.getState().claimSecureStore();
  })();
  return claimed;
}

/** Tests only: forget that this launch already ran the reinstall check. */
export function resetSecureStorageForTests(): void {
  claimed = null;
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
  const manifest = await readManifest();
  if (!manifest.includes(key)) {
    await SecureStore.setItemAsync(MANIFEST_KEY, JSON.stringify([...manifest, key]), OPTIONS);
  }
  // Drop the old value first so a shorter new one leaves no stale tail.
  await removeChunked(key);
  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), OPTIONS);
  }
  // The count goes last: until it is written, a reader sees no value at all.
  await SecureStore.setItemAsync(key, String(count), OPTIONS);
}

const nativeStorage: SessionStorage = {
  getItem: (key) => serialised(() => readChunked(key)),
  setItem: (key, value) => serialised(() => writeChunked(key, value)),
  removeItem: (key) =>
    serialised(async () => {
      checkKey(key);
      await claimOnce();
      await removeChunked(key);
    }),
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
