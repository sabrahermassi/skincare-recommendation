import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import IngredientRoute from "@/app/ingredient/[inci]";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients, SkinProfile } from "@/data/types";
import { EU_ALLERGEN_COPY, EU_ALLERGEN_SOURCE } from "@/lib/eu-allergens";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import { EU_PROHIBITED_SOURCE, SAFETY_NOTICE_COPY } from "@/lib/safety";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";
import { SPACE } from "@/lib/tokens";

/**
 * #324: opened from a product, the ingredient page gives the verdict the
 * ingredient list gave the row, so tapping a row never opens a page that
 * disagrees with it.
 */

jest.setTimeout(30_000);

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
// The phone's text size; iOS's largest accessibility size is about 3.57×.
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProduct: jest.fn(),
}));

function ingredient(name: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true, functions: [], ...overrides };
}

const INGREDIENTS = [
  ingredient("aqua"),
  ingredient("glycerin", { functions: ["humectant"] }),
  ingredient("butylene glycol"),
  ingredient("lanolin", { functions: ["emollient", "skin conditioning"] }),
  // An EU-labelled fragrance allergen (Annex III entry 346) with no rule of its own,
  // and an ingredient that is only restricted (a pH adjuster's maximum): #407.
  ingredient("vanillin"),
  ingredient("sodium hydroxide", { safety: "caution", note: "Restricted use (EU Annex III/15a)" }),
  ingredient("retinol"),
  ingredient("isopropyl myristate", { verified: false }),
  ingredient("parfum"),
  // Banned in EU cosmetics outside nail products, and a pregnancy caution: the
  // real dictionary marks it `avoid` (scripts/import-inci-dictionary.mjs).
  ingredient("hydroquinone", { safety: "avoid" }),
  ingredient("some prohibited substance", { safety: "avoid" }),
  // As the dictionary import writes it (#361): safe, with a note on the EU ban.
  ingredient("petrolatum", {
    note: "Allowed when fully refined. The EU bans it only when its refining history isn't known (EU Annex II/904)",
  }),
  ingredient("niacinamide", { functions: ["skin conditioning"] }),
];

const PRODUCT: ProductWithIngredients = {
  id: "p",
  barcode: "0000000000000",
  brand: "Brand",
  name: "Cream",
  type: "moisturizer",
  productType: "lotion-pump",
  price: 0,
  volume: "",
  suitableFor: [],
  targets: [],
  description: "",
  benefits: [],
  imageUrl: null,
  attribution: null,
  ingredientIds: INGREDIENTS.map((i) => i.id),
  ingredients: INGREDIENTS,
};

async function open(inci: string, profile: Partial<SkinProfile>, product: ProductWithIngredients = PRODUCT) {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, ...profile } });
  mockParams = { inci, product: "p" };
  (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({ ok: true, value: product });
  await render(<IngredientRoute />);
  await act(async () => {});
}

