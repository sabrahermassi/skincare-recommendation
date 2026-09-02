import type { AgeGroup, BodyArea, Concern, Gender, SkinProfile } from "@/data/types";

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

/** Every onboarding route, in order. The face flow uses all of them. */
const FACE_STEPS = [
  "/onboarding/about-you",
  "/onboarding/area",
  "/onboarding/concerns",
  "/onboarding/skin-type",
  "/onboarding/routine",
] as const;

export type QuizRoute = (typeof FACE_STEPS)[number];

/**
 * Body skips the routine question. Not a shortcut for its own sake: the body
 * catalogue is body-wash, body-lotion and hand-cream, and all three sit in
 * `matchProduct`'s "minimal" list and outside its "full" list, so every
 * routine answer shifts every body product by the same amount. The ranking is
 * identical whichever is picked — the question cannot change a single body
 * recommendation, so asking it is pure friction. `matching.test.ts` pins this,
 * and will fail if the catalogue ever gains a body product that breaks it.
 */
const BODY_STEPS = FACE_STEPS.filter((r) => r !== "/onboarding/routine");

/** Ordered onboarding routes for this area. Single source of truth for the flow. */
export function quizRoutes(area: BodyArea | null): readonly QuizRoute[] {
  return area === "body" ? BODY_STEPS : FACE_STEPS;
}

/** Total shown in "Step N of M". Defaults to the longer flow until area is known. */
export function quizStepCount(area: BodyArea | null): number {
  return quizRoutes(area).length;
}

/**
 * The route after `current`, or `null` when `current` is the last step — which
 * means "finish onboarding" rather than "navigate". Keeping the null-as-finish
 * rule here is what stops the face/body branch leaking into every screen.
 */
export function nextQuizRoute(
  current: QuizRoute,
  area: BodyArea | null
): QuizRoute | null {
  const routes = quizRoutes(area);
  const i = routes.indexOf(current);
  if (i === -1 || i === routes.length - 1) return null;
  return routes[i + 1];
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
