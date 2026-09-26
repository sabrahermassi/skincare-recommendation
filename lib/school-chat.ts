import { SCHOOL, type SchoolQuestion } from "@/data/school";

/**
 * Skincare School as a chat (#352): the same curated questions and answers
 * as `data/school.ts`, laid out as a conversation. Nothing here writes an
 * answer. The search box only finds a question someone already wrote; with
 * no match it says so and offers questions it can answer. An "AI
 * dermatologist" stays on the NOT NOW list.
 *
 * Nothing typed leaves the phone or is kept: no network, no history, no
 * analytics.
 */

/** Every question, in the order `SCHOOL` lists them. */
export const SCHOOL_QUESTIONS: readonly SchoolQuestion[] = SCHOOL.flatMap((category) => category.questions);

/** The screen's own lines. Audited by `__tests__/claims-policy.test.ts`. */
export const SCHOOL_CHAT_COPY = {
  greeting:
    "Hi! I'm here to explain skincare basics in plain words. I'm not a doctor. For a skin problem, see a dermatologist.",
  prompt: "What would you like to know?",
  searchPlaceholder: "Search skincare questions",
  noAnswer: "I don't have an answer for that yet. Here's what I can help with:",
  noMatchWhileTyping: "No questions match that yet. Press Search to ask anyway.",
  allAsked: "That's every question for now.",
} as const;

/** How many questions the no-answer reply offers. */
export const FALLBACK_SUGGESTIONS = 3;

/**
 * Words a question is phrased with rather than about. "What is SPF" should
 * search for "spf", not also require the word "what" in the answer.
 */
const FILLER = new Set([
  "a", "about", "am", "an", "and", "any", "are", "be", "can", "could", "do", "does", "did", "for", "how", "i",
  "if", "in", "is", "it", "its", "me", "my", "of", "on", "or", "should", "so", "that", "the", "there", "this",
  "to", "what", "when", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/** Lower case, accents dropped: "Crème" and "creme" are the same word here. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function wordsOf(text: string): string[] {
  return foldText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** A search word, with a plural "s" dropped so "sunscreens" still finds "sunscreen". */
function term(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/**
 * Whether `words` has `searched`: a short term ("c", "uv") only as a whole
 * word, a longer one as the start of a word too, so the list narrows while
 * someone is still typing ("niacin" finds "niacinamide").
 */
function has(words: readonly string[], searched: string): boolean {
  return searched.length < 3 ? words.includes(searched) : words.some((word) => word.startsWith(searched));
}

/**
 * The curated questions that match `query`: every meaningful word of it has
 * to appear in the question or its answer, and a question naming more of
 * them comes first. Empty when the query is only filler, or matches nothing.
 */
export function searchSchool(query: string, questions: readonly SchoolQuestion[] = SCHOOL_QUESTIONS): SchoolQuestion[] {
  const terms = wordsOf(query).filter((word) => !FILLER.has(word)).map(term);
  if (terms.length === 0) return [];
  return questions
    .map((item, index) => {
      const question = wordsOf(item.question);
      const answer = wordsOf(item.answer);
      if (!terms.every((searched) => has(question, searched) || has(answer, searched))) return null;
      return { item, index, inQuestion: terms.filter((searched) => has(question, searched)).length };
    })
    .filter((hit) => hit !== null)
    .sort((a, b) => b.inQuestion - a.inQuestion || a.index - b.index)
    .map((hit) => hit.item);
}

/**
 * What the no-answer reply offers: questions not asked yet, in `SCHOOL`
 * order, topped up from the asked ones when fewer are left.
 */
export function fallbackSuggestions(askedIds: ReadonlySet<string>, questions: readonly SchoolQuestion[] = SCHOOL_QUESTIONS): SchoolQuestion[] {
  const unasked = questions.filter((item) => !askedIds.has(item.id));
  const asked = questions.filter((item) => askedIds.has(item.id));
  return [...unasked, ...asked].slice(0, FALLBACK_SUGGESTIONS);
}
