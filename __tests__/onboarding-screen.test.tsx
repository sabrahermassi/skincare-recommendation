import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import Onboarding from "@/app/onboarding";
import { noteProfileErased } from "@/lib/erase-notice";
import { CANVAS, ONBOARDING_CANVAS } from "@/lib/tokens";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The intro (per #155): the three screens with their watercolor heroes, on the
 * intro's own lighter cream, and the "Your profile is erased" toast sitting
 * flush on that cream rather than on the rest of the app's.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});

const HEROES = [
  require("@/assets/illustrations/onboarding/hero-scan.webp"),
  require("@/assets/illustrations/onboarding/hero-ingredients.webp"),
  require("@/assets/illustrations/onboarding/hero-for-me.webp"),
];

const background = (node: { props: { style?: unknown } }) => StyleSheet.flatten(node.props.style)?.backgroundColor;

type Node = { props?: { style?: unknown }; children?: (Node | string)[] | null };

/** Every background colour painted on screen. */
function backgrounds(tree: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (node: Node | string | null | undefined) => {
    if (!node || typeof node === "string") return;
    const color = StyleSheet.flatten(node.props?.style as never)?.backgroundColor;
    if (color) out.push(color);
    node.children?.forEach(walk);
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n) => walk(n as Node));
  return out;
}

beforeEach(() => {
  useAppStore.setState({ hasSeenOnboarding: false, profile: EMPTY_PROFILE });
});

it("shows one watercolor hero per screen, in order", async () => {
  await render(<Onboarding />);
  expect(screen.getAllByTestId("image").map((image) => image.props.source)).toEqual(HEROES);
});

it("paints the intro on its own cream, not the app's", async () => {
  await render(<Onboarding />);
  const painted = backgrounds(screen.toJSON());
  expect(painted).toContain(ONBOARDING_CANVAS);
  expect(painted).not.toContain(CANVAS);
});

it("puts the erased-profile toast on the intro's cream, so it sits flush", async () => {
  noteProfileErased();
  await render(<Onboarding />);
  const toast = screen.getByRole("alert");
  expect(background(toast)).toBe(ONBOARDING_CANVAS);
  expect(screen.getByText("Your profile is erased")).toBeTruthy();
});

it("ends on Get started, which finishes the intro", async () => {
  await render(<Onboarding />);
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Continue"));
  await act(async () => fireEvent.press(screen.getByText("Get started")));
  expect(useAppStore.getState().hasSeenOnboarding).toBe(true);
});
