import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import IngredientRoute from "@/app/ingredient/[inci]";
import { PregnancySection, ReasonLine } from "@/components/VerdictExplanation";
import { resolveIngredientNames } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import { INGREDIENT_RULES } from "@/lib/rules";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #326: a claim from a sourced rule shows "Source: …" under it; PubChem's
 * "Look it up" is only for a name no rule covers.
 */

jest.setTimeout(30_000);

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  resolveIngredientNames: jest.fn(),
}));

function ingredient(name: string): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true };
}

const NIACINAMIDE_SOURCE = INGREDIENT_RULES.find((rule) => rule.names.includes("niacinamide"))?.source;

async function open(name: string) {
  mockParams = { inci: name };
  (resolveIngredientNames as unknown as { mockResolvedValue(value: unknown): void }).mockResolvedValue([
    ingredient(name),
  ]);
  await render(<IngredientRoute />);
  await act(async () => {});
}

describe("the ingredient page", () => {
  beforeEach(() => {
    useAppStore.setState({ profile: EMPTY_PROFILE });
  });

  it("shows a sourced rule's source under its claim, and no PubChem card", async () => {
    await open("niacinamide");
    expect(NIACINAMIDE_SOURCE).toBeDefined();
    expect(screen.getByText(NIACINAMIDE_SOURCE!.label)).toBeTruthy();
    expect(screen.queryByText("Look it up on PubChem")).toBeNull();
  });

  it("opens the source when it's tapped", async () => {
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await open("niacinamide");
    await fireEvent.press(screen.getByLabelText(`Source: ${NIACINAMIDE_SOURCE!.label}`));
    expect(openURL).toHaveBeenCalledWith(NIACINAMIDE_SOURCE!.url);
    openURL.mockRestore();
  });

  it("keeps PubChem as the fallback for a name no rule covers", async () => {
    await open("xanthan gum");
    expect(screen.getByText("Look it up on PubChem")).toBeTruthy();
    expect(screen.queryByText(/^Source:/)).toBeNull();
  });

  it("ends with Report a mistake when a support address is set (#327)", async () => {
    const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "help@example.com";
    try {
      await open("niacinamide");
      expect(screen.getByText("Report a mistake")).toBeTruthy();
    } finally {
      process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
    }
  });

  it("shows neither for a rule still waiting for a source", async () => {
    await open("tea tree oil");
    expect(screen.queryByText(/^Source:/)).toBeNull();
    expect(screen.queryByText("Look it up on PubChem")).toBeNull();
  });
});

describe("Why this score", () => {
  it("puts a reason's source under it, and nothing under an unsourced one", async () => {
    await render(
      <>
        <ReasonLine
          reason={{ ingredient: "niacinamide", reason: "Sourced claim", category: "barrier", effect: 5, source: NIACINAMIDE_SOURCE }}
        />
        <ReasonLine reason={{ ingredient: "glycerin", reason: "Unsourced claim", category: "hydration", effect: 5 }} />
      </>,
    );
    expect(screen.getAllByLabelText(/^Source:/)).toHaveLength(1);
    expect(screen.getByText(NIACINAMIDE_SOURCE!.label)).toBeTruthy();
  });

  it("puts a pregnancy caution's source under it", async () => {
    const hydroquinone = PREGNANCY_CAUTION.find((entry) => entry.category === "hydroquinone")!;
    await render(
      <PregnancySection
        warnings={[
          {
            ingredient: ingredient("hydroquinone"),
            reason: hydroquinone.reason,
            severity: "irritant",
            origin: "pregnancy",
            source: hydroquinone.source,
          },
        ]}
      />,
    );
    expect(screen.getByText(hydroquinone.source!.label)).toBeTruthy();
  });
});
