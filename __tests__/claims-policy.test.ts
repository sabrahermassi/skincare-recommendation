import { INGREDIENTS } from "@/data/ingredients";
import { PRODUCTS } from "@/data/products";
import { SCHOOL } from "@/data/school";
import { FIRST_PAGE_COPY } from "@/lib/first-page";
import { NOTE_COPY, tooLongCopy } from "@/lib/journal";
import { activeLine, buildRoutine } from "@/lib/routine-builder";
import { GOALS, JOURNEY_CARDS, PREGNANCY_LINE, needHeadlines, needVerdict } from "@/lib/journey";
import { sensitivityNote, startLine } from "@/lib/skin-needs";
import { ACTIVES, ACTIVES_IN_USE, FAMILIES, GOAL_OPTIONS, PRESCRIPTION, SIGNS } from "@/lib/skin-needs-data";
import { pairingNotesFor, shelfPairingNotes } from "@/lib/active-pairings";
import { claimPolicyViolations } from "@/lib/claims-policy";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { PORE_CLOGGERS, PORE_COUNTS_TEXT } from "@/lib/pore-clogging";
import { PREGNANCY_CAUTION } from "@/lib/pregnancy-caution";
import { INGREDIENT_RULES } from "@/lib/rules";
import { SCHOOL_CHAT_COPY } from "@/lib/school-chat";
import { EVENING_FALLBACK, EVENING_TIPS, GENERAL_TIPS, MORNING_TIPS, REST_NIGHT_TIP } from "@/lib/skin-tips";
import { LABEL_ORDER, SCORING_DISCLAIMER, SCORING_INTRO, SCORING_SOURCES, scoreBandLines, scoreFactors, scoreNotes } from "@/lib/scoring-explainer";
import { EU_ALLERGEN_CONDITION, EU_ALLERGEN_COPY, EU_ALLERGEN_ENTRIES } from "@/lib/eu-allergens";
import { displayIngredientName } from "@/lib/ingredient-name";
import { SAFETY_NOTICE_COPY, SAFETY_NOTICE_ENTRIES, contraindications } from "@/lib/safety";
import { EMPTY_PROFILE } from "@/store/useAppStore";

type OwnedClaim = { source: string; text: string };

const STRICTEST_PROFILE = {
  ...EMPTY_PROFILE,
  concerns: ["acne-prone" as const],
  sensitivity: "high" as const,
  pregnancyStatus: "pregnant" as const,
};

const WARNINGS = contraindications(Object.values(INGREDIENTS), STRICTEST_PROFILE);

// #234: sun/SPF context nudges — the copy most at risk of reading as a
// disease-prevention claim, so every variant is audited, not a sample.
const nudgeIngredient = (name: string) => ({
  id: name,
  name,
  comedogenic: 0 as const,
  safety: "safe" as const,
  verified: true,
});
const NUDGE_RESULTS: OwnedClaim[] = [
  ...nudgesFor([nudgeIngredient("glycolic acid")]),
  ...nudgesFor([nudgeIngredient("retinol")]),
  ...nudgesFor([nudgeIngredient("glycolic acid"), nudgeIngredient("retinol")]),
  ...goalNudgesFor([nudgeIngredient("niacinamide")], ["hyperpigmentation"]),
].map((nudge, index) => ({ source: `contextNudges[${index}].${nudge.id}`, text: nudge.text }));

// #233: pairing notes — the evening line, every per-product layering
// variant (each active alone, then a retinoid facing all four partners), and
// the shelf line in its one- and many-partner forms.
const shelfItem = (id: string, names: string[]) => ({ id, name: id, ingredients: names.map(nudgeIngredient) });
const PAIRING_CLAIMS: OwnedClaim[] = [
  ...pairingNotesFor([nudgeIngredient("retinol")]),
  ...["salicylic acid", "glycolic acid", "benzoyl peroxide", "sulfur"].flatMap((name) =>
    pairingNotesFor([nudgeIngredient(name)])
  ),
  ...shelfPairingNotes([shelfItem("A", ["retinol"]), shelfItem("B", ["salicylic acid"])]),
  ...shelfPairingNotes([
    shelfItem("C", ["retinol"]),
    shelfItem("D", ["salicylic acid", "glycolic acid", "benzoyl peroxide", "sulfur"]),
  ]),
  // The count line past the cap (#264 review).
  ...shelfPairingNotes([
    shelfItem("R", ["retinol"]),
    ...Array.from({ length: 12 }, (_, i) => shelfItem(`S${i}`, ["salicylic acid"])),
  ]).filter((note) => note.id === "more"),
].map((note, index) => ({ source: `pairingNotes[${index}].${note.id}`, text: note.text }));

