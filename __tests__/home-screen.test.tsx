import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";
import { openScanner } from "@/lib/open-scanner";

/**
 * Home (per #155, v7 design): the "Hi there" title, the scan card with its own
 * Scan now button, three tiles — Search, Routine and My match (the
 * skincare finder) — and the Tip of the day.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

it("shows the title, the scan card and the three tiles, and no skin profile card", async () => {
  await render(<Home />);
  expect(screen.getByRole("header", { name: "Hi there" })).toBeTruthy();
  expect(screen.getByText("Scan any product")).toBeTruthy();
  expect(screen.queryByText("Your skin profile")).toBeNull();
  for (const tile of ["Search", "Routine", "My match"]) expect(screen.getByRole("button", { name: tile })).toBeTruthy();
});

it("opens the scanner from Scan now", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Scan now" }));
  expect(openScanner).toHaveBeenCalled();
});

it("opens the skincare routine from Routine", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Routine" }));
  expect(router.push).toHaveBeenCalledWith("/routine");
});

it("opens Search from its tile, which has no tab of its own", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Search" }));
  expect(router.navigate).toHaveBeenCalledWith("/browse");
});

it("opens the skincare finder from My match", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "My match" }));
  expect(router.push).toHaveBeenCalledWith("/finder");
});

it("shows today's tip under the tiles", async () => {
  const { tipOfTheDay } = jest.requireActual<typeof import("@/lib/tips")>("@/lib/tips");
  await render(<Home />);
  expect(screen.getByText("Tip of the day")).toBeTruthy();
  expect(screen.getByLabelText(`Tip of the day: ${tipOfTheDay()}`)).toBeTruthy();
});

it("moves to the new day's tip when the app comes back to the front", async () => {
  const { AppState } = jest.requireActual<typeof import("react-native")>("react-native");
  const { TIPS, tipOfTheDay } = jest.requireActual<typeof import("@/lib/tips")>("@/lib/tips");
  const listeners: ((state: string) => void)[] = [];
  const spy = jest.spyOn(AppState, "addEventListener").mockImplementation((_event: string, handler: unknown) => {
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
    expect(screen.getByLabelText(`Tip of the day: ${tomorrow}`)).toBeTruthy();
    expect(TIPS).toContain(tomorrow);
  } finally {
    jest.useRealTimers();
    spy.mockRestore();
  }
});
