import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";
import { openScanner } from "@/lib/open-scanner";

/**
 * Home (per #155, v9 design): the "Hi there" title, the scan card (one big
 * button), two tiles — What my skin needs (the journey) and Skincare routine
 * — and the Tip of the day.
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
  expect(screen.getByRole("header", { name: "Hi there" })).toBeTruthy();
  expect(screen.getByText("Scan any product")).toBeTruthy();
  expect(screen.queryByText("Your skin profile")).toBeNull();
  for (const tile of ["What my skin needs", "Skincare routine"]) expect(screen.getByRole("button", { name: tile })).toBeTruthy();
  for (const gone of ["Search", "My match"]) expect(screen.queryByRole("button", { name: gone })).toBeNull();
});

it("opens the scanner from anywhere on the scan card", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Scan any product" }));
  expect(openScanner).toHaveBeenCalledWith();
});

it("opens the skincare routine from its tile", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Skincare routine" }));
  expect(router.push).toHaveBeenCalledWith("/routine");
});

it("opens What my skin needs from its tile", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "What my skin needs" }));
  expect(router.push).toHaveBeenCalledWith("/journey");
});

it("shows today's tip under the tiles", async () => {
  const { tipOfTheDay } = jest.requireActual<typeof import("@/lib/tips")>("@/lib/tips");
  await render(<Home />);
  expect(screen.getByText("Tip of the day")).toBeTruthy();
  expect(screen.getByText(tipOfTheDay())).toBeTruthy();
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
    expect(screen.getByText(tomorrow)).toBeTruthy();
    expect(TIPS).toContain(tomorrow);
  } finally {
    jest.useRealTimers();
    expect(spy).toHaveBeenCalled();
  }
});

it("shows another tip when the card is tapped, never the same one (v7)", async () => {
  const reduceMotion = jest.requireActual<typeof import("@/lib/reduce-motion")>("@/lib/reduce-motion");
  const spy = jest.spyOn(reduceMotion, "reduceMotionNow").mockReturnValue(true);
  const { tipOfTheDay } = jest.requireActual<typeof import("@/lib/tips")>("@/lib/tips");
  try {
    await render(<Home />);
    const first = tipOfTheDay();
    await fireEvent.press(screen.getByRole("button", { name: "Show another tip" }));
    expect(screen.queryByText(first)).toBeNull();
    expect(screen.getByText("Tap for another")).toBeTruthy();
  } finally {
    spy.mockRestore();
  }
});
