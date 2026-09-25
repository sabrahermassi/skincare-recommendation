/**
 * The scoring engine measured against the real catalogue (#175): each
 * `CONCERN_SATURATION` constant beside a fresh 75th percentile, and the score
 * distribution for six fixed profiles — the baseline #237 recalibrates
 * against when the rules table grows.
 *
 *   SCORE_BASELINE=1 npx jest score-baseline
 *
 * Read-only, against staging. Skipped unless that variable is set: CI has no
 * credentials and a unit run must stay hermetic. Every score comes from
 * `matchProduct` itself; nothing here re-implements the scoring.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { writeFileSync } from "fs";

import type { Concern, Ingredient, ProductType, SafetyLevel, SkinProfile } from "@/data/types";
import {
  CLOGGER_WEIGHT,
  CONCERN_SATURATION,
  PORE_SATURATION,
  SCORE_BANDS,
  matchProduct,
  resetScoreCache,
} from "@/lib/matching";
import { poreCloggingHits } from "@/lib/pore-clogging";
import { contactWeight, positionWeights } from "@/lib/rules";

import { nodeFetch, stagingEnv } from "../test-fixtures/staging";

jest.setTimeout(300_000);

const env = process.env.SCORE_BASELINE === "1" ? stagingEnv() : null;
if (env) globalThis.fetch = nodeFetch as typeof fetch;
const run = env?.SUPABASE_ENV === "staging" ? describe : describe.skip;

type Scored = { id: string; type: ProductType; ingredients: Ingredient[] };

/**
 * What a product's score is computed from — its type and every resolved
 * ingredient in order, with the dictionary fields scoring reads. Two baseline
 * files can only be compared product by product where this is unchanged:
 * a score that moved with a changed fingerprint moved because staging's data
 * did, not because the code did (#285 review, CodeRabbit).
 */
function inputFingerprint(p: Scored): string {
  const inputs = [
    p.type,
    ...p.ingredients.map((i) => [i.name, i.safety, i.verified, [...(i.functions ?? [])].sort().join(",")].join("|")),
  ];
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16);
}

/** Every product with a formula, resolved against the dictionary the way `data/api` does. */
async function loadCatalogue(url: string, key: string): Promise<Scored[]> {
  const db = createClient(url, key, { auth: { persistSession: false } });
  const page = async <T>(table: string, select: string, order: string): Promise<T[]> => {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select(select).order(order).range(from, from + 999);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...(data as T[]));
      if (!data || data.length < 1000) return rows;
    }
  };
  type Dict = { inci_name: string; safety: SafetyLevel; verified: boolean; functions: string[] | null; note: string | null };
  const dictionary = new Map(
    (await page<Dict>("ingredients", "inci_name, safety, verified, functions, note", "inci_name")).map((row) => [
      row.inci_name,
      {
        id: row.inci_name,
        name: row.inci_name,
        comedogenic: 0,
        safety: row.safety,
        note: row.note ?? undefined,
        verified: row.verified,
        functions: row.functions ?? undefined,
      } as Ingredient,
    ])
  );
  type Row = { id: string; type: ProductType; product_ingredients: { position: number; inci_name: string }[] };
  const products = await page<Row>("products", "id, type, product_ingredients ( position, inci_name )", "id");
  return products
    .filter((p) => p.product_ingredients.length > 0)
    .map((p) => ({
      id: p.id,
      type: p.type,
      ingredients: [...p.product_ingredients]
        .sort((a, b) => a.position - b.position)
        .map(
          (j) =>
            dictionary.get(j.inci_name) ??
            ({ id: j.inci_name, name: j.inci_name, comedogenic: 0, safety: "safe", verified: false } as Ingredient)
        ),
    }));
}

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (at - lo);
};
const round = (n: number, d = 1) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : NaN);

/** Evidence back out of a 0-100 fit: `50 + 50 * saturate(e, k)`, inverted. */
function evidenceFrom(fromActives: number, k: number): number {
  const s = Math.max(-0.999999, Math.min(0.999999, (fromActives - 50) / 50));
  return s >= 0 ? (k * s) / (1 - s) : -(k * -s) / (1 + s);
}

/** The pore-safety half of a pore-led concern's fit, from the same exported pieces `computeMatch` uses. */
function poreSafety(p: Scored): number {
  const factors = positionWeights(p.ingredients.map((i) => i.name));
  const harm = contactWeight(p.type).harm;
  const load = poreCloggingHits(p.ingredients).reduce(
    (sum, hit) => sum + CLOGGER_WEIGHT[hit.confidence] * factors[hit.position - 1] * harm,
    0
  );
  return 100 - (100 * load) / (load + PORE_SATURATION);
}

