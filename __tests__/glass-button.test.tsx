import { fireEvent, render, screen } from "@testing-library/react-native";

import { GlassButton } from "@/components/GlassButton";

/**
 * Every X in the app, the scanner's "i" and its torch are one glass button: iOS
 * Liquid Glass where the system has it, and a translucent disc of the same size
 * where it doesn't, so the layout never changes.
 */

let mockGlass = true;
jest.mock("expo-glass-effect", () => {
  const { View } = jest.requireActual("react-native");
  return {
    isLiquidGlassAvailable: () => mockGlass,
    GlassView: (props: object) => <View testID="glass" {...props} />,
  };
});

afterEach(() => {
  mockGlass = true;
});

it("draws iOS glass where the system has it, and still works as a button", async () => {
  const onPress = jest.fn();
  await render(<GlassButton icon="close" accessibilityLabel="Close" onPress={onPress} />);
  expect(screen.getByTestId("glass")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("falls back to a plain disc of the same size without Liquid Glass", async () => {
  mockGlass = false;
  await render(<GlassButton icon="close" accessibilityLabel="Close" size={28} />);
  expect(screen.queryByTestId("glass")).toBeNull();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
});

it("gives a small disc a whole touch target around it", async () => {
  await render(<GlassButton icon="close" accessibilityLabel="Close" size={28} />);
  expect(screen.getByRole("button", { name: "Close" }).props.hitSlop).toBeGreaterThanOrEqual(8);
});
