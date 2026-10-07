import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ResultTabs } from "@/components/result/ResultTabs";
import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { SAFETY_NOTICE_COPY } from "@/lib/safety";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #404: the EU safety notice on a product result, in the places the owner
 * approved, with the flag on, and none of it with the flag off.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const safe = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
const avoid = (name: string, note: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "avoid", verified: true, note });
const BASE = ["water", "glycerin", "butylene glycol", "xanthan gum"].map(safe);

const HICC = avoid("hydroxyisohexyl 3-cyclohexene carboxaldehyde", "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)");
const ISOBUTYLPARABEN = avoid("isobutylparaben", "Prohibited in cosmetics (EU Annex II/1375)");
const HYDROQUINONE = avoid("hydroquinone", "Prohibited in cosmetics (EU Annex II/1339 III/14)");
// An Annex II row whose entry is not on the verified list (1340, Basic Blue 26).
const UNLISTED = avoid("basic blue 26", "Prohibited in cosmetics (EU Annex II/1340)");

const PROFILE: SkinProfile = { ...EMPTY_PROFILE, concerns: ["dullness"], baseSkinType: "normal" };

async function show(extra: Ingredient[], profile: SkinProfile, base: Ingredient[] = BASE) {
  const ingredients = [...base, ...extra];
  const match = matchProduct({ type: "serum", ingredients }, profile);
  await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={match} profile={profile} onIngredientPress={jest.fn()} />);
  await act(async () => {});
  // With no skin profile a sheet rises over the result: put it away.
  const close = screen.queryByRole("button", { name: "Close" });
  if (close) await fireEvent.press(close);
}

const openMatch = () => fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
const openIngredients = () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));
const turnOn = () => useAppStore.setState({ safetyNoticeEnabled: true }, false);

afterEach(() => useAppStore.setState({ safetyNoticeEnabled: false }, false));

describe("with the flag off, every screen is what it was", () => {
  it("keeps Skin match's own line and words for a HICC product", async () => {
    await show([HICC], PROFILE);
    await openMatch();
    expect(screen.getByText("Contains something worth avoiding for your skin.")).toBeTruthy();
    expect(screen.getByText(/flagged as best avoided/i)).toBeTruthy();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.matchLine)).toBeNull();
    expect(screen.queryByText(/not permitted in EU cosmetics/i)).toBeNull();
    expect(screen.queryByRole("link", { name: "EU Cosmetics Regulation, Annex II" })).toBeNull();
  });

  it("keeps the Ingredients tab's Avoid", async () => {
    await show([HICC], PROFILE);
    await openIngredients();
    expect(screen.getByText("Avoid")).toBeTruthy();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.listWord)).toBeNull();
  });

  it("adds no card to a result with no profile", async () => {
    await show([HICC], EMPTY_PROFILE);
    await openMatch();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.cardTitle)).toBeNull();
    expect(screen.getAllByText("Is it right for your skin?").length).toBeGreaterThan(0);
  });
});

