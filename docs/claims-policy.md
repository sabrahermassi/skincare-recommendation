# Claims policy

for.me provides an **ingredient-based compatibility assessment**. It does not
diagnose a condition, prescribe treatment, promise safety or present a product
as medically or regulator approved.

## The line we hold

App-authored copy may describe cosmetic appearance, formula role and uncertain
compatibility: for example, “holds water,” “supports the skin barrier,” “may be
irritating,” “associated with congestion,” or “helps skin look smoother.” It
must not claim that an ingredient or product:

- diagnoses, cures, treats, heals, mitigates or prevents a disease or condition;
- repairs, restores, rebuilds or regenerates skin, cells or body structures;
- kills pathogens, is antibacterial/antimicrobial, or relieves a symptom;
- is FDA/MFDS/EMA/MHRA approved, cleared, certified or endorsed; or
- guarantees an outcome or calls an outcome “clinically proven” without a
  separately reviewed, product-specific substantiation process.

A disclaimer does not make an otherwise medical claim acceptable. Prefer
specific, bounded compatibility language and retain uncertainty where formula
concentration or individual response is unknown.

## Why

- The US FDA distinguishes cosmetics from drugs by intended use. Claims to
  diagnose, cure, mitigate, treat or prevent disease, or to affect body
  structure/function, can establish drug intent. It also notes that ordinary
  cosmetics generally do not receive FDA premarket approval:
  https://www.fda.gov/cosmetics/cosmetics-laws-regulations/it-cosmetic-drug-or-both-or-it-soap
- The US FTC requires appropriate substantiation for health-related claims,
  including claims made by apps:
  https://www.ftc.gov/business-guidance/advertising-marketing/health-claims
- EU Regulation 655/2013 requires explicit and implicit cosmetic claims to be
  supported by adequate, verifiable evidence:
  https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0655

This is a conservative product-language policy, not a statement that every
blocked word is unlawful in every jurisdiction.

## Enforcement and review

`lib/claims-policy.ts` is the shared high-signal guardrail. The regression test
audits every curated ingredient-rule reason, pore-clogging explanation, sample
product description/benefit and sample ingredient note. Add new app-owned claim
collections to that audit before displaying them.

External product names and label text are facts from their source, not claims
authored by for.me, and are not rewritten. Imported descriptions and
attribution are currently not displayed; they require source-aware review or
sanitisation before any future UI starts showing them. Pregnancy warnings and
regulatory restrictions are safety disclosures, not product benefit claims,
and must retain their qualified caution language.

The checker is intentionally not a substitute for human review. If copy makes
a new efficacy, comparative, quantitative or regulator-related claim, stop and
review its evidence even when no denylist pattern fires.
