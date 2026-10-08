import { render, screen } from "@testing-library/react-native";

import Privacy from "@/app/privacy";

/**
 * The privacy page credits only the sources the app still uses: UPCitemdb
 * left `product-lookup` in 5df2173, so it is no longer named here.
 */

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe("Privacy policy", () => {
  it("credits Open Beauty Facts and DailyMed, and no longer names UPCitemdb", async () => {
    await render(<Privacy />);
    expect(screen.getByText("Where product data comes from")).toBeTruthy();
    expect(screen.getByText("Product data from Open Beauty Facts, used under ODbL.")).toBeTruthy();
    expect(screen.getByText(/Label data from DailyMed/)).toBeTruthy();
    expect(screen.queryByText(/UPCitemdb/)).toBeNull();
  });

  // #386 review: the "In short" card's promises are each made in full below it.
  it("backs the short version's no-selling and no-ads promise with a line of the policy", async () => {
    await render(<Privacy />);
    expect(screen.getByText(/no ads, no selling your data/)).toBeTruthy();
    expect(screen.getByText("We do not sell your data, and there are no ads in the app.")).toBeTruthy();
  });

  // #471: the consent screen's promise, said in full on the page it links to.
  it("says the quiz asks first, keeps the date on the phone, and what Not now leaves", async () => {
    await render(<Privacy />);
    expect(screen.getByText(/the date you agreed is kept on this phone/)).toBeTruthy();
    expect(screen.getByText(/If you choose Not now/)).toBeTruthy();
  });
});