// #235: Skincare School — paragraphs about ingredients, the largest body of
// app-authored copy, so every question and every answer is audited.
const SCHOOL_CLAIMS: OwnedClaim[] = SCHOOL.flatMap((category) =>
  category.questions.flatMap((item) => [
    { source: `SCHOOL.${item.id}.question`, text: item.question },
    { source: `SCHOOL.${item.id}.answer`, text: item.answer },
  ])
);

/** Every string in a value, however deep, each with where it was found. */
function stringsIn(value: unknown, path: string): OwnedClaim[] {
  if (typeof value === "string") return [{ source: path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => stringsIn(item, `${path}[${i}]`));
  // An active's `sources` are the papers its claims were checked against: never
  // shown in the app, and their titles are the papers' own words, not ours.
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => (key === "sources" ? [] : stringsIn(item, `${path}.${key}`)));
  return [];
}

// Skin needs: the things to work on and every line of every card, which say
// what an ingredient does more directly than anything else in the app.
const JOURNEY_CLAIMS: OwnedClaim[] = [
  ...GOALS.map((goal) => ({ source: `GOALS.${goal.key}`, text: goal.label })),
  ...JOURNEY_CARDS.flatMap((card) => ([card.name, card.line, card.found ?? ""] as const).map((text, i) => ({ source: `JOURNEY_CARDS.${card.key}[${i}]`, text }))),
  // Every word of every active's story, family, warning sign and prescription
  // note (lib/skin-needs-data.ts), and the lines the story builds from them.
  ...stringsIn({ ACTIVES, FAMILIES, SIGNS, GOAL_OPTIONS, ACTIVES_IN_USE, PRESCRIPTION }, "skin-needs-data"),
  ...[1, 2, 3, 4, 5, 6, 7].map((nights) => ({ source: `startLine.${nights}`, text: startLine(nights) })),
  ...([null, "none", "some", "high"] as const).flatMap((sensitivity) =>
    [2, 7].map((nights) => ({ source: `sensitivityNote.${sensitivity}.${nights}`, text: sensitivityNote({ sensitivity }, nights) }))
  ),
  { source: "PREGNANCY_LINE", text: PREGNANCY_LINE },
  // What a scan from Skin needs can say: every headline, and each kind of line under it.
  ...needHeadlines().map((text) => ({ source: "needHeadlines", text })),
  ...GOALS.flatMap((goal) =>
    [["water"], ["salicylic acid", "glycerin", "niacinamide", "retinol", "ceramide np"], ["tea tree oil", "adenosine", "allantoin"]].map((names) => ({
      source: `needVerdict.${goal.key}.line`,
      text: needVerdict(names.map((name) => ({ name })), { goal: goal.key, sensitivity: null, pregnant: null }).line,
    }))
  ),
];

// The routine's serum and treatment steps: the active named in big letters and
// the line under it, for every concern and both skin types that stand in for
// one, plain, pregnant and very sensitive.
const ROUTINE_CONCERNS = ["acne-prone", "large-pores", "post-acne-marks", "hyperpigmentation", "redness", "dehydrated", "dullness", "fine-lines", "atopic"] as const;
const ROUTINE_CLAIMS: OwnedClaim[] = [
  ...ROUTINE_CONCERNS.map((concern) => ({ ...EMPTY_PROFILE, concerns: [concern] })),
  { ...EMPTY_PROFILE, baseSkinType: "oily" as const },
  { ...EMPTY_PROFILE, baseSkinType: "dry" as const },
]
  .flatMap((profile) => [profile, { ...profile, pregnancyStatus: "pregnant" as const }, { ...profile, sensitivity: "high" as const }])
  .flatMap((profile) => {
    const routine = buildRoutine([], profile);
    return [...routine.morning, ...routine.evening].flatMap((slot) =>
      slot.active ? [{ source: `routine.${profile.concerns[0] ?? profile.baseSkinType}.${slot.key}`, text: `${slot.active.name}. ${activeLine(slot.active)}` }] : []
    );
  });

