import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { IconCircle } from "@/components/IconCircle";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";

/**
 * Where the phone has Liquid Glass, the things that float over a screen are
 * glass and the things that are read stay flat (DESIGN.md, "Glass"). Jest has
 * no glass, so this file pretends it does.
 */

jest.mock("@/components/Glass", () => {
  const { View } = jest.requireActual("react-native");
  return { ...jest.requireActual("@/components/Glass"), hasLiquidGlass: true, Glass: (props: object) => <View testID="glass" {...props} /> };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

it("makes a floating pop-up glass, with no white card under it", async () => {
  await render(
    <BottomSheet visible onClose={jest.fn()} floating>
      <Text>Pop-up</Text>
    </BottomSheet>,
  );
  expect(screen.getByTestId("glass")).toBeTruthy();
  expect(screen.getByTestId("sheet-card")).not.toHaveStyle({ backgroundColor: "#FFFFFF" });
});

it("keeps a pop-up's close button flat, and a button elsewhere glass", async () => {
  const close = (
    <IconCircle onPress={jest.fn()} accessibilityLabel="Close">
      <Text>X</Text>
    </IconCircle>
  );
  await render(
    <BottomSheet visible onClose={jest.fn()} floating corner={close}>
      <Text>Pop-up</Text>
    </BottomSheet>,
  );
  // One glass: the pop-up's own.
  expect(screen.getAllByTestId("glass")).toHaveLength(1);
  await render(close);
  expect(screen.getAllByTestId("glass")).toHaveLength(1);
});

it("keeps a reading sheet flat", async () => {
  await render(
    <BottomSheet visible onClose={jest.fn()}>
      <Text>Reading</Text>
    </BottomSheet>,
  );
  expect(screen.queryByTestId("glass")).toBeNull();
});

const OPTIONS = [
  { value: "a", label: "One" },
  { value: "b", label: "Two" },
];
const laidOut = () => fireEvent(screen.getByRole("tab", { name: "One" }).parent!, "layout", { nativeEvent: { layout: { width: 300, height: 40 } } });

it("gives the page looks a glass thumb", async () => {
  await render(<SegmentedSwitch options={OPTIONS} selected="a" onSelect={jest.fn()} tone="light" />);
  await laidOut();
  expect(screen.getByTestId("glass")).toBeTruthy();
});

it("leaves the camera's thumb as it was", async () => {
  await render(<SegmentedSwitch options={OPTIONS} selected="a" onSelect={jest.fn()} tone="dark" />);
  await laidOut();
  expect(screen.queryByTestId("glass")).toBeNull();
});
