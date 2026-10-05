import { readFileSync } from "node:fs";
import { join } from "node:path";

import { advisoriesFrom, evaluateAudit, formatReport, parseAllowlist } from "../scripts/check-audit.mjs";

const TODAY = "2026-10-05";

const forge = {
  source: 1240912,
  name: "node-forge",
  title: "node-forge RSA PKCS#1 v1.5 signature verification accepts extra nested DigestAlgorithm elements",
  url: "https://github.com/advisories/GHSA-86w9-cpqp-85rv",
  severity: "high",
  range: "<=1.4.0",
};
const braces = {
  source: 1240992,
  name: "braces",
  title: "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns",
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  severity: "high",
  range: "<=3.0.3",
};
const fresh = {
  source: 9999999,
  name: "left-pad",
  title: "left-pad runs your code",
  url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  severity: "critical",
  range: "*",
};
const moderate = {
  source: 1147955,
  name: "decode-uri-component",
  title: "decode-uri-component: denial of service",
  url: "https://github.com/advisories/GHSA-vcc3-ghjq-m6fr",
  severity: "moderate",
  range: "<=0.4.2",
};

// The shape npm 7+ prints: the advisory sits on the vulnerable package, and
// every package that depends on it is listed too, with names in `via`.
const auditOf = (...advisories: (typeof forge)[]) => ({
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries([
    ...advisories.map((a) => [a.name, { name: a.name, severity: a.severity, via: [a] }]),
    ["@expo/cli", { name: "@expo/cli", severity: "high", isDirect: false, via: advisories.map((a) => a.name) }],
    ["expo", { name: "expo", severity: "high", isDirect: true, via: ["@expo/cli"] }],
  ]),
});

const entry = (over: Record<string, string> = {}) => ({
  id: "GHSA-86w9-cpqp-85rv",
  package: "node-forge",
  reason: "developer tooling",
  expires: "2026-11-04",
  ...over,
});

describe("evaluateAudit", () => {
  it("passes an allowlisted advisory and says why it was allowed", () => {
    const out = evaluateAudit(auditOf(forge), [entry()], TODAY);
    expect(out.failed).toEqual([]);
    expect(out.problems).toEqual([]);
    expect(out.allowed).toHaveLength(1);
    const report = formatReport(out, TODAY);
    expect(report).toContain("GHSA-86w9-cpqp-85rv");
    expect(report).toContain("developer tooling");
    expect(report).toContain("2026-11-04");
    expect(report).toContain("Audit passed");
  });

  it("fails a new high advisory that is not allowlisted, even beside an allowed one", () => {
    const out = evaluateAudit(auditOf(forge, fresh), [entry()], TODAY);
    expect(out.failed.map((a) => a.id)).toEqual(["GHSA-aaaa-bbbb-cccc"]);
    expect(out.allowed).toHaveLength(1);
    expect(formatReport(out, TODAY)).toContain("Audit failed");
  });

  it("fails a high advisory when the allowlist is empty", () => {
    expect(evaluateAudit(auditOf(braces), [], TODAY).failed).toHaveLength(1);
  });

  it("fails once an entry has expired, and says so", () => {
    const out = evaluateAudit(auditOf(forge), [entry({ expires: "2026-10-04" })], TODAY);
    expect(out.allowed).toEqual([]);
    expect(out.failed.map((a) => a.id)).toEqual(["GHSA-86w9-cpqp-85rv"]);
    expect(formatReport(out, TODAY)).toContain("expired on 2026-10-04");
  });

  it("still covers the advisory through the day the entry expires", () => {
    expect(evaluateAudit(auditOf(forge), [entry({ expires: TODAY })], TODAY).failed).toEqual([]);
  });

  it("does not let an entry for one package cover the same id under another", () => {
    expect(evaluateAudit(auditOf(forge), [entry({ package: "something-else" })], TODAY).failed).toHaveLength(1);
  });

  it("ignores moderate advisories", () => {
    const out = evaluateAudit(auditOf(moderate), [], TODAY);
    expect(out.failed).toEqual([]);
    expect(out.allowed).toEqual([]);
  });

  it("passes a clean audit", () => {
    expect(evaluateAudit({ vulnerabilities: {} }, [], TODAY).failed).toEqual([]);
  });

  it("lists an entry whose advisory has gone, without failing", () => {
    const out = evaluateAudit({ vulnerabilities: {} }, [entry()], TODAY);
    expect(out.failed).toEqual([]);
    expect(out.unused).toHaveLength(1);
    expect(formatReport(out, TODAY)).toContain("delete them");
  });

  it("fails rather than passing when npm audit gave no report", () => {
    const out = evaluateAudit({ error: { summary: "request to registry failed" } }, [entry()], TODAY);
    expect(out.problems[0]).toContain("request to registry failed");
    expect(formatReport(out, TODAY)).toContain("Audit failed");
  });

  it("fails on a malformed allowlist entry instead of allowing on it", () => {
    const out = evaluateAudit(auditOf(forge), [{ id: "GHSA-86w9-cpqp-85rv", package: "node-forge" }], TODAY);
    expect(out.problems[0]).toContain("reason");
    expect(out.failed).toHaveLength(1);
  });
});

