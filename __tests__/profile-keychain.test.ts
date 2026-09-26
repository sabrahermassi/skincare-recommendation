/**
 * #189: on a phone the skin profile, pregnancy status included, lives in the
 * Keychain, not in AsyncStorage's plain-text file. `expo-secure-store` is an
 * in-memory Keychain here so the tests can see what is where.
 */
const mockKeychain = new Map<string, string>();
const mockFail = { reads: false, writes: false, deletes: false };
// The app's AsyncStorage file, kept here so it outlives each simulated launch.
const mockFiles = new Map<string, string>();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockFiles.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockFiles.set(key, value);
    },
    removeItem: async (key: string) => {
      mockFiles.delete(key);
    },
  },
}));

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 42,
  getItemAsync: jest.fn(async (key: string) => {
    if (mockFail.reads) throw new Error("Keychain locked");
    return mockKeychain.get(key) ?? null;
  }),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    if (mockFail.writes) throw new Error("Keychain busy");
    mockKeychain.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    if (mockFail.deletes) throw new Error("Keychain busy");
    mockKeychain.delete(key);
  }),
}));

import * as SecureStore from "expo-secure-store";

import type { SkinProfile } from "@/data/types";
import { PROFILE_KEY } from "@/lib/secure-storage";
import { EMPTY_PROFILE, formeStorageFor, HISTORY_MAX_AGE_DAYS, type useAppStore as AppStore } from "@/store/useAppStore";

const KEY = "forme-store";

const PROFILE: SkinProfile = {
  concerns: ["acne-prone", "redness"],
  baseSkinType: "oily",
  sensitivity: "some",
  pregnancyStatus: "pregnant",
};

/** What a phone on the version before this one has on disk. */
function v8File(profile: SkinProfile = PROFILE) {
  return JSON.stringify({
    state: {
      profile,
      hasSeenOnboarding: true,
      savedProducts: [],
      savedIngredients: [],
      history: [],
      secureStoreClaimed: true,
      shelfOwner: null,
      shelfQueue: [],
      parkedShelf: null,
      journalStarted: [],
    },
    version: 8,
  });
}

function file(): { state: Record<string, unknown>; version: number } | null {
  const raw = mockFiles.get(KEY);
  return raw === undefined ? null : JSON.parse(raw);
}

const keychainProfile = () => {
  const raw = mockKeychain.get(PROFILE_KEY);
  return raw === undefined ? undefined : JSON.parse(raw);
};

/**
 * A cold start: a fresh copy of the store, reading the file and the Keychain
 * left by the launches before it.
 */
async function launch(): Promise<typeof AppStore> {
  let store!: typeof AppStore;
  jest.isolateModules(() => {
    store = (require("@/store/useAppStore") as typeof import("@/store/useAppStore")).useAppStore;
  });
  if (!store.persist.hasHydrated()) {
    await new Promise<void>((resolve) => store.persist.onFinishHydration(() => resolve()));
  }
  return store;
}

