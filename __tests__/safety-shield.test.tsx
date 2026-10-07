import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ProductListRow } from "@/components/ProductListRow";
import { ScorePill } from "@/components/ScorePill";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { SAFETY_NOTICE_COPY } from "@/lib/safety";

/**
 * #405: the small shield beside a product's score in lists and Saved/History,
 * and only when #404's own check says the EU safety notice applies: flag on
 * and a verified Annex II entry. Flag off, nothing; History reads the product
 * as it is loaded now, and a product that cannot be loaded shows no shield.
 */

jest.setTimeout(30000);

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: jest.fn(), navigate: jest.fn() },
    useScrollToTop: () => undefined,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProductsByIds: jest.fn(),
}));

type MockFn = {
  mock: { calls: [string[]][] };
  mockReset(): void;
  mockResolvedValue(value: unknown): void;
  mockImplementation(fn: (ids: string[]) => Promise<unknown>): void;
};
const { fetchProductsByIds } = require("@/data/api") as { fetchProductsByIds: MockFn };
const { useAppStore, EMPTY_PROFILE } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
const Saved = (require("@/app/(tabs)/saved") as { default: () => React.JSX.Element }).default;

const safe = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
const avoid = (name: string, note: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "avoid", verified: true, note });
const HICC = avoid("hydroxyisohexyl 3-cyclohexene carboxaldehyde", "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)");
// An Annex II row whose entry is not on the verified list (1340, Basic Blue 26): never a notice.
const UNLISTED = avoid("basic blue 26", "Prohibited in cosmetics (EU Annex II/1340)");
// A caution that merely mentions Annex II 358 (an exemption): never a notice.
const CUMIN = { ...safe("cuminum cyminum fruit extract"), safety: "caution" as const, note: "Restricted use (EU Annex III/156)" };

function product(id: string, extra: Ingredient[]): ProductWithIngredients {
  const ingredients = [safe("water"), safe("glycerin"), ...extra];
  return {
    id,
    barcode: id,
    brand: "Brand",
    name: `Cream ${id}`,
    type: "moisturizer",
    productType: "lotion-pump",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    ingredientIds: ingredients.map((i) => i.id),
    ingredients,
  };
}

const SHIELD = new RegExp(SAFETY_NOTICE_COPY.shieldLabel.replace(/[.]/g, "\\."));
const viewed = (id: string) => ({ id, known: true, firstSeenAt: 1, lastSeenAt: Date.now(), seenCount: 1, scoreAtView: 72, warningsAtView: 0 });
const turnOn = () => useAppStore.setState({ safetyNoticeEnabled: true }, false);

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE, savedProducts: [], savedIngredients: [], history: [], shelfOwner: null, safetyNoticeEnabled: false });
  fetchProductsByIds.mockReset();
});

describe("the shield on a score", () => {
  it("is beside the ring only when asked for, with its label", async () => {
    await render(<ScorePill score={72} notice />);
    expect(screen.getByLabelText(SAFETY_NOTICE_COPY.shieldLabel)).toBeTruthy();
    expect(screen.getByLabelText("72 out of 100")).toBeTruthy();
    await act(async () => screen.unmount());

    await render(<ScorePill score={72} />);
    expect(screen.queryByLabelText(SAFETY_NOTICE_COPY.shieldLabel)).toBeNull();
  });

  it("is in a list row's own label too, since the row is one button", async () => {
    await render(<ProductListRow product={product("a", [])} score={72} notice />);
    expect(screen.getByRole("button", { name: SHIELD })).toBeTruthy();
    await act(async () => screen.unmount());

    await render(<ProductListRow product={product("a", [])} score={72} />);
    expect(screen.getByRole("button", { name: /72 out of 100$/ })).toBeTruthy();
  });
});

describe("Saved", () => {
  const shelf = () => useAppStore.setState({ savedProducts: [{ id: "hicc", savedAt: 1 }, { id: "hq", savedAt: 2 }, { id: "cumin", savedAt: 3 }] });
  const load = () =>
    fetchProductsByIds.mockImplementation(async (ids: string[]) => ({
      ok: true,
      value: [product("hicc", [HICC]), product("hq", [UNLISTED]), product("cumin", [CUMIN])].filter((p) => ids.includes(p.id)),
    }));

  it("shows no shield anywhere with the flag off", async () => {
    shelf();
    load();
    await render(<Saved />);
    expect(await screen.findByText("Cream hicc")).toBeTruthy();
    expect(screen.queryByRole("button", { name: SHIELD })).toBeNull();
  });

  it("shows it on a HICC product only, never on an Annex II entry off the verified list or a 358-style exemption", async () => {
    turnOn();
    shelf();
    load();
    await render(<Saved />);
    expect(await screen.findByText("Cream hicc")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: SHIELD })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Cream hicc,.*Check the label\.$/ })).toBeTruthy();
  });
});

describe("History", () => {
  async function openHistory() {
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText("Cream hicc");
  }

  it("reads the product as it is loaded now: a correction shows up, in both directions", async () => {
    turnOn();
    useAppStore.setState({ history: [viewed("hicc")] });

    // Viewed when it held nothing on the list, now it does.
    fetchProductsByIds.mockResolvedValue({ ok: true, value: [product("hicc", [HICC])] });
    const first = await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText("Cream hicc");
    expect(screen.getByRole("button", { name: SHIELD })).toBeTruthy();
    // The score it had then stays as it was.
    expect(screen.getByRole("button", { name: /72 out of 100\./ })).toBeTruthy();
    await act(async () => first.unmount());

    // Corrected later: the ingredient is gone, and so is the shield.
    fetchProductsByIds.mockResolvedValue({ ok: true, value: [product("hicc", [])] });
    await openHistory();
    expect(screen.queryByRole("button", { name: SHIELD })).toBeNull();
  });

  it("shows no shield for a product that cannot be loaded, and never falls back to anything stored", async () => {
    turnOn();
    useAppStore.setState({ history: [viewed("hicc")] });
    fetchProductsByIds.mockResolvedValue({ ok: true, value: [] });
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText(/no longer in the catalogue|isn't in the catalogue|catalogue/i);
    expect(screen.queryByRole("button", { name: SHIELD })).toBeNull();
  });

  it("looks the visible products up in one batch, not one request per row", async () => {
    turnOn();
    useAppStore.setState({ history: [viewed("hicc"), viewed("hq"), viewed("cumin")] });
    fetchProductsByIds.mockResolvedValue({ ok: true, value: [product("hicc", [HICC]), product("hq", [UNLISTED]), product("cumin", [CUMIN])] });
    await openHistory();
    expect(fetchProductsByIds).toHaveBeenCalledTimes(1);
    expect(fetchProductsByIds.mock.calls[0][0].sort()).toEqual(["cumin", "hicc", "hq"]);
    expect(screen.getAllByRole("button", { name: SHIELD })).toHaveLength(1);
  });
});
