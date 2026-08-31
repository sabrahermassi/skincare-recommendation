import { useAppStore } from "@/store/useAppStore";

const initial = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(
    {
      skinType: null,
      concerns: [],
      hasSeenOnboarding: false,
      savedProducts: [],
      compareIds: [],
    },
    false
  );
});

const s = () => useAppStore.getState();

describe("onboarding gate", () => {
  it("starts closed so first run sees onboarding", () => {
    expect(s().hasSeenOnboarding).toBe(false);
  });

  it("completing onboarding opens the gate", () => {
    s().completeOnboarding();
    expect(s().hasSeenOnboarding).toBe(true);
  });

  /**
   * Regression: "Skip for now" previously only navigated to "/", which
   * bounced straight back to onboarding because the gate was still closed.
   */
  it("skipping also opens the gate, leaving the profile empty", () => {
    s().skipOnboarding();
    expect(s().hasSeenOnboarding).toBe(true);
    expect(s().skinType).toBeNull();
    expect(s().concerns).toEqual([]);
  });
});

describe("editProfile", () => {
  /**
   * Regression: this was wired to a reset that wiped the entire store, so
   * tapping "Edit" to change skin type silently deleted the wishlist.
   */
  it("preserves the wishlist and compare tray", () => {
    s().saveProduct("hanbang-rice-serum");
    s().toggleCompare("aqua-ceramide-cream");
    s().completeOnboarding();

    s().editProfile();

    expect(s().savedProducts.map((p) => p.id)).toEqual(["hanbang-rice-serum"]);
    expect(s().compareIds).toEqual(["aqua-ceramide-cream"]);
  });

  it("reopens the gate but keeps previous answers so steps arrive pre-filled", () => {
    s().setSkinType("dry");
    s().toggleConcern("dehydrated");
    s().completeOnboarding();

    s().editProfile();

    expect(s().hasSeenOnboarding).toBe(false);
    expect(s().skinType).toBe("dry");
    expect(s().concerns).toEqual(["dehydrated"]);
  });
});

describe("saveProduct vs toggleSaved", () => {
  /** Regression: scanning used toggle, so re-scanning a code un-saved it. */
  it("saveProduct is idempotent", () => {
    s().saveProduct("8801234567890");
    s().saveProduct("8801234567890");
    expect(s().savedProducts).toHaveLength(1);
  });

  it("toggleSaved adds then removes", () => {
    s().toggleSaved("x");
    expect(s().savedProducts).toHaveLength(1);
    s().toggleSaved("x");
    expect(s().savedProducts).toHaveLength(0);
  });
});

describe("concerns", () => {
  it("toggles on and off without duplicating", () => {
    s().toggleConcern("redness");
    s().toggleConcern("redness");
    expect(s().concerns).toEqual([]);
  });

  it("keeps selection order", () => {
    s().toggleConcern("redness");
    s().toggleConcern("dullness");
    expect(s().concerns).toEqual(["redness", "dullness"]);
  });
});

describe("compare tray", () => {
  it("holds at most two, dropping the oldest", () => {
    s().toggleCompare("a");
    s().toggleCompare("b");
    s().toggleCompare("c");
    expect(s().compareIds).toEqual(["b", "c"]);
  });

  it("deselects an already-selected product rather than re-adding it", () => {
    s().toggleCompare("a");
    s().toggleCompare("a");
    expect(s().compareIds).toEqual([]);
  });

  it("clearCompare empties the tray without touching saved products", () => {
    s().saveProduct("keep-me");
    s().toggleCompare("a");
    s().clearCompare();
    expect(s().compareIds).toEqual([]);
    expect(s().savedProducts).toHaveLength(1);
  });
});

afterAll(() => useAppStore.setState(initial, true));
