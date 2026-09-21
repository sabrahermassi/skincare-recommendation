import fs from "node:fs";
import path from "node:path";

import { buildLedger, checkLedger, reviewStub, serializeLedger } from "../scripts/audit-ingredient-coverage.mjs";

const known = new Set([
  "aqua",
  "glycerin",
  "sodium hyaluronate",
  "tocopherol",
  "tricaprylin",
]);
const aliases = new Map([["glycérine", "glycerin"]]);

describe("reviewStub", () => {
  it("normalises only to an already verified dictionary name", () => {
    expect(reviewStub({ name: "glycérine", source: "unmatched", uses: 2 }, known, aliases)).toMatchObject({
      decision: "normalize",
      target: "glycerin",
    });
  });

  it("removes an unreferenced stub without treating it as verified", () => {
    expect(reviewStub({ name: "possible new extract", source: "unmatched", uses: 0 }, known, aliases)).toMatchObject({
      decision: "remove-unused",
    });
  });

  it("records reviewed packaging text as not an ingredient", () => {
    expect(reviewStub({ name: "ingredients", source: "unmatched", uses: 1 }, known, aliases)).toMatchObject({
      decision: "remove-non-ingredient",
    });
  });

  it("leaves corrupted source text unmapped when it may still contain an ingredient", () => {
    expect(reviewStub({ name: "rosa canina fruit oil&quot", source: "unmatched", uses: 1 }, known, aliases)).toMatchObject({
      decision: "leave-unmapped-invalid-source-text",
    });
  });

  it("does not let a fuzzy candidate resolve a deliberately ambiguous name", () => {
    expect(reviewStub({ name: "caprylic triglyceride", source: "unmatched", uses: 3 }, known, aliases)).toMatchObject({
      decision: "leave-unmapped-ambiguous",
    });
  });

  it("does not collapse a glued list of verified ingredients", () => {
    expect(
      reviewStub({ name: "tocopherol. sodium hyaluronate", source: "unmatched", uses: 1 }, known, aliases)
    ).toMatchObject({ decision: "leave-unmapped-multiple" });
  });

  it("recognises an and-joined list without rewriting the formula", () => {
    const dictionary = new Set([...known, "behentrimonium methosulfate", "cetearyl alcohol"]);
    expect(
      reviewStub(
        { name: "behentrimonium methosulfate and cetearyl alcohol", source: "unmatched", uses: 1 },
        dictionary,
        aliases
      )
    ).toMatchObject({ decision: "leave-unmapped-multiple" });
  });

  it("leaves a plausible name unmapped when checked sources have no safe match", () => {
    expect(
      reviewStub({ name: "arnebia nobilis root extract", source: "unmatched", uses: 2 }, known, aliases)
    ).toMatchObject({ decision: "leave-unmapped-no-authoritative-match" });
  });
});

describe("buildLedger", () => {
  it("accounts for every stub and counts frequency only as usage", () => {
    const ledger = buildLedger({
      verifiedCount: known.size,
      known,
      aliases,
      generatedAt: "2026-09-21T00:00:00.000Z",
      stubs: [
        { inci_name: "glycérine", source: "unmatched" },
        { inci_name: "iron oxides", source: "unmatched" },
      ],
      uses: [
        { product_id: "p1", position: 1, inci_name: "iron oxides" },
        { product_id: "p2", position: 1, inci_name: "iron oxides" },
        { product_id: "p3", position: 1, inci_name: "iron oxides" },
      ],
    });

    expect(ledger.summary.unverifiedNames).toBe(2);
    expect(ledger.summary.unverifiedProductLinks).toBe(3);
    expect(ledger.policy.promoteByFrequency).toBe(false);
    expect(ledger.entries.find((entry: { name: string }) => entry.name === "iron oxides")).toMatchObject({
      uses: 3,
      decision: "leave-unmapped-ambiguous",
    });
    expect(ledger.inventoryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(serializeLedger(ledger))).toEqual(ledger);
  });

  it("names only sources that an import script actually loads", () => {
    const ledger = buildLedger({ verifiedCount: 0, known, aliases, stubs: [], uses: [] });
    expect(ledger.policy.checkedSources.join(" ")).not.toMatch(/MFDS/);
  });
});

describe("checkLedger", () => {
  const snapshot = (uses: { product_id: string; position: number; inci_name: string }[]) =>
    buildLedger({
      verifiedCount: known.size,
      known,
      aliases,
      generatedAt: "2026-09-21T00:00:00.000Z",
      stubs: [
        { inci_name: "glycérine", source: "unmatched" },
        { inci_name: "iron oxides", source: "unmatched" },
      ],
      uses,
    });
  const use = (product: string, name: string) => ({ product_id: product, position: 1, inci_name: name });

  it("accepts a ledger that matches the live catalogue", () => {
    const uses = [use("p1", "glycérine"), use("p1", "iron oxides")];
    expect(checkLedger(snapshot(uses), snapshot(uses))).toEqual([]);
  });

  it("is not made stale by a use count moving, only by a decision changing", () => {
    const before = snapshot([use("p1", "glycérine"), use("p1", "iron oxides")]);
    const moreUses = snapshot([use("p1", "glycérine"), use("p1", "iron oxides"), use("p2", "iron oxides")]);
    expect(checkLedger(before, moreUses)).toEqual([]);

    // "glycérine" is no longer used by anything, so its decision becomes remove-unused.
    const unused = snapshot([use("p1", "iron oxides")]);
    expect(checkLedger(before, unused)).toEqual([expect.stringMatching(/stale/)]);
  });

  it("catches an entry edited by hand while the stored hash was left alone", () => {
    const live = snapshot([use("p1", "glycérine"), use("p1", "iron oxides")]);
    const edited = {
      ...live,
      entries: live.entries.map((entry: { name: string }) =>
        entry.name === "iron oxides" ? { ...entry, decision: "normalize", target: "ci 77491" } : entry
      ),
    };
    expect(checkLedger(edited, live)).toEqual([
      expect.stringMatching(/edited without --write/),
      expect.stringMatching(/stale/),
    ]);
  });

  it("holds for the committed ledger: its entries give its own hash", () => {
    const committed = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "docs", "ingredient-stub-review.json"), "utf8")
    );
    expect(checkLedger(committed, { inventoryHash: committed.inventoryHash })).toEqual([]);
    expect(JSON.stringify(committed)).not.toMatch(/MFDS/);
  });
});
