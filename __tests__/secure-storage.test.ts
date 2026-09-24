/**
 * Where the sign-in session lives (#218, docs/device-storage-policy.md row 1).
 * `expo-secure-store` is replaced with an in-memory Keychain so these tests
 * can see exactly which keys were written, with which options.
 */
const mockKeychain = new Map<string, string>();
const mockFailingReads = new Set<string>();
const mockWriteOptions: unknown[] = [];
const mockFailingDeletes = new Set<string>();
const mockFailingWrites = new Set<string>();

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 42,
  getItemAsync: jest.fn(async (key: string) => {
    if (mockFailingReads.has(key)) throw new Error("Could not decrypt");
    return mockKeychain.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string, options: unknown) => {
    if (mockFailingWrites.has(key)) throw new Error("Keychain busy");
    mockKeychain.set(key, value);
    mockWriteOptions.push(options);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    if (mockFailingDeletes.has(key)) throw new Error("Keychain busy");
    mockKeychain.delete(key);
  }),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  CHUNK_SIZE,
  MANIFEST_KEY,
  authStorage,
  authStorageFor,
  createMemoryStorage,
  resetSecureStorageForTests,
} from "@/lib/secure-storage";
import { useAppStore } from "@/store/useAppStore";

const KEY = "sb-project-auth-token";

beforeEach(() => {
  mockKeychain.clear();
  mockFailingReads.clear();
  mockWriteOptions.length = 0;
  mockFailingDeletes.clear();
  mockFailingWrites.clear();
  resetSecureStorageForTests();
  useAppStore.setState({ secureStoreClaimed: true });
});

