import type { GoalKey } from "@/lib/journey";

/**
 * Skin needs: every piece of ingredient advice the app gives, in one file
 * (owner, 3 October 2026), so it can be checked and changed in one place.
 *
 * ALL OF THE COPY BELOW IS PLACEHOLDER. Strengths, frequencies, pairings,
 * pregnancy notes and the goal → families table need a scientific check
 * before launch (design_handoff "october 3d", BHA-STORY-README.md). Nothing
 * here may claim to treat, heal, repair or prevent anything:
 * docs/claims-policy.md, enforced by __tests__/claims-policy.test.ts.
 *
 * Three things live here:
 *
 * - `FAMILIES`: ten groups of actives, one set of pictures each.
 * - `ACTIVES`: one record per active. A record with a `story` can be shown on
 *   the Skin needs carousel and opened as a story; a record with a `result`
 *   is on the list a scanned product's actives are named from, and the
 *   routine builder picks its serum and evening actives from (`lib/journey.ts`).
 * - `GOAL_OPTIONS`: which actives the carousel shows for each goal.
 */

export type TimeOfDay = "morning" | "evening";

export type FamilyKey = "exfoliants" | "retinoids" | "brighteners" | "acne-oil" | "calming" | "hydrators" | "barrier" | "antioxidants" | "peptides" | "uv";

export type Family = {
  key: FamilyKey;
  name: string;
  /** Some of its actives, for the family card ("BHA · AHA · PHA"). */
  members: string;
  line: string;
  /** The carousel and pairing picture: a transparent watercolour, drawn with nothing behind it. */
  picture: number;
  /** The "Why this one?" picture. */
  why: number;
};

export const FAMILIES: Record<FamilyKey, Family> = {
  exfoliants: {
    key: "exfoliants",
    name: "Exfoliants",
    members: "BHA · AHA · PHA",
    line: "Unclogs pores and smooths texture.",
    picture: require("@/assets/illustrations/skin-needs/families/family-exfoliants.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-exfoliants.webp"),
  },
  retinoids: {
    key: "retinoids",
    name: "Retinoids",
    members: "Retinol · Retinal · Adapalene",
    line: "Speeds up renewal for lines and breakouts.",
    picture: require("@/assets/illustrations/skin-needs/families/family-retinoids.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-retinoids.webp"),
  },
  brighteners: {
    key: "brighteners",
    name: "Brighteners",
    members: "Vitamin C · Tranexamic acid · Arbutin",
    line: "Fades dark spots and evens tone.",
    picture: require("@/assets/illustrations/skin-needs/families/family-brighteners.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-brighteners.webp"),
  },
  "acne-oil": {
    key: "acne-oil",
    name: "Acne & Oil Control",
    members: "Niacinamide · Zinc · Sulfur",
    line: "Balances oil and calms breakouts.",
    picture: require("@/assets/illustrations/skin-needs/families/family-acne-oil.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-acne-oil.webp"),
  },
  calming: {
    key: "calming",
    name: "Soothing & Calming",
    members: "Centella · Oat · Panthenol",
    line: "Calms redness and sensitive skin.",
    picture: require("@/assets/illustrations/skin-needs/families/family-calming.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-calming.webp"),
  },
  hydrators: {
    key: "hydrators",
    name: "Hydrators",
    members: "Hyaluronic acid · Glycerin · Urea",
    line: "Draws water in so skin feels plump.",
    picture: require("@/assets/illustrations/skin-needs/families/family-hydrators.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-hydrators.webp"),
  },
  barrier: {
    key: "barrier",
    name: "Barrier Support",
    members: "Ceramides · Squalane · Cholesterol",
    // "Seals moisture in and repairs" in the hand-off: "repairs" is a claim docs/claims-policy.md rules out.
    line: "Seals moisture in and supports your barrier.",
    picture: require("@/assets/illustrations/skin-needs/families/family-barrier.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-barrier.webp"),
  },
  antioxidants: {
    key: "antioxidants",
    name: "Antioxidants",
    members: "Vitamin E · Ferulic · Green tea",
    line: "Shields skin from daily stress.",
    picture: require("@/assets/illustrations/skin-needs/families/family-antioxidants.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-antioxidants.webp"),
  },
  peptides: {
    key: "peptides",
    name: "Peptides",
    members: "Signal · Copper peptides",
    line: "Supports firmness and bounce.",
    picture: require("@/assets/illustrations/skin-needs/families/family-peptides.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-peptides.webp"),
  },
  uv: {
    key: "uv",
    name: "UV Protection",
    members: "Mineral · Chemical filters",
    line: "Blocks the sun that ages and marks skin.",
    picture: require("@/assets/illustrations/skin-needs/families/family-uv.webp"),
    why: require("@/assets/illustrations/skin-needs/why/why-uv.webp"),
  },
};

/** "When shopping"'s picture: a tube turned round, under a magnifier. */
export const LOOK_FOR_ART = require("@/assets/illustrations/skin-needs/families/what-to-look-for.webp");
export const PAIR_LOVE_ART = require("@/assets/illustrations/skin-needs/signs/pair-love.webp");
export const PAIR_AVOID_ART = require("@/assets/illustrations/skin-needs/signs/pair-avoid-bolt.webp");

export type SignKey = "dryness" | "stinging" | "peeling" | "redness" | "tightness" | "breakouts" | "sun";

/** The warning signs, one shared set: "Avoid pairing with" shows three of them. */
export const SIGNS: Record<SignKey, { label: string; picture: number }> = {
  dryness: { label: "Dryness", picture: require("@/assets/illustrations/skin-needs/signs/sign-dryness.webp") },
  stinging: { label: "Stinging", picture: require("@/assets/illustrations/skin-needs/signs/sign-stinging.webp") },
  peeling: { label: "Peeling", picture: require("@/assets/illustrations/skin-needs/signs/sign-peeling.webp") },
  redness: { label: "Redness", picture: require("@/assets/illustrations/skin-needs/signs/sign-redness.webp") },
  tightness: { label: "Tightness", picture: require("@/assets/illustrations/skin-needs/signs/sign-tightness.webp") },
  breakouts: { label: "Breakouts at first", picture: require("@/assets/illustrations/skin-needs/signs/sign-breakouts.webp") },
  sun: { label: "Sun sensitivity", picture: require("@/assets/illustrations/skin-needs/signs/sign-sun.webp") },
};

/** "How often do I use it?"'s picture (the hand-off's "Start easy"), by how sensitive the skin is ("some" when the question was skipped). */
export const SENSITIVITY_ART = {
  none: require("@/assets/illustrations/skin-needs/sensitivity-none.webp"),
  some: require("@/assets/illustrations/skin-needs/sensitivity-some.webp"),
  high: require("@/assets/illustrations/skin-needs/sensitivity-high.webp"),
} as const;

