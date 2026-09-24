import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { deleteMyAccount, exportMyData, type DeleteOutcome, type ExportOutcome } from "@/lib/account";
import { ACCOUNT_PITCH, accountSummary, signOut, signOutEverywhere, useAuth } from "@/lib/auth";
import {
  BORDER_INACTIVE,
  CANVAS,
  CARD_SHADOW,
  DANGER,
  FLOATING_SHADOW,
  INK,
  MUTED,
  SCRIM,
  SURFACE,
  TOUCH_TARGET,
  TYPE,
} from "@/lib/tokens";

/**
 * Account (#220, #224): who is signed in, and the ways out — sign out of
 * this phone or of every device, take a copy of the account's data, or
 * delete the account. Reached from the Profile menu, so deletion is easy to
 * find (App Store Guideline 5.1.1(v)). Signed out, it explains what an
 * account is for and offers the sign-in sheet; it never blocks anything else.
 */
export default function Account() {
  const status = useAuth((s) => s.status);
  const session = useAuth((s) => s.session);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const download = async () => {
    setWorking(true);
    setNotice(null);
    const outcome = await exportMyData();
    setWorking(false);
    if (outcome !== "shared") setNotice(EXPORT_COPY[outcome]);
  };

  // A ref, not the `working` state: a second tap can land before React has
  // re-rendered the button disabled, and a second delete of an account the
  // first one already removed would come back "nothing was deleted" — a
  // wrong message about an irreversible action (#275 review).
  const deleting = useRef(false);
  const remove = async () => {
    if (deleting.current) return;
    deleting.current = true;
    setConfirmingDelete(false);
    setWorking(true);
    setNotice(null);
    try {
      const outcome = await deleteMyAccount();
      if (outcome !== "cancelled") setNotice(DELETE_COPY[outcome]);
    } finally {
      deleting.current = false;
      setWorking(false);
    }
  };

  const leave = async (everywhere: boolean) => {
    setWorking(true);
    setNotice(null);
    try {
      if (everywhere) {
        const reachedServer = await signOutEverywhere();
        setNotice(reachedServer ? SIGNED_OUT_EVERYWHERE : SIGNED_OUT_HERE_ONLY);
      } else {
        await signOut();
      }
    } catch {
      // The phone's secure storage refused to let go of the session
      // (lib/secure-storage.ts's `removeItem`). Rare, and worth saying
      // plainly rather than leaving the button spinning.
      setNotice(SIGN_OUT_FAILED);
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Account" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 18, paddingBottom: 60 }}>
        {status === "loading" ? (
          <ActivityIndicator color={MUTED} accessibilityLabel="Loading" />
        ) : status === "signed-in" && session ? (
          <SignedIn
            summary={accountSummary(session)}
            working={working}
            onLeave={leave}
            onDownload={download}
            onDelete={() => setConfirmingDelete(true)}
          />
        ) : (
          <>
            <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>
              {ACCOUNT_PITCH}
            </Text>
            <PrimaryButton
              tone="cta"
              size={52}
              label="Sign in"
              onPress={() => {
                setNotice(null);
                router.push({ pathname: "/sign-in", params: { from: "account" } });
              }}
            />
          </>
        )}

        {/* A "you're signed out" line is about the moment it was shown; once
            someone signs back in it would contradict the card above it
            (#272 review). The one notice that belongs to a signed-in screen
            is the sign-out that failed. */}
        {notice && (status !== "signed-in" || SIGNED_IN_NOTICES.has(notice)) ? (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 13.5, lineHeight: 20, color: INK }}>
            {notice}
          </Text>
        ) : null}
      </ScrollView>

      <Modal visible={confirmingDelete} transparent animationType="fade" onRequestClose={() => setConfirmingDelete(false)}>
        <Pressable
          onPress={() => setConfirmingDelete(false)}
          style={{ flex: 1, backgroundColor: SCRIM, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
        >
          {/* Swallows its own tap so the card doesn't dismiss itself. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 340, borderRadius: 20, backgroundColor: SURFACE, padding: 24, gap: 16, ...FLOATING_SHADOW }}
          >
            <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: INK }}>Delete your account?</Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{DELETE_WARNING}</Text>
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => void remove()}
                disabled={working}
                accessibilityRole="button"
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, backgroundColor: DANGER }}
                className="active:opacity-90"
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: SURFACE }}>Delete my account</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmingDelete(false)}
                accessibilityRole="button"
                style={{ minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, borderWidth: 1, borderColor: BORDER_INACTIVE }}
              >
                <Text style={{ fontSize: 14.5, fontWeight: "600", color: INK }}>Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SignedIn({
  summary,
  working,
  onLeave,
  onDownload,
  onDelete,
}: {
  summary: ReturnType<typeof accountSummary>;
  working: boolean;
  onLeave: (everywhere: boolean) => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <View style={{ borderRadius: 20, backgroundColor: SURFACE, padding: 20, gap: 6, ...CARD_SHADOW }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>Signed in with {summary.providers}</Text>
        {summary.email ? <Text style={{ fontSize: 14, color: INK }}>{summary.email}</Text> : null}
        {summary.isHiddenEmail ? (
          // A relay address looks like a typo to anyone who didn't set it up
          // knowingly; saying what it is keeps it from reading as an error.
          <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{HIDDEN_EMAIL_NOTE}</Text>
        ) : null}
      </View>

      <PrimaryButton variant="outline" size={52} label="Sign out" disabled={working} onPress={() => onLeave(false)} />

      <View style={{ gap: 6 }}>
        <Pressable
          onPress={() => onLeave(true)}
          disabled={working}
          accessibilityRole="button"
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14.5, fontWeight: "600", color: INK }}>Sign out on every device</Text>
        </Pressable>
        <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>
          For a lost or stolen phone. Every phone and tablet on this account will need to sign in again.
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        <Pressable
          onPress={onDownload}
          disabled={working}
          accessibilityRole="button"
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14.5, fontWeight: "600", color: INK }}>Download my data</Text>
        </Pressable>
        <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{EXPORT_EXPLAINER}</Text>
      </View>

      <Pressable
        onPress={onDelete}
        disabled={working}
        accessibilityRole="button"
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
      >
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: DANGER }}>Delete my account</Text>
      </Pressable>
    </>
  );
}

/** Exported for the tests. */
export const HIDDEN_EMAIL_NOTE =
  "This is the address Apple made with Hide My Email. It forwards to your own inbox.";
export const SIGNED_OUT_EVERYWHERE = "You're signed out on every device.";
export const SIGN_OUT_FAILED = "We couldn't sign you out on this phone. Restart the app and try again.";
/** What the export holds and, as plainly, what it can't (#224). */
export const EXPORT_EXPLAINER =
  "A file with your saved products, notes, routine steps and starred ingredients. Your scan history and skin profile stay on this phone and aren't part of your account, so they're not in it.";

/** The confirmation says exactly what goes, and what stays. */
export const DELETE_WARNING =
  "This deletes your account and everything saved to it: your shelf, notes, routine steps and starred ingredients, on every phone. Your scan history and skin profile stay on this phone. It can't be undone.";

export const ACCOUNT_DELETED = "Your account and everything saved to it are deleted.";

const DELETE_COPY: Record<Exclude<DeleteOutcome, "cancelled">, string> = {
  deleted: ACCOUNT_DELETED,
  network: "We couldn't reach our servers, so nothing was deleted. Try again when you have a signal.",
  apple: "We couldn't finish with Apple, so nothing was deleted. Try again in a moment.",
  failed: "Something went wrong and nothing was deleted. Try again in a moment.",
};

const EXPORT_COPY: Record<Exclude<ExportOutcome, "shared">, string> = {
  network: "We couldn't reach our servers to fetch your data. Try again when you have a signal.",
  failed: "We couldn't make the file just now. Try again in a moment.",
};

/** The notices that belong to a signed-in screen: failures that left the account as it was. */
const SIGNED_IN_NOTICES = new Set<string>([
  SIGN_OUT_FAILED,
  DELETE_COPY.network,
  DELETE_COPY.apple,
  DELETE_COPY.failed,
  EXPORT_COPY.network,
  EXPORT_COPY.failed,
]);

export const SIGNED_OUT_HERE_ONLY =
  "You're signed out on this phone, but we couldn't reach our servers to sign out your other devices. Sign in and try again when you have a signal.";
