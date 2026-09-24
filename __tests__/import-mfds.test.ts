import { itemsFrom, proposeSynonyms, totalFrom } from "../scripts/import-mfds.mjs";

/**
 * The MFDS register → Korean synonyms (#201). The API needs a data.go.kr key
 * this repo does not hold, so the network half is exercised on the
 * operator's machine; this pins the part that decides what gets written.
 * Field names are the ones the data.go.kr page documents: INGR_KOR_NAME,
 * INGR_ENG_NAME, CAS_NO, INGR_SYNONYM.
 */

const record = (kor: string, eng: string, cas = "", synonym = "") => ({
  INGR_KOR_NAME: kor,
  INGR_ENG_NAME: eng,
  CAS_NO: cas,
  INGR_SYNONYM: synonym,
});

const world = (existing: [string, string][] = []) => ({
  verified: new Set(["glycerin", "niacinamide", "silica", "solum diatomeae", "butylene glycol"]),
  casIndex: new Map([
    ["56-81-5", new Set(["glycerin"])],
    ["98-92-0", new Set(["niacinamide"])],
    // One CAS, two INCI names: says nothing about which is meant.
    ["7631-86-9", new Set(["silica", "solum diatomeae"])],
  ]),
  existing: new Map(existing),
});

describe("reading the register's pages", () => {
  it.each([
    ["items as a list of { item }", { body: { totalCount: 2, items: [{ item: { INGR_KOR_NAME: "가" } }, { item: { INGR_KOR_NAME: "나" } }] } }],
    ["items.item as a list", { body: { totalCount: 2, items: { item: [{ INGR_KOR_NAME: "가" }, { INGR_KOR_NAME: "나" }] } } }],
    ["the whole thing under response", { response: { body: { totalCount: 2, items: { item: [{ INGR_KOR_NAME: "가" }, { INGR_KOR_NAME: "나" }] } } } }],
  ])("reads %s", (_: string, page: object) => {
    expect(itemsFrom(page).map((r: { INGR_KOR_NAME: string }) => r.INGR_KOR_NAME)).toEqual(["가", "나"]);
    expect(totalFrom(page)).toBe(2);
  });

  it("reads a one-record page and an empty one", () => {
    expect(itemsFrom({ body: { items: { item: { INGR_KOR_NAME: "가" } } } })).toHaveLength(1);
    expect(itemsFrom({ body: { items: "" } })).toEqual([]);
  });
});

describe("what gets written", () => {
  it("points the Korean standard name at the INCI name, matched on the English name", () => {
    const { rows, stats } = proposeSynonyms([record("글리세린", "Glycerin")], world());
    expect(rows).toEqual([{ synonym: "글리세린", inci_name: "glycerin", locale: "ko", source: "mfds" }]);
    expect(stats.matched).toBe(1);
  });

  it("falls back to a CAS number only one verified ingredient holds", () => {
    const { rows } = proposeSynonyms([record("나이아신아마이드", "Nicotinamide (vit B3)", "98-92-0")], world());
    expect(rows[0]).toMatchObject({ synonym: "나이아신아마이드", inci_name: "niacinamide" });
  });

  it("leaves a record unmatched rather than guess — a shared CAS, or no identifier at all", () => {
    const { rows, stats } = proposeSynonyms(
      [record("실리카", "Silicon dioxide", "7631-86-9"), record("알수없음", "Something Else")],
      world()
    );
    expect(rows).toEqual([]);
    expect(stats.unmatched).toBe(2);
  });

  // A comma between digits is part of the name, as the parser treats it — a
  // first draft split "1,3-butanediol" into "3-butanediol".
  it("adds each alternative name, Korean ones as ko and others as common names, keeping 1,3- whole", () => {
    const { rows } = proposeSynonyms([record("부틸렌글라이콜", "Butylene Glycol", "", "1,3-부틸렌글라이콜, 1,3-butanediol")], world());
    expect(rows).toEqual([
      { synonym: "부틸렌글라이콜", inci_name: "butylene glycol", locale: "ko", source: "mfds" },
      { synonym: "1,3-부틸렌글라이콜", inci_name: "butylene glycol", locale: "ko", source: "mfds" },
      { synonym: "1,3-butanediol", inci_name: "butylene glycol", locale: null, source: "mfds" },
    ]);
  });

  it("never turns a real ingredient's own name into a synonym of another", () => {
    const { rows } = proposeSynonyms([record("글리세린", "Glycerin", "", "niacinamide")], world());
    expect(rows.map((r: { synonym: string }) => r.synonym)).toEqual(["글리세린"]);
  });

  it("drops a name two substances claim", () => {
    const { rows, stats } = proposeSynonyms(
      [record("보습제", "Glycerin"), record("보습제", "Niacinamide")],
      world()
    );
    expect(rows).toEqual([]);
    expect(stats.ambiguous).toBe(1);
  });

  it("adds, never takes over: a synonym another source holds is left alone, and a clash reported", () => {
    const { rows, stats } = proposeSynonyms(
      [record("글리세린", "Glycerin"), record("나이아신아마이드", "Niacinamide")],
      world([
        ["글리세린", "glycerin"],
        ["나이아신아마이드", "butylene glycol"],
      ])
    );
    expect(rows).toEqual([]);
    expect(stats).toMatchObject({ alreadyHeld: 1, clashes: 1 });
  });
});