export type ActiveKey =
  | "azelaic"
  | "bha"
  | "niacinamide"
  | "hydrating"
  | "retinoids"
  | "tranexamic"
  | "vitamin-c"
  | "aha"
  | "benzoyl"
  | "bakuchiol"
  | "peptides"
  | "ceramides"
  | "calming"
  | "zinc-clay"
  | "emollients"
  | "urea"
  | "green-tea"
  | "spf"
  | "arbutin"
  | "pha"
  | "zinc"
  | "sulfur"
  | "oat"
  | "panthenol"
  | "glycerin"
  | "squalane"
  | "vitamin-e"
  | "ferulic"
  | "copper-peptides";

/** Something an active goes well with, on "Best paired with". */
type Pair = { family: FamilyKey; /** Under its picture, handwritten. */ label: string; /** In the list. */ name: string; note: string };

/** Something not to use in the same routine, on "Avoid pairing with". `actives` are what the routine's clash check looks for. */
type Avoid = { family: FamilyKey; label: string; actives: ActiveKey[] };

export type Story = {
  /** On its carousel card, under the name. */
  line: string;
  /** "Why this one?": the line under the title, and two handwritten notes on the picture. */
  why: { line: string; notes: [string, string] };
  /** "Also helps with …", after the goal. */
  alsoHelps: string;
  /**
   * How many nights (or mornings) a week: weeks one and two, weeks three and
   * four, and later, only if the skin is happy. Seven is every day, from the
   * start. Sensitivity moves the first number (`lib/skin-needs.ts`, `startNights`).
   */
  start: { first: number; then: number; later: number };
  /** "When do I use it?": the time to start, and a note on each tile. A time it should not be used in says so and is never picked. */
  time: { best: TimeOfDay; morning: { ok: boolean; note: string }; evening: { ok: boolean; note: string } };
  /** On its step of the three-step rail ("a few drops"). */
  amount: string;
  /** "Best paired with": a line, and three things, the first two with pictures. */
  pairs: { line: string; with: [Pair, Pair, Pair] };
  /** "Avoid pairing with", or `null` when it has nothing to avoid: the story is then five cards, not six. */
  avoid: { with: Avoid[]; signs: [SignKey, SignKey, SignKey] } | null;
  /** "When shopping". `strength` is `null` for an active sold by name, not by percentage. */
  shopping: {
    look: string;
    forms: string;
    formsAlt?: string;
    extra: string;
    strength: { range: string; steps: string[] } | null;
    /** The routine's line for the step, after the active's name ("BHA: a 0.5–2% leave-on, fragrance-free."). */
    routine: string;
  };
};

/**
 * A published source for one claim. `supports` is how far it backs the claim
 * as written: "partly" where it backs the idea but not every detail (a slow
 * start, though not the exact nights); "no" where it says otherwise, kept so
 * the claim is looked at again rather than forgotten.
 */
type ClaimSource = { label: string; url: string; supports: "yes" | "partly" | "no" };

export type Active = {
  key: ActiveKey;
  /** Its name on the carousel and the story ("BHA"). */
  name: string;
  /** Under the name ("Salicylic acid"). */
  sub: string;
  family: FamilyKey;
  /**
   * The ingredients it stands for. A product has it when one of its
   * ingredients matches a rule (`lib/rules.ts`) that matches one of these.
   */
  names: string[];
  /**
   * The label names that mean a product holds it, for the routine and "In your
   * routine" (`holdsActive`). `names` when left out. Kept apart from `names`
   * because one scoring rule can cover several actives (arbutin, tranexamic and
   * ferulic acid share one), and a product with one is not a product with all.
   */
  match?: (string | RegExp)[];
  /** The ingredient its star saves to Saved › Ingredients. */
  save: string;
  /** Safe while pregnant or breastfeeding. False leaves it off the carousel for anyone who said yes, skipped, or would rather not say. */
  pregnancySafe: boolean;
  /** 1 is the gentlest. Very sensitive skin sees the gentlest first. */
  gentleness: 1 | 2 | 3;
  /** An acid or a retinoid: skin has to get used to it, and it is worn at night. */
  strong?: boolean;
  /** Hydration, barrier and calming: what any routine needs, an active only where the goal is that very thing. */
  support?: boolean;
  /** One of the four a skin profile's own result is read against. */
  core?: boolean;
  /**
   * A basic step of every routine (sunscreen): it is already in, so its
   * story's last card says so in place of "Add <active> to my routine".
   */
  basic?: { when: string };
  /** Where "See the evidence" opens, where the scoring rule's own source is not the best one for it. */
  evidence?: { label: string; url: string };
  /**
   * Where the story's three claims that matter most were checked (owner, 3
   * October 2026): safe or not while pregnant, how often to start, and what
   * not to layer it with. A claim left out has no published source found
   * yet. Not shown in the app: they are here so the advice can be read
   * against them.
   */
  sources?: { pregnancy?: ClaimSource; start?: ClaimSource; avoid?: ClaimSource };
  /**
   * How a scanned product's result and the routine name it, when it is on
   * that list: its name there when that differs ("Salicylic acid"), and the
   * line after it. `found` stands in for the line after the ingredients
   * found ("Glycerin + Panthenol put water back in…"), for a record that is a
   * group of ingredients rather than one.
   */
  result?: { name?: string; line: string; found?: string };
  story?: Story;
};

const HYDRATION_PAIR: Pair = { family: "hydrators", label: "hydration", name: "Hydration", note: "means less dryness" };
const CERAMIDES_PAIR: Pair = { family: "barrier", label: "ceramides", name: "Ceramides", note: "protect your barrier" };
const SPF_PAIR: Pair = { family: "uv", label: "SPF", name: "SPF", note: "every morning, without fail" };
const NIACINAMIDE_PAIR: Pair = { family: "acne-oil", label: "niacinamide", name: "Niacinamide", note: "calms, balances oil" };
const CENTELLA_PAIR: Pair = { family: "calming", label: "centella", name: "Centella", note: "keeps skin calm" };

const AVOID_RETINOID: Avoid = { family: "retinoids", label: "retinoid", actives: ["retinoids"] };
const AVOID_ACIDS: Avoid = { family: "exfoliants", label: "acids", actives: ["bha", "aha"] };

/**
 * Every active, in the order a tie between two equally strong ones is broken
 * on a scanned product's result (salicylic acid ahead of niacinamide: for
 * pores and oil it leads). New records go at the end.
 */
