import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));


import { UNKNOWN_LINE } from "@/components/result/IngredientsCard";
import { reasonOrder, ResultTabs } from "@/components/result/ResultTabs";
import { Text } from "@/components/Text";
import type { Ingredient, SkinProfile } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { SPACE } from "@/lib/tokens";
import { EMPTY_PROFILE } from "@/store/useAppStore";

const scrollToCalls: unknown[] = [];
jest.spyOn(ScrollView.prototype, "scrollTo").mockImplementation((options?: unknown) => {
  scrollToCalls.push(options);
});

/** With no skin profile a sheet rises over the result (v9) and nothing behind it can be reached: put it away. */
async function putTeaserAway() {
  const close = screen.queryByRole("button", { name: "Close" });
  if (close) await fireEvent.press(close);
}

/**
 * The product result's two tabs (design_handoff_skincare_cards), past what
 * the product and label screens' own tests cover: every claim keeps its
 * source (#326), a layering note reads as a cost and the evening one doesn't
 * (#264), and the one note that depends on the person sits with their match.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ingredient = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });
const BASE = ["water", "glycerin", "butylene glycol", "xanthan gum"];

async function show(names: string[], profile: SkinProfile) {
  const ingredients = [...BASE, ...names].map(ingredient);
  const match = matchProduct({ type: "serum", ingredients }, profile);
  await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={match} profile={profile} onIngredientPress={jest.fn()} />);
  await act(async () => {});
  await putTeaserAway();
}

const openMatch = () => fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
const openIngredients = () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));

// #470: the owner's sentence sits under the score, and takes the score's place where there is none.
describe("the medical note on Skin match", () => {
  const NOTE = "Not medical advice. Patch test new products. For a skin condition, see a dermatologist.";

  it("shows under the score and verdict once the answers score, once", async () => {
    await show(["niacinamide"], { ...EMPTY_PROFILE, baseSkinType: "dry" });
    await openMatch();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(screen.getByLabelText(/How scoring works$/)).toBeTruthy();
  });

  it("shows with no skin profile, where there is no score", async () => {
    await show(["niacinamide"], EMPTY_PROFILE);
    await openMatch();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(screen.queryByLabelText(/How scoring works$/)).toBeNull();
  });

  it("shows when too little was read to score", async () => {
    const ingredients = ["water", "mystery extract", "another unknown"].map((name, i) => ({ ...ingredient(name), verified: i === 0 }));
    const profile = { ...EMPTY_PROFILE, baseSkinType: "dry" as const };
    await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, profile)} profile={profile} onIngredientPress={jest.fn()} />);
    await act(async () => {});
    expect(screen.getByText(/^We only recognised \d+ of \d+ names$/)).toBeTruthy();
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
  });

  it("is not on the Ingredients tab", async () => {
    await show(["niacinamide"], { ...EMPTY_PROFILE, baseSkinType: "dry" });
    await openIngredients();
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

// Owner, 2 October 2026: no sources on the result; they are on each ingredient's own sheet.
it("gives a reason its box, with no source under it", async () => {
  await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
  await openMatch();
  // One of the Skin needs recommendations for dark spots (v9), in its own box.
  expect(screen.getByText(/^Niacinamide helps with oil balance/)).toBeTruthy();
  expect(screen.queryByText("Good support")).toBeNull();
  expect(screen.queryByLabelText(/^Source:/)).toBeNull();
});

it("shows the pregnancy card, with no source on it", async () => {
  await show(["hydroquinone"], { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" });
  await openIngredients();
  expect(screen.getByText("Best avoided while pregnant")).toBeTruthy();
  // #475: worded for the one question the quiz asks, pregnant or breastfeeding.
  expect(screen.getByText(/If you're pregnant or breastfeeding and unsure, ask your doctor or midwife\./)).toBeTruthy();
  expect(screen.queryByLabelText(/^Source:/)).toBeNull();
});

// #475: the AAD page says to limit essential oils and salicylic acid above 2%, not to avoid them.
it("says 'best limited' when every pregnancy ingredient is one the sources say to limit", async () => {
  await show(["lavandula angustifolia oil", "salicylic acid"], { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" });
  await openIngredients();
  expect(screen.getByText("Best limited while pregnant")).toBeTruthy();
  expect(screen.queryByText("Best avoided while pregnant")).toBeNull();
});

it("keeps 'best avoided' when one of them is to be avoided", async () => {
  await show(["lavandula angustifolia oil", "retinol"], { ...EMPTY_PROFILE, pregnancyStatus: "pregnant" });
  await openIngredients();
  expect(screen.getByText("Best avoided while pregnant")).toBeTruthy();
  expect(screen.queryByText("Best limited while pregnant")).toBeNull();
});

it("marks a layering note as a caution and leaves the evening note plain", async () => {
  await show(["retinol"], { ...EMPTY_PROFILE, baseSkinType: "dry" });
  await openMatch();
  expect(screen.getByText(/evening routine/)).toBeTruthy();
  expect(screen.getByText(/another product with BHA/)).toBeTruthy();
  expect(screen.getAllByTestId("routine-caution")).toHaveLength(1);
});

it("gives the dark-spots SPF note on Skin match, not on the Ingredients tab everyone sees", async () => {
  await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
  await openIngredients();
  expect(screen.queryByText(/working on dark spots/)).toBeNull();
  await openMatch();
  expect(screen.getByText(/working on dark spots/)).toBeTruthy();
});

// Just the match (owner): no row of the person's answers or Edit above it.
it("opens Skin match on the score, with no row of the answers above it", async () => {
  await show(["niacinamide"], { concerns: ["hyperpigmentation"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null });
  await openMatch();
  expect(screen.getByTestId("score-ring")).toBeTruthy();
  // The score arrives: the arc starts undrawn, and the number is the real one from the first frame.
  const arc = screen.getByTestId("score-arc");
  expect(arc.props.strokeDashoffset).toBeGreaterThan(0);
  expect(arc.props.strokeOpacity).toBe(0);
  expect(screen.queryByText("Combination")).toBeNull();
  expect(screen.queryByText("Somewhat sensitive")).toBeNull();
  expect(screen.queryByText("Edit")).toBeNull();
});

// #379 review (Codex): a concern met only by a declared function still shows
// under "For your concerns", as the score counts it.
async function showWith(extra: Ingredient[], profile: SkinProfile) {
  const ingredients = [...BASE.map(ingredient), ...extra];
  const match = matchProduct({ type: "serum", ingredients }, profile);
  await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={match} profile={profile} onIngredientPress={jest.fn()} />);
  await act(async () => {});
  await putTeaserAway();
}

it("puts an EU prohibition on its red card, with no source under it", async () => {
  await showWith([{ ...ingredient("some prohibited substance"), safety: "avoid" }], { ...EMPTY_PROFILE, concerns: ["dullness"] });
  await openMatch();
  expect(screen.getByText("Some Prohibited Substance")).toBeTruthy();
  expect(screen.queryByLabelText(/^Source:/)).toBeNull();
});

it("credits a concern met only by a declared function, as the score does", async () => {
  // No curated rule here works on dehydration (unlike glycerin in BASE), so
  // only the declared function can.
  const ingredients = [ingredient("water"), ingredient("xanthan gum"), { ...ingredient("some declared humectant"), functions: ["humectant"] }];
  const profile = { ...EMPTY_PROFILE, concerns: ["dehydrated" as const] };
  await render(
    <ResultTabs header={null} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, profile)} profile={profile} onIngredientPress={jest.fn()} />,
  );
  await act(async () => {});
  await putTeaserAway();
  await openMatch();
  expect(screen.getByText(/Declared as a humectant/i)).toBeTruthy();
});

// A reason is the bold name and then the rule's sentence. A sentence that does
// not open with the name is set off with a colon, not run into it.
it("joins a reason to its ingredient's name so it reads as a sentence", async () => {
  await show(["sodium hyaluronate"], { ...EMPTY_PROFILE, concerns: ["dehydrated"] });
  await openMatch();
  expect(screen.getByText(/^Butylene Glycol: a humectant solvent/)).toBeTruthy();
});

it("does not say an ingredient's name twice in its row", async () => {
  await show([], { ...EMPTY_PROFILE, concerns: ["dehydrated"] });
  await openIngredients();
  expect(screen.getByText("Draws water into the skin")).toBeTruthy();
  expect(screen.queryByText(/^Glycerin draws/)).toBeNull();
});

// Owner (v9): the header and the switch hold still; only the white sheet scrolls.
it("keeps the header and the switch out of the part that scrolls", async () => {
  const ingredients = [ingredient("glycerin")];
  await render(
    <ResultTabs header={<Text>Toner</Text>} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, EMPTY_PROFILE)} profile={EMPTY_PROFILE} onIngredientPress={jest.fn()} />,
  );
  await putTeaserAway();
  const within = (node: { parent: unknown } | null, type: string): boolean => {
    for (let at = node as { type?: unknown; parent: unknown } | null; at; at = at.parent as typeof at) if (at.type === type) return true;
    return false;
  };
  expect(within(screen.getByTestId("result-sheet"), "RCTScrollView")).toBe(true);
  expect(within(screen.getByText("Toner"), "RCTScrollView")).toBe(false);
  expect(within(screen.getByRole("tab", { name: "Ingredients" }), "RCTScrollView")).toBe(false);
});

it("lets the header and the switch scroll at the largest text sizes, where they'd fill the screen", async () => {
  mockFontScale = 2;
  try {
    const ingredients = [ingredient("glycerin")];
    await render(
      <ResultTabs header={<Text>Toner</Text>} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, EMPTY_PROFILE)} profile={EMPTY_PROFILE} onIngredientPress={jest.fn()} />,
    );
    await putTeaserAway();
    let at = screen.getByText("Toner") as { type?: unknown; parent: unknown } | null;
    while (at && at.type !== "RCTScrollView") at = at.parent as typeof at;
    expect(at).not.toBeNull();
  } finally {
    mockFontScale = 1;
  }
});

// Owner, 2 October 2026: the first box agrees with the verdict above it.
describe("the boxes on Skin match", () => {
  it("says three ceramides with one sentence once, not three times", async () => {
    await show(["ceramide np", "ceramide ap", "ceramide eop"], { ...EMPTY_PROFILE, baseSkinType: "dry", concerns: ["dehydrated"] });
    await openMatch();
    expect(screen.getAllByText(/ceramides supply barrier lipids/)).toHaveLength(1);
    expect(screen.getByText(/Ceramide NP, Ceramide AP and Ceramide EOP/)).toBeTruthy();
  });

  it("keeps a warning on a good match, under the green boxes, and says so under the title", async () => {
    // Enough green to fill six boxes, then a fragrance for sensitive skin.
    await show(
      ["niacinamide", "panthenol", "sodium hyaluronate", "ceramide np", "allantoin", "squalane", "centella asiatica extract", "tocopherol", "parfum"],
      { ...EMPTY_PROFILE, baseSkinType: "dry", sensitivity: "some", concerns: ["dehydrated"] },
    );
    await openMatch();
    expect(screen.getByText(/Fragrance|Parfum/i)).toBeTruthy();
    expect(screen.getByText(/thing(s)? to watch below\./)).toBeTruthy();
  });
});

describe("the groups of boxes", () => {
  it("labels what works and what to watch once a result has both", async () => {
    await show(
      ["niacinamide", "panthenol", "sodium hyaluronate", "ceramide np", "allantoin", "squalane", "centella asiatica extract", "tocopherol", "parfum"],
      { ...EMPTY_PROFILE, baseSkinType: "dry", sensitivity: "some", concerns: ["dehydrated"] },
    );
    await openMatch();
    expect(screen.getByText("Working for you")).toBeTruthy();
    expect(screen.getByText("Worth watching")).toBeTruthy();
  });

  it("keeps the intro's space above a red group that has no label, and a label's own space when it leads", async () => {
    const profile = { ...EMPTY_PROFILE, baseSkinType: "dry" as const, sensitivity: "some" as const, concerns: ["dehydrated" as const] };
    await showWith(
      [{ ...ingredient("some prohibited substance"), safety: "avoid" }, ...["niacinamide", "panthenol", "sodium hyaluronate", "parfum"].map(ingredient)],
      profile,
    );
    await openMatch();
    expect(screen.getByText("Working for you")).toBeTruthy();
    expect(screen.getByText("Worth watching")).toBeTruthy();
    // Red leads and wears no label, so the container brings the gap itself.
    expect(screen.getByTestId("reason-groups")).toHaveStyle({ marginTop: SPACE.gutter });
  });

  it("lets the first label bring the space when green leads", async () => {
    await show(
      ["niacinamide", "panthenol", "sodium hyaluronate", "ceramide np", "allantoin", "squalane", "centella asiatica extract", "tocopherol", "parfum"],
      { ...EMPTY_PROFILE, baseSkinType: "dry", sensitivity: "some", concerns: ["dehydrated"] },
    );
    await openMatch();
    expect(screen.getByTestId("reason-groups")).toHaveStyle({ marginTop: 0 });
  });

  it("adds no label to a result that is all green", async () => {
    await show(["niacinamide"], { ...EMPTY_PROFILE, concerns: ["hyperpigmentation"] });
    await openMatch();
    expect(screen.queryByText("Working for you")).toBeNull();
    expect(screen.queryByText("Worth watching")).toBeNull();
  });
});

it("starts a tab at its top, so Ingredients does not open scrolled past its risks", async () => {
  scrollToCalls.length = 0;
  await show(["niacinamide"], { ...EMPTY_PROFILE, baseSkinType: "dry" });
  await openIngredients();
  expect(scrollToCalls).toContainEqual({ y: 0, animated: false });
});

it("has the first tab simply there, and brings the next one in from clear", async () => {
  await show(["niacinamide"], { ...EMPTY_PROFILE, baseSkinType: "dry" });
  expect(screen.getByTestId("swap-fade")).toHaveStyle({ opacity: 1 });
  await openIngredients();
  expect(screen.getByTestId("swap-fade")).toHaveStyle({ opacity: 0 });
});

describe("the order of the boxes", () => {
  it("leads with what works on a good or excellent match", () => {
    expect(reasonOrder("excellent")).toEqual(["red", "green", "orange"]);
    expect(reasonOrder("good")).toEqual(["red", "green", "orange"]);
  });

  it("leads with what doesn't on a fair or poor match", () => {
    expect(reasonOrder("fair")).toEqual(["red", "orange", "green"]);
    expect(reasonOrder("poor")).toEqual(["red", "orange", "green"]);
  });

  it("keeps a banned or hazardous ingredient first whatever the verdict", () => {
    for (const verdict of ["excellent", "good", "fair", "poor", "unknown"] as const) expect(reasonOrder(verdict)[0]).toBe("red");
  });
});

// Owner, 2 October 2026: a pore-clogger gets its own box for the skin it matters to.
describe("a pore-clogger on Skin match", () => {
  it("says it is comedogenic for someone with acne", async () => {
    await show(["isopropyl myristate"], { ...EMPTY_PROFILE, concerns: ["acne-prone"] });
    await openMatch();
    expect(screen.getByText(/Isopropyl Myristate is comedogenic and may clog pores\./i)).toBeTruthy();
  });

  it("says nothing of it for someone without acne or enlarged pores", async () => {
    await show(["isopropyl myristate"], { ...EMPTY_PROFILE, concerns: ["dehydrated"] });
    await openMatch();
    expect(screen.queryByText(/is comedogenic and may clog pores/)).toBeNull();
  });
  // #406: oily skin with no pore-led concern is charged a little for them, and
  // Skin match says so, with no number.
  describe("for oily skin without acne or enlarged pores (#406)", () => {
    const OILY = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["dehydrated" as const] };
    const SAYS = "can clog pores. That counts a little for your oily skin.";

    it("names the clogger and says it counts a little", async () => {
      await show(["coconut oil"], OILY);
      await openMatch();
      expect(screen.getByText(new RegExp(`Coconut Oil ${SAYS.replace(/\./g, "\\.")}`))).toBeTruthy();
      expect(screen.queryByText(/is comedogenic/)).toBeNull();
    });

    it("also names a moderate one, together with a strong one in one row", async () => {
      await show(["coconut oil", "glyceryl stearate se"], OILY);
      await openMatch();
      expect(screen.getByText(/Coconut Oil and Glyceryl Stearate SE can clog pores\. That counts a little/i)).toBeTruthy();
    });

    it("names three and then says 'and others'", async () => {
      await show(["coconut oil", "lauric acid", "isopropyl myristate", "glyceryl stearate se"], OILY);
      await openMatch();
      expect(screen.getByText(/Coconut Oil, Lauric Acid, Isopropyl Myristate and others can clog pores\./)).toBeTruthy();
    });

    it("never names a contested one, and shows no row for it alone", async () => {
      await show(["coconut alkanes"], OILY);
      await openMatch();
      expect(screen.queryByText(/can clog pores/)).toBeNull();
      expect(screen.queryByText(/Coconut Alkanes/i)).toBeNull();
    });

    it("shows no row when nothing on the label clogs pores", async () => {
      await show(["niacinamide"], OILY);
      await openMatch();
      expect(screen.queryByText(/That counts a little/)).toBeNull();
    });

    it("leaves acne and enlarged pores to their own wording, not this row", async () => {
      await show(["coconut oil"], { ...OILY, concerns: ["acne-prone"] });
      await openMatch();
      expect(screen.getByText(/Coconut Oil is comedogenic and may clog pores\./)).toBeTruthy();
      expect(screen.queryByText(/That counts a little/)).toBeNull();
    });

    it("is for oily skin only: normal skin is told nothing of it", async () => {
      await show(["coconut oil"], { ...OILY, baseSkinType: "normal" });
      await openMatch();
      expect(screen.queryByText(/can clog pores/)).toBeNull();
    });
  });
});

// Owner, 8 October 2026: "Unknown" is explained where it appears, once, and only then.
describe("the line that explains Unknown", () => {
  const profile = { ...EMPTY_PROFILE, baseSkinType: "dry" as const };

  async function showWith(extra: Ingredient[]) {
    const ingredients = [...BASE.map(ingredient), ...extra];
    await render(<ResultTabs header={null} ingredients={ingredients} type="serum" match={matchProduct({ type: "serum", ingredients }, profile)} profile={profile} onIngredientPress={jest.fn()} />);
    await act(async () => {});
    await putTeaserAway();
    await openIngredients();
  }

  it("sits under the list when a row is marked Unknown", async () => {
    await showWith([{ ...ingredient("mystery extract"), verified: false }]);
    expect(screen.getByText("Unknown")).toBeTruthy();
    expect(screen.getAllByText(UNKNOWN_LINE)).toHaveLength(1);
  });

  it("is absent when every ingredient is recognised", async () => {
    await showWith([]);
    expect(screen.queryByText(UNKNOWN_LINE)).toBeNull();
  });
});
