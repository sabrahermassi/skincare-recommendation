import { act, fireEvent, render, screen } from "@testing-library/react-native";

import HowScoringWorks from "@/app/scoring";
import { SCORE_BANDS } from "@/lib/matching";

/** #325: the page renders every section, with the bands from SCORE_BANDS (v7 layout). */

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockParams = {};
});

/** The bar only draws its marker once it knows its width. */
async function layOutBar() {
  await act(async () => fireEvent(screen.getByTestId("band-bar"), "layout", { nativeEvent: { layout: { width: 300, height: 44 } } }));
}

describe("How scoring works", () => {
  it("shows the bands and every section", async () => {
    await render(<HowScoringWorks />);
    expect(screen.getByText(`${SCORE_BANDS.excellent} to 100`)).toBeTruthy();
    expect(screen.getByText(`0 to ${SCORE_BANDS.fair - 1}`)).toBeTruthy();
    for (const title of [
      "How scoring works",
      "What the numbers mean",
      "What goes into it",
      "Raises it",
      "Lowers it",
      "Doesn't count",
      "Order on the label",
      "Good to know",
      "Pregnancy warnings",
      "Sometimes there is no score",
      "It's about you",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("marks the product's score on the bar when opened from a result", async () => {
    mockParams = { score: "84" };
    await render(<HowScoringWorks />);
    await layOutBar();
    expect(await screen.findByLabelText("This product scored 84")).toBeTruthy();
  });

  it.each([["no score", undefined], ["a score over 100", "140"], ["something that isn't a number", "abc"]])(
    "draws no marker with %s",
    async (_: string, score: string | undefined) => {
      mockParams = score ? { score } : {};
      await render(<HowScoringWorks />);
      await layOutBar();
      expect(screen.queryByLabelText(/This product scored/)).toBeNull();
    },
  );
});
