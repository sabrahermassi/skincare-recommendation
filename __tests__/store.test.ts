import {
  EMPTY_PROFILE,
  HISTORY_LIMIT,
  migratePersisted,
  PERSISTED_KEYS,
  partializeState,
  useAppStore,
} from "@/store/useAppStore";

const initial = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(
    {
      profile: EMPTY_PROFILE,
      hasSeenOnboarding: false,
      savedProducts: [],
      history: [],
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
    expect(s().profile).toEqual(EMPTY_PROFILE);
  });
});

describe("editing the profile via setProfile", () => {
  /**
   * Regression: editing used to be wired to a reset that wiped the entire
   * store, so changing skin type silently deleted the wishlist. Editing is
   * now a plain navigation to /profile plus a `setProfile` patch — it must
   * never touch savedProducts or compareIds.
   */
  it("preserves the wishlist and compare tray", () => {
    s().saveProduct("hanbang-rice-serum");
    s().toggleCompare("aqua-ceramide-cream");
    s().completeOnboarding();

    s().setProfile({ baseSkinType: "dry" });

    expect(s().savedProducts.map((p) => p.id)).toEqual(["hanbang-rice-serum"]);
    expect(s().compareIds).toEqual(["aqua-ceramide-cream"]);
  });

  it("shallow-merges, leaving other answers untouched", () => {
    s().setProfile({ baseSkinType: "dry", sensitivity: "some" });
    s().setProfile({ baseSkinType: "oily" });

    expect(s().profile.baseSkinType).toBe("oily");
    expect(s().profile.sensitivity).toBe("some");
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
    expect(s().profile.concerns).toEqual([]);
  });

  it("keeps selection order", () => {
    s().toggleConcern("redness");
    s().toggleConcern("dullness");
    expect(s().profile.concerns).toEqual(["redness", "dullness"]);
  });

  it("caps at 3 selections, ignoring a 4th tap rather than replacing one", () => {
    s().toggleConcern("redness");
    s().toggleConcern("dullness");
    s().toggleConcern("dehydrated");
    s().toggleConcern("fine-lines");
    expect(s().profile.concerns).toEqual(["redness", "dullness", "dehydrated"]);
  });

  it("still allows deselecting while at the cap", () => {
    s().toggleConcern("redness");
    s().toggleConcern("dullness");
    s().toggleConcern("dehydrated");
    s().toggleConcern("redness");
    expect(s().profile.concerns).toEqual(["dullness", "dehydrated"]);
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

describe("what survives an app restart", () => {
  /**
   * The compare tray is an in-session selection. Restoring "2 selected" from
   * three weeks ago would put a floating bar over the browse list for no
   * reason, so it is deliberately left out of the persisted slice.
   */
  it("persists the profile, gate, shelf and log — but not the compare tray", () => {
    expect([...PERSISTED_KEYS].sort()).toEqual([
      "hasSeenOnboarding",
      "history",
      "productSuggestions",
      "profile",
      "savedIngredients",
      "savedProducts",
    ]);

    s().toggleCompare("a");
    s().saveProduct("keep-me");

    const persisted = partializeState(useAppStore.getState());
    expect(Object.keys(persisted).sort()).toEqual([...PERSISTED_KEYS].sort());
    expect(persisted).not.toHaveProperty("compareIds");
    expect(persisted.savedProducts.map((p) => p.id)).toEqual(["keep-me"]);
  });

  /**
   * Issue #12. AsyncStorage is not a secure store. This pins the exact set
   * of keys that reach it, so adding a new persisted field is a deliberate
   * act that forces a classification decision in
   * docs/device-storage-policy.md rather than a silent one-line addition to
   * partialize.
   */
  it("never persists credential-shaped keys", () => {
    const forbidden = /token|session|secret|credential|password|jwt|refresh|apikey/i;
    for (const key of PERSISTED_KEYS) {
      expect(key).not.toMatch(forbidden);
    }
    // partialize is the real gate; assert it agrees with the declared key set.
    expect(Object.keys(partializeState(useAppStore.getState())).sort()).toEqual(
      [...PERSISTED_KEYS].sort()
    );
  });
});

describe("history log", () => {
  const view = (id: string, score: number | null = 80) =>
    s().recordView({ id, known: true, score, warnings: 0 });

  it("records a first view with a count of 1", () => {
    view("a");
    expect(s().history).toHaveLength(1);
    expect(s().history[0]).toMatchObject({ id: "a", seenCount: 1, known: true });
  });

  it("upserts rather than duplicating, bumping the count", () => {
    view("a");
    view("a");
    view("a");
    expect(s().history).toHaveLength(1);
    expect(s().history[0].seenCount).toBe(3);
  });

  it("keeps the original firstSeenAt across re-views", () => {
    view("a");
    const first = s().history[0].firstSeenAt;
    view("a");
    expect(s().history[0].firstSeenAt).toBe(first);
    expect(s().history[0].lastSeenAt).toBeGreaterThanOrEqual(first);
  });

  it("moves a re-viewed entry back to the front", () => {
    view("a");
    view("b");
    view("c");
    expect(s().history.map((h) => h.id)).toEqual(["c", "b", "a"]);
    view("a");
    expect(s().history.map((h) => h.id)).toEqual(["a", "c", "b"]);
  });

  it("caps the log, dropping the oldest entries", () => {
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) view(`p${i}`);
    expect(s().history).toHaveLength(HISTORY_LIMIT);
    expect(s().history[0].id).toBe(`p${HISTORY_LIMIT + 9}`);
    expect(s().history.some((h) => h.id === "p0")).toBe(false);
  });

  /**
   * The shelf is re-scored live; the log is not. A log that silently rewrote
   * its own past entries when the profile changed would be worse than no log,
   * so the snapshot must survive a later edit untouched.
   */
  it("does not rewrite a recorded score when the profile changes later", () => {
    s().recordView({ id: "a", known: true, score: 91, warnings: 2 });
    s().setProfile({ baseSkinType: "oily", sensitivity: "some" });
    s().toggleConcern("acne-prone");

    expect(s().history[0].scoreAtView).toBe(91);
    expect(s().history[0].warningsAtView).toBe(2);
  });

  it("records an unresolved barcode as an unknown entry", () => {
    s().recordView({ id: "8800000000000", known: false, score: null, warnings: 0 });
    expect(s().history[0]).toMatchObject({ known: false, scoreAtView: null });
  });

  it("clearHistory empties the log without touching the shelf", () => {
    s().saveProduct("keep-me");
    view("a");
    s().clearHistory();
    expect(s().history).toEqual([]);
    expect(s().savedProducts.map((p) => p.id)).toEqual(["keep-me"]);
  });

  /** Scanning is checking, not saving — the two lists must stay independent. */
  it("keeps the shelf and the log from leaking into each other", () => {
    view("a");
    expect(s().savedProducts).toEqual([]);

    s().toggleSaved("b");
    expect(s().history.map((h) => h.id)).toEqual(["a"]);
  });
});

describe("resetApp", () => {
  /**
   * Persistence is what makes this necessary: once onboarding is completed it
   * stays completed across launches, so without a reset there is no route back
   * to a first-run app short of deleting it.
   */
  it("returns every slice to its first-run value", () => {
    s().completeOnboarding();
    s().setProfile({ baseSkinType: "oily", sensitivity: "some" });
    s().toggleConcern("redness");
    s().saveProduct("a");
    s().recordView({ id: "b", known: true, score: 70, warnings: 0 });
    s().toggleCompare("c");

    s().resetApp();

    expect(s().hasSeenOnboarding).toBe(false);
    expect(s().profile).toEqual(EMPTY_PROFILE);
    expect(s().savedProducts).toEqual([]);
    expect(s().history).toEqual([]);
    expect(s().compareIds).toEqual([]);
  });

  it("re-opens the onboarding gate, which is the whole point", () => {
    s().completeOnboarding();
    expect(s().hasSeenOnboarding).toBe(true);
    s().resetApp();
    expect(s().hasSeenOnboarding).toBe(false);
  });
});

/**
 * The migration is the one thing in the store that can silently destroy a
 * real person's data — they would find out by watching every score change —
 * so it gets pinned rather than trusted.
 */
describe("v3 -> v4 migration", () => {
  const v3 = () => ({
    profile: {
      gender: "female",
      ageGroup: "25-34",
      area: "face" as const,
      concerns: ["acne-prone"] as const,
      baseSkinType: "oily" as const,
      sensitive: true,
    },
    hasSeenOnboarding: true,
    savedProducts: [{ id: "hanbang-rice-serum", savedAt: 1 }],
    savedIngredients: ["niacinamide"],
    history: [],
    productSuggestions: [],
  });

  it("keeps every answer the user still has a question for", () => {
    const migrated = migratePersisted(v3(), 3);
    expect(migrated?.profile.baseSkinType).toBe("oily");
    expect(migrated?.profile.concerns).toEqual(["acne-prone"]);
    // Not an onboarding question any more, but the browse filter reads it.
    expect(migrated?.profile.area).toBe("face");
  });

  it("maps the old boolean to the middle level, not the harshest", () => {
    // The old toggle asked "is your skin also sensitive" — that is "somewhat".
    // Promoting everyone to "high" would re-judge their saved products against
    // a stricter rule than they ever agreed to.
    expect(migratePersisted(v3(), 3)?.profile.sensitivity).toBe("some");

    const notSensitive = v3();
    notSensitive.profile.sensitive = false;
    // They saw the toggle and left it off: an answer, not a blank.
    expect(migratePersisted(notSensitive, 3)?.profile.sensitivity).toBe("none");
  });

  it("drops the fields nothing reads", () => {
    const migrated = migratePersisted(v3(), 3) as Record<string, unknown> | undefined;
    const profile = migrated?.profile as Record<string, unknown>;
    expect(profile).not.toHaveProperty("gender");
    expect(profile).not.toHaveProperty("ageGroup");
    expect(profile).not.toHaveProperty("sensitive");
  });

  it("leaves the shelf and the log alone", () => {
    const migrated = migratePersisted(v3(), 3);
    expect(migrated?.savedProducts).toEqual([{ id: "hanbang-rice-serum", savedAt: 1 }]);
    expect(migrated?.savedIngredients).toEqual(["niacinamide"]);
    expect(migrated?.hasSeenOnboarding).toBe(true);
  });

  it("passes a current store through untouched", () => {
    const v4 = { ...v3(), profile: { ...EMPTY_PROFILE, sensitivity: "high" as const } };
    expect(migratePersisted(v4, 4)?.profile.sensitivity).toBe("high");
  });

  it("does not invent a profile out of nothing", () => {
    expect(migratePersisted(undefined, 3)).toBeUndefined();
    // A stored blob with no profile is corrupt, not a first run — but it must
    // still come back with the key the rest of the app destructures.
    expect(migratePersisted({ hasSeenOnboarding: true }, 3)?.profile).toEqual(EMPTY_PROFILE);
  });
});

afterAll(() => useAppStore.setState(initial, true));
