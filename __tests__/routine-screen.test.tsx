import { render, screen } from "@testing-library/react-native";

import Routine from "@/app/routine";

/** The Skincare routine screen, opened from Home: not built yet, and it says so. */

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

it("says the routine is coming soon, under its title", async () => {
  await render(<Routine />);
  expect(screen.getByText("Skincare routine")).toBeTruthy();
  expect(screen.getByRole("header", { name: "Coming soon" })).toBeTruthy();
  expect(screen.getByText("Your morning and evening routine will live here.")).toBeTruthy();
});