/** Lets a write the store started (and didn't await) land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockKeychain.clear();
  mockFiles.clear();
  mockFail.reads = false;
  mockFail.writes = false;
  mockFail.deletes = false;
  jest.mocked(SecureStore.setItemAsync).mockClear();
});

describe("upgrading from the version before", () => {
  it("moves the profile into the Keychain and deletes the plain-text copy, on the first launch", async () => {
    mockFiles.set(KEY, v8File());
    const store = await launch();

    expect(store.getState().profile).toEqual(PROFILE);
    expect(keychainProfile()).toEqual(PROFILE);
    expect(file()?.version).toBe(9);
    expect(file()?.state).not.toHaveProperty("profile");
    expect(file()?.state.hasSeenOnboarding).toBe(true);
    expect(mockFiles.get(KEY)).not.toContain("pregnant");
  });

  it("reads the moved profile back on the next launch", async () => {
    mockFiles.set(KEY, v8File());
    await launch();

    const next = await launch();
    expect(next.getState().profile).toEqual(PROFILE);
    expect(next.getState().hasSeenOnboarding).toBe(true);
  });

  it("keeps the plain copy when the Keychain refuses the write, so nothing is lost", async () => {
    mockFiles.set(KEY, v8File());
    mockFail.writes = true;
    const store = await launch();

    expect(store.getState().profile).toEqual(PROFILE);
    expect(file()?.state.profile).toEqual(PROFILE);

    // The next launch that can write finishes the move.
    mockFail.writes = false;
    const next = await launch();
    await next.getState().setProfile({});
    expect(next.getState().profile).toEqual(PROFILE);
    expect(keychainProfile()).toEqual(PROFILE);
    expect(file()?.state).not.toHaveProperty("profile");
  });
});

describe("launching", () => {
  it("starts with an empty profile when the Keychain holds none, rather than crashing", async () => {
    mockFiles.set(KEY, v8File());
    await launch();
    mockKeychain.delete(PROFILE_KEY);

    const next = await launch();
    expect(next.getState().profile).toEqual(EMPTY_PROFILE);
    expect(next.getState().hasSeenOnboarding).toBe(true);
  });

  it.each([["not json"], ["removed"], ['{"concerns":"acne"}'], ["[]"]])(
    "treats a corrupt Keychain value (%s) as no profile",
    async (corrupt: string) => {
      mockFiles.set(KEY, v8File());
      await launch();
      mockKeychain.set(PROFILE_KEY, corrupt);

      const next = await launch();
      expect(next.getState().profile).toEqual(EMPTY_PROFILE);
      expect(next.getState().hasSeenOnboarding).toBe(true);
    },
  );

  it("works on a fresh install, with no file and nothing in the Keychain", async () => {
    const store = await launch();
    expect(store.getState().profile).toEqual(EMPTY_PROFILE);

    await store.getState().setProfile(PROFILE);
    expect(keychainProfile()).toEqual(PROFILE);
    expect(file()?.state).not.toHaveProperty("profile");
    expect((await launch()).getState().profile).toEqual(PROFILE);
  });

  it("never brings back a previous install's profile, and clears it on the first write", async () => {
    mockKeychain.set(PROFILE_KEY, JSON.stringify(PROFILE));

    const store = await launch();
    expect(store.getState().profile).toEqual(EMPTY_PROFILE);

    await store.getState().completeOnboarding();
    expect(mockKeychain.has(PROFILE_KEY)).toBe(false);
  });

  it(`drops history older than ${HISTORY_MAX_AGE_DAYS} days as the app starts`, async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const seen = (id: string, daysAgo: number) => ({
      id,
      known: true,
      firstSeenAt: Date.now() - daysAgo * DAY,
      lastSeenAt: Date.now() - daysAgo * DAY,
      seenCount: 1,
      scoreAtView: 70,
      warningsAtView: 0,
    });
    const stored = JSON.parse(v8File());
    stored.state.history = [seen("recent", 3), seen("old", HISTORY_MAX_AGE_DAYS + 5)];
    mockFiles.set(KEY, JSON.stringify(stored));

    const store = await launch();
    expect(store.getState().history.map((h) => h.id)).toEqual(["recent"]);
    await settle();
    expect((file()?.state.history as { id: string }[]).map((h) => h.id)).toEqual(["recent"]);
  });

  it("does not delete the profile when the Keychain couldn't be read this launch", async () => {
    mockFiles.set(KEY, v8File());
    await launch();

    mockFail.reads = true;
    const locked = await launch();
    expect(locked.getState().profile).toEqual(EMPTY_PROFILE);
    await locked.getState().completeOnboarding();
    expect(keychainProfile()).toEqual(PROFILE);

    mockFail.reads = false;
    expect((await launch()).getState().profile).toEqual(PROFILE);
  });
});

describe("changing the profile", () => {
  it("writes an edit to the Keychain, never to the file", async () => {
    mockFiles.set(KEY, v8File());
    const store = await launch();

    await store.getState().setProfile({ sensitivity: "high" });
    expect(keychainProfile()).toEqual({ ...PROFILE, sensitivity: "high" });
    expect(file()?.state).not.toHaveProperty("profile");
  });

  it("leaves the Keychain alone when something else changes", async () => {
    mockFiles.set(KEY, v8File());
    const store = await launch();
    jest.mocked(SecureStore.setItemAsync).mockClear();

    await store.getState().recordView({ id: "p1", known: true, score: 70, warnings: 0 });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(file()?.state.history).toHaveLength(1);
  });

  it("deletes the Keychain copy when the profile is erased", async () => {
    mockFiles.set(KEY, v8File());
    const store = await launch();

    store.getState().resetApp();
    await settle();
    expect(mockKeychain.has(PROFILE_KEY)).toBe(false);
    expect((await launch()).getState().profile).toEqual(EMPTY_PROFILE);
  });

  it("still erases it when the Keychain refuses the delete", async () => {
    mockFiles.set(KEY, v8File());
    const store = await launch();

    mockFail.deletes = true;
    store.getState().resetApp();
    await settle();

    mockFail.deletes = false;
    expect((await launch()).getState().profile).toEqual(EMPTY_PROFILE);
  });

  it("still erases it when the Keychain refuses both the delete and the overwrite", async () => {
    mockFiles.set(KEY, v8File());
    const store = await launch();

    mockFail.deletes = true;
    mockFail.writes = true;
    store.getState().resetApp();
    await settle();

    mockFail.deletes = false;
    mockFail.writes = false;
    expect((await launch()).getState().profile).toEqual(EMPTY_PROFILE);
  });
});

describe("the storage underneath", () => {
  const written = (profile: SkinProfile) => JSON.stringify({ state: { profile, history: [] }, version: 9 });

  it("keeps the profile in the file on web, which has no Keychain", async () => {
    const web = formeStorageFor("web");
    await web.getItem(KEY);
    await web.setItem(KEY, written(PROFILE));

    expect(file()?.state.profile).toEqual(PROFILE);
    expect(mockKeychain.size).toBe(0);
  });

  it("puts two quick edits in the Keychain in the order they were made", async () => {
    const phone = formeStorageFor("ios");
    mockFiles.set(KEY, written(EMPTY_PROFILE));
    await phone.getItem(KEY);

    await Promise.all([
      phone.setItem(KEY, written({ ...PROFILE, sensitivity: "none" })),
      phone.setItem(KEY, written({ ...PROFILE, sensitivity: "high" })),
    ]);
    expect(keychainProfile().sensitivity).toBe("high");
  });

  it("leaves the Keychain alone for a write made before the file was read", async () => {
    const phone = formeStorageFor("ios");
    mockKeychain.set(PROFILE_KEY, JSON.stringify(PROFILE));

    await phone.setItem(KEY, written(EMPTY_PROFILE));
    expect(keychainProfile()).toEqual(PROFILE);
    expect(file()?.state).not.toHaveProperty("profile");
  });
});
