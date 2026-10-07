import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

/**
 * `Glass` is Liquid Glass on iOS 26 and later and the frosted blur everywhere
 * else (owner, 7 October 2026). The choice is made once, when the module loads,
 * so each case loads it afresh with the phone it is pretending to be.
 */
function loadGlass(liquid: boolean) {
  jest.resetModules();
  jest.doMock("expo-glass-effect", () => {
    const { View } = jest.requireActual("react-native");
    return {
      isLiquidGlassAvailable: () => liquid,
      isGlassEffectAPIAvailable: () => liquid,
      GlassView: (props: object) => <View testID="liquid-glass" {...props} />,
    };
  });
  jest.doMock("expo-blur", () => {
    const { View } = jest.requireActual("react-native");
    return { BlurView: (props: object) => <View testID="blur" {...props} /> };
  });
  return require("@/components/Glass") as typeof import("@/components/Glass");
}

it("draws the real glass, and no blur, where the phone has it", async () => {
  const { Glass, hasLiquidGlass } = loadGlass(true);
  expect(hasLiquidGlass).toBe(true);
  await render(
    <Glass fill="#fff" tint="#eee">
      <Text>inside</Text>
    </Glass>,
  );
  expect(screen.getByTestId("liquid-glass")).toBeTruthy();
  expect(screen.queryByTestId("blur")).toBeNull();
  expect(screen.getByText("inside")).toBeTruthy();
});

it("draws the frosted blur, and no glass, where it does not", async () => {
  const { Glass, hasLiquidGlass } = loadGlass(false);
  expect(hasLiquidGlass).toBe(false);
  await render(
    <Glass fill="#fff">
      <Text>inside</Text>
    </Glass>,
  );
  expect(screen.getByTestId("blur")).toBeTruthy();
  expect(screen.queryByTestId("liquid-glass")).toBeNull();
  expect(screen.getByText("inside")).toBeTruthy();
});
