import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ResultTabs } from "@/components/result/ResultTabs";
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
  await render(<ResultTabs ingredients={ingredients} type="serum" match={match} profile={profile} onIngredientPress={jest.fn()} />);
  await act(async () => {});
}

const openMatch = () => fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));

it("puts a reason's source under it in Why this score (#326)", async () => {
  const source = INGREDIENT_RULES.find((rule) => rule.names.includes("niacinamide"))?.source;
  expect(source).toBeDefined();
  await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
  await openMatch();
  await fireEvent.press(screen.getByLabelText("Why this score"));
  expect(screen.getByLabelText(`Source: ${source!.label}`)).toBeTruthy();
});

it("puts a pregnancy caution's source on the pregnancy card", async () => {
  const hydroquinone = PREGNANCY_CAUTION.find((entry) => entry.category === "hydroquinone")!;
  await show(["hydroquinone"], { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" });
  expect(screen.getByText("While pregnant or breastfeeding")).toBeTruthy();
  expect(screen.getByLabelText(`Source: ${hydroquinone.source!.label}`)).toBeTruthy();
});

it("marks a layering note as a caution and leaves the evening note plain", async () => {
  await show(["retinol"], EMPTY_PROFILE);
  expect(screen.getByText(/evening routine/)).toBeTruthy();
  expect(screen.getByText(/another product with BHA/)).toBeTruthy();
  expect(screen.getAllByTestId("routine-caution")).toHaveLength(1);
});

it("gives the dark-spots SPF note on Skin match, not on the Safety tab everyone sees", async () => {
  await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
  expect(screen.queryByText(/working on dark spots/)).toBeNull();
  await openMatch();
  expect(screen.getByText(/working on dark spots/)).toBeTruthy();
});

// Just the match (owner): no row of the person's answers or Edit above it.
it("opens Skin match on the score, with no row of the answers above it", async () => {
  await show(["niacinamide"], { concerns: ["hyperpigmentation"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null });
  await openMatch();
  expect(screen.getByLabelText("Why this score")).toBeTruthy();
  expect(screen.queryByText("Combination")).toBeNull();
  expect(screen.queryByText("Somewhat sensitive")).toBeNull();
  expect(screen.queryByText("Edit")).toBeNull();
});
