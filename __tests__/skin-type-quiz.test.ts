import {
  BARRIER_QUESTION,
  SHINE_QUESTION,
  deriveSkinType,
  type BarrierAnswer,
  type ShineAnswer,
} from "@/lib/skin-type-quiz";

const BARRIERS = BARRIER_QUESTION.options.map((o) => o.value);
const SHINES = SHINE_QUESTION.options.map((o) => o.value);

describe("deriveSkinType", () => {
  // The whole point of a lookup table is that every cell is stated, so the
  // test states them too. A change to the table has to be a deliberate edit
  // here as well, not a silent shift in what the app tells people.
  const EXPECTED: Record<BarrierAnswer, Record<ShineAnswer, string>> = {
    tight: { none: "dry", slight: "dry", tzone: "combination", allover: "combination" },
    comfortable: { none: "dry", slight: "normal", tzone: "combination", allover: "oily" },
    mixed: { none: "dry", slight: "combination", tzone: "combination", allover: "oily" },
    oily: { none: "normal", slight: "normal", tzone: "combination", allover: "oily" },
  };

  it.each(BARRIERS.flatMap((barrier) => SHINES.map((shine) => [barrier, shine] as const)))(
    "%s + %s",
    (barrier, shine) => {
      expect(deriveSkinType({ barrier, shine })).toBe(EXPECTED[barrier][shine]);
    }
  );

  it("never returns 'sensitive' — that is a modifier, not a base type", () => {
    for (const barrier of BARRIERS) {
      for (const shine of SHINES) {
        expect(["dry", "oily", "combination", "normal"]).toContain(
          deriveSkinType({ barrier, shine })
        );
      }
    }
  });

  it("offers four answers to each question, with no duplicate values", () => {
    expect(new Set(BARRIERS).size).toBe(4);
    expect(new Set(SHINES).size).toBe(4);
  });
});
