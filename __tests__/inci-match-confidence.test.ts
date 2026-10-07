import fixture from "../test-fixtures/inci-match-confidence.json";
import { parseIngredientBlock as client } from "@/lib/inci";
import { parseIngredientBlock as deno } from "@/supabase/functions/_shared/inci-parse";
import { parseInci } from "../scripts/lib/inci-parse.mjs";
import { isHighConfidenceMatch } from "@/lib/safety";

/**
 * #458: how each stored name was reached, through all three copies of the label parser. One
 * fixture (`test-fixtures/inci-match-confidence.json`) says what each must return, and the Deno
 * test (`supabase/tests/inci_match_confidence.test.ts`) reads the same file, so the copies cannot
 * drift apart on a match without one of the two failing.
 */

type Case = { name: string; text: string; parsers?: string[]; dictionary?: boolean; expected: { inci_name: string; position: number; match: string | null }[] };

const dictionary = new Set(fixture.dictionary);
const aliases = new Map(fixture.aliases as [string, string][]);
const cases = fixture.cases as Case[];

const RUNNERS: Record<string, (text: string, withDictionary: boolean) => unknown> = {
  client: (text, withDictionary) => client(text, withDictionary ? dictionary : undefined, aliases),
  // The Deno functions add the synonyms to the dictionary before the read, as label-ocr does.
  deno: (text, withDictionary) => deno(text, withDictionary ? new Set([...dictionary, ...aliases.keys()]) : undefined, aliases),
  // The importers read with the dictionary and the synonyms kept apart, as import-obf does.
  mjs: (text, withDictionary) => parseInci(text, withDictionary ? dictionary : undefined, [], aliases),
};

describe.each(Object.keys(RUNNERS))("the %s parser", (parser: string) => {
  const mine = cases.filter((c) => (c.parsers ?? Object.keys(RUNNERS)).includes(parser));

  it.each(mine.map((c): [string, Case] => [c.name, c]))("%s", (_name: string, c: Case) => {
    expect(RUNNERS[parser](c.text, c.dictionary !== false)).toEqual(c.expected);
  });
});

it("covers all four values and 'not known'", () => {
  const seen = new Set(cases.flatMap((c) => c.expected.map((e) => e.match)));
  expect(seen).toEqual(new Set(["alias", "corrected", "exact", "rebuilt", null]));
});

it("keeps the first position of a repeated name, and the weaker of its matches", () => {
  const repeated = client("Aqua, Glycerin, Niacinamide, Glycérine, Parfum", dictionary, aliases);
  expect(repeated.map((p) => p.inci_name)).toEqual(["aqua", "glycerin", "niacinamide", "parfum"]);
  expect(repeated[1].match).toBe("alias");
  const reverse = client("Aqua, Glycérine, Niacinamide, Glycerin, Parfum", dictionary, aliases);
  expect(reverse[1]).toEqual({ inci_name: "glycerin", position: 1, match: "alias" });
});

it("calls only an exact name or a synonym high confidence", () => {
  expect(isHighConfidenceMatch("exact")).toBe(true);
  expect(isHighConfidenceMatch("alias")).toBe(true);
  expect(isHighConfidenceMatch("corrected")).toBe(false);
  expect(isHighConfidenceMatch("rebuilt")).toBe(false);
  expect(isHighConfidenceMatch(null)).toBe(false);
  expect(isHighConfidenceMatch(undefined)).toBe(false);
});