export const ACTIVES: readonly Active[] = [
  {
    key: "azelaic",
    name: "Azelaic acid",
    sub: "Gentle acid",
    family: "calming",
    names: ["azelaic acid"],
    save: "azelaic acid",
    pregnancySafe: true,
    gentleness: 2,
    sources: {
      pregnancy: { label: "MotherToBaby: topical acne treatments in pregnancy", url: "https://mothertobaby.org/fact-sheets/topical-acne-treatments-pregnancy/", supports: "yes" },
      start: { label: "Kircik 2011: azelaic acid gel 15% for marks and acne", url: "https://pubmed.ncbi.nlm.nih.gov/21637899/", supports: "no" },
    },
    core: true,
    result: { line: "Calms breakouts and helps with the marks they leave." },
    story: {
      line: "Calms breakouts and fades the red marks they leave.",
      why: { line: "It calms angry spots and evens out the marks after.", notes: ["calmer spots", "marks fade"] },
      alsoHelps: "breakouts and redness",
      start: { first: 3, then: 5, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too, add SPF" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "Azelaic acid calms. These keep your skin comfy.", with: [NIACINAMIDE_PAIR, CERAMIDES_PAIR, HYDRATION_PAIR] },
      avoid: { with: [AVOID_ACIDS], signs: ["stinging", "dryness", "redness"] },
      shopping: {
        look: "Azelaic Acid",
        forms: "Cream, gel or serum",
        extra: "Fragrance-free, gentle",
        strength: { range: "10% is plenty", steps: ["5%", "10%"] },
        routine: "a 10% cream or gel, fragrance-free.",
      },
    },
  },
  {
    key: "bha",
    name: "BHA",
    sub: "Salicylic acid",
    family: "exfoliants",
    names: ["salicylic acid"],
    match: ["salicylic acid", "betaine salicylate", "bha"],
    save: "salicylic acid",
    pregnancySafe: false,
    gentleness: 2,
    sources: {
      pregnancy: { label: "AAD: is any acne treatment safe to use during pregnancy?", url: "https://www.aad.org/public/diseases/acne/derm-treat/pregnancy", supports: "no" },
      avoid: { label: "Robinson et al. 2022: a double-conjugated retinoid and AHA cream", url: "https://pubmed.ncbi.nlm.nih.gov/35005862/", supports: "partly" },
    },
    strong: true,
    result: { name: "Salicylic acid", line: "Gets inside pores and clears out what blocks them." },
    story: {
      line: "Great for oily skin and clogged pores.",
      why: { line: "It loves oil, so it slips right into oily pores.", notes: ["clears it from inside the pore", "loosens dead skin"] },
      alsoHelps: "clogged pores and breakouts",
      start: { first: 2, then: 3, later: 4 },
      time: { best: "evening", morning: { ok: true, note: "works too, add SPF" }, evening: { ok: true, note: "an easy start" } },
      amount: "a few drops",
      pairs: { line: "BHA clears. These keep your skin comfy.", with: [NIACINAMIDE_PAIR, CERAMIDES_PAIR, HYDRATION_PAIR] },
      avoid: { with: [AVOID_RETINOID, { family: "exfoliants", label: "AHA", actives: ["aha"] }], signs: ["dryness", "stinging", "peeling"] },
      shopping: {
        look: "Salicylic Acid",
        forms: "Serum, toner or gel",
        formsAlt: "or a cleanser",
        extra: "Fragrance-free, gentle",
        strength: { range: "0.5–2% is plenty", steps: ["0.5%", "1%", "2%"] },
        routine: "a 0.5–2% leave-on, fragrance-free.",
      },
    },
  },
  {
    key: "niacinamide",
    name: "Niacinamide",
    sub: "Vitamin B3",
    family: "acne-oil",
    names: ["niacinamide"],
    save: "niacinamide",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Bozzo et al. 2011: safety of skin care products during pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3114665/", supports: "yes" },
      start: { label: "Poostiyan et al. 2024: 1% niacinamide gel, a randomised trial", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11845947/", supports: "partly" },
    },
    core: true,
    result: { line: "Helps with oil balance, supports your skin barrier and can fade marks." },
    story: {
      line: "Balances oil and calms breakouts.",
      why: { line: "It balances oil and calms breakouts.", notes: ["less shine", "calmer spots"] },
      alsoHelps: "breakouts, redness and marks",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "an easy start" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Niacinamide balances. These keep your skin comfy.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: { with: [AVOID_ACIDS], signs: ["redness", "tightness", "stinging"] },
      shopping: {
        look: "Niacinamide",
        forms: "Serum or moisturiser",
        extra: "Fragrance-free, gentle",
        strength: { range: "2–5% is plenty", steps: ["2%", "4%", "5%"] },
        routine: "a 2–5% serum, every day.",
      },
    },
  },
  {
    key: "hydrating",
    name: "Hyaluronic acid",
    sub: "Humectant",
    family: "hydrators",
    names: ["glycerin", "sodium hyaluronate", "urea"],
    match: ["sodium hyaluronate", "hyaluronic acid", "hydrolyzed hyaluronic acid"],
    save: "sodium hyaluronate",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "yes" },
      start: { label: "Bravo et al. 2022: topical hyaluronic acid for skin quality", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10078143/", supports: "yes" },
    },
    support: true,
    core: true,
    result: { name: "Hydrating basics", line: "Glycerin, hyaluronic acid and urea draw water in and hold it there.", found: "put water back in and help keep it there." },
    story: {
      line: "Draws water in, so skin feels plump.",
      why: { line: "It pulls water in, so skin feels plump.", notes: ["water sinks in", "plump and bouncy"] },
      alsoHelps: "fine lines and tightness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "an easy start" }, evening: { ok: true, note: "works too" } },
      amount: "on damp skin",
      pairs: { line: "Hyaluronic acid draws water in. These keep it there.", with: [CERAMIDES_PAIR, CENTELLA_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Sodium Hyaluronate",
        forms: "Serum or essence",
        formsAlt: "or a light gel cream",
        extra: "Fragrance-free",
        strength: null,
        routine: "a light serum, every day.",
      },
    },
  },
  {
    key: "retinoids",
    name: "Retinoids",
    sub: "Retinol · Retinal · Adapalene",
    family: "retinoids",
    // The retinol rule names retinal, hydroxypinacolone retinoate and adapalene too.
    names: ["retinol"],
    match: ["retinol", "retinal", "retinaldehyde", "hydroxypinacolone retinoate", "adapalene", "retinyl retinoate", "retinyl palmitate"],
    save: "retinol",
    pregnancySafe: false,
    gentleness: 3,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "yes" },
      start: { label: "AAD: retinoid or retinol?", url: "https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol", supports: "partly" },
      avoid: { label: "Feneran et al. 2011: retinoid plus antimicrobial combinations for acne", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3133504/", supports: "partly" },
    },
    strong: true,
    core: true,
    result: { line: "Strong evidence for acne, lines and texture, with a learning curve." },
    story: {
      line: "Speeds up renewal for lines, texture and breakouts.",
      why: { line: "It tells your skin to renew itself faster.", notes: ["fresh cells rise up", "smoother on top"] },
      alsoHelps: "texture and breakouts",
      start: { first: 2, then: 3, later: 4 },
      time: { best: "evening", morning: { ok: false, note: "not in the morning" }, evening: { ok: true, note: "where it belongs" } },
      amount: "a pea-sized amount",
      pairs: { line: "Retinoids work hard. These keep your skin comfortable.", with: [CERAMIDES_PAIR, HYDRATION_PAIR, SPF_PAIR] },
      avoid: { with: [AVOID_ACIDS, { family: "acne-oil", label: "benzoyl peroxide", actives: ["benzoyl"] }], signs: ["dryness", "peeling", "breakouts"] },
      shopping: {
        look: "Retinol",
        forms: "Serum or night cream",
        formsAlt: "a gentle one first",
        extra: "Fragrance-free, at night",
        strength: { range: "0.1–0.3% to start", steps: ["0.1%", "0.2%", "0.3%"] },
        routine: "a gentle 0.1–0.3% retinol, at night.",
      },
    },
  },
  {
    key: "tranexamic",
    name: "Tranexamic acid",
    sub: "Brightener",
    family: "brighteners",
    names: ["tranexamic acid"],
    save: "tranexamic acid",
    pregnancySafe: true,
    gentleness: 1,
    result: { line: "With arbutin and kojic acid, it works on uneven tone and dark marks.", found: "can work on uneven tone and dark marks." },
    story: {
      line: "Evens out dark marks, gently enough for sensitive skin.",
      why: { line: "It quiets the signals that make dark patches.", notes: ["fewer dark signals", "tone evens out"] },
      alsoHelps: "stubborn patches and post-acne marks",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "under your SPF" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Tranexamic acid evens. These help it along.", with: [SPF_PAIR, NIACINAMIDE_PAIR, HYDRATION_PAIR] },
      avoid: null,
      shopping: {
        look: "Tranexamic Acid",
        forms: "Serum or essence",
        extra: "Fragrance-free",
        strength: { range: "2–5% is plenty", steps: ["2%", "3%", "5%"] },
        routine: "a 2–5% serum, every day.",
      },
    },
  },
  {
    key: "arbutin",
    name: "Arbutin",
    sub: "Alpha-arbutin",
    family: "brighteners",
    names: ["alpha-arbutin"],
    match: ["alpha-arbutin", "arbutin"],
    save: "alpha-arbutin",
    // A plant cousin of hydroquinone: left out while pregnant or breastfeeding until it is checked.
    pregnancySafe: false,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "no" },
    },
    story: {
      line: "A gentle brightener for dark spots and uneven tone.",
      why: { line: "It slows the making of the pigment behind dark spots.", notes: ["less pigment made", "spots soften"] },
      alsoHelps: "post-acne marks",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "under your SPF" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Arbutin brightens. These help it along.", with: [SPF_PAIR, NIACINAMIDE_PAIR, HYDRATION_PAIR] },
      avoid: null,
      shopping: {
        look: "Alpha-Arbutin",
        forms: "Serum",
        formsAlt: "alpha- is the steadier form",
        extra: "Fragrance-free",
        strength: { range: "1–2% is plenty", steps: ["1%", "2%"] },
        routine: "a 1–2% serum, every day.",
      },
    },
  },
  {
    key: "vitamin-c",
    name: "Vitamin C",
    sub: "Ascorbic acid",
    family: "brighteners",
    names: ["ascorbic acid", "3-o-ethyl ascorbic acid"],
    match: ["ascorbic acid", "l-ascorbic acid", "3-o-ethyl ascorbic acid", "ascorbyl glucoside", "magnesium ascorbyl phosphate", "sodium ascorbyl phosphate", "ascorbyl tetraisopalmitate"],
    save: "ascorbic acid",
    pregnancySafe: true,
    gentleness: 2,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "yes" },
    },
    result: { line: "An antioxidant that brightens and evens out skin tone.", found: "can brighten and even out skin tone." },
    story: {
      line: "Fades dark spots and evens your tone.",
      why: { line: "It fades dark spots and evens your tone.", notes: ["brighter, more even", "spots fade"] },
      alsoHelps: "dullness and post-acne marks",
      start: { first: 3, then: 5, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "under your SPF" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Vitamin C brightens. These help it work.", with: [SPF_PAIR, HYDRATION_PAIR, { family: "antioxidants", label: "vitamin E", name: "Vitamin E", note: "keeps it stable" }] },
      avoid: { with: [AVOID_ACIDS, { family: "acne-oil", label: "benzoyl peroxide", actives: ["benzoyl"] }], signs: ["stinging", "redness", "tightness"] },
      shopping: {
        look: "Ascorbic Acid",
        forms: "Serum",
        formsAlt: "in a dark or airless bottle",
        extra: "Fragrance-free, fresh",
        strength: { range: "10–15% is plenty", steps: ["10%", "15%", "20%"] },
        routine: "a 10–15% serum, every morning.",
      },
    },
  },
  {
    key: "aha",
    name: "AHA",
    sub: "Glycolic acid",
    family: "exfoliants",
    names: ["glycolic acid"],
    match: ["glycolic acid", "lactic acid", "mandelic acid"],
    save: "glycolic acid",
    pregnancySafe: true,
    gentleness: 3,
    sources: {
      pregnancy: { label: "AAD: dermatologist-approved pregnancy skin care", url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care", supports: "yes" },
      start: { label: "Moghimipour 2012: hydroxy acids, the most used anti-ageing agents", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3941867/", supports: "partly" },
      avoid: { label: "Robinson et al. 2022: a double-conjugated retinoid and AHA cream", url: "https://pubmed.ncbi.nlm.nih.gov/35005862/", supports: "partly" },
    },
    strong: true,
    result: { name: "AHAs", line: "Glycolic and lactic acid lift away dead skin, for a smoother, brighter surface.", found: "can lift away dead skin, for a smoother, brighter surface." },
    story: {
      line: "Smooths rough skin and brings back the glow.",
      why: { line: "It loosens the dead skin that dulls your surface.", notes: ["dead skin lifts off", "smoother, brighter"] },
      alsoHelps: "dark marks and dullness",
      start: { first: 1, then: 2, later: 3 },
      time: { best: "evening", morning: { ok: false, note: "not in the morning" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "AHA smooths. These keep your skin calm.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: { with: [AVOID_RETINOID, { family: "exfoliants", label: "BHA", actives: ["bha"] }], signs: ["stinging", "redness", "sun"] },
      shopping: {
        look: "Glycolic Acid",
        forms: "Toner or serum",
        formsAlt: "lactic acid is gentler",
        extra: "Fragrance-free, at night",
        strength: { range: "5–10% is plenty", steps: ["5%", "8%", "10%"] },
        routine: "a 5–10% toner or serum, at night.",
      },
    },
  },
  {
    key: "benzoyl",
    name: "Benzoyl peroxide",
    sub: "Spot care",
    family: "acne-oil",
    names: ["benzoyl peroxide"],
    save: "benzoyl peroxide",
    pregnancySafe: true,
    gentleness: 3,
    sources: {
      pregnancy: { label: "Chien et al. 2016: treatment of acne in pregnancy", url: "https://www.jabfm.org/content/29/2/254", supports: "yes" },
      avoid: { label: "Feneran et al. 2011: retinoid plus antimicrobial combinations for acne", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3133504/", supports: "partly" },
    },
    strong: true,
    result: { line: "One of the most studied ingredients for red, inflamed pimples.", found: "is one of the most studied ingredients for red, inflamed pimples." },
    story: {
      line: "Works on red, angry pimples themselves.",
      why: { line: "It gets into pimples and calms the angry ones.", notes: ["works inside the spot", "redness settles"] },
      alsoHelps: "breakouts that keep coming back",
      start: { first: 3, then: 5, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too, add SPF" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "Benzoyl peroxide works hard. These keep skin comfy.", with: [NIACINAMIDE_PAIR, CERAMIDES_PAIR, HYDRATION_PAIR] },
      avoid: { with: [AVOID_RETINOID, { family: "brighteners", label: "vitamin C", actives: ["vitamin-c"] }], signs: ["dryness", "peeling", "redness"] },
      shopping: {
        look: "Benzoyl Peroxide",
        forms: "Gel or cream",
        formsAlt: "or a wash",
        extra: "It bleaches fabric: white pillowcases",
        strength: { range: "2.5% is enough", steps: ["2.5%", "5%"] },
        routine: "a 2.5% gel, on the spots.",
      },
    },
  },
  {
    key: "bakuchiol",
    name: "Bakuchiol",
    sub: "Plant retinol alternative",
    family: "retinoids",
    names: ["bakuchiol"],
    save: "bakuchiol",
    // Not studied in pregnancy (its old card said so): left out until it is checked.
    pregnancySafe: false,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Cleveland Clinic: bakuchiol, a retinol alternative", url: "https://health.clevelandclinic.org/bakuchiol/", supports: "partly" },
    },
    result: { line: "A plant ingredient that smooths like retinol, with far less irritation.", found: "can smooth like retinol, with far less irritation." },
    story: {
      line: "Smooths like retinol, with far less irritation.",
      why: { line: "A plant ingredient that works like a gentle retinol.", notes: ["smoother on top", "no sting"] },
      alsoHelps: "texture and uneven tone",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a few drops",
      pairs: { line: "Bakuchiol smooths. These help it along.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Bakuchiol",
        forms: "Serum or cream",
        formsAlt: "high on the list",
        extra: "Fragrance-free",
        strength: { range: "0.5–1% is plenty", steps: ["0.5%", "1%"] },
        routine: "a 0.5–1% serum or cream.",
      },
    },
  },
  {
    key: "peptides",
    name: "Peptides",
    sub: "Signal peptides",
    family: "peptides",
    names: ["palmitoyl tripeptide-1"],
    match: [/^palmitoyl (tri|tetra|penta|hexa|oligo)peptide/, "acetyl hexapeptide-8"],
    save: "palmitoyl tripeptide-1",
    pregnancySafe: true,
    gentleness: 1,
    result: { line: "Small proteins that help skin look firmer and smoother.", found: "can help skin look firmer and smoother." },
    story: {
      line: "Supports firmness and bounce, gently.",
      why: { line: "They help your skin keep its bounce.", notes: ["tiny messengers", "firmer underneath"] },
      alsoHelps: "firmness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a few drops",
      pairs: { line: "Peptides support. These help them along.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: { with: [AVOID_ACIDS], signs: ["redness", "stinging", "dryness"] },
      shopping: {
        look: "Palmitoyl Tripeptide",
        forms: "Serum or cream",
        formsAlt: "a leave-on, not a wash",
        extra: "Fragrance-free",
        strength: null,
        routine: "a leave-on serum or cream.",
      },
    },
  },
  {
    key: "ceramides",
    name: "Ceramides",
    sub: "Skin lipids",
    family: "barrier",
    names: ["ceramide np", "cholesterol"],
    match: [/^ceramide/],
    save: "ceramide np",
    pregnancySafe: true,
    gentleness: 1,
    support: true,
    result: { line: "The fats your skin barrier is made of, put back from the outside.", found: "can top up the fats your skin barrier is made of." },
    story: {
      line: "Seals moisture in and supports your barrier.",
      why: { line: "They fill the gaps that let water escape.", notes: ["sealed in", "gaps let water out"] },
      alsoHelps: "dryness and sensitivity",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "Ceramides seal. These help them along.", with: [HYDRATION_PAIR, CENTELLA_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Ceramide NP",
        forms: "Moisturiser or cream",
        formsAlt: "with cholesterol too",
        extra: "Fragrance-free",
        strength: null,
        routine: "a cream with ceramides and cholesterol.",
      },
    },
  },
  {
    key: "calming",
    name: "Centella",
    sub: "Cica",
    family: "calming",
    names: ["centella asiatica extract", "panthenol", "colloidal oatmeal", "allantoin", "bisabolol", "beta-glucan"],
    match: [/centella/, "madecassoside", "asiaticoside"],
    save: "centella asiatica extract",
    pregnancySafe: true,
    gentleness: 1,
    support: true,
    result: {
      name: "Calming ingredients",
      line: "Centella, panthenol, oat and allantoin calm the look of redness and keep skin comfortable.",
      found: "can calm the look of redness and keep skin comfortable.",
    },
    story: {
      line: "Cools redness and soothes reactive skin.",
      why: { line: "It cools redness and soothes reactive skin.", notes: ["calm again", "redness settles"] },
      alsoHelps: "sensitivity",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "an easy start" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Centella calms. These keep your skin comfy.", with: [CERAMIDES_PAIR, HYDRATION_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Centella Asiatica",
        forms: "Serum, toner or cream",
        formsAlt: "madecassoside counts too",
        extra: "Fragrance-free",
        strength: null,
        routine: "a fragrance-free serum or cream.",
      },
    },
  },
  {
    key: "zinc-clay",
    name: "Zinc and clay",
    sub: "Oil control",
    family: "acne-oil",
    names: ["zinc pca", "kaolin"],
    save: "zinc pca",
    pregnancySafe: true,
    gentleness: 1,
    result: { line: "Zinc helps moderate oil, and clay soaks it up from the surface.", found: "can help with oil and shine." },
  },
  {
    key: "emollients",
    name: "Squalane and shea",
    sub: "Emollients",
    family: "barrier",
    names: ["squalane", "shea butter"],
    save: "squalane",
    pregnancySafe: true,
    gentleness: 1,
    support: true,
    result: { line: "Soften dry skin and slow the water leaving it.", found: "can soften dry skin and slow the water leaving it." },
  },
  {
    key: "pha",
    name: "PHA",
    sub: "Gluconolactone",
    family: "exfoliants",
    // No scoring rule names PHAs: the label names alone say a product has one.
    names: ["gluconolactone"],
    match: ["gluconolactone", "lactobionic acid"],
    save: "gluconolactone",
    pregnancySafe: true,
    gentleness: 1,
    story: {
      line: "The gentlest acid: smooths without the sting.",
      why: { line: "Its big molecules work slowly on the surface, so it stings less.", notes: ["works on the surface", "kind to sensitive skin"] },
      alsoHelps: "rough texture and dullness",
      start: { first: 3, then: 5, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too, add SPF" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "PHA smooths. These keep your skin calm.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: { with: [{ family: "exfoliants", label: "other acids", actives: ["aha", "bha"] }], signs: ["stinging", "dryness", "redness"] },
      shopping: {
        look: "Gluconolactone",
        forms: "Toner or serum",
        formsAlt: "or lactobionic acid",
        extra: "Fragrance-free, gentle",
        strength: { range: "4–10% is plenty", steps: ["4%", "8%", "10%"] },
        routine: "a 4–10% toner or serum.",
      },
    },
  },
  {
    key: "zinc",
    name: "Zinc",
    sub: "Zinc PCA",
    family: "acne-oil",
    names: ["zinc pca"],
    match: ["zinc pca", "zinc gluconate"],
    save: "zinc pca",
    pregnancySafe: true,
    gentleness: 1,
    story: {
      line: "Takes down shine, gently, every day.",
      why: { line: "It helps your skin make less oil.", notes: ["less shine", "calmer spots"] },
      alsoHelps: "breakouts",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "an easy start" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Zinc balances. These help it along.", with: [NIACINAMIDE_PAIR, HYDRATION_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Zinc PCA",
        forms: "Serum or light gel",
        formsAlt: "often with niacinamide",
        extra: "Oil-free, fragrance-free",
        strength: null,
        routine: "a light serum, every morning.",
      },
    },
  },
  {
    key: "sulfur",
    name: "Sulfur",
    sub: "Spot care",
    family: "acne-oil",
    names: ["sulfur"],
    match: ["sulfur", "colloidal sulfur", "sulphur"],
    save: "sulfur",
    pregnancySafe: true,
    gentleness: 2,
    sources: {
      pregnancy: { label: "Patel et al. 2016: topical scabies and lice medicines in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5122270/", supports: "yes" },
    },
    story: {
      line: "Soaks up oil and dries out spots, gently.",
      why: { line: "It soaks up oil and loosens flakes on a spot.", notes: ["oil soaks up", "flakes loosen"] },
      alsoHelps: "oily skin",
      start: { first: 3, then: 5, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a dab on spots",
      pairs: { line: "Sulfur dries spots. These keep skin comfy.", with: [NIACINAMIDE_PAIR, CERAMIDES_PAIR, HYDRATION_PAIR] },
      avoid: { with: [AVOID_RETINOID, AVOID_ACIDS], signs: ["dryness", "tightness", "peeling"] },
      shopping: {
        look: "Sulfur",
        forms: "Mask or spot cream",
        formsAlt: "it smells a little",
        extra: "On spots, not all over",
        strength: { range: "3–10% is plenty", steps: ["3%", "5%", "10%"] },
        routine: "a spot cream or mask, on the spots.",
      },
    },
  },
  {
    key: "oat",
    name: "Oat",
    sub: "Colloidal oatmeal",
    family: "calming",
    names: ["colloidal oatmeal"],
    match: [/^avena sativa/, "colloidal oatmeal", "oat kernel extract", "oat kernel oil"],
    save: "colloidal oatmeal",
    pregnancySafe: true,
    gentleness: 1,
    story: {
      line: "Calms itchy, dry, easily upset skin.",
      why: { line: "It soothes itch and holds water in.", notes: ["itch settles", "soft again"] },
      alsoHelps: "dryness and redness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "Oat calms. These help it along.", with: [CERAMIDES_PAIR, HYDRATION_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Colloidal Oatmeal",
        forms: "Cream or balm",
        formsAlt: "or avena sativa",
        extra: "Fragrance-free",
        strength: null,
        routine: "a fragrance-free cream.",
      },
    },
  },
  {
    key: "panthenol",
    name: "Panthenol",
    sub: "Vitamin B5",
    family: "calming",
    names: ["panthenol"],
    match: ["panthenol", "dexpanthenol", "d-panthenol"],
    save: "panthenol",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "yes" },
      start: { label: "Tseng et al. 2026: a panthenol repair balm, a randomised trial", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC13237422/", supports: "partly" },
    },
    story: {
      line: "Soothes and keeps skin comfortable.",
      why: { line: "It soothes skin and helps it hold water.", notes: ["comfy again", "water stays"] },
      alsoHelps: "redness and dryness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "an easy start" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Panthenol soothes. These help it along.", with: [CERAMIDES_PAIR, HYDRATION_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Panthenol",
        forms: "Serum, toner or cream",
        extra: "Fragrance-free",
        strength: null,
        routine: "a serum or cream, every day.",
      },
    },
  },
  {
    key: "glycerin",
    name: "Glycerin",
    sub: "Humectant",
    family: "hydrators",
    names: ["glycerin"],
    match: ["glycerin", "glycerol"],
    save: "glycerin",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "yes" },
    },
    story: {
      line: "The most proven way to draw water into skin.",
      why: { line: "It pulls water in and keeps it there.", notes: ["water pulled in", "soft and smooth"] },
      alsoHelps: "tightness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "an easy start" }, evening: { ok: true, note: "works too" } },
      amount: "on damp skin",
      pairs: { line: "Glycerin draws water in. These keep it there.", with: [CERAMIDES_PAIR, { family: "barrier", label: "squalane", name: "Squalane", note: "seals it in" }, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Glycerin",
        forms: "Moisturiser, toner or serum",
        formsAlt: "near the top of the list",
        extra: "Fragrance-free",
        strength: null,
        routine: "a moisturiser with glycerin near the top.",
      },
    },
  },
  {
    key: "squalane",
    name: "Squalane",
    sub: "Light oil",
    family: "barrier",
    names: ["squalane"],
    match: ["squalane"],
    save: "squalane",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "partly" },
    },
    story: {
      line: "A light oil that seals water in.",
      why: { line: "It softens skin and slows water leaving it.", notes: ["sealed in", "soft, not greasy"] },
      alsoHelps: "rough, dry patches",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "two or three drops",
      pairs: { line: "Squalane seals. These go under it.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Squalane",
        forms: "Oil or cream",
        formsAlt: "last, over the rest",
        extra: "Fragrance-free",
        strength: null,
        routine: "a few drops, as the last step.",
      },
    },
  },
  {
    key: "vitamin-e",
    name: "Vitamin E",
    sub: "Tocopherol",
    family: "antioxidants",
    names: ["tocopherol"],
    match: ["tocopherol", "tocopheryl acetate"],
    save: "tocopherol",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Putra et al. 2022: skin changes and safety of topical products in pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC8884185/", supports: "yes" },
    },
    story: {
      line: "Shields skin from daily stress, and softens it.",
      why: { line: "It soaks up the daily stress that ages skin.", notes: ["stress soaked up", "softer skin"] },
      alsoHelps: "dryness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "under your SPF" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Vitamin E shields. These work with it.", with: [{ family: "brighteners", label: "vitamin C", name: "Vitamin C", note: "they boost each other" }, SPF_PAIR, HYDRATION_PAIR] },
      avoid: null,
      shopping: {
        look: "Tocopherol",
        forms: "Serum or cream",
        formsAlt: "often with vitamin C",
        extra: "Fragrance-free",
        strength: null,
        routine: "a serum or cream, every morning.",
      },
    },
  },
  {
    key: "ferulic",
    name: "Ferulic acid",
    sub: "Antioxidant",
    family: "antioxidants",
    names: ["ferulic acid"],
    match: ["ferulic acid"],
    save: "ferulic acid",
    pregnancySafe: true,
    gentleness: 2,
    story: {
      line: "Makes vitamin C and E work harder.",
      why: { line: "It steadies vitamin C and E, so they protect for longer.", notes: ["C and E last longer", "stronger shield"] },
      alsoHelps: "dullness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "under your SPF" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Ferulic acid backs up the others.", with: [{ family: "brighteners", label: "vitamin C", name: "Vitamin C", note: "lasts longer with it" }, { family: "antioxidants", label: "vitamin E", name: "Vitamin E", note: "the classic trio" }, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Ferulic Acid",
        forms: "Vitamin C serum",
        formsAlt: "with vitamin E",
        extra: "Dark or airless bottle",
        strength: { range: "0.5–1% is plenty", steps: ["0.5%", "1%"] },
        routine: "a vitamin C serum with ferulic acid, every morning.",
      },
    },
  },
  {
    key: "copper-peptides",
    name: "Copper peptides",
    sub: "Copper tripeptide-1",
    family: "peptides",
    names: ["copper tripeptide-1"],
    match: ["copper tripeptide-1"],
    save: "copper tripeptide-1",
    pregnancySafe: true,
    gentleness: 1,
    story: {
      line: "Supports firmness, and calms skin as it does.",
      why: { line: "They signal your skin to keep its bounce.", notes: ["tiny messengers", "firmer, calmer"] },
      alsoHelps: "firmness and redness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a few drops",
      pairs: { line: "Copper peptides support. These help them along.", with: [HYDRATION_PAIR, CERAMIDES_PAIR, SPF_PAIR] },
      avoid: { with: [{ family: "brighteners", label: "vitamin C", actives: ["vitamin-c"] }, AVOID_ACIDS], signs: ["redness", "stinging", "dryness"] },
      shopping: {
        look: "Copper Tripeptide-1",
        forms: "Serum",
        formsAlt: "a blue tint is normal",
        extra: "Fragrance-free",
        strength: null,
        routine: "a serum, in the evening.",
      },
    },
  },
  {
    key: "urea",
    name: "Urea",
    sub: "Humectant",
    family: "hydrators",
    names: ["urea"],
    save: "urea",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Bozzo et al. 2011: safety of skin care products during pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3114665/", supports: "partly" },
    },
    support: true,
    story: {
      line: "Softens rough patches and holds water in.",
      why: { line: "It softens rough skin and holds water in.", notes: ["rough bits soften", "water stays"] },
      alsoHelps: "dryness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "evening", morning: { ok: true, note: "works too" }, evening: { ok: true, note: "an easy start" } },
      amount: "a thin layer",
      pairs: { line: "Urea softens. These help it along.", with: [CERAMIDES_PAIR, HYDRATION_PAIR, SPF_PAIR] },
      avoid: null,
      shopping: {
        look: "Urea",
        forms: "Cream or lotion",
        extra: "Fragrance-free",
        strength: { range: "5–10% is plenty", steps: ["5%", "10%"] },
        routine: "a 5–10% cream.",
      },
    },
  },
  {
    key: "green-tea",
    name: "Green tea",
    sub: "Antioxidant",
    family: "antioxidants",
    names: ["green tea extract"],
    match: ["green tea extract", /^camellia sinensis/, "egcg"],
    save: "camellia sinensis leaf extract",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "Bozzo et al. 2011: safety of skin care products during pregnancy", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3114665/", supports: "partly" },
    },
    story: {
      line: "Shields skin from daily stress.",
      why: { line: "It shields your skin from daily stress.", notes: ["pollution bounces off", "protected glow"] },
      alsoHelps: "fine lines and redness",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "under your SPF" }, evening: { ok: true, note: "works too" } },
      amount: "a few drops",
      pairs: { line: "Green tea shields. These help it along.", with: [SPF_PAIR, { family: "brighteners", label: "vitamin C", name: "Vitamin C", note: "brightens alongside" }, HYDRATION_PAIR] },
      avoid: null,
      shopping: {
        look: "Camellia Sinensis",
        forms: "Serum, toner or cream",
        formsAlt: "high on the list",
        extra: "Fragrance-free",
        strength: null,
        routine: "a serum or toner, every morning.",
      },
    },
  },
  {
    key: "spf",
    name: "SPF",
    sub: "UV filters",
    family: "uv",
    names: ["zinc oxide", "titanium dioxide"],
    save: "zinc oxide",
    pregnancySafe: true,
    gentleness: 1,
    sources: {
      pregnancy: { label: "AAD: dermatologist-approved pregnancy skin care", url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care", supports: "yes" },
      start: { label: "AAD: dermatologist-approved pregnancy skin care", url: "https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care", supports: "yes" },
    },
    basic: { when: "every morning" },
    // The trial behind putting it first for lines: daily sunscreen, 24% less
    // skin ageing over 4.5 years (owner, 3 October 2026, after research).
    evidence: { label: "Hughes et al. 2013: sunscreen and skin ageing", url: "https://www.acpjournals.org/doi/10.7326/0003-4819-158-11-201306040-00001" },
    story: {
      line: "Step one for lines and dark spots: it blocks the rays behind them.",
      why: { line: "It sends back the rays that mark and age skin.", notes: ["rays bounce off", "skin stays even"] },
      alsoHelps: "redness, and keeping new marks away",
      start: { first: 7, then: 7, later: 7 },
      time: { best: "morning", morning: { ok: true, note: "every single day" }, evening: { ok: false, note: "not needed at night" } },
      amount: "two finger lengths",
      pairs: {
        line: "SPF protects. These work alongside it.",
        with: [
          { family: "brighteners", label: "vitamin C", name: "Vitamin C", note: "adds to its protection" },
          { family: "acne-oil", label: "niacinamide", name: "Niacinamide", note: "evens tone alongside" },
          { family: "hydrators", label: "hydration", name: "Hydration", note: "keeps skin comfy under it" },
        ],
      },
      avoid: null,
      shopping: {
        look: "Broad Spectrum",
        forms: "Sunscreen or day cream",
        formsAlt: "tinted with iron oxide for dark spots",
        extra: "SPF 30 or higher, every day",
        strength: null,
        routine: "a broad-spectrum SPF 30 or higher, every morning.",
      },
    },
  },
];

