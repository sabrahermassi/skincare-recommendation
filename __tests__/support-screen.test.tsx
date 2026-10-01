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
    // Each answer opens under its question; only the first starts open (v9).
    expect(screen.queryByText(/we'll read it for you/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Why can't I find a product?" }));
    expect(screen.getByText(/we'll read it for you/)).toBeTruthy();
    expect(screen.queryByText(/add it to the catalogue|Name and add|add the product/i)).toBeNull();
  });

  it("opens the first answer, and one answer at a time", async () => {
    await render(<Support />);
    expect(screen.getByText(/recognise enough of the list/)).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Is my data sold?" }));
    expect(screen.queryByText(/recognise enough of the list/)).toBeNull();
    expect(screen.getByText(/we never sell your data/)).toBeTruthy();
  });

  it("keeps the answer for an ingredient list that looks wrong", async () => {
    await render(<Support />);
    await fireEvent.press(screen.getByRole("button", { name: "The ingredients look wrong" }));
    expect(screen.getByText(/labels can be misread/)).toBeTruthy();
  });

  it("does not promise that a new photo refreshes what we hold", async () => {
    await render(<Support />);
    expect(screen.queryByText(/refresh what we hold/)).toBeNull();
  });
});
