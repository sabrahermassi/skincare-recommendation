import { fireEvent, render, screen } from "@testing-library/react-native";

import { GlassButton } from "@/components/GlassButton";

/**
 * Every X in the app, the scanner's "i" and its torch are one glass button:
 * Apple's own SwiftUI glass button on iOS 26 and later, and a translucent disc
 * of the same size where Liquid Glass isn't available, so the layout never
 * changes. (`@expo/ui/swift-ui` is stood in for in jest.setup.js.)
 */

let mockGlass = true;
jest.mock("expo-glass-effect", () => ({ isLiquidGlassAvailable: () => mockGlass }));

afterEach(() => {
  mockGlass = true;
});

it("is Apple's SwiftUI glass button, round, icon only, with the SF Symbol asked for", async () => {
  const onPress = jest.fn();
  await render(<GlassButton symbol="xmark" icon="close" accessibilityLabel="Close" onPress={onPress} />);
  const button = screen.getByTestId("swiftui-button");
  expect(button.props.systemImage).toBe("xmark");
  expect(button.props.modifiers).toEqual(
    expect.arrayContaining([
      { $type: "buttonStyle", args: ["glass"] },
      { $type: "buttonBorderShape", args: ["circle"] },
      { $type: "labelStyle", args: ["iconOnly"] },
    ]),
  );
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("falls back to a plain disc without Liquid Glass, still a labelled button", async () => {
  mockGlass = false;
  const onPress = jest.fn();
  await render(<GlassButton symbol="xmark" icon="close" accessibilityLabel="Close" onPress={onPress} small />);
  expect(screen.queryByTestId("swiftui-button")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it("gives the small fallback disc a whole touch target around it", async () => {
  mockGlass = false;
  await render(<GlassButton symbol="xmark" icon="close" accessibilityLabel="Close" small />);
  expect(screen.getByRole("button", { name: "Close" }).props.hitSlop).toBeGreaterThanOrEqual(8);
});
