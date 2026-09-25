import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { STEP_LABEL, TYPE_STEP, stepOf } from "@/lib/routine-step";
import { applyOps, planPush, shelfAsSaves } from "@/lib/shelf";

/**
 * Routine-step tagging (#227): the guess from a product's type, the
 * person's choice that overrides it, the sync of that choice, and the shelf's
 * filter pills.
 */

jest.setTimeout(30000);

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: jest.fn(), back: jest.fn() },
    useScrollToTop: () => undefined,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");

describe("the guess from a product's type", () => {
  it("covers every type, with no fallback", () => {
    expect(Object.keys(TYPE_STEP).sort()).toEqual(Object.keys(PRODUCT_TYPE_LABEL).sort());
  });

  it("keeps 'not a face product' apart from 'we couldn't tell'", () => {
    expect(TYPE_STEP["hand-cream"]).toBe("body");
    expect(TYPE_STEP.shampoo).toBe("body");
    expect(TYPE_STEP.unknown).toBe("unsorted");
    expect(STEP_LABEL.body).not.toBe(STEP_LABEL.unsorted);
  });

  it("puts the everyday face types where a person would", () => {
    expect([TYPE_STEP.cleanser, TYPE_STEP.serum, TYPE_STEP.moisturizer, TYPE_STEP.sunscreen]).toEqual([1, 2, 3, 3]);
  });
});

describe("the person's choice", () => {
  it("overrides the guess, and survives the product's type changing", () => {
    expect(stepOf("serum", 3)).toBe(3);
    const correctedType: ProductType = "cleanser";
    expect(stepOf(correctedType, 3)).toBe(3);
  });

  it("falls back to the guess when cleared, and follows a type correction then", () => {
    expect(stepOf("unknown", undefined)).toBe("unsorted");
    expect(stepOf("toner", undefined)).toBe(2);
  });
});

describe("syncing a step", () => {
  it("writes the last choice per product, after the save", () => {
    const push = planPush([
      { kind: "save-product", id: "a", savedAt: 1 },
      { kind: "set-product-step", id: "a", step: 2 },
      { kind: "set-product-step", id: "a", step: 3 },
      { kind: "set-product-step", id: "b", step: null },
    ]);
    expect(push.productSteps).toEqual([
      { id: "a", step: 3 },
      { id: "b", step: null },
    ]);
  });

  it("drops a step for a product removed after it, and keeps one chosen after a re-save", () => {
    expect(
      planPush([
        { kind: "set-product-step", id: "a", step: 1 },
        { kind: "remove-product", id: "a" },
      ]).productSteps,
    ).toEqual([]);
    expect(
      planPush([
        { kind: "remove-product", id: "a" },
        { kind: "save-product", id: "a", savedAt: 5 },
        { kind: "set-product-step", id: "a", step: 1 },
      ]).productSteps,
    ).toEqual([{ id: "a", step: 1 }]);
  });

  it("shows a step chosen mid-sync over the server's shelf, and a clear", () => {
    const shelf = applyOps({ products: [{ id: "a", savedAt: 1, routineStep: 2 }], ingredients: [] }, [
      { kind: "set-product-step", id: "a", step: null },
    ]);
    expect(shelf.products[0]).toEqual({ id: "a", savedAt: 1 });
  });

  it("carries a pre-accounts step into the account", () => {
    expect(shelfAsSaves({ products: [{ id: "a", savedAt: 1, routineStep: 1 }], ingredients: [] }, 0)).toContainEqual({
      kind: "set-product-step",
      id: "a",
      step: 1,
    });
  });

  it("queues the choice for an account's shelf", () => {
    useAppStore.setState({ savedProducts: [{ id: "a", savedAt: 1 }], shelfOwner: "u", shelfQueue: [] });
    useAppStore.getState().setRoutineStep("a", 2);
    expect(useAppStore.getState().savedProducts[0].routineStep).toBe(2);
    expect(useAppStore.getState().shelfQueue).toEqual([{ kind: "set-product-step", id: "a", step: 2 }]);
    useAppStore.getState().setRoutineStep("a", null);
    expect(useAppStore.getState().savedProducts[0].routineStep).toBeUndefined();
  });
});

describe("the shelf", () => {
  const Saved = (require("@/app/(tabs)/saved") as { default: () => React.JSX.Element }).default;

  beforeEach(() => {
    useAppStore.setState({
      shelfOwner: null,
      shelfQueue: [],
      savedProducts: [
        { id: "hanbang-rice-serum", savedAt: 3 },
        { id: "mugwort-gel-cleanser", savedAt: 2 },
      ],
      savedIngredients: [],
    });
  });

  it("filters by step with pills, one per group on the shelf", async () => {
    await render(<Saved />);
    await screen.findByText("Hanbang Rice Ferment", { exact: false });
    expect(screen.getByText("All")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getAllByText("Cleanse")[0]));
    expect(screen.queryByText("Hanbang Rice Ferment", { exact: false })).toBeNull();
  });

  // #278 review: filtering to a group and then emptying it left a blank shelf
  // with the pills gone.
  it("shows the whole shelf again when the filtered group empties", async () => {
    await render(<Saved />);
    await screen.findByText("Hanbang Rice Ferment", { exact: false });
    await act(async () => fireEvent.press(screen.getAllByText("Cleanse")[0]));
    await act(async () => useAppStore.getState().toggleSaved("mugwort-gel-cleanser"));
    expect(screen.getByText("Hanbang Rice Ferment", { exact: false })).toBeTruthy();
  });

  it("lets a product be put in a step, and says a guess is a guess", async () => {
    await render(<Saved />);
    await screen.findByText("Hanbang Rice Ferment", { exact: false });
    expect(screen.getAllByText("Treat · our guess").length).toBeGreaterThan(0);
    await act(async () => fireEvent.press(screen.getAllByText("Change")[0]));
    await act(async () => fireEvent.press(screen.getAllByText("Moisturize & protect").at(-1)!));
    const serum = useAppStore.getState().savedProducts.find((p) => p.id === "hanbang-rice-serum");
    expect(serum?.routineStep).toBe(3);
  });
});
