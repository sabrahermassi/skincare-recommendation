/**
 * Where the sign-in session lives (#218, docs/device-storage-policy.md row 1).
 * `expo-secure-store` is replaced with an in-memory Keychain so these tests
 * can see exactly which keys were written, with which options.
 */
const mockKeychain = new Map<string, string>();
const mockFailingReads = new Set<string>();
const mockWriteOptions: unknown[] = [];

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 42,
  getItemAsync: jest.fn(async (key: string) => {
    if (mockFailingReads.has(key)) throw new Error("Could not decrypt");
    return mockKeychain.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string, options: unknown) => {
    mockKeychain.set(key, value);
    mockWriteOptions.push(options);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockKeychain.delete(key);
  }),
}));

import {
  CHUNK_SIZE,
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

  it("keeps the session on an ordinary relaunch", async () => {
    await authStorage.setItem(KEY, "mine");
    resetSecureStorageForTests();
    expect(await authStorage.getItem(KEY)).toBe("mine");
  });

  it("keeps the install marker through erase-everything, so it does not sign out by accident", () => {
    useAppStore.getState().resetApp();
    expect(useAppStore.getState().secureStoreClaimed).toBe(true);
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
