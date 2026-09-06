import type { SkinProfile } from "@/data/types";
import {
  isPersonalized,
  isSensitive,
  nextQuizRoute,
  profileSummary,
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

  it("is false when only sensitivity and area are answered", () => {
    // Sensitivity scales how harshly irritants are judged; it does not say
    // what a formula should be doing for you, so it must not on its own
    // unlock a match score.
    expect(isPersonalized(profile({ sensitivity: "high", area: "face" }))).toBe(false);
  });

  it("is true once a base skin type is set", () => {
    expect(isPersonalized(profile({ baseSkinType: "dry" }))).toBe(true);
  });

  it("is true once at least one concern is set", () => {
    expect(isPersonalized(profile({ concerns: ["redness"] }))).toBe(true);
  });
});

describe("profileSummary", () => {
  it("is empty for an unanswered profile", () => {
    expect(profileSummary(EMPTY_PROFILE)).toBe("");
  });

  it("includes sensitivity alongside the base type", () => {
    expect(profileSummary(profile({ baseSkinType: "dry", sensitivity: "some" }))).toBe(
      "Dry, sensitive"
    );
  });

  it("distinguishes very sensitive from somewhat", () => {
    expect(profileSummary(profile({ baseSkinType: "dry", sensitivity: "high" }))).toBe(
      "Dry, very sensitive"
    );
  });

  // Skin type is optional now ("I don't know"), so sensitivity has to be able
  // to carry the summary on its own rather than leaving the pill blank.
  it("falls back to sensitivity when there is no skin type", () => {
    expect(profileSummary(profile({ sensitivity: "high" }))).toBe("Very sensitive");
  });

  it("joins skin type and concerns with a separator", () => {
    const summary = profileSummary(
      profile({ baseSkinType: "oily", concerns: ["acne-prone", "large-pores"] })
    );
    expect(summary).toBe("Oily · acne-prone, large pores");
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
  // The MVP asks for exactly three: concerns, skin type, sensitivity. Age and
  // gender were dropped, and face/body is no longer a question.
  it("has three steps", () => {
    expect(quizStepCount()).toBe(3);
  });

  it("no longer asks for demographics or body area", () => {
    expect(quizRoutes()).not.toContain("/onboarding/about-you");
    expect(quizRoutes()).not.toContain("/onboarding/area");
  });

  it("treats sensitivity as the last step", () => {
    // null means "finish onboarding", not "navigate".
    expect(nextQuizRoute("/onboarding/sensitivity")).toBeNull();
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
