import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import Routine from "@/app/routine";
import { fetchProducts } from "@/data/api";
import type { ProductType, ProductWithIngredients } from "@/data/types";
import { forgetRoutine } from "@/lib/routine-builder";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The Skincare routine screen: with no skin profile it asks for one, and the
 * button opens the skin quiz; with one, morning and evening steps, each with
 * the catalogue's best matches for that skin (owner, 2 October 2026).
 */

jest.setTimeout(30000);

const mockOpenQuiz = jest.fn();
jest.mock("@/lib/open-quiz", () => ({ openQuiz: () => mockOpenQuiz() }));
let mockFocused = true;
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true }, useIsFocused: () => mockFocused }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({ fetchProducts: jest.fn() }));
const fetched = jest.mocked(fetchProducts);

const product = (id: string, type: ProductType, name: string, extra: string[] = []): ProductWithIngredients =>
  ({
    id,
    barcode: id,
    brand: "Brand",
    name,
    type,
    productType: type,
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-26T00:00:00Z",
    ingredientIds: [],
    ingredients: ["water", "glycerin", "butylene glycol", "sodium hyaluronate", ...extra].map((n) => ({ id: n, name: n, comedogenic: 0, safety: "safe", verified: true })),
  }) as ProductWithIngredients;

const CATALOGUE = [
  product("c1", "cleanser", "Foaming gel"),
  product("m1", "moisturizer", "Day cream"),
  product("m2", "moisturizer", "Night cream", ["niacinamide"]),
  product("s1", "sunscreen", "Sun fluid"),
  product("t1", "serum", "BHA serum", ["salicylic acid"]),
];
const ACNE = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["acne-prone" as const] };

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
  fetched.mockReset();
  fetched.mockResolvedValue([]);
  jest.mocked(router.push).mockClear();
  mockFocused = true;
  forgetRoutine();
});

/** The screen with its routine built: the catalogue read, and scored in its batches. */
async function open() {
  await render(<Routine />);
  await waitFor(() => expect(screen.queryByText("Finding products…")).toBeNull());
}

it("asks for a skin profile first, and opens the quiz from Take the skin quiz", async () => {
  await render(<Routine />);
  expect(screen.getByRole("header", { name: "Your skin profile is empty" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Take the skin quiz" }));
  expect(mockOpenQuiz).toHaveBeenCalledTimes(1);
});

it("lays out the morning steps, and the evening's from the switch", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await open();
  expect(screen.getByText("Steps for today")).toBeTruthy();
  // By day: Cleansing, Serum, Moisturiser, Sunscreen.
  for (const step of ["Cleansing", "Serum", "Moisturiser", "Sunscreen"]) expect(screen.getByText(step)).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  // By night it cleanses twice, then the treatment and a moisturiser (owner).
  for (const step of ["First cleanse", "Cleansing", "Treatment", "Moisturiser"]) expect(screen.getByText(step)).toBeTruthy();
  expect(screen.queryByText("Sunscreen")).toBeNull();
  expect(screen.queryByText("Serum")).toBeNull();
});

it("numbers each step plainly, with no dotted connectors between them (v9)", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await open();
  for (const n of ["1", "2", "3", "4"]) expect(screen.getByText(n)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Scan one to check, for / })).toHaveLength(4);
});

it("says it is finding products until the catalogue arrives, then that none was picked where it has none", async () => {
  useAppStore.setState({ profile: ACNE });
  let arrive: (products: ProductWithIngredients[]) => void = () => undefined;
  fetched.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
  await render(<Routine />);
  expect(screen.getAllByText("Finding products…")).toHaveLength(4);
  await act(async () => arrive([]));
  await waitFor(() => expect(screen.queryByText("Finding products…")).toBeNull());
  expect(screen.getAllByText("No product picked yet.")).toHaveLength(4);
});

it("names the best match for each step, and opens the product screen from it", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  expect(screen.getByText("Foaming gel")).toBeTruthy();
  expect(screen.getByText("Sun fluid")).toBeTruthy();
  // The serum step has nothing gentle to name for acne here, so it only says what to look for.
  expect(screen.getByText("Look for Azelaic acid, for acne.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /^Brand Foaming gel\. / }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/product/[id]", params: { id: "c1" } });
});

it("offers the other matches for a step behind a count", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  // Two moisturisers: one named, one more behind the link.
  await fireEvent.press(screen.getByRole("button", { name: "1 more for moisturiser" }));
  expect(screen.getByText("Day cream")).toBeTruthy();
  expect(screen.getByText("Night cream")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Fewer options for moisturiser" }));
  expect(screen.getAllByText(/cream$/)).toHaveLength(1);
});

it("names a treatment with the active for the concern in the evening, with what to look for and a way to scan one", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  expect(screen.getByText("BHA serum")).toBeTruthy();
  expect(screen.getByText("Look for Benzoyl peroxide, Retinoids or Salicylic acid, for acne.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Scan one to check, for treatment" })).toBeTruthy();
});

it("still lays out the steps when the catalogue cannot be read", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockRejectedValue(new Error("offline"));
  await open();
  expect(screen.getAllByText("No product picked yet.")).toHaveLength(4);
  expect(screen.getByText("Look for Azelaic acid, for acne.")).toBeTruthy();
});

// Home draws this screen ahead of the tap, and the skin quiz opens over it and
// changes the profile with every answer. Scoring the catalogue then froze the
// app while nobody was looking at the routine (owner, 2 October 2026).
it("neither reads the catalogue nor builds a routine while it is not the screen showing", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  mockFocused = false;
  const view = await render(<Routine />);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(fetched).not.toHaveBeenCalled();
  expect(screen.getAllByText("Finding products…")).toHaveLength(4);

  // Shown: now it reads and builds.
  mockFocused = true;
  await view.rerender(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  expect(fetched).toHaveBeenCalledTimes(1);

  // An answer changed behind another screen: the old routine is not shown as
  // if it were for the new profile, and nothing is rebuilt until it is back.
  mockFocused = false;
  await act(async () => useAppStore.setState({ profile: { ...ACNE, sensitivity: "high" } }));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(screen.queryByText("Foaming gel")).toBeNull();
  mockFocused = true;
  await view.rerender(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  expect(fetched).toHaveBeenCalledTimes(1);
});

// The screen is drawn afresh on every visit; scoring the catalogue again each
// time made every visit wait a second for its products (owner).
it("shows the routine at once on a second visit, without building it again", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  const first = await render(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  await act(async () => first.unmount());

  await render(<Routine />);
  // There on the first frame: no "Finding products…" to wait through.
  expect(screen.getByText("Foaming gel")).toBeTruthy();
  expect(screen.queryByText("Finding products…")).toBeNull();
});

it("builds it again when the catalogue it reads has changed", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  const first = await render(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  await act(async () => first.unmount());

  fetched.mockResolvedValue([product("c2", "cleanser", "Cream wash"), ...CATALOGUE.slice(1)]);
  await render(<Routine />);
  await waitFor(() => expect(screen.getByText("Cream wash")).toBeTruthy());
  expect(screen.queryByText("Foaming gel")).toBeNull();
});

