import { act, render, screen } from "@testing-library/react-native";

import IngredientRoute from "@/app/ingredient/[inci]";
import LabelResult from "@/app/label-result";
import ProductRoute from "@/app/product/[id]";
import { holdLabelRead } from "@/lib/pending-label";
import { FONT_SCALE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * #334, per #155: the product, ingredient and label-result screens at the
 * phone's largest text size. Past the ordinary ceiling the score ring grows
 * and goes above the verdict instead of beside it, and the ingredient page
 * drops its picture so the name has the whole width. The sample catalogue
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

// The ring's drawing is not the test; its size and where it sits are.
jest.mock("@/components/ScoreRing", () => {
  const { View } = jest.requireActual("react-native");
  return { ScoreRing: ({ size }: { size: number }) => <View testID="score-ring" accessibilityValue={{ now: size }} /> };
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

/**
 * The score ring's size, and whether the verdict sits beside it. The row is a
 * NativeWind class, which tests see as the class name rather than a style.
 */
function ring() {
  const found = screen.getByTestId("score-ring");
  const classes = String(found.parent?.props.className ?? "").split(/\s+/);
  return { size: found.props.accessibilityValue.now as number, beside: classes.includes("flex-row") };
}

describe.each([
  ["the product screen", () => {
    mockParams = { id: PRODUCT };
    return <ProductRoute />;
  }],
  ["the label result", () => {
    holdLabelRead({ ingredients: ["water", "glycerin", "niacinamide", "panthenol", "butylene glycol"], readToken: "token" });
    return <LabelResult />;
  }],
])("%s", (_name: string, screenFor: () => React.JSX.Element) => {
  it("keeps the score ring beside the verdict, at its drawn size, up to the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    await renderSettled(screenFor());
    expect(ring()).toEqual({ size: 82, beside: true });
  });

  it("grows the ring and puts it above the verdict at the largest text size", async () => {
    mockFontScale = LARGEST;
    await renderSettled(screenFor());
    expect(ring()).toEqual({ size: 82 * FONT_SCALE.icon, beside: false });
  });
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
