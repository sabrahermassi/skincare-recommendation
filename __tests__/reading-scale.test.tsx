import { render, screen, within } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";

import { RiskCards } from "@/components/RiskCards";
import { ReadingScale, Text, readingFontScale, useIconScale, useRingScale } from "@/components/Text";
import { ExplanationLine } from "@/components/VerdictExplanation";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { matchProduct } from "@/lib/matching";
import { FONT_SCALE, TYPE } from "@/lib/tokens";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * #334: inside a `ReadingScale` — the reading part of the product, ingredient
 * and label-result screens — text follows the phone's text size past the #314
 * ceiling, and the layouts that can't hold it side by side stack.
 */

// The phone's text size. iOS's largest accessibility size is about 3.57×.
let mockFontScale = 1;
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 402, height: 874, scale: 3, fontScale: mockFontScale }),
}));
beforeEach(() => {
  mockFontScale = 1;
});

const LARGEST = 3.57;
const TOP = TYPE.body * FONT_SCALE.reading;

describe("readingFontScale", () => {
  it("never stops body or smaller text short of iOS's largest size", () => {
    expect(readingFontScale(undefined, { fontSize: TYPE.body })).toBeGreaterThan(LARGEST);
    expect(readingFontScale(undefined, { fontSize: TYPE.label })).toBeGreaterThan(LARGEST);
    expect(readingFontScale("text-[10.5px]", undefined)).toBeGreaterThan(LARGEST);
  });

  it("stops larger text where body text stops, so a heading ends level with it", () => {
    expect(readingFontScale(undefined, { fontSize: TYPE.heading }) * TYPE.heading).toBeCloseTo(TOP);
    expect(
      readingFontScale(undefined, { fontFamily: "PlayfairDisplay_500Medium", fontSize: 34 }) * 34,
    ).toBeCloseTo(TOP);
    expect(readingFontScale("font-display text-[21px]", undefined) * 21).toBeCloseTo(TOP);
    expect(readingFontScale("text-title", undefined) * TYPE.title).toBeCloseTo(TOP);
  });

  it("never gives text less room than it has outside the scope", () => {
    expect(readingFontScale(undefined, { fontSize: 60 })).toBe(FONT_SCALE.ui);
    expect(readingFontScale(undefined, { fontFamily: "PlayfairDisplay_500Medium", fontSize: 60 })).toBe(
      FONT_SCALE.display,
    );
  });

  it("reads text with no size of its own as body text", () => {
    expect(readingFontScale(undefined, undefined)).toBe(FONT_SCALE.reading);
  });
});

describe("Text in and out of a ReadingScale", () => {
  it("raises the ceiling only inside the scope", async () => {
    await render(
      <View>
        <Text style={{ fontSize: TYPE.body }}>outside</Text>
        <ReadingScale>
          <Text style={{ fontSize: TYPE.body }}>inside</Text>
        </ReadingScale>
      </View>,
    );
    expect(screen.getByText("outside").props.maxFontSizeMultiplier).toBe(FONT_SCALE.ui);
    expect(screen.getByText("inside").props.maxFontSizeMultiplier).toBe(FONT_SCALE.reading);
  });

  it("keeps a ceiling the caller sets, as a control inside the scope does", async () => {
    await render(
      <ReadingScale>
        <Text maxFontSizeMultiplier={FONT_SCALE.display}>button</Text>
      </ReadingScale>,
    );
    expect(screen.getByText("button").props.maxFontSizeMultiplier).toBe(FONT_SCALE.display);
  });
});

describe("ExplanationLine's sign", () => {
  const line = <ExplanationLine label="Your concerns" detail="This formula works on what you asked about" direction="up" />;

  it("moves into the label past the ordinary ceiling, so it can't be cut off from it", async () => {
    mockFontScale = LARGEST;
    await render(<ReadingScale>{line}</ReadingScale>);
    // The sign is part of the label's own line, not a separate dot.
    expect(within(screen.getByText("+ Your concerns")).getByText("+")).toBeTruthy();
  });

  it("stays in its dot, grown with the words, up to the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    await render(<ReadingScale>{line}</ReadingScale>);
    expect(screen.getByText("+").props.maxFontSizeMultiplier).toBe(FONT_SCALE.ui);
    expect(screen.getByText("Your concerns")).toBeTruthy();
  });

  it("stays in its dot outside a ReadingScale, and never shrinks below its drawn size", async () => {
    mockFontScale = LARGEST;
    const { rerender } = await render(line);
    expect(screen.getByText("+").props.maxFontSizeMultiplier).toBe(FONT_SCALE.ui);

    mockFontScale = 0.8;
    await rerender(<ReadingScale>{line}</ReadingScale>);
    expect(screen.getByText("+").props.maxFontSizeMultiplier).toBe(1);
  });
});

describe("icon and ring growth", () => {
  function Probe({ fontSize }: { fontSize: number }) {
    return <Text>{`${useIconScale(fontSize)} ${useRingScale()}`}</Text>;
  }

  it("stops icons at FONT_SCALE.icon however large the text gets", async () => {
    mockFontScale = LARGEST;
    await render(
      <ReadingScale>
        <Probe fontSize={TYPE.label} />
      </ReadingScale>,
    );
    expect(screen.getByText(`${FONT_SCALE.icon} ${FONT_SCALE.icon}`)).toBeTruthy();
  });

  it("grows the ring only past the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    const { rerender } = await render(<Probe fontSize={TYPE.label} />);
    expect(screen.getByText(`${FONT_SCALE.ui} 1`)).toBeTruthy();

    mockFontScale = 2.25;
    await rerender(<Probe fontSize={TYPE.label} />);
    expect(screen.getByText(`${FONT_SCALE.ui} ${2.25 / FONT_SCALE.ui}`)).toBeTruthy();
  });
});

describe("RiskCards", () => {
  const ingredient = (name: string): Ingredient => ({
    id: name,
    name,
    comedogenic: 0,
    safety: "safe",
    verified: true,
    functions: [],
  });
  const product = {
    type: "serum",
    ingredients: ["glycerin", "propanediol", "carbomer", "allantoin"].map(ingredient),
  } as unknown as ProductWithIngredients;
  const cards = () => <RiskCards product={product} match={matchProduct(product, EMPTY_PROFILE)} />;
  // The cards' own container is the root of what RiskCards renders.
  const direction = () => {
    const root = screen.toJSON();
    return root && !Array.isArray(root) ? StyleSheet.flatten(root.props.style)?.flexDirection : undefined;
  };

  it("sits side by side up to the ordinary ceiling", async () => {
    mockFontScale = FONT_SCALE.ui;
    await render(cards());
    expect(direction()).toBe("row");
  });

  it("stacks past it", async () => {
    mockFontScale = LARGEST;
    await render(cards());
    expect(direction()).toBe("column");
  });
});
