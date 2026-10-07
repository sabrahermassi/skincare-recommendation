import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Journey from "@/app/journey";
import { decodeAnswers } from "@/lib/skin-needs";
import { GOALS } from "@/lib/journey";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * Skin needs (design_handoff "october 3d", per #155): the questions, then
 * "What can help?", a carousel of up to three actives. A card opens its story.
 */

jest.setTimeout(30_000);

let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => true }));

afterEach(() => {
  mockFontScale = 1;
  useAppStore.setState({ profile: EMPTY_PROFILE, routineActives: [], savedIngredients: [] });
  jest.mocked(router.push).mockClear();
});

// A goal past the first few sits behind "more": open it as a person would.
const pick = async (name: string) => {
  if (!screen.queryByRole("radio", { name })) {
    const more = screen.queryByRole("button", { name: /more goals$/ });
    if (more) await fireEvent.press(more);
  }
  await fireEvent.press(screen.getByRole("radio", { name }));
};
const tick = (name: string) => fireEvent.press(screen.getByRole("checkbox", { name }));
const show = () => fireEvent.press(screen.getByRole("button", { name: "Show what helps" }));
const card = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}, `) });

// Owner, 7 October 2026: asked once. Sensitivity and pregnancy start from the profile; the goal never does.
it("starts sensitivity and pregnancy from the skin profile, and the goal fresh", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["acne-prone"], sensitivity: "high", pregnancyStatus: "pregnant" } });
  await render(<Journey />);
  expect(screen.getByRole("radio", { name: "Clear pimples" }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole("radio", { name: "Sensitive skin: Very" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole("radio", { name: "Pregnant or breastfeeding: Yes" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getAllByText("From your profile")).toHaveLength(2);
  await pick("Lines and wrinkles");
  await show();
  // The profile's pregnancy is carried in: retinoids are left out.
  expect(screen.queryByRole("button", { name: /^Retinoids, / })).toBeNull();
});

it("lets a profile answer be changed, and then it no longer says it came from the profile", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, sensitivity: "high", pregnancyStatus: "neither" } });
  await render(<Journey />);
  await pick("Sensitive skin: Somewhat");
  expect(screen.getByRole("radio", { name: "Sensitive skin: Somewhat" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getAllByText("From your profile")).toHaveLength(1);
  // Picking the profile's answer again does not bring the tag back: it was chosen here.
  await pick("Sensitive skin: Very");
  expect(screen.getByRole("radio", { name: "Sensitive skin: Very" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getAllByText("From your profile")).toHaveLength(1);
});

it("asks everything when the profile is empty", async () => {
  await render(<Journey />);
  // A question's tag is a meta line: medium, not semibold.
  expect(screen.getByText("Pick one")).toHaveStyle({ fontWeight: "500" });
  expect(screen.queryByText("From your profile")).toBeNull();
  expect(screen.getByRole("radio", { name: "Sensitive skin: Very" }).props.accessibilityState.checked).toBe(false);
});

it("shows the first goals and the rest a tap away, open at once for a goal in the rest", async () => {
  await render(<Journey />);
  expect(screen.getByRole("radio", { name: GOALS[0].label })).toBeTruthy();
  expect(screen.queryByRole("radio", { name: GOALS[GOALS.length - 1].label })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: /more goals$/ }));
  expect(GOALS.every((goal) => screen.getByRole("radio", { name: goal.label }))).toBe(true);
  expect(screen.queryByRole("button", { name: /more goals$/ })).toBeNull();
});

// The title sits beside its tag, so the pair kept together only applies while text is at its normal size.
it("keeps the last two words of a question together, until the text size grows", async () => {
  await render(<Journey />);
  expect(screen.getByRole("header", { name: "What do you want to work on?" }).props.children).toBe("What do you want to work\u00A0on?");
  await screen.unmount();
  mockFontScale = 1.5;
  await render(<Journey />);
  expect(screen.getByRole("header", { name: "What do you want to work on?" }).props.children).toBe("What do you want to work on?");
});

it("keeps Show what helps off until a goal is picked (Q0), and takes one goal only", async () => {
  await render(<Journey />);
  expect(screen.getByRole("button", { name: "Show what helps" }).props.accessibilityState.disabled).toBe(true);
  await pick("Clear pimples");
  await pick("Calm redness");
  expect(screen.getByRole("radio", { name: "Clear pimples" }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole("radio", { name: "Calm redness" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole("button", { name: "Show what helps" }).props.accessibilityState.disabled).toBe(false);
});

it("takes an optional answer back when it is tapped again", async () => {
  await render(<Journey />);
  await pick("Sensitive skin: Somewhat");
  expect(screen.getByRole("radio", { name: "Sensitive skin: Somewhat" }).props.accessibilityState.checked).toBe(true);
  await pick("Sensitive skin: Somewhat");
  expect(screen.getByRole("radio", { name: "Sensitive skin: Somewhat" }).props.accessibilityState.checked).toBe(false);
});

it("lights only the active chip tapped, though glycolic and AHA are one active", async () => {
  await render(<Journey />);
  await tick("Glycolic acid");
  expect(screen.getByRole("checkbox", { name: "Glycolic acid" }).props.accessibilityState.checked).toBe(true);
  expect(screen.getByRole("checkbox", { name: "AHA acids" }).props.accessibilityState.checked).toBe(false);
});

it("shows three options for Control oil, BHA first, with the answers as chips", async () => {
  await render(<Journey />);
  await pick("Control oil");
  await pick("Sensitive skin: Somewhat");
  await pick("Pregnant or breastfeeding: No");
  await show();
  expect(screen.getByRole("header", { name: "What can help with oiliness?" })).toBeTruthy();
  expect(screen.getByText("Based on your answers, here are 3 options worth knowing.")).toBeTruthy();
  expect(screen.getByText("Somewhat sensitive")).toBeTruthy();
  expect(screen.getByText("Not pregnant or breastfeeding")).toBeTruthy();
  expect(screen.getByText("Best first pick")).toBeTruthy();
  expect(card("BHA")).toBeTruthy();
  expect(card("Niacinamide")).toBeTruthy();
  expect(card("Retinoids")).toBeTruthy();
  expect(screen.getByText("swipe for 2 more")).toBeTruthy();
});

it("hides the unsafe ones after a yes, and says which (1p)", async () => {
  await render(<Journey />);
  await pick("Control oil");
  await pick("Pregnant or breastfeeding: Yes");
  await show();
  expect(screen.queryByRole("button", { name: /^BHA, / })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Retinoids, / })).toBeNull();
  expect(screen.getByText("BHA and Retinoids are hidden while you're pregnant or breastfeeding.")).toBeTruthy();
  expect(screen.getByText("Based on your answers, here are 3 safe options.")).toBeTruthy();
  // A safe one from the same family, and one from a nearby family for the gap (owner).
  expect(card("PHA")).toBeTruthy();
  expect(card("Azelaic acid")).toBeTruthy();
});

it("treats a skipped pregnancy as yes, and Change shows every option (1s)", async () => {
  await render(<Journey />);
  await pick("Control oil");
  await show();
  expect(screen.getByText("Pregnancy: skipped")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^BHA, / })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Not pregnant: show every option" }));
  expect(card("BHA")).toBeTruthy();
  expect(screen.getByText("Not pregnant or breastfeeding")).toBeTruthy();
});

it("puts the gentlest first for very sensitive skin", async () => {
  await render(<Journey />);
  await pick("Control oil");
  await pick("Sensitive skin: Very");
  await pick("Pregnant or breastfeeding: No");
  await show();
  const names = screen.getAllByRole("button", { name: /, .* quick cards/ }).map((button) => String(button.props.accessibilityLabel).split(",")[0]);
  expect(names).toEqual(["PHA", "Niacinamide", "Bakuchiol"]);
});

it("opens a card's story with the answers", async () => {
  await render(<Journey />);
  await pick("Control oil");
  await pick("Pregnant or breastfeeding: No");
  await tick("Retinol, other OTC retinoids");
  await show();
  await fireEvent.press(card("BHA"));
  const call = jest.mocked(router.push).mock.calls[0][0] as { pathname: string; params: { active: string; answers: string } };
  expect(call.pathname).toBe("/journey-story");
  expect(call.params.active).toBe("bha");
  expect(decodeAnswers(call.params.answers, GOALS.map((goal) => goal.key))).toEqual({ goal: "oil", sensitivity: null, pregnancy: "no", uses: ["retinoids"] });
});

it("stars an option to Saved › Ingredients, and marks one already in the routine", async () => {
  useAppStore.setState({ routineActives: [{ active: "bha", time: "evening", days: [0, 3] }] });
  await render(<Journey />);
  await pick("Control oil");
  await pick("Pregnant or breastfeeding: No");
  await show();
  await fireEvent.press(screen.getByRole("button", { name: "Save Niacinamide to your ingredients" }));
  expect(useAppStore.getState().savedIngredients).toContain("niacinamide");
  expect(screen.getByText("In your routine")).toBeTruthy();
  expect(screen.getByText("add another?")).toBeTruthy();
});

// The deck's dots follow the scroll position (7 October 2026); before any swipe the first is the current one.
it("shows a dot for each option, the first one current", async () => {
  await render(<Journey />);
  await pick("Control oil");
  await pick("Pregnant or breastfeeding: No");
  await show();
  expect(screen.getByLabelText(/^Option 1: /).props.accessibilityState.selected).toBe(true);
  expect(screen.getByLabelText(/^Option 2: /).props.accessibilityState.selected).toBe(false);
});

it("goes back from the options to the questions with the answers kept", async () => {
  await render(<Journey />);
  await pick("Clear pimples");
  await show();
  await fireEvent.press(screen.getByRole("button", { name: "Back to the questions" }));
  expect(screen.getByRole("radio", { name: "Clear pimples" }).props.accessibilityState.checked).toBe(true);
});
