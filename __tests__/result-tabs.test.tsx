import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));


import { ResultTabs } from "@/components/result/ResultTabs";
import { Text } from "@/components/Text";
import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import { INGREDIENT_RULES } from "@/lib/rules";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * The product result's two tabs (design_handoff_skincare_cards), past what
 * the product and label screens' own tests cover: every claim keeps its
 * source (#326), a layering note reads as a cost and the evening one doesn't
 * (#264), and the one note that depends on the person sits with their match.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ingredient = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
const BASE = ["water", "glycerin", "butylene glycol", "xanthan gum"];

async function show(names: string[], profile: SkinProfile) {
  const ingredients = [...BASE, ...names].map(ingredient);
  const match = matchProduct({ type: "serum", ingredients }, profile);
  await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={match} profile={profile} onIngredientPress={jest.fn()} />);
  await act(async () => {});
}

const openMatch = () => fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
const openIngredients = () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));

it("puts a reason's source under it, on its card (#326)", async () => {
  const source = INGREDIENT_RULES.find((rule) => rule.names.includes("niacinamide"))?.source;
  expect(source).toBeDefined();
  await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
  await openMatch();
  // One of the Skin needs recommendations for dark spots (v9), in its own box.
  expect(screen.getByText(/^Niacinamide helps with oil balance/)).toBeTruthy();
  expect(screen.getByText("Good support")).toBeTruthy();
  expect(screen.getByLabelText(`Source: ${source!.label}`)).toBeTruthy();
});

it("puts a pregnancy caution's source on the pregnancy card", async () => {
  const hydroquinone = PREGNANCY_CAUTION.find((entry) => entry.category === "hydroquinone")!;
  await show(["hydroquinone"], { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" });
  await openIngredients();
  expect(screen.getByText("Best avoided while pregnant")).toBeTruthy();
  expect(screen.getByLabelText(`Source: ${hydroquinone.source!.label}`)).toBeTruthy();
});

it("marks a layering note as a caution and leaves the evening note plain", async () => {
  await show(["retinol"], { ...EMPTY_PROFILE, baseSkinType: "dry" });
  await openMatch();
  expect(screen.getByText(/evening routine/)).toBeTruthy();
  expect(screen.getByText(/another product with BHA/)).toBeTruthy();
  expect(screen.getAllByTestId("routine-caution")).toHaveLength(1);
});

it("gives the dark-spots SPF note on Skin match, not on the Ingredients tab everyone sees", async () => {
  await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
  await openIngredients();
  expect(screen.queryByText(/working on dark spots/)).toBeNull();
  await openMatch();
  expect(screen.getByText(/working on dark spots/)).toBeTruthy();
});

// Just the match (owner): no row of the person's answers or Edit above it.
it("opens Skin match on the score, with no row of the answers above it", async () => {
  await show(["niacinamide"], { concerns: ["hyperpigmentation"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null });
  await openMatch();
  expect(screen.getByTestId("score-ring")).toBeTruthy();
  expect(screen.queryByText("Combination")).toBeNull();
  expect(screen.queryByText("Somewhat sensitive")).toBeNull();
  expect(screen.queryByText("Edit")).toBeNull();
});

// #379 review (Codex): a sourced warning keeps its source in "Flagged for your
// skin", and a concern met only by a declared function still shows under "For
// your concerns", as the score counts it.
async function showWith(extra: Ingredient[], profile: SkinProfile) {
  const ingredients = [...BASE.map(ingredient), ...extra];
  const match = matchProduct({ type: "serum", ingredients }, profile);
  await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={match} profile={profile} onIngredientPress={jest.fn()} />);
  await act(async () => {});
}

it("puts an EU prohibition's source under it, on its red card", async () => {
  await showWith([{ ...ingredient("some prohibited substance"), safety: "avoid" }], { ...EMPTY_PROFILE, concerns: ["dullness"] });
  await openMatch();
  expect(screen.getByText("Some Prohibited Substance")).toBeTruthy();
  expect(screen.getAllByLabelText("Source: EU Cosmetics Regulation, Annex II").length).toBeGreaterThan(0);
});

it("credits a concern met only by a declared function, as the score does", async () => {
  // No curated rule here works on dehydration (unlike glycerin in BASE), so
  // only the declared function can.
  const ingredients = [ingredient("water"), ingredient("xanthan gum"), { ...ingredient("some declared humectant"), functions: ["humectant"] }];
  const profile = { ...EMPTY_PROFILE, concerns: ["dehydrated" as const] };
  await render(
    <ResultTabs header={null} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, profile)} profile={profile} onIngredientPress={jest.fn()} />,
  );
  await act(async () => {});
  await openMatch();
  expect(screen.getByText(/Declared as a humectant/i)).toBeTruthy();
});

// A reason is the bold name and then the rule's sentence. A sentence that does
// not open with the name is set off with a colon, not run into it.
it("joins a reason to its ingredient's name so it reads as a sentence", async () => {
  await show(["sodium hyaluronate"], { ...EMPTY_PROFILE, concerns: ["dehydrated"] });
  await openMatch();
  expect(screen.getByText(/^Butylene Glycol: a humectant solvent/)).toBeTruthy();
});

it("does not say an ingredient's name twice in its row", async () => {
  await show([], { ...EMPTY_PROFILE, concerns: ["dehydrated"] });
  await openIngredients();
  expect(screen.getByText("Draws water into the skin")).toBeTruthy();
  expect(screen.queryByText(/^Glycerin draws/)).toBeNull();
});

// Owner (v9): the header and the switch hold still; only the white sheet scrolls.
it("keeps the header and the switch out of the part that scrolls", async () => {
  const ingredients = [ingredient("glycerin")];
  await render(
    <ResultTabs header={<Text>Toner</Text>} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, EMPTY_PROFILE)} profile={EMPTY_PROFILE} onIngredientPress={jest.fn()} />,
  );
  const within = (node: { parent: unknown } | null, type: string): boolean => {
    for (let at = node as { type?: unknown; parent: unknown } | null; at; at = at.parent as typeof at) if (at.type === type) return true;
    return false;
  };
  expect(within(screen.getByTestId("result-sheet"), "RCTScrollView")).toBe(true);
  expect(within(screen.getByText("Toner"), "RCTScrollView")).toBe(false);
  expect(within(screen.getByRole("tab", { name: "Ingredients" }), "RCTScrollView")).toBe(false);
});

it("lets the header and the switch scroll at the largest text sizes, where they'd fill the screen", async () => {
  mockFontScale = 2;
  try {
    const ingredients = [ingredient("glycerin")];
    await render(
      <ResultTabs header={<Text>Toner</Text>} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, EMPTY_PROFILE)} profile={EMPTY_PROFILE} onIngredientPress={jest.fn()} />,
    );
    let at = screen.getByText("Toner") as { type?: unknown; parent: unknown } | null;
    while (at && at.type !== "RCTScrollView") at = at.parent as typeof at;
    expect(at).not.toBeNull();
  } finally {
    mockFontScale = 1;
  }
});
