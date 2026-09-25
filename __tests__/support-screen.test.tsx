import { render, screen } from "@testing-library/react-native";

import Support from "@/app/support";

jest.setTimeout(30000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => false, replace: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// #293: a photo alone gives a result; only a name, a barcode and an
// ingredient list put a product in the catalogue, and a second photo never
// replaces a list we already hold.
describe("Support", () => {
  it("says what a product needs before it is added to the catalogue", async () => {
    await render(<Support />);
    expect(screen.getByText(/we need its name, its barcode and the ingredient list/)).toBeTruthy();
    expect(screen.queryByText(/We read it and add the product/)).toBeNull();
  });

  it("does not promise that a new photo refreshes what we hold", async () => {
    await render(<Support />);
    expect(screen.queryByText(/refresh what we hold/)).toBeNull();
  });
});
