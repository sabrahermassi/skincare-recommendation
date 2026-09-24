import { applyOps, planPush, shelfAsSaves, type ShelfOp } from "@/lib/shelf";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The signed-in shelf's rules (#222, #223): what a push does, how the cache
 * is rebuilt, and when the store queues a change at all.
 */

const s = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    profile: EMPTY_PROFILE,
    savedProducts: [],
    savedIngredients: [],
    history: [],
    shelfOwner: null,
    shelfQueue: [],
    legacyShelfMigrated: false,
  });
});

describe("reducing a queue to one push", () => {
  it("keeps the first save's time when an item is saved twice", () => {
    const push = planPush([
      { kind: "save-product", id: "a", savedAt: 1 },
      { kind: "save-product", id: "a", savedAt: 5 },
    ]);
    expect(push.saveProducts).toEqual([{ id: "a", savedAt: 1, formulaFetchedAt: undefined, fresh: false }]);
    expect(push.deleteProducts).toEqual([]);
  });

  it("lets a removal beat a save made before it", () => {
    const push = planPush([
      { kind: "save-product", id: "a", savedAt: 1 },
      { kind: "remove-product", id: "a" },
    ]);
    expect(push.saveProducts).toEqual([]);
    expect(push.deleteProducts).toEqual(["a"]);
  });

  it("treats a save after a removal as a new row with its own time", () => {
    const push = planPush([
      { kind: "remove-product", id: "a" },
      { kind: "save-product", id: "a", savedAt: 9, formulaFetchedAt: "2026-09-01" },
    ]);
    expect(push.deleteProducts).toEqual(["a"]);
    expect(push.saveProducts).toEqual([{ id: "a", savedAt: 9, formulaFetchedAt: "2026-09-01", fresh: true }]);
  });

  it("does the same for ingredients", () => {
    const push = planPush([
      { kind: "save-ingredient", name: "niacinamide", savedAt: 1 },
      { kind: "remove-ingredient", name: "retinol" },
    ]);
    expect(push.saveIngredients).toEqual([{ name: "niacinamide", savedAt: 1, fresh: false }]);
    expect(push.deleteIngredients).toEqual(["retinol"]);
  });
});

describe("laying queued changes over the server's shelf", () => {
  it("keeps a save made while the sync was running, and honours a removal", () => {
    const shelf = applyOps(
      { products: [{ id: "a", savedAt: 1 }, { id: "b", savedAt: 2 }], ingredients: ["glycerin"] },
      [
        { kind: "save-product", id: "c", savedAt: 3 },
        { kind: "remove-product", id: "a" },
        { kind: "save-ingredient", name: "glycerin", savedAt: 4 },
      ],
    );
    expect(shelf.products.map((p) => p.id)).toEqual(["b", "c"]);
    expect(shelf.ingredients).toEqual(["glycerin"]);
  });
});

describe("a shelf from before accounts (#222)", () => {
  it("becomes saves that keep each product's time and formula version", () => {
    const ops = shelfAsSaves(
      { products: [{ id: "a", savedAt: 7, formulaFetchedAt: "2026-08-01" }], ingredients: ["x", "y"] },
      100,
    );
    expect(ops).toEqual([
      { kind: "save-product", id: "a", savedAt: 7, formulaFetchedAt: "2026-08-01" },
      { kind: "save-ingredient", name: "x", savedAt: 100 },
      { kind: "save-ingredient", name: "y", savedAt: 101 },
    ]);
  });

  it("is carried into the first account signed in on this device, once", () => {
    useAppStore.setState({ savedProducts: [{ id: "legacy", savedAt: 3 }], savedIngredients: ["niacinamide"] });
    s().adoptShelf("user-a");
    expect(s().shelfOwner).toBe("user-a");
    expect(s().legacyShelfMigrated).toBe(true);
    expect(s().shelfQueue.map((op) => op.kind)).toEqual(["save-product", "save-ingredient"]);
    // Still on screen while it syncs.
    expect(s().savedProducts.map((p) => p.id)).toEqual(["legacy"]);
  });

  it("never runs again, so a removal after signing in stays removed", () => {
    useAppStore.setState({ savedProducts: [{ id: "legacy", savedAt: 3 }] });
    s().adoptShelf("user-a");
    s().leaveShelf();
    useAppStore.setState({ savedProducts: [{ id: "legacy", savedAt: 3 }] }); // as if somehow left behind
    s().adoptShelf("user-a");
    expect(s().shelfQueue).toEqual([]);
    expect(s().savedProducts).toEqual([]);
  });

  it("does not touch the profile", () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["redness"] }, savedProducts: [{ id: "a", savedAt: 1 }] });
    s().adoptShelf("user-a");
    s().leaveShelf();
    expect(s().profile.concerns).toEqual(["redness"]);
  });
});

