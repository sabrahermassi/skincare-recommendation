import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";

/**
 * Home (per #155): the greeting, the two cards side by side ("Scan a product"
 * and "Find skincare"), and the watercolor still life under them. The still
 * life comes after the cards in the page and is drawn behind them, so it never
 * covers one; it has no words, so screen readers skip it.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type Node = { props?: Record<string, unknown>; children?: (Node | string)[] | null };

/** Every accessibility label on screen, in the order a screen reader reaches them. */
function labelsInOrder(tree: unknown): string[] {
  const out: string[] = [];
  const walk = (node: Node | string | null | undefined) => {
    if (!node || typeof node === "string") return;
    const label = node.props?.accessibilityLabel;
    if (typeof label === "string" && label) out.push(label);
    node.children?.forEach(walk);
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n) => walk(n as Node));
  return out;
}

it("shows the greeting and both cards, and no skin profile card", async () => {
  await render(<Home />);
  expect(screen.getByLabelText("Hi there!")).toBeTruthy();
  expect(screen.queryByText("Your skin profile")).toBeNull();
  expect(screen.getByRole("button", { name: "Scan a product. Analyze a product by photo or barcode." })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Find skincare. Search products or brands." })).toBeTruthy();
});

it("opens Browse from Find skincare, which has no tab of its own", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Find skincare. Search products or brands." }));
  expect(router.navigate).toHaveBeenCalledWith("/browse");
});

it("shows the still life as decoration: nothing for a screen reader to stop on", async () => {
  await render(<Home />);
  expect(screen.getByTestId("home-still-life")).toBeTruthy();
  // Only the greeting and the two cards are read out; the old picture's
  // handwritten line is gone with it.
  expect(labelsInOrder(screen.toJSON())).not.toContain("A little progress every day");
});

it("draws the still life behind the cards, where it takes no touches", async () => {
  await render(<Home />);
  const stillLife = screen.getByTestId("home-still-life");
  const merged = Object.assign({}, ...[stillLife.props.style].flat());
  expect(merged.zIndex).toBeLessThan(0);
  expect(stillLife.props.pointerEvents).toBe("none");
});
