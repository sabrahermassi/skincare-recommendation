import { longEnoughToSearch, searchableQuery, searchProducts } from "@/data/api";

// #297: "%%" returned two unrelated products whose names held a double space.
describe("searchableQuery", () => {
  it.each(["%%", "%", "__", "**", "(),", "--", "  ", '"\\'])("searches nothing for %p", (query: string) => {
    expect(searchableQuery(query)).toBeNull();
  });

  it("turns wildcards and filter syntax into spaces, and collapses them", () => {
    expect(searchableQuery("rose_%water")).toBe("rose water");
    expect(searchableQuery("  cica  (cream)  ")).toBe("cica cream");
    expect(searchableQuery("a*b")).toBe("a b");
  });

  it("leaves an ordinary query as it is", () => {
    expect(searchableQuery("Nivea Anti-Wrinkle")).toBe("Nivea Anti-Wrinkle");
    expect(searchableQuery("L'Oréal")).toBe("L'Oréal");
    expect(searchableQuery("설화수")).toBe("설화수");
  });
});

describe("searchProducts", () => {
  it("returns nothing for a punctuation-only query", async () => {
    expect(await searchProducts("%%")).toEqual([]);
    expect(await searchProducts("--")).toEqual([]);
  });
});

// Three letters before a search (owner); a Korean, Chinese or Japanese character counts as two.
describe("longEnoughToSearch", () => {
  it("waits for three Latin letters", () => {
    expect(longEnoughToSearch("ro")).toBe(false);
    expect(longEnoughToSearch("  ro  ")).toBe(false);
    expect(longEnoughToSearch("ros")).toBe(true);
  });

  it("searches a two-syllable Korean brand name, but not one syllable", () => {
    expect(longEnoughToSearch("미샤")).toBe(true);
    expect(longEnoughToSearch("미")).toBe(false);
  });
});