// #228: the app's copy around a journal note — never the note itself, which
// is the person's own words and is not the app's to audit or rewrite.
const NOTE_CLAIMS: OwnedClaim[] = [
  ...Object.entries(NOTE_COPY).map(([key, text]) => ({ source: `NOTE_COPY.${key}`, text })),
  { source: "tooLongCopy(612)", text: tooLongCopy(612) },
];

// #230: the first-page moment — warm copy, which is exactly where a claim
// can creep in unnoticed.
const FIRST_PAGE_CLAIMS: OwnedClaim[] = Object.entries(FIRST_PAGE_COPY).map(([key, text]) => ({
  source: `FIRST_PAGE_COPY.${key}`,
  text,
}));

// #325: "How scoring works" — every line on the page.
const SCORING_CLAIMS: OwnedClaim[] = [
  ...[...scoreFactors(), ...scoreNotes()].flatMap((row) => [
    { source: `scoring.${row.title}.title`, text: row.title },
    { source: `scoring.${row.title}.body`, text: row.body },
  ]),
  ...scoreBandLines().map((band) => ({ source: `scoreBandLines.${band.label}`, text: `${band.range}: ${band.label}. ${band.meaning}` })),
  { source: "LABEL_ORDER", text: LABEL_ORDER },
  { source: "SCORING_DISCLAIMER", text: SCORING_DISCLAIMER },
  { source: "SCORING_INTRO", text: SCORING_INTRO },
  { source: "SCORING_SOURCES", text: SCORING_SOURCES },
];

// #352: the School chat's own lines — its greeting speaks for the app.
// The skincare tip on Home (handoff_home_and_tip): every tip and its reason, said in the app's own voice.
const TIP_CLAIMS: OwnedClaim[] = stringsIn({ GENERAL_TIPS, MORNING_TIPS, EVENING_TIPS, EVENING_FALLBACK, REST_NIGHT_TIP }, "skin-tips");

const SCHOOL_CHAT_CLAIMS: OwnedClaim[] = Object.entries(SCHOOL_CHAT_COPY).map(([key, text]) => ({
  source: `SCHOOL_CHAT_COPY.${key}`,
  text,
}));

// #404: the EU safety notice, every sentence of it as it is read on screen: the
// name, then the line that follows it; the sheet's body for every entry on the
// verified list, with its dates where it has them.
const SAFETY_NOTICE_CLAIMS: OwnedClaim[] = [
  { source: "SAFETY_NOTICE_COPY.matchLine", text: SAFETY_NOTICE_COPY.matchLine },
  { source: "SAFETY_NOTICE_COPY.rowText", text: `Name${SAFETY_NOTICE_COPY.rowText}` },
  { source: "SAFETY_NOTICE_COPY.rowCaveat", text: SAFETY_NOTICE_COPY.rowCaveat },
  { source: "SAFETY_NOTICE_COPY.cardTitle", text: SAFETY_NOTICE_COPY.cardTitle },
  { source: "SAFETY_NOTICE_COPY.cardText", text: `Name${SAFETY_NOTICE_COPY.cardText}` },
  { source: "SAFETY_NOTICE_COPY.listWord", text: SAFETY_NOTICE_COPY.listWord },
  { source: "SAFETY_NOTICE_COPY.listLine", text: SAFETY_NOTICE_COPY.listLine },
  { source: "SAFETY_NOTICE_COPY.clogWord", text: SAFETY_NOTICE_COPY.clogWord },
  { source: "SAFETY_NOTICE_COPY.pregnancyWord", text: SAFETY_NOTICE_COPY.pregnancyWord },
  { source: "SAFETY_NOTICE_COPY.sheetHeadline", text: SAFETY_NOTICE_COPY.sheetHeadline },
  // #405: the shield's label, and what sharing says.
  { source: "SAFETY_NOTICE_COPY.shieldLabel", text: SAFETY_NOTICE_COPY.shieldLabel },
  { source: "SAFETY_NOTICE_COPY.shareLine", text: SAFETY_NOTICE_COPY.shareLine("Brand", "Serum") },
  ...SAFETY_NOTICE_ENTRIES.map((entry) => ({
    source: `SAFETY_NOTICE_COPY.sheetBody.${entry.entry}`,
    text: `${SAFETY_NOTICE_COPY.sheetBody(entry.entry)}${entry.dates ? ` ${entry.dates}` : ""}`,
  })),
];

