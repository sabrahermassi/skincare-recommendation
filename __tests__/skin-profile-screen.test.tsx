import { act, fireEvent, render, screen } from "@testing-library/react-native";

import SkinProfileScreen from "@/app/skin-profile";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The Skin profile screen (owner's reference, a settings list): each answer on
 * its own row with its value; a row opens that question as a sheet, and a
 * choice saves at once.
 */

jest.setTimeout(30000);

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => useAppStore.setState({ profile: EMPTY_PROFILE }));

it("lists every answer with its value, and says Not set before any", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily", concerns: ["large-pores"] } });
  await render(<SkinProfileScreen />);
  expect(screen.getByRole("button", { name: "Skin type: Oily" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Skin concerns: Enlarged pores" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pregnancy: Not set" })).toBeTruthy();
});

it("saves a skin type the moment it is chosen", async () => {
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin type: Not set" })));
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "Dry" })));
  expect(useAppStore.getState().profile.baseSkinType).toBe("dry");
});

it("adds and removes concerns in place, up to the limit", async () => {
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin concerns: Not set" })));
  await act(async () => fireEvent.press(screen.getByRole("checkbox", { name: "Dullness" })));
  expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
  await act(async () => fireEvent.press(screen.getByRole("checkbox", { name: "Dullness" })));
  expect(useAppStore.getState().profile.concerns).toEqual([]);
});
