/**
 * When the shelf syncs (#223): on sign-in, after a change, and never by
 * dropping a queued write when there is no signal. The network is faked;
 * the store and the rules are real.
 */
import type { Session } from "@supabase/supabase-js";

const mockFetchShelf = jest.fn();
const mockPushShelf = jest.fn();
jest.mock("@/data/api", () => ({
  fetchShelf: () => mockFetchShelf(),
  pushShelf: (...args: unknown[]) => mockPushShelf(...args),
}));
const mockCalls: string[] = [];
jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      signOut: async () => {
        mockCalls.push("signOut");
        return { error: null };
      },
    },
  },
}));

const { useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");
const { resetShelfSyncForTests, startShelfSync, syncShelf } = require("@/lib/shelf-sync") as typeof import("@/lib/shelf-sync");
const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");

const s = () => useAppStore.getState();
const session = (id: string) => ({ user: { id } }) as unknown as Session;
const OFFLINE = { ok: false, failure: { kind: "offline" } };

beforeEach(() => {
  jest.clearAllMocks();
  resetShelfSyncForTests();
  useAuth.setState({ status: "loading", session: null });
  useAppStore.setState({ savedProducts: [], savedIngredients: [], shelfOwner: null, shelfQueue: [], legacyShelfMigrated: false });
  mockPushShelf.mockResolvedValue({ ok: true, value: undefined });
  mockFetchShelf.mockResolvedValue({ ok: true, value: { products: [], ingredients: [] } });
});

describe("a sync", () => {
  it("pushes the queue, then shows the account's shelf", async () => {
    s().adoptShelf("user-a");
    s().saveProduct("mine");
    mockFetchShelf.mockResolvedValue({
      ok: true,
      value: { products: [{ id: "mine", savedAt: 1 }, { id: "from-the-ipad", savedAt: 2 }], ingredients: [] },
    });

    await expect(syncShelf()).resolves.toBe(true);

    expect(mockPushShelf).toHaveBeenCalledWith("user-a", expect.objectContaining({ saveProducts: [expect.objectContaining({ id: "mine" })] }));
    expect(s().savedProducts.map((p) => p.id)).toEqual(["mine", "from-the-ipad"]);
    expect(s().shelfQueue).toEqual([]);
  });

  it("keeps the queue and the cached change when there is no signal", async () => {
    s().adoptShelf("user-a");
    s().saveProduct("in-the-shop");
    mockPushShelf.mockResolvedValue(OFFLINE);

    await expect(syncShelf()).resolves.toBe(false);

    expect(s().savedProducts.map((p) => p.id)).toEqual(["in-the-shop"]);
    expect(s().shelfQueue).toHaveLength(1);
    expect(mockFetchShelf).not.toHaveBeenCalled();
  });

  it("sends the same queue again next time, and then it lands", async () => {
    s().adoptShelf("user-a");
    s().saveProduct("in-the-shop");
    mockPushShelf.mockResolvedValueOnce(OFFLINE);
    await syncShelf();
    mockFetchShelf.mockResolvedValue({ ok: true, value: { products: [{ id: "in-the-shop", savedAt: 1 }], ingredients: [] } });

    await expect(syncShelf()).resolves.toBe(true);

    expect(mockPushShelf).toHaveBeenCalledTimes(2);
    expect(mockPushShelf.mock.calls[1][1]).toEqual(mockPushShelf.mock.calls[0][1]);
    expect(s().shelfQueue).toEqual([]);
  });

  it("does nothing for a guest", async () => {
    await expect(syncShelf()).resolves.toBe(true);
    expect(mockPushShelf).not.toHaveBeenCalled();
    expect(mockFetchShelf).not.toHaveBeenCalled();
  });
});

describe("following the account", () => {
  it("carries a pre-accounts shelf into the account on the first sign-in, and syncs", async () => {
    jest.useFakeTimers();
    try {
      useAppStore.setState({ savedProducts: [{ id: "legacy", savedAt: 5, formulaFetchedAt: "2026-07-01" }] });
      const stop = startShelfSync();
      useAuth.setState({ status: "signed-in", session: session("user-a") });
      await jest.runOnlyPendingTimersAsync();

      expect(s().shelfOwner).toBe("user-a");
      expect(mockPushShelf).toHaveBeenCalledWith(
        "user-a",
        expect.objectContaining({
          saveProducts: [{ id: "legacy", savedAt: 5, formulaFetchedAt: "2026-07-01", fresh: false }],
        }),
      );
      stop();
    } finally {
      jest.useRealTimers();
    }
  });

  it("clears the account's shelf when the session ends, and leaves a guest's alone", () => {
    const stop = startShelfSync();
    useAppStore.setState({ savedProducts: [{ id: "guest-legacy", savedAt: 1 }] });
    useAuth.setState({ status: "signed-out", session: null });
    expect(s().savedProducts.map((p) => p.id)).toEqual(["guest-legacy"]);

    useAuth.setState({ status: "signed-in", session: session("user-a") });
    useAuth.setState({ status: "signed-out", session: null });
    expect(s().shelfOwner).toBeNull();
    expect(s().savedProducts).toEqual([]);
    stop();
  });

  it("pushes what is still queued before a deliberate sign-out ends the session", async () => {
    const { signOut } = require("@/lib/auth") as typeof import("@/lib/auth");
    mockCalls.length = 0;
    mockPushShelf.mockImplementation(async () => {
      mockCalls.push("push");
      return { ok: true, value: undefined };
    });
    const stop = startShelfSync();
    s().adoptShelf("user-a");
    s().saveProduct("last-minute");

    await signOut();

    expect(mockCalls).toEqual(["push", "signOut"]);
    expect(mockPushShelf).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({ saveProducts: [expect.objectContaining({ id: "last-minute" })] }),
    );
    stop();
  });
});
