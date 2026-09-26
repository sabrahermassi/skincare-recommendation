import type { SkinProfile } from "@/data/types";
import {
  answeredWithoutSignal,
  isPersonalized,
  isSensitive,
  nextQuizRoute,
  profileHeadline,
  quizRoutes,
  quizStepCount,
  sensitivityLabel,
  type QuizRoute,
} from "@/lib/profile";
import { EMPTY_PROFILE } from "@/store/useAppStore";

function profile(overrides: Partial<SkinProfile> = {}): SkinProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

describe("isPersonalized", () => {
  it("is false for a completely empty profile", () => {
    expect(isPersonalized(EMPTY_PROFILE)).toBe(false);
  });

  it("is false when only sensitivity is answered", () => {
    // Sensitivity scales how harshly irritants are judged; it does not say
    // what a formula should be doing for you, so it must not on its own
    // unlock a match score.
    expect(isPersonalized(profile({ sensitivity: "high" }))).toBe(false);
  });

  it("is true once a base skin type is set", () => {
    expect(isPersonalized(profile({ baseSkinType: "dry" }))).toBe(true);
  });

  it("is true once at least one concern is set", () => {
    expect(isPersonalized(profile({ concerns: ["redness"] }))).toBe(true);
  });
});

// #291: copy that tells an "I don't know" quiz-taker to answer the questions
// they just answered reads as the app not listening.
describe("answeredWithoutSignal", () => {
  it("is true for a quiz answered with I don't know / no concerns / prefer not to say", () => {
    expect(answeredWithoutSignal(profile({ pregnancyStatus: "prefer-not-to-say" }))).toBe(true);
  });

  it("is true when only sensitivity was answered", () => {
    expect(answeredWithoutSignal(profile({ sensitivity: "none" }))).toBe(true);
  });

  it("is false for a skipped quiz", () => {
    expect(answeredWithoutSignal(EMPTY_PROFILE)).toBe(false);
  });

  it("is false once there is something to score with", () => {
    expect(answeredWithoutSignal(profile({ baseSkinType: "dry", pregnancyStatus: "neither" }))).toBe(false);
  });
});

describe("sensitivity", () => {
  it("labels every level without throwing", () => {
    expect(sensitivityLabel("none")).toBe("Not sensitive");
    expect(sensitivityLabel("some")).toBe("Somewhat sensitive");
    expect(sensitivityLabel("high")).toBe("Very sensitive");
  });

  // `null` is unanswered and must not read as "sensitive" — that would apply
  // the irritant rules to someone who never said their skin reacts.
  it("treats unanswered and 'none' alike, and only those", () => {
    expect(isSensitive({ sensitivity: null })).toBe(false);
    expect(isSensitive({ sensitivity: "none" })).toBe(false);
    expect(isSensitive({ sensitivity: "some" })).toBe(true);
    expect(isSensitive({ sensitivity: "high" })).toBe(true);
  });
});

describe("quiz flow", () => {
  // Four steps as of the for.me design-system rollout: concerns, skin type,
  // sensitivity, pregnancy/breastfeeding. Age and gender were dropped
  // earlier and stay dropped; face/body is still not a question.
  it("has four steps", () => {
    expect(quizStepCount()).toBe(4);
  });

  it("no longer asks for demographics or body area", () => {
    expect(quizRoutes()).not.toContain("/onboarding/about-you");
    expect(quizRoutes()).not.toContain("/onboarding/area");
  });

  it("treats pregnancy as the last step", () => {
    // null means "finish onboarding", not "navigate".
    expect(nextQuizRoute("/onboarding/pregnancy")).toBeNull();
  });

  it("moves from sensitivity to pregnancy, not straight to finishing", () => {
    expect(nextQuizRoute("/onboarding/sensitivity")).toBe("/onboarding/pregnancy");
  });

  it("walks the whole flow end to end", () => {
    const visited: QuizRoute[] = ["/onboarding/concerns"];
    let current = nextQuizRoute(visited[0]);
    while (current) {
      visited.push(current);
      current = nextQuizRoute(current);
    }
    expect(visited).toEqual(quizRoutes());
  });
});

describe("profileHeadline", () => {
  it("names an unanswered profile as such, with no tags", () => {
    expect(profileHeadline(EMPTY_PROFILE)).toEqual({ title: "Your skin profile", tags: [] });
  });

  it("titles by skin type and tags sensitivity, then concerns", () => {
    const h = profileHeadline(profile({ baseSkinType: "oily", sensitivity: "high", concerns: ["acne-prone", "redness"] }));
    expect(h.title).toBe("Oily skin");
    // The quiz's own words, so a chip can't rename an answer (#294).
    expect(h.tags).toEqual(["Very sensitive", "Acne or pimples", "Redness or rosacea"]);
  });

  it("tags some sensitivity in the quiz's words", () => {
    expect(profileHeadline(profile({ baseSkinType: "dry", sensitivity: "some" })).tags).toEqual(["Somewhat sensitive"]);
  });

  it("says Your skin when only concerns are answered", () => {
    expect(profileHeadline(profile({ concerns: ["dullness"] })).title).toBe("Your skin");
  });

  it("does not tag a not-sensitive skin", () => {
    expect(profileHeadline(profile({ baseSkinType: "dry", sensitivity: "none" })).tags).toEqual([]);
  });
});