// #407: the EU allergen copy — each sentence rendered for every name on the
// list, with and without the unset-sensitivity note (the `contraindications`
// collection below runs at "high", over sample ingredients that hold none of
// these names), plus the words the sheet and the risk card use.
const EU_ALLERGEN_CLAIMS: OwnedClaim[] = [
  ...EU_ALLERGEN_ENTRIES.flatMap((entry) =>
    entry.names.flatMap((name) => {
      const shown = displayIngredientName(name);
      const reason = entry.kind === "fragrance" ? EU_ALLERGEN_COPY.fragranceReason(shown) : EU_ALLERGEN_COPY.warningReason(shown);
      return [
        { source: `EU_ALLERGEN_ENTRIES.${entry.entry}.${name}`, text: reason },
        { source: `EU_ALLERGEN_ENTRIES.${entry.entry}.${name}.unset`, text: `${reason}${EU_ALLERGEN_COPY.unsetNote}` },
      ];
    })
  ),
  ...EU_ALLERGEN_ENTRIES.flatMap((entry) => (entry.exempt ? [{ source: `EU_ALLERGEN_ENTRIES.${entry.entry}.exempt`, text: entry.exempt }] : [])),
  ...Object.entries(EU_ALLERGEN_CONDITION).map(([kind, text]) => ({ source: `EU_ALLERGEN_CONDITION.${kind}`, text })),
  ...Object.entries(EU_ALLERGEN_COPY.subtitle).map(([kind, text]) => ({ source: `EU_ALLERGEN_COPY.subtitle.${kind}`, text })),
  { source: "EU_ALLERGEN_COPY.exemptCondition", text: EU_ALLERGEN_COPY.exemptCondition },
  { source: "EU_ALLERGEN_COPY.limits", text: EU_ALLERGEN_COPY.limits },
  { source: "EU_ALLERGEN_COPY.noneListed", text: EU_ALLERGEN_COPY.noneListed },
  { source: "EU_ALLERGEN_COPY.noneFlagged", text: EU_ALLERGEN_COPY.noneFlagged },
  { source: "EU_ALLERGEN_COPY.entries(1)", text: EU_ALLERGEN_COPY.entries(1) },
  { source: "EU_ALLERGEN_COPY.entries(2)", text: EU_ALLERGEN_COPY.entries(2) },
];

const OWNED_CLAIMS: OwnedClaim[] = [
  ...EU_ALLERGEN_CLAIMS,
  // #406: the oily-skin pore row on Skin match, as it is read: names, then this.
  { source: "PORE_COUNTS_TEXT", text: `Coconut Oil ${PORE_COUNTS_TEXT}` },
  ...NOTE_CLAIMS,
  ...SAFETY_NOTICE_CLAIMS,
  ...JOURNEY_CLAIMS,
  ...ROUTINE_CLAIMS,
  ...FIRST_PAGE_CLAIMS,
  ...NUDGE_RESULTS,
  ...PAIRING_CLAIMS,
  ...SCHOOL_CLAIMS,
  ...SCHOOL_CHAT_CLAIMS,
  ...TIP_CLAIMS,
  ...SCORING_CLAIMS,
  // Audited directly (#261 review): `WARNINGS` below comes from the sample
  // INGREDIENTS, which hold none of the pregnancy-caution names — so these
  // reasons were never actually reaching the audit, despite
  // docs/claims-policy.md saying they were.
  ...PREGNANCY_CAUTION.map((entry) => ({
    source: `PREGNANCY_CAUTION.${entry.category}.reason`,
    text: entry.reason,
  })),
  ...INGREDIENT_RULES.map((rule, index) => ({
    source: `INGREDIENT_RULES[${index}].reason`,
    text: rule.reason,
  })),
  ...PORE_CLOGGERS.map((rule, index) => ({
    source: `PORE_CLOGGERS[${index}].reason`,
    text: rule.reason,
  })),
  ...Object.entries(INGREDIENTS).flatMap(([id, ingredient]) =>
    ingredient.note ? [{ source: `INGREDIENTS.${id}.note`, text: ingredient.note }] : []
  ),
  ...WARNINGS.map((hit) => ({
    source: `contraindications.${hit.ingredient.id}`,
    text: hit.reason,
  })),
  ...PRODUCTS.flatMap((product) => [
    { source: `PRODUCTS.${product.id}.description`, text: product.description },
    ...product.benefits.map((text, index) => ({
      source: `PRODUCTS.${product.id}.benefits[${index}]`,
      text,
    })),
  ]),
];

