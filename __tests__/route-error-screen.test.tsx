import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Try } from "expo-router/build/views/Try";
import { useState } from "react";
import { Text } from "react-native";

import { ROUTE_ERROR_COPY, RouteErrorScreen } from "@/components/RouteErrorScreen";

/**
 * A render crash shows a way out (#152), through the same boundary Expo
 * Router wraps each route in, and "Try again" renders the screen again.
 */

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// The root layout's stylesheet import; Jest has no CSS transform.
jest.mock("../global.css", () => ({}));

let mockBroken = true;
function Flaky() {
  const [shown] = useState("fine now");
  if (mockBroken) throw new Error("boom");
  return <Text>{shown}</Text>;
}

beforeEach(() => {
  mockBroken = true;
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

it("shows the error screen instead of a crash, and Try again renders the screen again", async () => {
  await render(
    <Try catch={RouteErrorScreen}>
      <Flaky />
    </Try>,
  );
  expect(screen.getByText(ROUTE_ERROR_COPY.heading)).toBeTruthy();

  mockBroken = false;
  await act(async () => fireEvent.press(screen.getByText(ROUTE_ERROR_COPY.retry)));
  expect(screen.getByText("fine now")).toBeTruthy();
});

it("is what the root layout hands Expo Router as its ErrorBoundary", () => {
  const layout = require("@/app/_layout") as { ErrorBoundary?: unknown };
  expect(layout.ErrorBoundary).toBe(RouteErrorScreen);
});
