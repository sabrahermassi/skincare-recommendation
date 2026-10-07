// #458: how each stored name was reached, through the parser the Edge Functions read.
// `test-fixtures/inci-match-confidence.json` is the same file `__tests__/inci-match-confidence.test.ts`
// runs the client and importer copies against, so the three parsers cannot drift apart on a match
// without one of the two suites failing.
import { assertEquals } from "jsr:@std/assert@1";

import { parseIngredientBlock } from "../functions/_shared/inci-parse.ts";
import fixture from "../../test-fixtures/inci-match-confidence.json" with { type: "json" };

type Case = {
  name: string;
  text: string;
  parsers?: string[];
  dictionary?: boolean;
  expected: { inci_name: string; position: number; match: string | null }[];
};

const aliases = new Map(fixture.aliases as [string, string][]);
// The functions add the synonyms to the dictionary before the read, as label-ocr does.
const dictionary = new Set([...fixture.dictionary, ...aliases.keys()]);

for (const c of fixture.cases as Case[]) {
  if (c.parsers && !c.parsers.includes("deno")) continue;
  Deno.test(c.name, () => {
    assertEquals(parseIngredientBlock(c.text, c.dictionary === false ? undefined : dictionary, aliases), c.expected);
  });
}
