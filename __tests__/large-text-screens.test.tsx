import { VERDICT_TEXT_SIZE } from "@/components/result/ScoreRing";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import IngredientRoute from "@/app/ingredient/[inci]";
import LabelResult from "@/app/label-result";
import ProductRoute from "@/app/product/[id]";
import { RING_SIZE } from "@/components/result/ScoreRing";
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
  // With no skin profile a sheet rises over the result (v9) and nothing behind it can be reached: put it away.
  if (screen.queryByRole("button", { name: "Take the 1-minute quiz" })) await fireEvent.press(screen.getByRole("button", { name: "Close" }));
}

/** Opens the Skin match tab, where the score is (it opens first; pressing it again is harmless). */
async function openMatch() {
  await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
}

/** Opens the Ingredients tab, where the risk cards are. */
async function openSafety() {
  await fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
}

/** The score ring's drawn size (v7 centres it above the verdict at every size). */
function ringSize() {
  return StyleSheet.flatten(screen.getByTestId("score-ring").props.style).width as number;
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
  it("keeps the score ring at its drawn size up to the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    await renderSettled(screenFor());
    await openMatch();
    expect(ringSize()).toBe(RING_SIZE);
  });

  it("grows the ring at the largest text size", async () => {
    mockFontScale = LARGEST;
    await renderSettled(screenFor());
    await openMatch();
    expect(ringSize()).toBe(RING_SIZE * FONT_SCALE.icon);
  });

  // v9: the two risks are rows in one box, one under the other at every text size.
  it("lists the two risks one under the other, whatever the text size", async () => {
    for (const scale of [FONT_SCALE.ui, LARGEST]) {
      mockFontScale = scale;
      await renderSettled(screenFor());
      await openSafety();
      expect(StyleSheet.flatten(screen.getByTestId("risk-cards").props.style).flexDirection).not.toBe("row");
      await act(async () => screen.unmount());
    }
  });

  // #346: no profile yet asks for one, not an empty score.
  it("with no profile yet, asks for one instead of a score", async () => {
    useAppStore.setState({ profile: EMPTY_PROFILE });
    mockFontScale = LARGEST;
    await renderSettled(screenFor());
    await openMatch();
    expect(screen.queryByTestId("score-ring")).toBeNull();
    // On the tab's own card, and on the teaser sheet that rises over it (v9).
    expect(screen.getAllByText("Is it right for your skin?").length).toBeGreaterThan(0);
  });

  it("lets the verdict follow the phone as far as body text", async () => {
    await renderSettled(screenFor());
    await openMatch();
    expect(screen.getByText(/^(Excellent|Good|Fair|Poor) match$/).props.maxFontSizeMultiplier).toBe((TYPE.body * FONT_SCALE.reading) / VERDICT_TEXT_SIZE);
  });
});

it("keeps the product's header at its ordinary ceilings, so the verdict isn't pushed off the first screen", async () => {
  mockParams = { id: PRODUCT };
  mockFontScale = LARGEST;
  await renderSettled(<ProductRoute />);
  expect(screen.getByText("Sooyun").props.maxFontSizeMultiplier).toBe(FONT_SCALE.ui);
  expect(screen.getByText("Hanbang Rice Ferment Hydrating Serum").props.maxFontSizeMultiplier).toBe(FONT_SCALE.display);
});

describe("the ingredient screen", () => {
  beforeEach(() => {
    mockParams = { inci: "niacinamide", product: PRODUCT };
  });

  // v7 draws no picture beside the name, so the name has the whole width at every size.
  it("draws no picture beside the name, at the largest text size or below", async () => {
    mockFontScale = LARGEST;
    await renderSettled(<IngredientRoute />);
    expect(screen.queryAllByTestId("image")).toEqual([]);
  });
});
