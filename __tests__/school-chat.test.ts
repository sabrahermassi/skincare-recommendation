import type { SchoolQuestion } from "@/data/school";
import { FALLBACK_SUGGESTIONS, fallbackSuggestions, foldText, SCHOOL_QUESTIONS, searchSchool } from "@/lib/school-chat";

/**
 * #352: the School's search box only ever finds a curated question. It never
 * writes an answer, so what it matches is the whole contract.
 */

const ids = (found: SchoolQuestion[]) => found.map((item) => item.id);

describe("searchSchool", () => {
  it("finds a question by its own words", () => {
    expect(ids(searchSchool("retinoids"))[0]).toBe("retinoids");
    expect(ids(searchSchool("parfum"))[0]).toBe("fragrance");
  });

  it("finds one by a word only its answer uses", () => {
    // "INCI" is in the question; "Butyrospermum" only in its answer.
    expect(ids(searchSchool("butyrospermum"))).toEqual(["inci-names"]);
  });

  it("ignores case and accents", () => {
    expect(ids(searchSchool("NIACINAMIDE"))[0]).toBe("niacinamide");
    expect(ids(searchSchool("Fragrànce"))[0]).toBe("fragrance");
    expect(foldText("Crème Brûlée")).toBe("creme brulee");
  });

  it("matches while someone is still typing, and a plural finds the singular", () => {
    expect(ids(searchSchool("niacin"))[0]).toBe("niacinamide");
    expect(ids(searchSchool("retinoid"))[0]).toBe("retinoids");
    expect(ids(searchSchool("steps"))).toContain("how-many-steps");
  });

  it("reads past how a question is phrased", () => {
    expect(ids(searchSchool("what is comedogenic"))[0]).toBe("comedogenic");
  });

  it("puts the question that names the words ahead of answers that only mention them", () => {
    const found = ids(searchSchool("retinoid"));
    expect(found[0]).toBe("retinoids");
    expect(found.length).toBeGreaterThan(1);
  });

  it("needs every meaningful word to appear", () => {
    expect(searchSchool("retinoids volcano")).toEqual([]);
  });

  it("finds nothing for a question it has no answer to, or for filler alone", () => {
    expect(searchSchool("how do I cure eczema overnight")).toEqual([]);
    expect(searchSchool("what is the")).toEqual([]);
    expect(searchSchool("   ")).toEqual([]);
  });

  it("only ever returns the curated questions themselves", () => {
    for (const query of ["skin", "sunscreen", "acid", "label"]) {
      for (const item of searchSchool(query)) expect(SCHOOL_QUESTIONS).toContain(item);
    }
  });
});

describe("fallbackSuggestions", () => {
  it("offers questions not asked yet, in order", () => {
    const asked = new Set([SCHOOL_QUESTIONS[0].id]);
    expect(fallbackSuggestions(asked)).toEqual(SCHOOL_QUESTIONS.slice(1, 1 + FALLBACK_SUGGESTIONS));
  });

  it("tops up from asked ones when fewer are left", () => {
    const asked = new Set(SCHOOL_QUESTIONS.slice(0, -1).map((item) => item.id));
    const offered = fallbackSuggestions(asked);
    expect(offered).toHaveLength(FALLBACK_SUGGESTIONS);
    expect(offered[0]).toBe(SCHOOL_QUESTIONS[SCHOOL_QUESTIONS.length - 1]);
  });
});
