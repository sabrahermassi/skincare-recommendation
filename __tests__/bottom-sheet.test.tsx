import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { Pressable, StyleSheet, Text } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";

/**
 * A long sheet (Why this score on a 50-ingredient product) used to grow past
 * the top of the screen, taking its X under the status bar (owner). It now
 * stops short of the top, scrolls its content, and keeps the X pinned.
 */

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: 1 }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));

it("stops short of the status bar and scrolls, with its X outside the scroll", async () => {
  await render(
    <BottomSheet
      visible
      onClose={jest.fn()}
      floating
      corner={
        <Pressable accessibilityRole="button" accessibilityLabel="Close sheet">
          <Text>X</Text>
        </Pressable>
      }
    >
      <Text>Long content</Text>
    </BottomSheet>,
  );
  // The screen, less the status bar, the gap under it and the float inset.
  expect(StyleSheet.flatten(screen.getByTestId("sheet-card").props.style).maxHeight).toBe(874 - 62 - 12 - 10);
  const scroll = screen.getByTestId("sheet-scroll");
  expect(within(scroll).getByText("Long content")).toBeTruthy();
  expect(within(scroll).queryByLabelText("Close sheet")).toBeNull();
  expect(screen.getByLabelText("Close sheet")).toBeTruthy();
});

it("slides in over its own height, not the screen's", async () => {
  const onClose = jest.fn();
  const sheet = () => (
    <BottomSheet visible onClose={onClose}>
      <Text>Short</Text>
    </BottomSheet>
  );
  await render(sheet());
  const slide = () => screen.getByTestId("sheet-card").parent!;
  const lift = () => (StyleSheet.flatten(slide().props.style).transform as { translateY: number }[])[0].translateY;
  const start = lift();
  await act(async () => fireEvent(slide(), "layout", { nativeEvent: { layout: { height: 300 } } }));
  // Drawn again, since a moved value alone does not redraw in a test.
  await screen.rerender(sheet());
  expect(lift() / start).toBeCloseTo(300 / 874);
});