describe("the ingredient page, opened from a product", () => {
  it("gives petrolatum's EU status as allowed when refined, not 'No restriction' (#362)", async () => {
    await open("petrolatum", {});
    // "Good to know": the fact's key, then its value.
    expect(screen.getByText("EU status")).toBeTruthy();
    // A fact's row keeps to the spacing grid (it had been 13).
    expect(screen.getByText("EU status").parent).toHaveStyle({ paddingVertical: SPACE.block });
    expect(screen.getByText("Allowed when refined")).toBeTruthy();
    expect(screen.queryByText("No restriction")).toBeNull();
  });

  it.each([
    ["no skin profile", {}],
    ["a skin profile", { baseSkinType: "dry" as const }],
  ])("shows cannabidiol as depending on how it's made, never as cleared, with %s", async (_label: string, profile: Partial<SkinProfile>) => {
    // As the dictionary import writes it (0030): safe, so nothing is charged, but not cleared.
    const cbd = ingredient("cannabidiol", { note: "EU rules depend on how it's made." });
    await open("cannabidiol", profile, { ...PRODUCT, ingredientIds: [...PRODUCT.ingredientIds, cbd.id], ingredients: [...INGREDIENTS, cbd] });
    // Under the name, in "For your skin", and as its EU status.
    expect(screen.getAllByText("Depends on how it's made").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Not in your score")).toHaveStyle({ fontWeight: "500" });
    expect(screen.getByText(/depend on how it is made, which a label can't show/)).toBeTruthy();
    for (const allClear of ["No known concerns", "Nothing against it", "Neutral for you", "Safe", "No restriction", /no concerns/i]) {
      expect(screen.queryByText(allClear)).toBeNull();
    }
  });

  it("says a neutral ingredient is neutral once, not in a headline and again at the foot", async () => {
    await open("butylene glycol", { baseSkinType: "dry" as const });
    expect(screen.getByText("Nothing against it")).toBeTruthy();
    expect(screen.queryByText("Neutral for you")).toBeNull();
  });

  it("with no skin profile, doesn't call a plain ingredient Good, as the list gives it no word", async () => {
    await open("glycerin", {});
    expect(screen.getByText("No known concerns")).toBeTruthy();
    expect(screen.queryByText("Good")).toBeNull();
    // Nothing to say about it for everyone, and no profile: a way to set one up.
    expect(screen.getByText("Set up your skin profile to see how this fits you")).toBeTruthy();
  });

  it("gives a pore-clogger the list's Watch, never Good, whatever it does for this skin", async () => {
    await open("lanolin", { baseSkinType: "dry", concerns: ["dehydrated"] });
    expect(screen.getAllByText("Worth knowing").length).toBeGreaterThan(0);
    expect(screen.getByText("Watch")).toBeTruthy();
    expect(screen.queryByText("Good")).toBeNull();
  });

  it("gives an EU allergen for reactive skin the list's Watch, with the warning's own reason", async () => {
    await open("vanillin", { baseSkinType: "dry", sensitivity: "high" });
    // The score charged it, so the sheet says so: the pill and the penalty agree.
    expect(screen.getAllByText("Lowers your score").length).toBeGreaterThan(0);
    expect(screen.getByText("Watch")).toBeTruthy();
    expect(screen.getByText(EU_ALLERGEN_COPY.fragranceReason("Vanillin"))).toBeTruthy();
    expect(screen.queryByText("Flagged for everyone")).toBeNull();
  });

  // #407: Annex III alone is "allowed with limits" and says nothing about the person.
  it("gives an ingredient that is only restricted no warning, no Watch, and says 'Allowed with limits'", async () => {
    await open("sodium hydroxide", { baseSkinType: "dry", sensitivity: "high" });
    expect(screen.queryByText("Worth knowing")).toBeNull();
    expect(screen.queryByText(/Common irritant for sensitive skin/)).toBeNull();
    expect(screen.queryByText("Restricted")).toBeNull();
    expect(screen.getByText("Allowed with limits")).toBeTruthy();
    expect(screen.getByText("Annex III, entry 15a")).toBeTruthy();
    // The import's citation is a status, not what the ingredient does.
    expect(screen.queryByText(/Restricted use \(EU Annex III/)).toBeNull();
  });

  it("says a misread pore-clogger the score charged counts against the person, not that it can't be judged", async () => {
    await open("isopropyl myristate", { concerns: ["acne-prone"] });
    expect(screen.getByText("Flagged for your skin")).toBeTruthy();
    expect(screen.getByText("This is one of the things pulling the score down for the skin you described.")).toBeTruthy();
    expect(screen.getByText("Lowers your score")).toBeTruthy();
    expect(screen.queryByText("Not enough to go on")).toBeNull();
  });

  it("says a misread pore-clogger is on the lists when the score didn't charge it", async () => {
    await open("isopropyl myristate", {});
    // A strong-evidence pore-clogger is red (owner, 2 October 2026).
    expect(screen.getByText("Flagged for everyone")).toBeTruthy();
    expect(
      screen.getByText("This name didn't match our ingredient dictionary, but it is on the published pore-clogging lists."),
    ).toBeTruthy();
  });

  it("flags a pregnancy caution for this person, even with no skin profile", async () => {
    await open("retinol", { pregnancyStatus: "pregnant" });
    expect(screen.getAllByText("Flagged for you").length).toBeGreaterThan(0);
    // No profile means no score, and a pregnancy caution never moves one (#383 review).
    expect(screen.queryByText("Lowers your score")).toBeNull();
    expect(screen.queryByText("Suits your skin")).toBeNull();
    expect(screen.queryByText(/^Helps with your/)).toBeNull();
  });

  it("gives fragrance the list's Watch for everyone, and says why (#345)", async () => {
    for (const profile of [{}, { baseSkinType: "oily" as const, sensitivity: "none" as const }]) {
      await open("parfum", profile);
      expect(screen.getByText("Worth a second look")).toBeTruthy();
      expect(
        screen.getByText("A fragrance or common irritant, flagged for everyone rather than for your profile in particular."),
      ).toBeTruthy();
      expect(screen.queryByText(/Carries a restriction or a pore rating/)).toBeNull();
      await act(async () => screen.unmount());
    }
  });
});

// #347: what a warning was checked against is listed in the Sources card.
describe.each([
  ["default text", 1],
  ["the largest text size", 3.57],
] as const)("a warning's source on the ingredient page, at %s", (_size: string, fontScale: number) => {
  beforeEach(() => {
    mockFontScale = fontScale;
  });
  afterAll(() => {
    mockFontScale = 1;
  });

  it("shows both of hydroquinone's warnings, and both their sources in the Sources card", async () => {
    const hydroquinone = PREGNANCY_CAUTION.find((entry) => entry.category === "hydroquinone")!;
    await open("hydroquinone", { pregnancyStatus: "pregnant" });
    expect(screen.getByText("Flagged as best avoided")).toBeTruthy();
    expect(screen.getByRole("link", { name: EU_PROHIBITED_SOURCE.label })).toBeTruthy();
    expect(screen.getByText(hydroquinone.reason)).toBeTruthy();
    expect(screen.getByRole("link", { name: hydroquinone.source!.label })).toBeTruthy();
  });

  it("lists the EU prohibition as the source of a best-avoided warning", async () => {
    await open("some prohibited substance", {});
    expect(screen.getByText("Flagged as best avoided")).toBeTruthy();
    expect(screen.getByRole("link", { name: EU_PROHIBITED_SOURCE.label })).toBeTruthy();
  });

  it("lists the Annex III entry as the source of an allergen warning", async () => {
    await open("vanillin", { baseSkinType: "dry", sensitivity: "high" });
    expect(screen.getByText(EU_ALLERGEN_COPY.fragranceReason("Vanillin"))).toBeTruthy();
    expect(screen.getByRole("link", { name: EU_ALLERGEN_SOURCE.label })).toBeTruthy();
  });
});

// The handoff's layout (design_handoff_ingredient_detail): where it came from
// and where it sits on the label. v9 makes it a sheet, closed with its X; there
// is no Previous / Next along the label any more.
describe("the ingredient page's layout", () => {
  it("says where it sits on the label", async () => {
    await open("glycerin", {});
    expect(screen.getByText("On this label")).toBeTruthy();
    expect(screen.getByText(/^#2 of 13/)).toBeTruthy();
  });

  it("is a sheet with a close button, and no Previous or Next", async () => {
    await open("glycerin", {});
    expect(screen.getByTestId("sheet-screen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Previous ingredient" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Next ingredient/ })).toBeNull();
    // The sheet's own X, and the dimmed screen behind it.
    await fireEvent.press(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(router.back).toHaveBeenCalled();
  });

  it("names the concern a helping ingredient works on", async () => {
    await open("niacinamide", { concerns: ["hyperpigmentation"] });
    expect(screen.getByText("Helps with your dark spots")).toBeTruthy();
    expect(screen.getByText("Adds to your score")).toBeTruthy();
  });
});

// Opened from a Skin needs result (owner, 2 October 2026): that path reads
// nothing from the saved skin profile, so the sheet does not say how the
// ingredient fits it either.
it("leaves out For your skin when opened from a Skin needs result", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] }, skinNeedsEnabled: true });
  mockParams = { inci: "niacinamide", product: "p", from: "journey" };
  (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({ ok: true, value: PRODUCT });
  await render(<IngredientRoute />);
  await act(async () => {});
  expect(screen.getByText("What it does")).toBeTruthy();
  expect(screen.queryByText("For your skin")).toBeNull();
  await act(async () => screen.unmount());

  await open("niacinamide", { concerns: ["hyperpigmentation"] });
  expect(screen.getByText("For your skin")).toBeTruthy();
  useAppStore.setState({ skinNeedsEnabled: false });
});

// #467: with Skin needs hidden, an old link from it is an ordinary ingredient page.
it("keeps For your skin on an old Skin needs link while Skin needs is hidden", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] }, skinNeedsEnabled: false });
  mockParams = { inci: "niacinamide", product: "p", from: "journey" };
  (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({ ok: true, value: PRODUCT });
  await render(<IngredientRoute />);
  await act(async () => {});
  expect(screen.getByText("For your skin")).toBeTruthy();
  mockParams = {};
});