describe("with the flag on", () => {
  beforeEach(turnOn);

  it("says it under the title and on the red row, with the regulation's link and the caveat", async () => {
    await show([HICC], PROFILE);
    await openMatch();
    expect(screen.getByText(SAFETY_NOTICE_COPY.matchLine)).toBeTruthy();
    expect(screen.getByText(/Hydroxyisohexyl.*is listed as not permitted in EU cosmetics\./i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "EU Cosmetics Regulation, Annex II" })).toBeTruthy();
    expect(screen.getByText(SAFETY_NOTICE_COPY.rowCaveat)).toBeTruthy();
    expect(screen.queryByText("Contains something worth avoiding for your skin.")).toBeNull();
    expect(screen.queryByText(/flagged as best avoided/i)).toBeNull();
  });

  // Codex review on #414: the six-box limit must not cut the box the line above names.
  it("keeps the notice's box when six other hazards come before it", async () => {
    const others = ["one", "two", "three", "four", "five", "six"].map((name) => avoid(`prohibited ${name}`, "Prohibited in cosmetics (EU Annex II/900)"));
    await show([...others, HICC], PROFILE);
    await openMatch();
    expect(screen.getByText(SAFETY_NOTICE_COPY.matchLine)).toBeTruthy();
    expect(screen.getByText(/Hydroxyisohexyl.*is listed as not permitted in EU cosmetics\./i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "EU Cosmetics Regulation, Annex II" })).toBeTruthy();
  });

  it("does the same for isobutylparaben", async () => {
    await show([ISOBUTYLPARABEN], PROFILE);
    await openMatch();
    expect(screen.getByText(SAFETY_NOTICE_COPY.matchLine)).toBeTruthy();
    expect(screen.getByText(/Isobutylparaben is listed as not permitted in EU cosmetics\./i)).toBeTruthy();
  });

  it("says it for hydroquinone, verified on 7 October 2026", async () => {
    await show([HYDROQUINONE], PROFILE);
    await openMatch();
    expect(screen.getByText(SAFETY_NOTICE_COPY.matchLine)).toBeTruthy();
    expect(screen.getByText(/Hydroquinone is listed as not permitted in EU cosmetics\./i)).toBeTruthy();
  });

  it("says nothing new for an Annex II entry that is not on the verified list", async () => {
    await show([UNLISTED], PROFILE);
    await openMatch();
    expect(screen.getByText("Contains something worth avoiding for your skin.")).toBeTruthy();
    expect(screen.getByText(/flagged as best avoided/i)).toBeTruthy();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.matchLine)).toBeNull();
    expect(screen.queryByRole("link", { name: "EU Cosmetics Regulation, Annex II" })).toBeNull();
  });

  it("puts a card above the prompt when there is no skin profile", async () => {
    await show([HICC], EMPTY_PROFILE);
    await openMatch();
    expect(screen.getByText(SAFETY_NOTICE_COPY.cardTitle)).toBeTruthy();
    expect(screen.getByText(/Hydroxyisohexyl.*is listed as not permitted in EU cosmetics\. Formulas vary by country, and scans can contain errors\./i)).toBeTruthy();
    expect(screen.getAllByText("Is it right for your skin?").length).toBeGreaterThan(0);
  });

  it("puts a card above the 'too few names' note when too little was read", async () => {
    const unread = ["aaa", "bbb", "ccc", "ddd", "eee", "fff"].map((name) => ({ ...safe(name), verified: false }));
    await show([HICC], PROFILE, unread);
    await openMatch();
    expect(screen.getByText(SAFETY_NOTICE_COPY.cardTitle)).toBeTruthy();
    expect(screen.getByText(/We only recognised/)).toBeTruthy();
  });

  it("adds no card to a product with nothing on the verified list", async () => {
    await show([UNLISTED], EMPTY_PROFILE);
    await openMatch();
    expect(screen.queryByText(SAFETY_NOTICE_COPY.cardTitle)).toBeNull();
  });

  it("says 'Check label' and why on the Ingredients tab, and keeps Avoid for an unverified Annex II row", async () => {
    await show([HICC, UNLISTED], PROFILE);
    await openIngredients();
    expect(screen.getByText(SAFETY_NOTICE_COPY.listWord)).toBeTruthy();
    expect(screen.getByText(SAFETY_NOTICE_COPY.listLine)).toBeTruthy();
    expect(screen.getAllByText("Avoid")).toHaveLength(1);
  });

  it("names the reason for the other two kinds of Avoid: a strong pore-clogger, and a pregnancy caution", async () => {
    await show([safe("isopropyl myristate"), safe("retinol")], { ...EMPTY_PROFILE, concerns: ["acne-prone"], baseSkinType: "oily", pregnancyStatus: "pregnant" });
    await openIngredients();
    expect(screen.getByText(SAFETY_NOTICE_COPY.clogWord)).toBeTruthy();
    // The pregnancy card already says it; the row now does too.
    expect(screen.getAllByText(SAFETY_NOTICE_COPY.pregnancyWord)).toHaveLength(2);
    expect(screen.queryByText("Avoid")).toBeNull();
  });
});