describe("parseAllowlist", () => {
  it("rejects an entry with no valid expiry date", () => {
    expect(parseAllowlist([entry({ expires: "soon" })]).problems[0]).toContain("YYYY-MM-DD");
    expect(parseAllowlist([entry({ expires: "2026-13-45" })]).problems[0]).toContain("YYYY-MM-DD");
    expect(parseAllowlist([entry({ expires: "2026-02-30" })]).problems[0]).toContain("YYYY-MM-DD");
    expect(parseAllowlist([entry({ expires: "2028-02-29" })]).problems).toEqual([]);
  });

  it("rejects a file that is not an array", () => {
    expect(parseAllowlist({}).problems).toHaveLength(1);
  });
});

describe("an advisory that names two packages", () => {
  const sameIdOtherPackage = { ...forge, name: "node-forge-fork", source: 1240913 };
  const both = {
    vulnerabilities: {
      "node-forge": { name: "node-forge", severity: "high", via: [forge] },
      "node-forge-fork": { name: "node-forge-fork", severity: "high", via: [sameIdOtherPackage] },
    },
  };

  it("is reported once per package", () => {
    expect(advisoriesFrom(both).map((a) => a.package).sort()).toEqual(["node-forge", "node-forge-fork"]);
  });

  it("fails for the package that is not allowlisted, even when the other one is", () => {
    const out = evaluateAudit(both, [entry()], TODAY);
    expect(out.allowed.map((x) => x.advisory.package)).toEqual(["node-forge"]);
    expect(out.failed.map((a) => a.package)).toEqual(["node-forge-fork"]);
  });

  it("fails for the package that is not allowlisted, whichever order npm lists them in", () => {
    const reversed = { vulnerabilities: { "node-forge-fork": both.vulnerabilities["node-forge-fork"], "node-forge": both.vulnerabilities["node-forge"] } };
    expect(evaluateAudit(reversed, [entry()], TODAY).failed.map((a) => a.package)).toEqual(["node-forge-fork"]);
  });
});

describe("advisoriesFrom", () => {
  it("counts each advisory once", () => {
    const list = advisoriesFrom(auditOf(forge, braces));
    expect(list.map((a) => a.id).sort()).toEqual(["GHSA-86w9-cpqp-85rv", "GHSA-vfj7-8cjw-p6xm"]);
  });

  it("names the direct dependency that pulls an advisory in, not every package between", () => {
    const [forgeAdvisory] = advisoriesFrom(auditOf(forge));
    expect(forgeAdvisory.reachedThrough).toEqual(["expo"]);
  });

  it("prints that dependency when the advisory fails", () => {
    const report = formatReport(evaluateAudit(auditOf(fresh), [], TODAY), TODAY);
    expect(report).toContain("pulled in by expo");
  });
});

describe("audit-allowlist.json", () => {
  const raw = JSON.parse(readFileSync(join(__dirname, "..", "audit-allowlist.json"), "utf8"));

  it("is well formed", () => {
    expect(parseAllowlist(raw).problems).toEqual([]);
  });

  it("holds exactly the two advisories with no fix yet (#393)", () => {
    expect(raw.map((e: { id: string }) => e.id).sort()).toEqual(["GHSA-86w9-cpqp-85rv", "GHSA-vfj7-8cjw-p6xm"]);
  });
});