// #404: the EU safety notice on the ingredient's own sheet, only for the
// entries the owner verified and only with the flag on.
describe("the EU safety notice on the ingredient page", () => {
  afterEach(() => useAppStore.setState({ safetyNoticeEnabled: false, skinNeedsEnabled: false }, false));

  // As the dictionary writes them (0030): prohibited, with the Annex II entry in the note.
  const HICC = ingredient("hydroxyisohexyl 3-cyclohexene carboxaldehyde", {
    safety: "avoid",
    note: "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)",
  });
  const ISOBUTYLPARABEN = ingredient("isobutylparaben", { safety: "avoid", note: "Prohibited in cosmetics (EU Annex II/1375)" });
  const withThem: ProductWithIngredients = { ...PRODUCT, ingredientIds: [...PRODUCT.ingredientIds, HICC.id, ISOBUTYLPARABEN.id], ingredients: [...INGREDIENTS, HICC, ISOBUTYLPARABEN] };

  it("is not there with the flag off: the page says what it said", async () => {
    await open("hydroxyisohexyl 3-cyclohexene carboxaldehyde", {}, withThem);
    expect(screen.getByText("Flagged as best avoided")).toBeTruthy();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.sheetHeadline)).toBeNull();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.listWord)).toBeNull();
    expect(screen.getByText("Avoid")).toBeTruthy();
  });

  it("says HICC is not permitted, names its entry, and gives its two dates", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await open("hydroxyisohexyl 3-cyclohexene carboxaldehyde", {}, withThem);
    expect(screen.getByText(SAFETY_NOTICE_COPY.sheetHeadline)).toBeTruthy();
    expect(screen.getByText(/lists this ingredient as prohibited \(Annex II, entry 1380\)\. If it is on a label you scanned, check the label\./)).toBeTruthy();
    expect(screen.getAllByText(/23 August 2019.*23 August 2021/).length).toBeGreaterThan(0);
    expect(screen.getByText(SAFETY_NOTICE_COPY.listWord)).toBeTruthy();
    expect(screen.queryByText("Flagged as best avoided")).toBeNull();
    // Found in the simulator: the generic sentence must not sit under the notice.
    expect(screen.queryByText(/The EU inventory restricts or prohibits this one/)).toBeNull();
    // The regulation stays one tap away.
    expect(screen.getByRole("link", { name: EU_PROHIBITED_SOURCE.label })).toBeTruthy();
  });

  // Codex review on #414: opened from a Skin needs result the "For your skin"
  // card is left out, and the notice still has to be said.
  it("says it on a Skin needs path too, where 'For your skin' is left out", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true, skinNeedsEnabled: true }, false);
    mockParams = { inci: "hydroxyisohexyl 3-cyclohexene carboxaldehyde", product: "p", from: "journey" };
    (fetchProduct as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue({ ok: true, value: withThem });
    await render(<IngredientRoute />);
    await act(async () => {});
    expect(screen.queryByText("For your skin")).toBeNull();
    expect(screen.getByText(SAFETY_NOTICE_COPY.sheetHeadline)).toBeTruthy();
    expect(screen.getByText(/Annex II, entry 1380/)).toBeTruthy();
    mockParams = {};
  });

  it("says it for isobutylparaben with no dates", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await open("isobutylparaben", {}, withThem);
    expect(screen.getByText(/Annex II, entry 1375/)).toBeTruthy();
    expect(screen.queryAllByText(/23 August/)).toHaveLength(0);
  });

  it("shows the notice for hydroquinone, as the dictionary writes it (Annex II/1339 beside Annex III/14)", async () => {
    // As the dictionary writes it: prohibited, citing Annex II/1339 beside Annex III/14.
    const hydroquinone = ingredient("hydroquinone", { safety: "avoid", note: "Prohibited in cosmetics (EU Annex II/1339 III/14)" });
    const withIt: ProductWithIngredients = { ...PRODUCT, ingredients: INGREDIENTS.map((i) => (i.name === "hydroquinone" ? hydroquinone : i)) };
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await open("hydroquinone", {}, withIt);
    expect(screen.getByText(SAFETY_NOTICE_COPY.sheetHeadline)).toBeTruthy();
    expect(screen.getByText(/Annex II, entry 1339\)/)).toBeTruthy();
  });

  it("leaves a prohibited row with no entry on the verified list as it was, even with the flag on", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await open("some prohibited substance", {}, withThem);
    expect(screen.getByText("Flagged as best avoided")).toBeTruthy();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.sheetHeadline)).toBeNull();
    expect(screen.getByText("Avoid")).toBeTruthy();
  });
});
