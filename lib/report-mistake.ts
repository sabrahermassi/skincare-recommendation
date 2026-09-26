import Constants from "expo-constants";

/**
 * "Report a mistake" (#327): a pre-filled email to support, naming exactly
 * what's wrong so the fix can start from the right row. What goes in it is
 * deliberately short: the product or ingredient, the app version, and a line
 * for the person to write on. Never the skin profile, pregnancy status or an
 * account id — which is why nothing here takes them.
 */

export type MistakeSubject =
  | { kind: "product"; id: string; name: string; brand?: string; barcode?: string }
  | { kind: "ingredient"; name: string };

/** The version this build was configured with — Expo Go's own version would mislead. */
function appVersion(): string {
  return Constants.expoConfig?.version ?? "unknown";
}

export function mistakeReportUrl(email: string, subject: MistakeSubject): string {
  const title = subject.kind === "product" ? [subject.brand, subject.name].filter(Boolean).join(" ") : subject.name;
  const facts =
    subject.kind === "product"
      ? [`Product: ${title}`, `Product id: ${subject.id}`, ...(subject.barcode ? [`Barcode: ${subject.barcode}`] : [])]
      : [`Ingredient (INCI name): ${subject.name}`];
  const body = ["What's wrong?", "", "", "---", ...facts, `App version: ${appVersion()}`].join("\n");
  return `mailto:${email}?subject=${encodeURIComponent(`Mistake report: ${title}`)}&body=${encodeURIComponent(body)}`;
}
