import { render, screen } from "@testing-library/react-native";

import Home from "@/app/(tabs)/index";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * Home (per #155): the greeting, the two cards, and the watercolor still life
 * under them. The still life sits in the page after the cards, not behind
 * them, so it can never cover a card; its handwriting is read out.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
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

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
});

it("shows the greeting, the skin profile card and the scan card", async () => {
  await render(<Home />);
  expect(screen.getByLabelText("Hi there!")).toBeTruthy();
  expect(screen.getByLabelText("Your skin profile is not set up yet. Open it to answer the skin questions.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Scan a product. Analyze a product by photo or barcode." })).toBeTruthy();
});

it("puts the still life after the scan card, with its handwriting read out", async () => {
  await render(<Home />);
  const labels = labelsInOrder(screen.toJSON());
  const scan = labels.indexOf("Scan a product. Analyze a product by photo or barcode.");
  const stillLife = labels.indexOf("A little progress every day");
  expect(scan).toBeGreaterThanOrEqual(0);
  expect(stillLife).toBeGreaterThan(scan);
});
