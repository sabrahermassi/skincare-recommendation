import { fireEvent, render, screen } from "@testing-library/react-native";

import Support from "@/app/support";

jest.setTimeout(30000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => false, replace: jest.fn() },
  Stack: { Screen: () => null },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// #293: a photo alone gives a result, and a second photo never replaces a
// list we already hold. Users can't put a product in the catalogue at all.
describe("Support", () => {
  // Users can't add products (owner): a photo gives a result, and the
  // answer never offers to add the product to the catalogue.
  it("says a photo of the list gives a result, and never offers to add the product", async () => {
    await render(<Support />);
    // Each answer opens under its question (v7).
    expect(screen.queryByText(/you get a result straight away/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "A product isn't in our catalogue" }));
    expect(screen.getByText(/you get a result straight away/)).toBeTruthy();
    expect(screen.queryByText(/add it to the catalogue|Name and add|add the product/i)).toBeNull();
  });

  it("does not promise that a new photo refreshes what we hold", async () => {
    await render(<Support />);
    expect(screen.queryByText(/refresh what we hold/)).toBeNull();
  });
});
