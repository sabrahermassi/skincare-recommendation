import { render, screen } from "@testing-library/react-native";
import { View } from "react-native";

import { ReadingScale, Text, readingFontScale, useIconScale, useRingScale } from "@/components/Text";
import { FONT_SCALE, TYPE } from "@/lib/tokens";

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
      readingFontScale(undefined, { fontFamily: "PTSerif_700Bold", fontSize: 34 }) * 34,
    ).toBeCloseTo(TOP);
    expect(readingFontScale("font-display text-[21px]", undefined) * 21).toBeCloseTo(TOP);
    expect(readingFontScale("text-title", undefined) * TYPE.title).toBeCloseTo(TOP);
  });

  it("never gives text less room than it has outside the scope", () => {
    expect(readingFontScale(undefined, { fontSize: 60 })).toBe(FONT_SCALE.ui);
    expect(readingFontScale(undefined, { fontFamily: "PTSerif_700Bold", fontSize: 60 })).toBe(
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
