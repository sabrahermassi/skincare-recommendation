import { render, screen } from "@testing-library/react-native";

import HowScoringWorks from "@/app/scoring";
import { SCORE_BANDS } from "@/lib/matching";

/** #325: the page renders every section, with the bands from SCORE_BANDS. */

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("How scoring works", () => {
  it("shows the bands and every section", async () => {
    await render(<HowScoringWorks />);
    expect(screen.getByText(`${SCORE_BANDS.excellent} and up`)).toBeTruthy();
    expect(screen.getByText(`Below ${SCORE_BANDS.fair}`)).toBeTruthy();
    for (const title of [
      "Your score is personal",
      "What the numbers mean",
      "What raises it",
      "What lowers it",
      "Pregnancy",
      "When there's no score",
      "What we don't do",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });
});
