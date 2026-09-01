import type { SkinProfile } from "@/data/types";
import {
  ageGroupLabel,
  genderLabel,
  isPersonalized,
  nextQuizRoute,
  profileSummary,
  quizRoutes,
  quizStepCount,
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

  it("is false when only demographics are answered", () => {
    // Gender/age don't affect scoring, so they must not unlock match badges.
    expect(isPersonalized(profile({ gender: "female", ageGroup: "25-34", area: "face" }))).toBe(
      false
    );
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
    expect(profileSummary(profile({ baseSkinType: "dry", sensitive: true }))).toBe(
      "Dry, sensitive"
    );
  });

  it("joins skin type and concerns with a separator", () => {
    const summary = profileSummary(
      profile({ baseSkinType: "oily", concerns: ["acne-prone", "large-pores"] })
    );
    expect(summary).toBe("Oily · acne-prone, large pores");
  });
});

describe("labels", () => {
  it("cover every gender and age group without throwing", () => {
    expect(genderLabel("undisclosed")).toBe("Prefer not to say");
    expect(ageGroupLabel("65+")).toBe("65+");
  });
});

describe("quiz flow", () => {
  it("has four steps, the same for face and body", () => {
    expect(quizStepCount()).toBe(4);
  });

  it("does not include a routine step", () => {
    expect(quizRoutes()).not.toContain("/onboarding/routine");
  });

  it("treats skin type as the last step", () => {
    // null means "finish onboarding", not "navigate".
    expect(nextQuizRoute("/onboarding/skin-type")).toBeNull();
  });

  it("walks the whole flow end to end", () => {
    const visited: QuizRoute[] = ["/onboarding/about-you"];
    let current = nextQuizRoute(visited[0]);
    while (current) {
      visited.push(current);
      current = nextQuizRoute(current);
    }
    expect(visited).toEqual(quizRoutes());
  });
});