/** Which actives the carousel shows for a goal (hand-off table), and how its title reads ("What can help with oiliness?"). */
export type GoalOptions = {
  /** After "What can help with". */
  about: string;
  /**
   * Best first. Each place is one active, or a family's actives in the order
   * this goal prefers them: which one a person sees depends on their answers
   * (`lib/skin-needs.ts`, `optionsFor`). Up to three places are shown.
   */
  actives: (ActiveKey | ActiveKey[])[];
  /** Filled in when the pregnancy filter takes some away (owner: a safe option from a nearby family). */
  safeBackup?: ActiveKey;
};

// A family's actives in the order the goal prefers them. SPF first where the
// evidence puts sunscreen before any active (owner, 3 October 2026, after
// research: AAD, Hughes 2013), second where it helps without being the main
// thing. Every active has its own story because each person needs a
// different one (owner, 3 October 2026).
export const GOAL_OPTIONS: Record<GoalKey, GoalOptions> = {
  pimples: { about: "pimples", actives: [["bha", "pha"], ["benzoyl", "niacinamide", "sulfur", "zinc"], ["retinoids", "bakuchiol"]], safeBackup: "azelaic" },
  blackheads: { about: "clogged pores", actives: [["bha", "pha"], ["retinoids", "bakuchiol"], ["niacinamide", "zinc", "sulfur"]], safeBackup: "azelaic" },
  "red-marks": { about: "red marks", actives: [["azelaic"], "spf", ["vitamin-c", "tranexamic"], ["niacinamide"]] },
  "dark-marks": { about: "dark marks", actives: ["spf", ["vitamin-c", "tranexamic", "arbutin"], ["aha", "pha"], ["retinoids", "bakuchiol"]], safeBackup: "azelaic" },
  "dark-spots": { about: "uneven skin tone", actives: ["spf", ["vitamin-c", "tranexamic", "arbutin"], ["niacinamide"], ["aha", "pha"]] },
  redness: { about: "redness", actives: [["calming", "panthenol", "oat"], ["ceramides", "squalane"]] },
  hydrate: { about: "dry skin", actives: [["hydrating", "glycerin", "urea"], ["ceramides", "squalane"]] },
  dull: { about: "dull skin", actives: [["vitamin-c", "tranexamic"], "spf", ["aha", "pha"], ["green-tea", "vitamin-e", "ferulic"]] },
  lines: { about: "lines and wrinkles", actives: ["spf", ["retinoids", "bakuchiol"], ["peptides", "copper-peptides"], ["green-tea", "ferulic", "vitamin-e"]], safeBackup: "vitamin-c" },
  eczema: { about: "eczema-prone skin", actives: [["oat", "calming", "panthenol"], ["ceramides", "squalane"]] },
  oil: { about: "oiliness", actives: [["bha", "pha"], ["niacinamide", "zinc"], ["retinoids", "bakuchiol"]], safeBackup: "azelaic" },
  texture: { about: "rough texture", actives: [["aha", "pha"], ["bha"], ["retinoids", "bakuchiol"], ["urea"]] },
  barrier: { about: "your skin barrier", actives: [["ceramides", "squalane"], ["hydrating", "glycerin"], ["panthenol", "calming", "oat"]] },
};

