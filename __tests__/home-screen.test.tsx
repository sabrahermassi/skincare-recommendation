import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";
import { openScanner } from "@/lib/open-scanner";

/**
 * Home (per #155, v7 design): the "Hi there" title, the scan card with its own
 * Scan now button, and three tiles — Search, Routine and My match (the
 * skincare finder).
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
