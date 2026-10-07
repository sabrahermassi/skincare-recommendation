import { fireEvent, render, screen } from "@testing-library/react-native";

import HowScoringWorks from "@/app/scoring";
import { SCORE_BANDS } from "@/lib/matching";

/** #325: the sheet renders every section, with the bands from SCORE_BANDS (v9 layout). */

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("How scoring works", () => {
  it("shows the bands as pills and every section, on a sheet", async () => {
    await render(<HowScoringWorks />);
    expect(screen.getByTestId("sheet-screen")).toBeTruthy();
    expect(screen.getByText(`Excellent · ${SCORE_BANDS.excellent}–100`)).toBeTruthy();
    expect(screen.getByText(`Poor · 0–${SCORE_BANDS.fair - 1}`)).toBeTruthy();
    for (const title of [
      "How scoring works",
      "Your score shows how well a product fits your skin profile.",
      "What the numbers mean",
      "How we score",
      "Raises it",
      "Lowers it",
      "Doesn't count",
      "Good to know",
      "Pregnancy warnings",
      "Sometimes there is no score",
      "It's about you",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  // #472: the sentence about where the facts come from is the honest one, and the old promise is gone.
  it("says where the facts come from without promising every ingredient is checked", async () => {
    await render(<HowScoringWorks />);
    expect(screen.getByText(/We match ingredient names against the EU's CosIng list and our own ingredient notes\. Where we have a source, it's on the ingredient's page\. Some ingredients we don't recognise yet\./)).toBeTruthy();
    expect(screen.queryByText(/Every ingredient is checked/)).toBeNull();
  });

  it("closes from its X", async () => {
    const { router } = jest.requireMock<typeof import("expo-router")>("expo-router");
    await render(<HowScoringWorks />);
    await fireEvent.press(screen.getAllByRole("button", { name: "Close" }).at(-1)!);
    expect(router.back).toHaveBeenCalled();
  });
});
