import { SCHOOL } from "@/data/school";
import { CONCERN_PHRASE, CONCERN_TITLE } from "@/lib/profile";
import { PORE_CLOGGERS } from "@/lib/pore-clogging";
import { INGREDIENT_RULES } from "@/lib/rules";
import { EVENING_FALLBACK, EVENING_TIPS, GENERAL_TIPS, MORNING_TIPS, REST_NIGHT_TIP } from "@/lib/skin-tips";
import type { Concern } from "@/data/types";

/**
 * The app names no condition and claims no effect on one (#473): a cosmetic
 * app describes skin and what a product is for, it does not treat acne or
 * eczema. The owner approved each replacement (8 October 2026); this pins them
 * in the four places the table covered (rule reasons, pore-clogging notes,
 * School, tips), so a later edit cannot quietly bring one back. It is not an
 * audit of every screen: lines found outside the table are listed, unchanged,
 * in `docs/wording-for-review.md` for the owner to decide.
 */

const VISIBLE = JSON.stringify({
  rules: INGREDIENT_RULES.map((rule) => rule.reason),
  clog: PORE_CLOGGERS,
  school: SCHOOL,
  tips: [GENERAL_TIPS, MORNING_TIPS, EVENING_TIPS, EVENING_FALLBACK, REST_NIGHT_TIP],
});

const RETIRED = [
  "eczema-prone",
  "acne-clinic",
  "acne clinics",
  "strong blemish active",
  "anti-blemish",
  "real evidence against blemishes",
  "circulation-boosting",
  "why did this break me out",
  "Oat soothes",
  "blemish products",
  "Korean acne ranges",
  "your skin is acne-prone",
];

it.each(RETIRED)("no visible rule, note, School page or tip still says %s", (phrase: string) => {
  expect(VISIBLE).not.toContain(phrase);
});

describe("concern names", () => {
  it("say what a person sees, in the owner's words", () => {
    expect(CONCERN_TITLE["acne-prone"]).toBe("Breakouts");
    expect(CONCERN_TITLE.redness).toBe("Redness");
    expect(CONCERN_TITLE["post-acne-marks"]).toBe("Marks left by breakouts");
    expect(CONCERN_TITLE.atopic).toBe("Very dry or reactive");
    // An appearance claim, kept.
    expect(CONCERN_TITLE["fine-lines"]).toBe("Fine lines and wrinkles");
    expect(CONCERN_PHRASE["acne-prone"]).toBe("breakouts");
    expect(CONCERN_PHRASE["post-acne-marks"]).toBe("marks left by breakouts");
    expect(CONCERN_PHRASE.atopic).toBe("very dry or reactive skin");
  });

  it("move only the labels: the stored concern keys, and so every saved profile, are unchanged", () => {
    const keys: Concern[] = ["acne-prone", "atopic", "dehydrated", "dullness", "fine-lines", "hyperpigmentation", "large-pores", "post-acne-marks", "redness"];
    expect(Object.keys(CONCERN_TITLE).sort()).toEqual(keys);
    expect(Object.keys(CONCERN_PHRASE).sort()).toEqual(keys);
  });
});
