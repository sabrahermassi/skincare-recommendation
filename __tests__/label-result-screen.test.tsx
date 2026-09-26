import { act, fireEvent, render, screen } from "@testing-library/react-native";

import LabelResult from "@/app/label-result";
import { clearLabelRead, holdLabelRead } from "@/lib/pending-label";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #345: a photographed label's result opens with the Ingredient check — the
 * same with or without a skin profile — and it opens the ingredient list,
 * except for a read too thin to check.
 */

// The first render loads the screen's whole module graph.
jest.setTimeout(30_000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const RECOGNISED: Record<string, { safety: string }> = {
  water: { safety: "safe" },
  glycerin: { safety: "safe" },
  "xanthan gum": { safety: "safe" },
  "butylene glycol": { safety: "safe" },
  parfum: { safety: "safe" },
  linalool: { safety: "caution" },
};

jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  resolveIngredientNames: (names: string[]) =>
    Promise.resolve(
      names.map((name) => ({
        id: name,
        name,
        comedogenic: 0,
        safety: RECOGNISED[name]?.safety ?? "safe",
        verified: name in RECOGNISED,
      })),
    ),
}));

async function open(names: string[]) {
  holdLabelRead({ ingredients: names, readToken: "token" });
  await render(<LabelResult />);
  await act(async () => {});
}

afterEach(() => {
  clearLabelRead();
  useAppStore.setState({ profile: EMPTY_PROFILE });
});

const LIST = ["water", "glycerin", "xanthan gum", "butylene glycol", "parfum", "linalool", "mystery extract"];
const LINE = "Ingredient check: 2 ingredients to watch · 1 not recognised";

describe("the label result's Ingredient check", () => {
  it("shows the same check without a profile and with one", async () => {
    await open(LIST);
    expect(screen.getByLabelText(LINE)).toBeTruthy();
    await act(async () => screen.unmount());

    useAppStore.setState({
      profile: { concerns: ["redness"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null },
    });
    await open(LIST);
    expect(screen.getByLabelText(LINE)).toBeTruthy();
  });

  it("opens the ingredient list when tapped", async () => {
    await open(LIST);
    await fireEvent.press(screen.getByLabelText(LINE));
    expect(screen.getByText("Close")).toBeTruthy();
  });

  it("says a thin read can't be checked, and doesn't offer a list that isn't there", async () => {
    await open(["water", "mystery extract", "another unknown"]);
    const check = screen.getByLabelText("Ingredient check: Not enough ingredients recognised to check");
    expect(check.props.accessibilityRole).toBeUndefined();
  });

  // #346: the quiz in place of an empty score, gone once the answers score.
  it("offers See your skin match with no profile, and not once the answers score", async () => {
    await open(LIST);
    expect(screen.getByText("See your skin match")).toBeTruthy();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "dry" } });
    await open(LIST);
    expect(screen.queryByText("See your skin match")).toBeNull();
  });

  it("asks for a retake, not the quiz, when the read can't be scored", async () => {
    await open(["water", "mystery extract", "another unknown"]);
    expect(screen.queryByText("See your skin match")).toBeNull();
    expect(screen.getByText("Retake the photo")).toBeTruthy();
  });
});