const PORE_LED: Concern[] = ["acne-prone", "large-pores"];

const PROFILES: Record<string, SkinProfile> = {
  "oily · acne-prone · not sensitive": { concerns: ["acne-prone"], baseSkinType: "oily", sensitivity: "none", pregnancyStatus: null },
  "dry · dehydrated · not sensitive": { concerns: ["dehydrated"], baseSkinType: "dry", sensitivity: "none", pregnancyStatus: null },
  "combination · dullness + dark spots · somewhat": { concerns: ["dullness", "hyperpigmentation"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null },
  "normal · redness · very sensitive": { concerns: ["redness"], baseSkinType: "normal", sensitivity: "high", pregnancyStatus: null },
  "dry · fine lines + eczema-prone · somewhat": { concerns: ["fine-lines", "atopic"], baseSkinType: "dry", sensitivity: "some", pregnancyStatus: null },
  "combination · large pores · unset": { concerns: ["large-pores"], baseSkinType: "combination", sensitivity: null, pregnancyStatus: null },
};

const band = (score: number) =>
  score >= SCORE_BANDS.excellent ? "excellent" : score >= SCORE_BANDS.good ? "good" : score >= SCORE_BANDS.fair ? "fair" : "poor";

run("the scoring baseline on staging", () => {
  let catalogue: Scored[] = [];
  beforeAll(async () => {
    catalogue = await loadCatalogue(env!.SUPABASE_URL, env!.SUPABASE_SERVICE_ROLE_KEY);
  });

  it("re-measures each concern's saturation constant", () => {
    const lines = ["| Concern | Constant | Products with positive evidence | 75th percentile (positive) | Median (positive) |", "|---|---|---|---|---|"];
    for (const concern of Object.keys(CONCERN_SATURATION) as Concern[]) {
      const k = CONCERN_SATURATION[concern];
      const profile: SkinProfile = { concerns: [concern], baseSkinType: null, sensitivity: "none", pregnancyStatus: null };
      const evidence: number[] = [];
      let scored = 0;
      for (const p of catalogue) {
        resetScoreCache();
        const fit = matchProduct(p, profile).breakdown.concernFit;
        if (fit === null || matchProduct(p, profile).score === null) continue;
        scored++;
        const fromActives = PORE_LED.includes(concern) ? (fit - 0.65 * poreSafety(p)) / 0.35 : fit;
        evidence.push(evidenceFrom(fromActives, k));
      }
      const positive = evidence.filter((e) => e > 0.01);
      lines.push(
        `| ${concern} | ${k} | ${positive.length} of ${scored} (${round((100 * positive.length) / scored)}%) | ${round(quantile(positive, 0.75))} | ${round(quantile(positive, 0.5))} |`
      );
    }
    console.log(`Saturation, ${catalogue.length} products with a formula:\n${lines.join("\n")}`);
    expect(catalogue.length).toBeGreaterThan(0);
  });

  it("records the score distribution for six fixed profiles", () => {
    const lines = ["| Profile | Scored | Refused | Mean | P25 | Median | P75 | Excellent | Good | Fair | Poor |", "|---|---|---|---|---|---|---|---|---|---|---|"];
    // `SCORE_BASELINE_OUT=<file>` also writes every product's score per
    // profile, so a score-moving change can list exactly what it moved — and
    // each product's input fingerprint, so a comparison between two runs
    // only counts products whose staging data didn't change in between.
    const perProduct: Record<string, Record<string, number | null>> = {};
    for (const [name, profile] of Object.entries(PROFILES)) {
      const scores: number[] = [];
      let refused = 0;
      perProduct[name] = {};
      for (const p of catalogue) {
        resetScoreCache();
        const { score } = matchProduct(p, profile);
        perProduct[name][p.id] = score;
        if (score === null) refused++;
        else scores.push(score);
      }
      const bands = { excellent: 0, good: 0, fair: 0, poor: 0 };
      for (const s of scores) bands[band(s)]++;
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      lines.push(
        `| ${name} | ${scores.length} | ${refused} | ${round(mean)} | ${round(quantile(scores, 0.25))} | ${round(quantile(scores, 0.5))} | ${round(quantile(scores, 0.75))} | ${bands.excellent} | ${bands.good} | ${bands.fair} | ${bands.poor} |`
      );
    }
    console.log(`Distribution:\n${lines.join("\n")}`);
    if (process.env.SCORE_BASELINE_OUT) writeFileSync(
        process.env.SCORE_BASELINE_OUT,
        JSON.stringify({
          inputs: Object.fromEntries(catalogue.map((p) => [p.id, inputFingerprint(p)])),
          scores: perProduct,
        }),
      );
    expect(lines.length).toBe(2 + Object.keys(PROFILES).length);
  });
});
