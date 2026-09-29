import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { COLORS } from "@/lib/colors";
import { BUTTON, INK } from "@/lib/tokens";

/**
 * The three button variants and the one disabled look (owner, 27 September
 * 2026): only colours differ between them, never the size.
 */

type Node = { props: { style?: StyleProp<ViewStyle> }; parent: Node | null };

const flat = (node: Node): ViewStyle => StyleSheet.flatten(node.props.style) ?? {};
/** The outer pill: the nearest ancestor of the button that carries its fill. */
function pill(label: string): ViewStyle {
  let node = screen.getByRole("button", { name: label }) as unknown as Node | null;
  while (node && !("backgroundColor" in flat(node))) node = node.parent;
  return flat(node!);
}
const labelColor = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color;
const inner = (label: string) => flat(screen.getByRole("button", { name: label }) as unknown as Node);

it("fills primary in the brand colour with a white label", async () => {
  await render(<PrimaryButton label="Continue" onPress={() => {}} />);
  expect(pill("Continue").backgroundColor).toBe(COLORS.buttonPrimary);
  expect(labelColor("Continue")).toBe("#FFFFFF");
});

it("gives secondary its lighter fill and an ink label, since white on it is too faint", async () => {
  await render(<PrimaryButton label="Back to list" variant="secondary" onPress={() => {}} />);
  expect(pill("Back to list").backgroundColor).toBe(COLORS.buttonSecondary);
  expect(labelColor("Back to list")).toBe(INK);
});

it("draws tertiary as an outline, inside the same height", async () => {
  await render(<PrimaryButton label="Edit" variant="tertiary" onPress={() => {}} />);
  expect(pill("Edit").backgroundColor).toBe("transparent");
  expect(inner("Edit")).toMatchObject({ height: 48, borderWidth: 1.5, borderColor: COLORS.buttonTertiary });
  expect(labelColor("Edit")).toBe(COLORS.buttonTertiary);
});

it("looks the same disabled in every variant, and does nothing when pressed", async () => {
  const onPress = jest.fn();
  await render(
    <>
      <PrimaryButton label="A" disabled onPress={onPress} />
      <PrimaryButton label="B" variant="secondary" disabled onPress={onPress} />
      <PrimaryButton label="C" variant="tertiary" disabled onPress={onPress} />
    </>,
  );
  for (const label of ["A", "B", "C"]) {
    expect(pill(label).backgroundColor).toBe(BUTTON.disabled.fill);
    expect(labelColor(label)).toBe(BUTTON.disabled.label);
    await fireEvent.press(screen.getByRole("button", { name: label }));
  }
  expect(onPress).not.toHaveBeenCalled();
});
