import type { AgeGroup, Concern, Gender, SkinProfile } from "@/data/types";

/**
 * A profile "counts" for matching once it carries a skin signal. Demographics
 * alone (gender, age) do not — `matchProduct` never scores on them — so
 * answering only those questions must not unlock match percentages.
 */
export function isPersonalized(profile: SkinProfile): boolean {
  return profile.baseSkinType !== null || profile.concerns.length > 0;
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

const GENDER_LABEL: Record<Gender, string> = {
  female: "Female",
  male: "Male",
  nonbinary: "Non-binary",
  undisclosed: "Prefer not to say",
};

const AGE_LABEL: Record<AgeGroup, string> = {
  "18-24": "18–24",
  "25-34": "25–34",
  "35-44": "35–44",
  "45-54": "45–54",
  "55-64": "55–64",
  "65+": "65+",
};

export function genderLabel(gender: Gender): string {
  return GENDER_LABEL[gender];
}

export function ageGroupLabel(ageGroup: AgeGroup): string {
  return AGE_LABEL[ageGroup];
}

/** The short summary shown in the browse header, e.g. "Combination · sensitive · dehydrated, redness". */
export function profileSummary(profile: SkinProfile): string {
  const parts: string[] = [];

  if (profile.baseSkinType) {
    parts.push(
      profile.sensitive
        ? `${capitalize(profile.baseSkinType)}, sensitive`
        : capitalize(profile.baseSkinType)
    );
  }

  if (profile.concerns.length > 0) {
    parts.push(profile.concerns.map((c) => CONCERN_LABEL[c]).join(", "));
  }

  return parts.join(" · ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every onboarding route, in order. Same flow for face and body. */
const STEPS = [
  "/onboarding/about-you",
  "/onboarding/area",
  "/onboarding/concerns",
  "/onboarding/skin-type",
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
 * `router.replace("/")`, and `/` resolves to the browse grid — so the skin
 * analysis ended on a list of products, which is exactly what this app stopped
 * being. Reordering the tab bar did not help, because these navigations name
 * the destination explicitly.
 */
export const POST_ONBOARDING_ROUTE = "/scan" as const;
