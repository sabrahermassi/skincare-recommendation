import { SCHOOL } from "@/data/school";

/**
 * Skincare School's content rules (#235). The claims-policy audit covers
 * the wording; these pin the shape `FOR_ME_MVP.md` §25 asks for and the one
 * content rule a denylist can't see — no question about a condition.
 */
const questions = SCHOOL.flatMap((category) => category.questions);

describe("Skincare School content", () => {
  it("has 15–20 questions in four categories", () => {
    expect(SCHOOL).toHaveLength(4);
    expect(questions.length).toBeGreaterThanOrEqual(15);
    expect(questions.length).toBeLessThanOrEqual(20);
  });

  it("gives every question a unique id", () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it("never asks about a condition — that's a medical question, not a label one", () => {
    const conditionWords = /\b(?:acne|eczema|rosacea|psoriasis|dermatitis|infection|disease|condition|rash|allerg(?:y|ies))\b/i;
    for (const q of questions) expect(q.question).not.toMatch(conditionWords);
  });

  // Both answers describe what the app does, so they have to match it (#263 review).
  it("doesn't deny AI: label photos are read by a trained model", () => {
    const answer = questions.find((q) => q.id === "ai")!.answer;
    expect(answer).not.toMatch(/^No\b/);
    expect(answer).toMatch(/label/i);
    expect(answer).toMatch(/model/i);
  });

  it("keeps the pregnancy exception when saying unrecognised names don't count", () => {
    const answer = questions.find((q) => q.id === "cant-tell")!.answer;
    expect(answer).not.toMatch(/\bnever counts\b/);
    expect(answer).toMatch(/pregnant or breastfeeding/);
  });

  it("names a missing skin profile as a reason it can't tell, not only the photo", () => {
    expect(questions.find((q) => q.id === "cant-tell")!.answer).toMatch(/skin-profile questions/);
  });

  it("has no empty question or answer", () => {
    for (const q of questions) {
      expect(q.question.trim().length).toBeGreaterThan(0);
      expect(q.answer.trim().length).toBeGreaterThan(0);
    }
  });
});
