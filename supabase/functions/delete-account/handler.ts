// Deletes the caller's own account (#224) — the most dangerous endpoint in
// the app, kept free of `Deno.env` so its decisions can be tested with fakes
// (supabase/tests/delete_account.test.ts). `index.ts` supplies the real
// dependencies.
//
// Two rules this file exists to hold:
//
//  1. **Identity comes from the verified token and nowhere else.** The body is
//     read for exactly one field, an Apple authorization code. A `user_id`,
//     an email, anything else a client sends about who to delete is ignored —
//     honouring it would be an account-deletion IDOR.
//
//  2. **An Apple-linked account is not deleted until Apple's grant is
//     revoked.** App Store Guideline 5.1.1(v): "If your app offers Sign in
//     with Apple, you'll need to use the Sign in with Apple REST API to revoke
//     user tokens when deleting an account." Supabase's delete stops at its
//     own row. So a revocation that cannot happen — no Apple keys configured,
//     Apple refusing — stops the deletion with a clear reason, rather than
//     deleting and leaving the grant behind.
//
// The saved shelf goes with the auth user: both tables reference it
// `on delete cascade` (migration 0025). Catalogue products the person added
// are public rows with no link to them, so they stay (#219). The account's
// analytics person in PostHog is deleted after it (#24), and never decides
// the reply: the account is already gone by then.

export type AccountUser = {
  id: string;
  /** Whether Sign in with Apple is one of the account's identities. */
  appleLinked: boolean;
};

export type AppleRevocation = "revoked" | "not-configured" | "failed";

export type AnalyticsForget = "deleted" | "not-configured" | "failed";

export type DeleteAccountDeps = {
  /** The user the token was issued to, or null for a missing, forged or expired token. */
  userFromToken(token: string): Promise<AccountUser | null>;
  /** Exchanges a fresh Apple authorization code for tokens and revokes them. */
  revokeApple(authorizationCode: string): Promise<AppleRevocation>;
  /** Deletes the auth user; the shelf rows cascade. */
  deleteUser(id: string): Promise<boolean>;
  /** Deletes the account's analytics person and events (PostHog, #24). */
  forgetAnalytics(id: string): Promise<AnalyticsForget>;
};

export type DeleteAccountReply = {
  status: number;
  body: { deleted: true } | { error: DeleteAccountError };
};

export type DeleteAccountError =
  | "not_signed_in"
  | "apple_reauth_required"
  | "apple_not_configured"
  | "apple_revoke_failed"
  | "delete_failed"
  | "method_not_allowed";

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

/** The one field this endpoint reads from its body. */
async function appleCodeFrom(req: Request): Promise<string | null> {
  try {
    const body: unknown = await req.json();
    const code = (body as { appleAuthorizationCode?: unknown } | null)?.appleAuthorizationCode;
    return typeof code === "string" && code.length > 0 && code.length < 4096 ? code : null;
  } catch {
    return null;
  }
}

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<DeleteAccountReply> {
  if (req.method !== "POST") return { status: 405, body: { error: "method_not_allowed" } };

  const token = bearer(req);
  if (!token) return { status: 401, body: { error: "not_signed_in" } };
  const user = await deps.userFromToken(token);
  if (!user) return { status: 401, body: { error: "not_signed_in" } };

  if (user.appleLinked) {
    const code = await appleCodeFrom(req);
    if (!code) return { status: 400, body: { error: "apple_reauth_required" } };
    const revoked = await deps.revokeApple(code);
    if (revoked === "not-configured") return { status: 503, body: { error: "apple_not_configured" } };
    if (revoked === "failed") return { status: 502, body: { error: "apple_revoke_failed" } };
  }

  if (!(await deps.deleteUser(user.id))) return { status: 500, body: { error: "delete_failed" } };

  // Only after the account is gone, and never able to change the answer: a
  // PostHog outage leaves an analytics person to delete by hand, not an
  // account that still exists. The id is the one to delete by hand.
  const analytics = await deps.forgetAnalytics(user.id).catch((): AnalyticsForget => "failed");
  if (analytics !== "deleted") console.warn(`delete-account: PostHog person not deleted (${analytics}) for ${user.id}`);
  return { status: 200, body: { deleted: true } };
}
