/**
 * Guardrails for claims the app authors and presents as its own.
 *
 * This is deliberately a small, high-signal denylist rather than an attempt
 * to decide legal compliance with a regex. It catches language that is never
 * appropriate for this app's ingredient-compatibility role. See
 * `docs/claims-policy.md` for scope, review guidance and primary sources.
 */
export type ClaimPolicyRule = {
  id: string;
  explanation: string;
  pattern: RegExp;
};

const CLAIM_POLICY_RULES: readonly ClaimPolicyRule[] = [
  {
    id: "disease-or-treatment",
    explanation: "Do not diagnose, cure, treat, heal or prevent a disease or condition",
    pattern:
      /\b(?:diagnos(?:e|es|ed|ing|is)|cure[sd]?|curing|treatments?|heal(?:s|ed|ing)?|(?:treat|treats|treated|treating|prevent|prevents|prevented|preventing)\b.{0,30}\b(?:acne|eczema|rosacea|psoriasis|dermatitis|disease|condition|infection|breakouts?|blemishes?))\b/i,
  },
  {
    id: "body-structure",
    explanation: "Do not claim to repair, restore, rebuild or regenerate skin or its structures",
    pattern: /\b(?:repair|restore|rebuild|regenerate)(?:s|ed|ing|ation)?\b|\b(?:regenerat|restorat|reparat)(?:ion|ive)\b/i,
  },
  {
    id: "antimicrobial-or-symptom",
    explanation: "Do not make antimicrobial, pathogen-killing or anti-symptom claims",
    pattern:
      /\b(?:anti[- ]?(?:bacterial|microbial|fungal|viral|itch)|(?:kills?|eliminates?)\b.{0,40}\b(?:bacteria|germs?|fung(?:us|i)|viruses?)|(?:bacteria|germs?|fung(?:us|i)|viruses?)[- ]?(?:killing|eliminating))\b/i,
  },
  {
    id: "regulatory-endorsement",
    explanation: "Do not imply approval or endorsement by a regulator or other authority",
    pattern: /\b(?:FDA|FTC|EMA|MHRA|MFDS)\b|\b(?:approved|endorsed|certified) by\b/i,
  },
  {
    id: "guaranteed-outcome",
    explanation: "Do not promise or overstate a health or product outcome",
    pattern: /\b(?:guaranteed?|definitely|clinically proven|proven to)\b/i,
  },
] as const;

export function claimPolicyViolations(text: string): ClaimPolicyRule[] {
  return CLAIM_POLICY_RULES.filter((rule) => rule.pattern.test(text));
}