describe("the session on a phone", () => {
  it("round-trips a session too large for one Keychain item", async () => {
    const session = "x".repeat(CHUNK_SIZE * 2 + 17);
    await authStorage.setItem(KEY, session);
    expect(await authStorage.getItem(KEY)).toBe(session);
    for (const [key, value] of mockKeychain) {
      if (key.startsWith(`${KEY}.`)) expect(value.length).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });

  it("keeps every item on this device only, while unlocked", async () => {
    await authStorage.setItem(KEY, "session");
    expect(mockWriteOptions.length).toBeGreaterThan(0);
    for (const options of mockWriteOptions) expect(options).toEqual({ keychainAccessible: 42 });
  });

  it("leaves no stale tail when a shorter session replaces a longer one", async () => {
    await authStorage.setItem(KEY, "a".repeat(CHUNK_SIZE * 3));
    await authStorage.setItem(KEY, "short");
    expect(await authStorage.getItem(KEY)).toBe("short");
    expect(mockKeychain.has(`${KEY}.1`)).toBe(false);
    expect(mockKeychain.has(`${KEY}.2`)).toBe(false);
  });

  it("deletes every piece on sign-out", async () => {
    await authStorage.setItem(KEY, "b".repeat(CHUNK_SIZE * 2));
    await authStorage.removeItem(KEY);
    expect(await authStorage.getItem(KEY)).toBeNull();
    expect([...mockKeychain.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
  });

  it("treats an unreadable Keychain item as signed out, not a crash", async () => {
    await authStorage.setItem(KEY, "session");
    mockFailingReads.add(KEY);
    await expect(authStorage.getItem(KEY)).resolves.toBeNull();
  });

  it("treats a half-written session as no session", async () => {
    await authStorage.setItem(KEY, "c".repeat(CHUNK_SIZE * 2));
    mockKeychain.delete(`${KEY}.1`);
    expect(await authStorage.getItem(KEY)).toBeNull();
  });

  // #270 review, round 2: a sign-out whose delete failed used to report
  // success and leave the session readable on the next launch.
  it("leaves nothing readable when a sign-out's delete fails", async () => {
    await authStorage.setItem(KEY, "f".repeat(CHUNK_SIZE * 2));
    mockFailingDeletes.add(KEY);
    mockFailingDeletes.add(`${KEY}.0`);
    await authStorage.removeItem(KEY);

    resetSecureStorageForTests(); // the next launch
    expect(await authStorage.getItem(KEY)).toBeNull();

    // And the next sign-in still works over the leftovers.
    mockFailingDeletes.clear();
    await authStorage.setItem(KEY, "new session");
    expect(await authStorage.getItem(KEY)).toBe("new session");
  });

  it("tells the caller when a sign-out could neither delete nor overwrite", async () => {
    await authStorage.setItem(KEY, "session");
    mockFailingDeletes.add(KEY);
    mockFailingWrites.add(KEY);
    await expect(authStorage.removeItem(KEY)).rejects.toThrow();
  });

  // #270 review: a crash after the chunks but before the count left chunks
  // that nothing knew to delete.
  it("deletes chunks whose count was never written", async () => {
    await authStorage.setItem(KEY, "e".repeat(CHUNK_SIZE * 3));
    mockKeychain.delete(KEY);
    await authStorage.removeItem(KEY);
    expect([...mockKeychain.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
  });

  it("does not interleave a write with a sign-out that overlaps it", async () => {
    await authStorage.setItem(KEY, "old");
    await Promise.all([authStorage.setItem(KEY, "d".repeat(CHUNK_SIZE * 2)), authStorage.removeItem(KEY)]);
    expect(await authStorage.getItem(KEY)).toBeNull();
    expect([...mockKeychain.keys()].filter((k) => k.startsWith(KEY))).toEqual([]);
  });
});

describe("a reinstalled app", () => {
  it("deletes a session an earlier install left in the Keychain", async () => {
    await authStorage.setItem(KEY, "previous owner");
    // A fresh install: AsyncStorage is empty, so the flag is back to false,
    // while the Keychain still holds what the old install wrote.
    useAppStore.setState({ secureStoreClaimed: false });
    resetSecureStorageForTests();

    expect(await authStorage.getItem(KEY)).toBeNull();
    expect(mockKeychain.size).toBe(0);
    expect(useAppStore.getState().secureStoreClaimed).toBe(true);
  });

  // #270 review: a failed delete used to be swallowed and the install marked
  // clean anyway, so the old session survived and was never retried.
  it("retries next launch when a delete fails, and never hands back the old session meanwhile", async () => {
    await authStorage.setItem(KEY, "previous owner");
    useAppStore.setState({ secureStoreClaimed: false });
    resetSecureStorageForTests();
    mockFailingDeletes.add(`${KEY}.0`);

    expect(await authStorage.getItem(KEY)).toBeNull();
    expect(useAppStore.getState().secureStoreClaimed).toBe(false);

    // A sign-in during the same launch is still readable.
    await authStorage.setItem("other-key", "new session");
    expect(await authStorage.getItem("other-key")).toBe("new session");

    // Next launch, the delete works: the leftover goes and the install is claimed.
    mockFailingDeletes.clear();
    resetSecureStorageForTests();
    expect(await authStorage.getItem(KEY)).toBeNull();
    expect(mockKeychain.has(`${KEY}.0`)).toBe(false);
    expect(useAppStore.getState().secureStoreClaimed).toBe(true);
  });

  it("does not trust leftovers when the list of what to delete cannot be read", async () => {
    await authStorage.setItem(KEY, "previous owner");
    useAppStore.setState({ secureStoreClaimed: false });
    resetSecureStorageForTests();
    mockFailingReads.add(MANIFEST_KEY);

    expect(await authStorage.getItem(KEY)).toBeNull();
    expect(useAppStore.getState().secureStoreClaimed).toBe(false);
  });

  it("keeps the session on an ordinary relaunch", async () => {
    await authStorage.setItem(KEY, "mine");
    resetSecureStorageForTests();
    expect(await authStorage.getItem(KEY)).toBe("mine");
  });

  // #270 review: an unawaited clear raced the write that restored the flag,
  // so the disk could end up without it. Pinned on disk, not just in memory.
  it("keeps the install marker through erase-everything, on disk too", async () => {
    useAppStore.getState().completeOnboarding();
    useAppStore.getState().resetApp();
    expect(useAppStore.getState().secureStoreClaimed).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stored = JSON.parse((await AsyncStorage.getItem("forme-store")) ?? "null");
    expect(stored?.state.secureStoreClaimed).toBe(true);
    expect(stored?.state.hasSeenOnboarding).toBe(false);
  });
});

describe("the session on web", () => {
  it("never reaches localStorage or the Keychain", async () => {
    const localStorage = { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() };
    Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });
    try {
      const web = authStorageFor("web");
      await web.setItem(KEY, "web session");
      expect(await web.getItem(KEY)).toBe("web session");
      await web.removeItem(KEY);
      expect(await web.getItem(KEY)).toBeNull();
      expect(localStorage.setItem).not.toHaveBeenCalled();
      expect(localStorage.getItem).not.toHaveBeenCalled();
      expect(mockKeychain.size).toBe(0);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });

  it("forgets the session with the page, since memory is all it has", async () => {
    const tab = createMemoryStorage();
    await tab.setItem(KEY, "session");
    expect(await createMemoryStorage().getItem(KEY)).toBeNull();
  });
});
