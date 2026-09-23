/**
 * Skincare School — curated beginner questions with fixed, pre-written
 * answers (`FOR_ME_MVP.md` §25, #235). Static text: no network, nothing
 * generated when the screen opens.
 *
 * The highest-risk copy in the app for `docs/claims-policy.md`: every
 * question and answer here is audited by `__tests__/claims-policy.test.ts`,
 * and the denylist is the floor, not the bar. Rules for editing this file:
 *
 * - No question about a condition. "How do I get rid of eczema" is a medical
 *   question this app doesn't answer, however it's hedged. Questions are
 *   about ingredients, formulas, routines and reading a label.
 * - An answer about an ingredient the app scores must agree with that
 *   ingredient's `INGREDIENT_RULES[].reason` in `lib/rules.ts` — two
 *   different explanations of retinoids in one app is drift.
 * - Written in the `docs/voice.md` register: second person, plain, no
 *   promises.
 */

export type SchoolQuestion = { id: string; question: string; answer: string };
export type SchoolCategory = { title: string; questions: SchoolQuestion[] };

export const SCHOOL: SchoolCategory[] = [
  {
    title: "Reading a label",
    questions: [
      {
        id: "list-order",
        question: "Why are ingredients listed in that order?",
        answer:
          "On an ordinary cosmetic label, they're listed from most to least, down to the ones that make up about 1% of the formula — below that, brands can list them in any order. So the first few names are most of what's in the bottle, and an active near the end is usually there in a small amount. Sunscreens and some blemish products sold in the US carry a \"Drug Facts\" box instead: the active ingredients come first with their strength printed beside them, and the rest are often listed alphabetically, so there the order says nothing about amounts.",
      },
      {
        id: "inci-names",
        question: "Why do ingredient names look so technical?",
        answer:
          "Most labels use INCI names, a shared international naming system, so the same ingredient carries the same name on a bottle in Seoul or in Paris. That's why water can show up as \"Aqua\" and shea butter as \"Butyrospermum Parkii Butter\".",
      },
      {
        id: "fragrance",
        question: "What does \"fragrance\" or \"parfum\" on a label mean?",
        answer:
          "It stands in for a blend of scent ingredients that brands don't have to list one by one. Fragrance is the most common cause of reactions to cosmetics, which is why this app flags it for sensitive skin. In the EU, a set of known fragrance allergens, like linalool and limonene, also has to be named separately above a certain amount.",
      },
      {
        id: "natural-clean",
        question: "Does \"natural\" or \"clean\" on the front mean anything?",
        answer:
          "Not in any regulated way — neither word has a shared definition behind it. The ingredient list on the back is the part with rules behind it, and it's the part this app reads.",
      },
      {
        id: "no-amounts",
        question: "Why doesn't the label say how much of each ingredient is in it?",
        answer:
          "On an ordinary cosmetic label, brands don't have to share amounts, and most don't. (A \"Drug Facts\" box, on some sunscreens and blemish products, is the exception: it prints each active ingredient's strength.) It's the biggest limit on what anyone can tell from a label: an ingredient at 0.5% and at 5% looks exactly the same. It's also why this app goes by which ingredients are present and roughly where they sit in the list, not by exact amounts.",
      },
    ],
  },
  {
    title: "Ingredients people ask about",
    questions: [
      {
        id: "retinoids",
        question: "What are retinoids?",
        answer:
          "A family of vitamin A ingredients, including retinol and retinal, with the strongest evidence of any active for lines and congestion. They also have the highest irritation cost, especially on dry or sensitive skin, and they can leave skin more reactive to sunlight — so a daytime SPF is worth pairing with them. They're commonly advised against in pregnancy and while breastfeeding.",
      },
      {
        id: "ahas",
        question: "What do AHAs do?",
        answer:
          "Alpha hydroxy acids — glycolic, lactic and mandelic acid among them — loosen the outermost layer of dead skin cells, so skin can look smoother and brighter. The trade-off is tolerance: they can sting reactive skin, and they can leave skin more reactive to sunlight.",
      },
      {
        id: "aha-vs-bha",
        question: "What's the difference between AHAs and BHA?",
        answer:
          "AHAs dissolve in water and work on the skin's surface. BHA, which is salicylic acid, dissolves in oil, so it can work inside pores — that's why people reach for it for congestion. It can be drying on dry or reactive skin.",
      },
      {
        id: "niacinamide",
        question: "What does niacinamide do?",
        answer:
          "Niacinamide, a form of vitamin B3, is unusually versatile: it's associated with less visible oiliness, a more even-looking tone and a stronger skin barrier, and most skin types get on with it well.",
      },
      {
        id: "comedogenic",
        question: "What does \"comedogenic\" mean?",
        answer:
          "Likely to clog pores. Some oils and waxes are associated with congestion on skin that's prone to it, and this app weighs them more heavily if you've told it your skin is acne-prone. Whether a formula actually clogs anyone's pores also depends on how much of the ingredient is in it, which the label doesn't say.",
      },
    ],
  },
  {
    title: "Building a routine",
    questions: [
      {
        id: "how-many-steps",
        question: "Do I need a lot of steps?",
        answer:
          "No. A cleanser, a moisturiser and, in the daytime, a sunscreen cover the basics for most people. Everything else is optional — and adding several new actives at once makes it hard to tell which one your skin isn't getting on with.",
      },
      {
        id: "starting-new",
        question: "How should I start a new product?",
        answer:
          "One at a time, a week or two apart, so if your skin reacts you know what caused it. For anything strong, like a retinoid or an acid, starting a few times a week is gentler than starting every day.",
      },
      {
        id: "two-actives",
        question: "Can I use two strong actives together?",
        answer:
          "Often, yes — but layering strong ones, like a retinoid with an AHA, raises the chance of irritation. Plenty of people use them on different days instead.",
      },
      {
        id: "order",
        question: "Does the order I put products on matter?",
        answer:
          "A common rule of thumb is thinnest to thickest: watery products first, creams after, and sunscreen last in the daytime. It's a convention more than a rule.",
      },
    ],
  },
  {
    title: "What this app does",
    questions: [
      {
        id: "score-meaning",
        question: "What does the score mean?",
        answer:
          "It's how well a product's ingredients line up with the skin profile you gave us, from 0 to 100. It isn't a rating of the product's quality or safety, and it can't promise how your skin will react — it's a starting point for your own decision.",
      },
      {
        id: "cant-tell",
        question: "Why does it sometimes say it can't tell?",
        answer:
          "Two reasons. If you haven't answered the skin-profile questions yet, there's nothing to match the product against — answer them in your profile and every score is made for your skin. Otherwise, when we can't recognise enough of the ingredient list — a blurry photo, or names we don't have yet — we'd rather say so than guess. An ingredient we don't recognise doesn't count toward the score as good or bad; it just makes the answer less certain. One exception: if you've told us you're pregnant or breastfeeding, a name that looks like one to check is still flagged, even when we can't fully confirm it.",
      },
      {
        id: "is-it-safe",
        question: "Can the app tell me whether a product is safe for me?",
        answer:
          "No, and nothing that reads a label can. It can tell you which ingredients are in a formula and which are commonly irritating, pore-clogging or worth a second look given your profile. How your skin actually responds depends on you, the amounts, and how you use the product. For a skin problem, a dermatologist is the right person to ask.",
      },
      {
        id: "ai",
        question: "Does the app use AI?",
        answer:
          "For one step. When you photograph a label, Google's trained text-recognition model reads the words off the photo. Everything after that is fixed: the score comes from fixed rules about ingredients, each carrying the sentence you see on screen, and these answers are fixed text too — nothing is generated when you open them.",
      },
    ],
  },
];
