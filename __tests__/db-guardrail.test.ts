import { decide, projectRef } from "../scripts/lib/db.mjs";

/**
 * The rule that decides whether a script may write, and to which project.
 *
 * Pinned rather than trusted because the failure it exists to prevent is
 * silent: a script that writes to production when it meant staging reports
 * success either way, and the damage is only visible later in the data. The
 * pure `decide` is exported for exactly this — the live client cannot be made
 * to prove a refusal happened.
 */

const STAGING = "https://stagingref.supabase.co";
const PROD = "https://prodref.supabase.co";
const KEY = "service-role-key";

/** A write against staging, which is the ordinary development case. */
const writeToStaging = { url: STAGING, key: KEY, declared: "staging", write: true };

describe("projectRef", () => {
  it("takes the subdomain of a Supabase URL", () => {
    expect(projectRef(PROD)).toBe("prodref");
  });

  it("does not throw on a URL it cannot parse", () => {
    expect(projectRef("not a url")).toBe("unparseable");
    expect(projectRef(undefined)).toBe("unparseable");
  });
});

describe("reads", () => {
  it("are allowed with no environment declared at all", () => {
    const verdict = decide({ url: PROD, key: KEY, declared: undefined, write: false });
    expect(verdict.ok).toBe(true);
  });

  it("name the project that was read, so the log says which one it was", () => {
    const verdict = decide({ url: PROD, key: KEY, declared: undefined, write: false });
    expect(verdict.ok && verdict.notice).toContain("prodref");
  });

  it("are allowed against production without --prod", () => {
    const verdict = decide({ url: PROD, key: KEY, declared: "production", write: false, argv: [] });
    expect(verdict.ok).toBe(true);
  });
});

describe("credentials", () => {
  it("are required", () => {
    expect(decide({ url: undefined, key: KEY, declared: "staging", write: true }).ok).toBe(false);
    expect(decide({ url: STAGING, key: undefined, declared: "staging", write: true }).ok).toBe(false);
  });

  it("are required for a read too", () => {
    expect(decide({ url: undefined, key: undefined, write: false }).ok).toBe(false);
  });
});

describe("writes", () => {
  it("are allowed against staging", () => {
    const verdict = decide(writeToStaging);
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.env).toBe("staging");
  });

  it("are refused when no environment is declared", () => {
    const verdict = decide({ ...writeToStaging, declared: undefined });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.message).toContain("SUPABASE_ENV is not set");
  });

  /*
    A typo has to fail rather than fall through to a default. "prod",
    "PRODUCTION" and "dev" are all plausible things to type, and any of them
    silently treated as staging would put a production write past the gate.
  */
  it("are refused when the environment is not one of the two names", () => {
    for (const declared of ["prod", "PRODUCTION", "dev", "test", ""]) {
      expect(decide({ ...writeToStaging, declared }).ok).toBe(false);
    }
  });

  it("are refused against production without --prod", () => {
    const verdict = decide({ url: PROD, key: KEY, declared: "production", write: true, argv: [] });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.message).toContain("PRODUCTION");
  });

  it("are allowed against production with --prod", () => {
    const verdict = decide({
      url: PROD,
      key: KEY,
      declared: "production",
      write: true,
      argv: ["node", "script.mjs", "--apply", "--prod"],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.notice).toContain("PRODUCTION");
  });

  /*
    --prod is about production only. Passing it to a staging run must not be an
    error, or muscle memory from a production run turns into friction that
    teaches the operator to stop reading the flag.
  */
  it("are allowed against staging whether or not --prod is passed", () => {
    expect(decide({ ...writeToStaging, argv: ["--prod"] }).ok).toBe(true);
    expect(decide({ ...writeToStaging, argv: [] }).ok).toBe(true);
  });
});

/*
  The second surface. Once the production ref is known, the URL and the
  declaration have to agree — a stale `export SUPABASE_ENV=staging` left in a
  shell that has since been pointed at production is the exact accident this
  catches, and it is one the --prod flag alone does not.
*/
describe("when the production ref is known", () => {
  const productionRef = "prodref";

  it("refuses a production URL that claims to be staging", () => {
    const verdict = decide({ url: PROD, key: KEY, declared: "staging", write: true, productionRef });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.message).toContain("points at the production project");
  });

  it("refuses a non-production URL that claims to be production", () => {
    const verdict = decide({
      url: STAGING,
      key: KEY,
      declared: "production",
      write: true,
      argv: ["--prod"],
      productionRef,
    });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.message).toContain("is not production");
  });

  it("still allows the two honest combinations", () => {
    expect(decide({ ...writeToStaging, productionRef }).ok).toBe(true);
    expect(
      decide({ url: PROD, key: KEY, declared: "production", write: true, argv: ["--prod"], productionRef }).ok,
    ).toBe(true);
  });

  it("does not gate reads on the mismatch", () => {
    expect(decide({ url: PROD, key: KEY, declared: "staging", write: false, productionRef }).ok).toBe(true);
  });
});
