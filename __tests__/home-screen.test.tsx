import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";
import { openScanner } from "@/lib/open-scanner";

/**
 * Home (per #155, v9 design): the "Hi there!" greeting, the scan card (one
 * big button), Explore's two tiles — Skin Needs (the journey) and Skincare
 * Routine — and today's tip, an envelope that opens a sheet.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Reduce Motion on: a tap acts at once, with no bounce delay to wait out.
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => true }));

it("shows the title, the scan card and the two tiles, and no Search or finder", async () => {
  await render(<Home />);
  expect(screen.getByRole("header", { name: "Hi there!" })).toBeTruthy();
  expect(screen.getByText("Scan Any Product")).toBeTruthy();
  expect(screen.getByRole("header", { name: "Explore" })).toBeTruthy();
  expect(screen.queryByText("Your skin profile")).toBeNull();
  for (const tile of ["Skin Needs", "Skincare Routine"]) expect(screen.getByRole("button", { name: tile })).toBeTruthy();
  for (const gone of ["Search", "My match"]) expect(screen.queryByRole("button", { name: gone })).toBeNull();
});

it("opens the scanner from anywhere on the scan card", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Scan Any Product" }));
  expect(openScanner).toHaveBeenCalledWith();
});

it("opens the skincare routine from its tile", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Skincare Routine" }));
  expect(router.push).toHaveBeenCalledWith("/routine");
});

it("opens Skin Needs from its tile", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Skin Needs" }));
  expect(router.push).toHaveBeenCalledWith("/journey");
});

it("keeps today's tip in its envelope until it is opened", async () => {
  const { tipOfTheDay } = jest.requireActual<typeof import("@/lib/tips")>("@/lib/tips");
  await render(<Home />);
  expect(screen.getByText("Today's tip")).toBeTruthy();
  expect(screen.queryByText(tipOfTheDay())).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Open today's tip" }));
  expect(screen.getByText(tipOfTheDay())).toBeTruthy();
  expect(screen.getByText(/^Tomorrow's tip opens in \d+ h$/)).toBeTruthy();
});

it("moves to the new day's tip when the app comes back to the front", async () => {
  const { AppState } = jest.requireActual<typeof import("react-native")>("react-native");
  const { TIPS, tipOfTheDay } = jest.requireActual<typeof import("@/lib/tips")>("@/lib/tips");
  const listeners: ((state: string) => void)[] = [];
  // Once, for the one render below; later tests keep the preset's own AppState.
  const spy = jest.spyOn(AppState, "addEventListener").mockImplementationOnce((_event: string, handler: unknown) => {
    listeners.push(handler as (state: string) => void);
    return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.useFakeTimers({ now: new Date(2026, 8, 29, 22, 0) });
  try {
    await render(<Home />);
    const today = tipOfTheDay();
    jest.setSystemTime(new Date(2026, 8, 30, 8, 0));
    const tomorrow = tipOfTheDay();
    expect(tomorrow).not.toBe(today);
    const { act } = jest.requireActual<typeof import("@testing-library/react-native")>("@testing-library/react-native");
    await act(async () => listeners.forEach((listener) => listener("active")));
    await fireEvent.press(screen.getByRole("button", { name: "Open today's tip" }));
    expect(screen.getByText(tomorrow)).toBeTruthy();
    expect(TIPS).toContain(tomorrow);
  } finally {
    jest.useRealTimers();
    expect(spy).toHaveBeenCalled();
  }
});
