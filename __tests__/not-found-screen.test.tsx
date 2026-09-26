import { fireEvent, render, screen } from "@testing-library/react-native";

import NotFound from "@/app/+not-found";

jest.setTimeout(30000);

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => false, replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// #298: a broken link showed Expo Router's own "Unmatched Route" page.
describe("NotFound", () => {
  beforeEach(() => mockReplace.mockClear());

  it("says the page wasn't found and offers Home", async () => {
    await render(<NotFound />);
    expect(screen.getByText("Page not found")).toBeTruthy();
    await fireEvent.press(screen.getByText("Go to Home"));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("goes Home from Back when there is nothing to go back to", async () => {
    await render(<NotFound />);
    await fireEvent.press(screen.getByLabelText("Back"));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
