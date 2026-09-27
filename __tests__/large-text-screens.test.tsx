import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import IngredientRoute from "@/app/ingredient/[inci]";
import LabelResult from "@/app/label-result";
import ProductRoute from "@/app/product/[id]";
import { RING_SIZE } from "@/components/result/ResultTabs";
import { holdLabelRead } from "@/lib/pending-label";
import { FONT_SCALE, TYPE } from "@/lib/tokens";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #334, per #155: the product, ingredient and label-result screens at the
 * phone's largest text size. Past the ordinary ceiling the score ring grows
 * and goes above the verdict instead of beside it, the two risk cards stack,
 * and the ingredient page drops its picture so the name has the whole width. The product name keeps
 * its ordinary ceiling and the verdict title keeps growing, so the answer
 * stays near the top and still stands out. The sample catalogue
 * stands in for the backend (no Supabase env in tests).
 */

jest.setTimeout(30_000);

// The phone's text size. iOS's largest accessibility size is about 3.57×.
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn() },
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// A stand-in that keeps its props, so the test can see whether the picture is drawn.
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});

const LARGEST = 3.57;
const PRODUCT = "hanbang-rice-serum";

beforeEach(() => {
  mockFontScale = 1;
  mockParams = {};
  useAppStore.setState((s) => ({ profile: { ...s.profile, concerns: ["dehydrated"], baseSkinType: "dry" } }));
});

async function renderSettled(element: React.JSX.Element) {
  await render(element);
  await act(async () => {});
}

/** Opens the Skin match tab, where the score is. */
async function openMatch() {
  await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
}

/** The score ring's size, and whether the verdict sits beside it. */
function ring() {
  const card = StyleSheet.flatten(screen.getByTestId("score-card").props.style);
  const drawn = StyleSheet.flatten(screen.getByTestId("score-ring").props.style);
  return { size: drawn.width as number, beside: card.flexDirection === "row" };
}

describe.each([
  ["the product screen", () => {
    mockParams = { id: PRODUCT };
    return <ProductRoute />;
  }],
  ["the label result", () => {
    holdLabelRead({ ingredients: ["water", "glycerin", "niacinamide", "panthenol", "butylene glycol"] });
    return <LabelResult />;
  }],
])("%s", (_name: string, screenFor: () => React.JSX.Element) => {
  it("keeps the score ring beside the verdict, at its drawn size, up to the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    await renderSettled(screenFor());
    await openMatch();
    expect(ring()).toEqual({ size: RING_SIZE, beside: true });
  });

  it("grows the ring and puts it above the verdict at the largest text size", async () => {
    mockFontScale = LARGEST;
    await renderSettled(screenFor());
    await openMatch();
    expect(ring()).toEqual({ size: RING_SIZE * FONT_SCALE.icon, beside: false });
  });

  it("stacks the two risk cards at the largest text size, and keeps them side by side below it", async () => {
    mockFontScale = FONT_SCALE.ui;
    await renderSettled(screenFor());
    expect(StyleSheet.flatten(screen.getByTestId("risk-cards").props.style).flexDirection).toBe("row");
    await act(async () => screen.unmount());

    mockFontScale = LARGEST;
    await renderSettled(screenFor());
    expect(StyleSheet.flatten(screen.getByTestId("risk-cards").props.style).flexDirection).toBe("column");
  });

  // #346: no profile yet asks for one, not an empty score.
  it("with no profile yet, asks for one instead of a score", async () => {
    useAppStore.setState({ profile: EMPTY_PROFILE });
    mockFontScale = LARGEST;
    await renderSettled(screenFor());
    await openMatch();
    expect(screen.queryByTestId("score-ring")).toBeNull();
    expect(screen.getByText("See your skin match")).toBeTruthy();
  });

  it("lets the verdict follow the phone as far as body text", async () => {
    await renderSettled(screenFor());
    await openMatch();
    expect(screen.getByText(/^(Excellent|Good|Fair|Poor) match$/).props.maxFontSizeMultiplier).toBe((TYPE.body * FONT_SCALE.reading) / TYPE.caption);
  });
});

it("keeps the product's header at its ordinary ceilings, so the verdict isn't pushed off the first screen", async () => {
  mockParams = { id: PRODUCT };
  mockFontScale = LARGEST;
  await renderSettled(<ProductRoute />);
  expect(screen.getByText("Sooyun").props.maxFontSizeMultiplier).toBe(FONT_SCALE.ui);
  expect(screen.getByText("Hanbang Rice Ferment Hydrating Serum").props.maxFontSizeMultiplier).toBe(FONT_SCALE.display);
  expect(screen.getByText(/^50 ml/).props.maxFontSizeMultiplier).toBe(FONT_SCALE.ui);
});

describe("the ingredient screen", () => {
  beforeEach(() => {
    mockParams = { inci: "niacinamide", product: PRODUCT };
  });

  it("shows its picture beside the name up to the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    await renderSettled(<IngredientRoute />);
    expect(screen.queryAllByTestId("image").length).toBeGreaterThan(0);
  });

  it("drops the picture at the largest text size, so the name has the whole width", async () => {
    mockFontScale = LARGEST;
    await renderSettled(<IngredientRoute />);
    expect(screen.queryAllByTestId("image")).toEqual([]);
  });
});
