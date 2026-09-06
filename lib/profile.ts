import type { Concern, Sensitivity, SkinProfile } from "@/data/types";

/**
 * A profile "counts" for matching once it carries a skin signal. Sensitivity
 * alone does not: it scales how harshly irritants are judged, it does not say
 * what the formula should be doing for you.
 */
export function isPersonalized(profile: SkinProfile): boolean {
  return profile.baseSkinType !== null || profile.concerns.length > 0;
}

/**
 * The boolean the rules table still speaks. Derived rather than stored, so
 * there is one source of truth and no way for the two to drift — which is
 * exactly what happened when `sensitive` and the skin type were separate
 * stored answers.
 */
export function isSensitive(profile: { sensitivity: Sensitivity | null }): boolean {
  return profile.sensitivity === "some" || profile.sensitivity === "high";
}

const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  none: "Not sensitive",
  some: "Somewhat sensitive",
  high: "Very sensitive",
};

export function sensitivityLabel(sensitivity: Sensitivity): string {
  return SENSITIVITY_LABEL[sensitivity];
}

const CONCERN_LABEL: Record<Concern, string> = {
  dehydrated: "dehydrated",
  "acne-prone": "acne-prone",
  redness: "redness",
  dullness: "dullness",
  "large-pores": "large pores",
  "fine-lines": "fine lines",
  hyperpigmentation: "dark spots",
  atopic: "eczema-prone",
};

/** The short summary shown in the browse header, e.g. "Combination, sensitive · dehydrated, redness". */
export function profileSummary(profile: SkinProfile): string {
  const parts: string[] = [];

  if (profile.baseSkinType) {
    parts.push(
      isSensitive(profile)
        ? `${capitalize(profile.baseSkinType)}, ${
            profile.sensitivity === "high" ? "very sensitive" : "sensitive"
          }`
        : capitalize(profile.baseSkinType)
    );
  } else if (profile.sensitivity !== null && profile.sensitivity !== "none") {
    // Skin type can be "I don't know" now, and a sensitivity answer on its own
    // is still worth showing rather than leaving the pill blank.
    parts.push(sensitivityLabel(profile.sensitivity));
  }

  if (profile.concerns.length > 0) {
    parts.push(profile.concerns.map((c) => CONCERN_LABEL[c]).join(", "));
  }

  return parts.join(" · ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Every onboarding route, in order — exactly the three answers the MVP asks
 * for, and nothing else.
 *
 * Gone: "about you" (gender and age, both collected and read by nothing) and
 * the face/body step. `area` is still a real field, still editable from the
 * profile screen and still what the browse filter reads; it just isn't a
 * question standing between someone and their first scan.
 */
const STEPS = [
  "/onboarding/concerns",
  "/onboarding/skin-type",
  "/onboarding/sensitivity",
] as const;

export type QuizRoute = (typeof STEPS)[number];

/** Ordered onboarding routes. Single source of truth for the flow. */
export function quizRoutes(): readonly QuizRoute[] {
  return STEPS;
}

/** Total shown in "Step N of M". */
export function quizStepCount(): number {
  return STEPS.length;
}

/**
 * The route after `current`, or `null` when `current` is the last step — which
 * means "finish onboarding" rather than "navigate".
 */
export function nextQuizRoute(current: QuizRoute): QuizRoute | null {
  const i = STEPS.indexOf(current);
  if (i === -1 || i === STEPS.length - 1) return null;
  return STEPS[i + 1];
}

/**
 * Where finishing (or skipping) the quiz lands you.
 *
 * Defined once because it was wrong four times: every exit called
 * `router.replace("/")`, and `/` used to resolve to the browse grid — so the
 * skin analysis ended on a list of products, which is exactly what this app
 * stopped being. Reordering the tab bar did not help, because these
 * navigations name the destination explicitly.
 *
 * `/` is now the scanner itself (`app/(tabs)/index.tsx`), so this and a cold
 * start agree by construction rather than by two routes being kept in step.
 */
export const POST_ONBOARDING_ROUTE = "/" as const;