/** The most cards the carousel shows. */
export const OPTIONS_MAX = 3;

/** "Actives you already use", on the questions screen: what each answer is in the routine's clash check. */
export const ACTIVES_IN_USE: readonly { label: string; active: ActiveKey }[] = [
  { label: "Retinol, other OTC retinoids", active: "retinoids" },
  { label: "Salicylic acid (BHA)", active: "bha" },
  { label: "Glycolic acid", active: "aha" },
  { label: "AHA acids", active: "aha" },
  { label: "Vitamin C", active: "vitamin-c" },
  { label: "Niacinamide", active: "niacinamide" },
  { label: "Azelaic acid", active: "azelaic" },
  { label: "Benzoyl peroxide", active: "benzoyl" },
];

/**
 * Prescription-only actives (over-the-counter only, owner): a product with one,
 * scanned from Skin needs, gets "Talk to a doctor first" and an over-the-counter
 * option. Adapalene is sold over the counter in the US and needs a
 * prescription elsewhere, so it counts here unless the phone's region is the
 * US (owner, 3 October 2026; `lib/skin-needs.ts`, `prescriptionIn`). Hydroquinone
 * is no longer sold over the counter in the US or the EU.
 */
export const PRESCRIPTION: readonly { name: string; what: string; alternative: ActiveKey; overTheCounterInUS?: boolean }[] = [
  { name: "isotretinoin", what: "a prescription-strength retinoid", alternative: "retinoids" },
  { name: "tretinoin", what: "a prescription-strength retinoid", alternative: "retinoids" },
  { name: "tazarotene", what: "a prescription-strength retinoid", alternative: "retinoids" },
  { name: "trifarotene", what: "a prescription-strength retinoid", alternative: "retinoids" },
  { name: "adapalene", what: "a prescription-strength retinoid", alternative: "retinoids", overTheCounterInUS: true },
  { name: "hydroquinone", what: "a prescription-strength skin lightener", alternative: "azelaic" },
];
