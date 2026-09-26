import { render, screen, waitFor } from "@testing-library/react-native";

import IngredientRoute from "@/app/ingredient/[inci]";
import IngredientListRoute from "@/app/ingredients/[id]";
import Onboarding from "@/app/onboarding";
import ProductRoute from "@/app/product/[id]";
import { fetchProduct, resolveIngredientNames } from "@/data/api";
import {
  MAX_INGREDIENT_NAME_LENGTH,
  MAX_PRODUCT_ID_LENGTH,
  barcodeParam,
  ingredientNameParam,
  productIdParam,
} from "@/lib/route-params";
import { noteProfileErased, profileErasedNoticePending } from "@/lib/erase-notice";
import { useAppStore } from "@/store/useAppStore";

/**
 * #29: any web page, QR code or app can open `forme://…` with whatever it
 * likes in the path. A malformed or hostile parameter must end at "Page not
 * found" (or be dropped), never in a catalogue query or on screen.
 */

// The first render loads each screen's whole module graph.
jest.setTimeout(30_000);

let mockParams: Record<string, string | string[] | undefined> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => false, replace: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProduct: jest.fn(() => new Promise(() => undefined)),
  resolveIngredientNames: jest.fn(() => Promise.resolve([])),
}));

// Structural cast rather than `jest.Mock`: the jest namespace is not in scope here (see jest-globals.d.ts).
type MockFn = { mock: { calls: unknown[][] }; mockClear(): void };
const fetched = fetchProduct as unknown as MockFn;
const resolved = resolveIngredientNames as unknown as MockFn;

beforeEach(() => {
  fetched.mockClear();
  resolved.mockClear();
});

const HOSTILE_IDS = [
  "",
  "../../account",
  "obf-1 or 1=1",
  "obf-123;drop",
  "-leading-dash",
  "a%00b",
  "x".repeat(MAX_PRODUCT_ID_LENGTH + 1),
  "제품",
];

describe("productIdParam", () => {
  it("accepts every shape of id the catalogue makes", () => {
    for (const id of ["obf-8801234567890", "ocr-8801234567890", "inci-5060489794208", "hanbang-rice-serum", "dailymed-3f1c2a9e-0b1d-4c2e-9f3a-1b2c3d4e5f60"]) {
      expect(productIdParam(id)).toBe(id);
    }
  });

  it("refuses anything else, including a repeated query key", () => {
    for (const id of HOSTILE_IDS) expect(productIdParam(id)).toBeNull();
    expect(productIdParam(["obf-1", "obf-2"])).toBeNull();
    expect(productIdParam(undefined)).toBeNull();
  });
});

describe("ingredientNameParam", () => {
  it("accepts real names in any script, with brackets, slashes and numbers", () => {
    for (const name of ["Water", "1,2-Hexanediol", "PEG-40 Hydrogenated Castor Oil", "Water/Aqua/Eau", "병풀추출물", "Centella Asiatica (Leaf) Extract 10%"]) {
      expect(ingredientNameParam(name)).toBe(name);
    }
    expect(ingredientNameParam("x".repeat(MAX_INGREDIENT_NAME_LENGTH))).not.toBeNull();
  });

  it("refuses empty, overlong, control and invisible-formatting text", () => {
    for (const name of ["", "   ", "x".repeat(MAX_INGREDIENT_NAME_LENGTH + 1), "water\u0000", "line\nbreak", "\u202Eretaw", "zero\u200Bwidth"]) {
      expect(ingredientNameParam(name)).toBeNull();
    }
    expect(ingredientNameParam(["water", "glycerin"])).toBeNull();
  });
});

describe("barcodeParam", () => {
  it("keeps a barcode the label functions accept, and drops anything else", () => {
    expect(barcodeParam("8801234567890")).toBe("8801234567890");
    for (const barcode of ["abc", "1234567", "123456789012345", "88012345678ab", "", undefined]) {
      expect(barcodeParam(barcode)).toBeUndefined();
    }
    expect(barcodeParam(["8801234567890"])).toBeUndefined();
  });
});

describe("a hostile link to a product", () => {
  it.each(HOSTILE_IDS)("shows Page not found for %j and never asks the catalogue", async (id: string) => {
    mockParams = { id };
    await render(<ProductRoute />);
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(fetched.mock.calls).toEqual([]);
  });

  it("does the same for the ingredient list", async () => {
    mockParams = { id: "../../account", tab: "Pore-clogging" };
    await render(<IngredientListRoute />);
    expect(screen.getByText("Page not found")).toBeTruthy();
    expect(fetched.mock.calls).toEqual([]);
  });

  it("asks the catalogue for a well-formed id", async () => {
    mockParams = { id: "obf-8801234567890" };
    await render(<ProductRoute />);
    expect(screen.queryByText("Page not found")).toBeNull();
    expect(fetched.mock.calls[0][0]).toBe("obf-8801234567890");
  });
});

describe("a hostile link to an ingredient", () => {
  it.each(["\u202Eretaw", "x".repeat(MAX_INGREDIENT_NAME_LENGTH + 1), ""])(
    "shows Page not found for a name no ingredient has (case %#), and looks nothing up",
    async (inci: string) => {
      mockParams = { inci };
      await render(<IngredientRoute />);
      expect(screen.getByText("Page not found")).toBeTruthy();
      expect(resolved.mock.calls).toEqual([]);
      expect(fetched.mock.calls).toEqual([]);
    },
  );

  it("drops a malformed product and looks the name up on its own", async () => {
    mockParams = { inci: "niacinamide", product: "../../account" };
    await render(<IngredientRoute />);
    await waitFor(() => expect(resolved.mock.calls).toEqual([[["niacinamide"]]]));
    expect(fetched.mock.calls).toEqual([]);
  });
});

describe("a link claiming the profile was erased", () => {
  it.each([true, false])(
    "never shows the erased message (onboarded: %s): only the erase itself can",
    async (hasSeenOnboarding: boolean) => {
      mockParams = { erased: "1" };
      useAppStore.setState({ hasSeenOnboarding });
      await render(<Onboarding />);
      expect(screen.queryByText("Your profile is erased")).toBeNull();
    },
  );

  it("shows it once after Profile's erase, with no parameter at all", async () => {
    mockParams = {};
    useAppStore.setState({ hasSeenOnboarding: false });
    noteProfileErased();
    await render(<Onboarding />);
    expect(screen.getByText("Your profile is erased")).toBeTruthy();
    // Shown, so a later visit to onboarding doesn't repeat it.
    expect(profileErasedNoticePending()).toBe(false);
  });
});