describe("medical and safety claims policy", () => {
  // Without this, a regression that stopped the nudges firing would empty
  // the collection and the audit below would pass on nothing.
  it("audits every context-nudge variant, not an empty collection", () => {
    expect(NUDGE_RESULTS.map((claim) => claim.source)).toEqual([
      "contextNudges[0].photosensitising",
      "contextNudges[1].photosensitising",
      "contextNudges[2].photosensitising",
      "contextNudges[3].pigment-goal",
    ]);
    // Four distinct sentences — the three photosensitising variants differ by subject.
    expect(new Set(NUDGE_RESULTS.map((claim) => claim.text)).size).toBe(4);
  });

  it("audits every pairing-note variant, not an empty collection", () => {
    expect(PAIRING_CLAIMS.map((claim) => claim.source)).toEqual([
      "pairingNotes[0].retinoid-evening",
      "pairingNotes[1].layering",
      "pairingNotes[2].layering",
      "pairingNotes[3].layering",
      "pairingNotes[4].layering",
      "pairingNotes[5].layering",
      "pairingNotes[6].A+B",
      "pairingNotes[7].C+D",
      "pairingNotes[8].more",
    ]);
    // The four single-partner lines all read "with a retinoid", so they collapse to one.
    expect(new Set(PAIRING_CLAIMS.map((claim) => claim.text)).size).toBe(6);
  });

  // Without this, a regression that emptied the list would pass the audit on nothing.
  it("audits every EU allergen name, in both of its sentences", () => {
    const names = EU_ALLERGEN_ENTRIES.flatMap((entry) => entry.names);
    expect(names.length).toBeGreaterThan(200);
    const audited = EU_ALLERGEN_CLAIMS.map((claim) => claim.source);
    for (const entry of EU_ALLERGEN_ENTRIES) for (const name of entry.names) expect(audited).toContain(`EU_ALLERGEN_ENTRIES.${entry.entry}.${name}.unset`);
  });

  it("keeps every app-authored ingredient and product claim within policy", () => {
    const failures = OWNED_CLAIMS.flatMap(({ source, text }) =>
      claimPolicyViolations(text).map((rule) => ({ source, text, rule: rule.id }))
    );

    expect(failures).toEqual([]);
  });

  it.each([
    ["cures acne", "disease-or-treatment"],
    ["heals eczema", "disease-or-treatment"],
    ["prevents rosacea", "disease-or-treatment"],
    ["repairs the skin barrier", "body-structure"],
    ["regenerates skin cells", "body-structure"],
    ["kills acne bacteria", "antimicrobial-or-symptom"],
    ["FDA approved", "regulatory-endorsement"],
    ["skin regeneration", "body-structure"],
    ["reparative lipid for the barrier", "body-structure"],
    ["a bacteria-killing option", "antimicrobial-or-symptom"],
    ["germ-eliminating formula", "antimicrobial-or-symptom"],
    ["barrier restoration", "body-structure"],
    ["clinically proven to work", "guaranteed-outcome"],
  ])("rejects %s", (text: string, ruleId: string) => {
    expect(claimPolicyViolations(text).map((rule) => rule.id)).toContain(ruleId);
  });

  it.each([
    "May be irritating on reactive skin",
    "Supports the skin barrier",
    "Helps prevent moisture loss",
    "Helps skin look smoother",
    "Associated with congestion on acne-prone skin",
    "Not medical advice",
  ])("allows bounded compatibility copy: %s", (text: string) => {
    expect(claimPolicyViolations(text)).toEqual([]);
  });
});
