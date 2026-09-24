import { File, Paths } from "expo-file-system";
import { Share } from "react-native";

import { deleteAccount, fetchAccountExport, type AccountExportRows } from "@/data/api";
import { accountSummary, confirmWithApple, forgetDeletedAccount, useAuth } from "@/lib/auth";
import { useAppStore } from "@/store/useAppStore";

/**
 * Deleting the account and taking a copy of it (#224) — App Store Guideline
 * 5.1.1(v) and the GDPR's portability right, both reached from the account
 * screen.
 */

export type DeleteOutcome =
  | "deleted"
  /** The person closed Apple's confirmation. Nothing happened. */
  | "cancelled"
  | "network"
  /** Apple's side isn't set up on the server yet, or Apple refused. Nothing was deleted. */
  | "apple"
  | "failed";

/**
 * Deletes the account: the server deletes the auth user and, through its
 * foreign keys, every saved row; an Apple-linked account has Apple's grant
 * revoked first. Then the phone forgets the account — session, cached shelf,
 * anything queued or parked for it. The skin profile and scan history stay:
 * they were always the device's, never the account's.
 */
export async function deleteMyAccount(): Promise<DeleteOutcome> {
  const session = useAuth.getState().session;
  if (!session) return "failed";

  let appleCode: string | undefined;
  if (accountSummary(session).providers.includes("Apple")) {
    const code = await confirmWithApple();
    if (!code) return "cancelled";
    appleCode = code;
  }

  const result = await deleteAccount(appleCode);
  if (!result.ok) {
    if (result.reason === "network") return "network";
    if (result.reason === "apple_not_configured" || result.reason === "apple_revoke_failed") return "apple";
    return "failed";
  }

  // Dropped before the session goes, so the sign-out's last-push hook finds
  // nothing to push to an account that no longer exists.
  useAppStore.getState().discardShelf();
  await forgetDeletedAccount();
  return "deleted";
}

/** Exported for the tests. */
export function exportDocument(email: string | null, providers: string, rows: AccountExportRows, now: Date) {
  return {
    exportedAt: now.toISOString(),
    app: "for.me",
    account: { email, signInWith: providers },
    savedProducts: rows.products,
    savedIngredients: rows.ingredients,
    // Said in the file as well as on screen, so a copy on its own is honest
    // about what it leaves out.
    notIncluded:
      "Your scan history and skin profile stay on your phone and are never sent to your account, so they are not in this file.",
  };
}

export type ExportOutcome = "shared" | "network" | "failed";

/**
 * Writes the account's data as JSON — not CSV: a note is free text, and
 * commas, quotes and line breaks are how a CSV quietly corrupts it — and
 * opens the share sheet so the person can keep it wherever they like.
 */
export async function exportMyData(): Promise<ExportOutcome> {
  const session = useAuth.getState().session;
  if (!session) return "failed";
  const rows = await fetchAccountExport();
  if (!rows.ok) return rows.failure.kind === "offline" || rows.failure.kind === "timeout" ? "network" : "failed";

  const { email, providers } = accountSummary(session);
  const text = JSON.stringify(exportDocument(email, providers, rows.value, new Date()), null, 2);
  try {
    const file = new File(Paths.cache, "for.me-account-export.json");
    file.create({ overwrite: true });
    file.write(text);
    await Share.share({ url: file.uri, title: "for.me account export" });
    return "shared";
  } catch {
    return "failed";
  }
}
