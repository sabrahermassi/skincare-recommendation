import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import Onboarding from "@/app/onboarding";
import { scaleThatFits } from "@/components/shell/OnboardingShell";
import { noteProfileErased } from "@/lib/erase-notice";
import { COLORS } from "@/lib/colors";
import { CANVAS } from "@/lib/tokens";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The intro (per #155): the three screens with their watercolor heroes, on the
 * same cream as every other screen (`CANVAS`), and the "Your profile is erased"
 * toast sitting flush on it.
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

const background = (node: { props: { style?: StyleProp<ViewStyle> } }) => StyleSheet.flatten(node.props.style)?.backgroundColor;

type Node = { props?: { style?: StyleProp<ViewStyle> }; children?: (Node | string)[] | null };

/** Every background colour painted on screen. */
function backgrounds(tree: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (node: Node | string | null | undefined) => {
    if (!node || typeof node === "string") return;
    const color = StyleSheet.flatten(node.props?.style)?.backgroundColor;
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

// The pictures pass each other between screens (7 October 2026): the one shown is at rest and
// full size, the others wait faded out, a little to the side and a little smaller.
it("rests the shown hero and holds the others aside, faded and smaller", async () => {
  await render(<Onboarding />);
  const placed = screen.getAllByTestId("image").map((image) => {
    const style = StyleSheet.flatten(image.parent?.props.style as StyleProp<ViewStyle>);
    const moves = Object.assign({}, ...((style?.transform as object[] | undefined) ?? [])) as { translateX: number; scale: number };
    return { opacity: style?.opacity, ...moves };
  });
  expect(placed[0]).toEqual({ opacity: 1, translateX: 0, scale: 1 });
  expect(placed[1].opacity).toBe(0);
  expect(Math.abs(placed[1].translateX)).toBeGreaterThan(0);
  expect(placed[1].scale).toBeLessThan(1);
});

it("paints the intro on the app's one background colour and no other", async () => {
  await render(<Onboarding />);
  const painted = backgrounds(screen.toJSON());
  expect(painted).toContain(CANVAS);
  // The intro's own cream from before every screen shared one (#FDFAF2).
  expect(painted).not.toContain("#FDFAF2");
});

it("puts the erased-profile toast on the page's cream, so it sits flush", async () => {
  noteProfileErased();
  await render(<Onboarding />);
  const toast = screen.getByRole("alert");
  expect(background(toast)).toBe(CANVAS);
  expect(screen.getByText("Your profile is erased")).toBeTruthy();
});

it("ends on Get started, which finishes the intro", async () => {
  await render(<Onboarding />);
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.press(screen.getByText("Continue"));
  await act(async () => fireEvent.press(screen.getByText("Get started")));
  expect(useAppStore.getState().hasSeenOnboarding).toBe(true);
});

// The owner's type spec (26 September 2026): the first line of each headline
// in the accent colour and the rest in ink, muted subtext and Skip, and a flat
// pill button in the intro's own colours.
const textStyle = (node: { props: { style?: StyleProp<ViewStyle> } }) => StyleSheet.flatten(node.props.style) as Record<string, unknown>;

it("colours the headline's first line as the accent and the rest as ink", async () => {
  await render(<Onboarding />);
  expect(textStyle(screen.getByText("Scan any")).color).toBe(COLORS.introAccent);
  expect(textStyle(screen.getByText("skincare product")).color).toBe(COLORS.introInk);
  expect(textStyle(screen.getByText("Scan any")).fontFamily).toBe("PTSerif_700Bold");
});

it("shows each screen's sentence in the muted colour, and moves through all three", async () => {
  await render(<Onboarding />);
  const first = screen.getByText("Point your camera at a barcode or ingredient list.");
  expect(textStyle(first).color).toBe(COLORS.introMuted);
  await fireEvent.press(screen.getByText("Continue"));
  // The words change halfway through the slide.
  expect(await screen.findByText("Know")).toBeTruthy();
  expect(screen.getByText("We read the ingredient list and flag what may irritate or clog pores.")).toBeTruthy();
  await fireEvent.press(screen.getByText("Continue"));
  expect(await screen.findByText("Find what fits")).toBeTruthy();
  expect(screen.getByText("Add your skin type and concerns to see how each product may suit you.")).toBeTruthy();
});

it("draws the button in the primary button colours, and Skip in the muted one", async () => {
  await render(<Onboarding />);
  const button = screen.getByRole("button", { name: "Continue" });
  expect(textStyle(button).backgroundColor).toBe(COLORS.buttonPrimary);
  expect(textStyle(screen.getByText("Continue")).color).toBe(COLORS.buttonPrimaryText);
  expect(textStyle(screen.getByText("Skip")).color).toBe(COLORS.introMuted);
});

// Moving through the intro by VoiceOver and by swipe (onboarding critique, 6 October 2026).
const swipe = async (dx: number, dy = 0) => {
  const root = screen.getByTestId("onboarding-shell");
  await fireEvent(root, "touchStart", { nativeEvent: { touches: [{}], pageX: 200, pageY: 400 } });
  await fireEvent(root, "touchEnd", { nativeEvent: { touches: [], pageX: 200 + dx, pageY: 400 + dy } });
};

it("labels the dots as one element, 'Page n of 3', that follows the active screen", async () => {
  await render(<Onboarding />);
  expect(screen.getByLabelText("Page 1 of 3")).toBeTruthy();
  await fireEvent.press(screen.getByText("Continue"));
  expect(screen.getByLabelText("Page 2 of 3")).toBeTruthy();
  // Let the slide finish, so it cannot announce during the next test.
  await screen.findByText("Know");
});

it("announces the new headline once the words change", async () => {
  // Jest's own mock of AccessibilityInfo already holds the calls earlier tests made.
  const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
  announce.mockClear();
  await render(<Onboarding />);
  expect(announce).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Continue"));
  await screen.findByText("Know");
  expect(announce).toHaveBeenCalledWith("Know what's inside");
  announce.mockRestore();
});

it("moves forward on a swipe left and back on a swipe right", async () => {
  await render(<Onboarding />);
  await swipe(-120);
  expect(await screen.findByText("Know")).toBeTruthy();
  await swipe(120);
  expect(await screen.findByText("Scan any")).toBeTruthy();
});

it("leaves a tap and a vertical drag alone, and a swipe left on the last screen", async () => {
  await render(<Onboarding />);
  await swipe(0);
  await swipe(-120, 200);
  expect(screen.getByText("Scan any")).toBeTruthy();
  await fireEvent.press(screen.getByText("Continue"));
  await screen.findByText("Know");
  await fireEvent.press(screen.getByText("Continue"));
  await screen.findByText("Find what fits");
  await swipe(-120);
  expect(useAppStore.getState().hasSeenOnboarding).toBe(false);
});

// A larger text setting grows the headline only as far as its band holds it.
describe("scaleThatFits", () => {
  const band = { top: 64.5, bottom: 76.5 };
  it("allows the full 1.3 when the band has room", () => {
    expect(scaleThatFits(2000, band, 79)).toBe(1.3);
  });

  it("stops where the band is full on a short phone", () => {
    const scale = scaleThatFits(667, band, 79);
    expect(scale).toBeGreaterThanOrEqual(1);
    expect(scale).toBeLessThan(1.3);
    expect(79 * scale).toBeLessThanOrEqual((667 * 12) / 100 + 0.001);
  });

  it("never goes below the base size", () => {
    expect(scaleThatFits(300, band, 79)).toBe(1);
  });
});