describe("what the store queues", () => {
  it("queues nothing for a guest", () => {
    s().saveProduct("a");
    s().toggleSavedIngredient("glycerin");
    expect(s().shelfQueue).toEqual([]);
  });

  it("queues every change to an account's shelf, removals included", () => {
    s().adoptShelf("user-a");
    s().saveProduct("a", "2026-09-01");
    s().toggleSaved("a");
    s().saveIngredient("glycerin");
    s().toggleSavedIngredient("glycerin");
    expect(s().shelfQueue.map((op) => op.kind)).toEqual([
      "save-product",
      "remove-product",
      "save-ingredient",
      "remove-ingredient",
    ]);
    expect(s().shelfQueue[0]).toMatchObject({ id: "a", formulaFetchedAt: "2026-09-01" });
  });

  it("puts an undone removal back with its original time", () => {
    s().adoptShelf("user-a");
    s().saveProduct("a");
    const original = s().savedProducts[0];
    s().toggleSaved("a");
    s().restoreSavedProduct(original);
    const push = planPush(s().shelfQueue);
    expect(push.saveProducts).toEqual([{ ...original, fresh: true }]);
  });

  it("erases the account's shelf too when the app is reset, and stays signed in", () => {
    s().adoptShelf("user-a");
    useAppStore.setState({ savedProducts: [{ id: "a", savedAt: 1 }], savedIngredients: ["x"], shelfQueue: [] });
    s().resetApp();
    expect(s().shelfOwner).toBe("user-a");
    expect(s().savedProducts).toEqual([]);
    expect(s().shelfQueue).toEqual([
      { kind: "remove-product", id: "a" },
      { kind: "remove-ingredient", name: "x" },
    ]);
  });
});

describe("the server's answer", () => {
  it("replaces the cache, drops what was pushed, and keeps what was queued since", () => {
    s().adoptShelf("user-a");
    s().saveProduct("a");
    const pushed = [...s().shelfQueue];
    s().saveProduct("late"); // tapped while the sync was out
    s().applyServerShelf("user-a", pushed, { products: [{ id: "a", savedAt: 1 }, { id: "other-phone", savedAt: 2 }], ingredients: [] });
    expect(s().savedProducts.map((p) => p.id)).toEqual(["a", "other-phone", "late"]);
    expect(s().shelfQueue.map((op: ShelfOp) => op.kind === "save-product" && op.id)).toEqual(["late"]);
  });

  it("is ignored if the shelf changed hands meanwhile", () => {
    s().adoptShelf("user-a");
    s().leaveShelf();
    s().applyServerShelf("user-a", [], { products: [{ id: "a", savedAt: 1 }], ingredients: [] });
    expect(s().savedProducts).toEqual([]);
  });
});

describe("signing out (#222)", () => {
  it("clears an account's shelf and queue, and leaves a guest's alone", () => {
    useAppStore.setState({ savedProducts: [{ id: "guest", savedAt: 1 }] });
    s().leaveShelf();
    expect(s().savedProducts.map((p) => p.id)).toEqual(["guest"]);

    s().adoptShelf("user-a");
    s().leaveShelf();
    expect(s().shelfOwner).toBeNull();
    expect(s().savedProducts).toEqual([]);
    expect(s().shelfQueue).toEqual([]);
  });
});
