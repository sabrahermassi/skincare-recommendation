import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { ConfirmSheet } from "@/components/ConfirmSheet";
import { MenuGroup, MenuRow } from "@/components/MenuRows";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { deleteMyAccount, exportMyData, type DeleteOutcome, type ExportOutcome } from "@/lib/account";
import { ACCOUNT_PITCH, accountSummary, signOut, signOutEverywhere, useAuth } from "@/lib/auth";
import { noteProfileErased } from "@/lib/erase-notice";
import { CANVAS, INK, MUTED, SPACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * Account (#220, #224): who is signed in, and the ways out — sign out of
 * this phone or of every device, take a copy of the account's data, or
 * delete the account. Reached from the Profile menu, so deletion is easy to
 * find (App Store Guideline 5.1.1(v)). Signed out, it explains what an
 * account is for and offers the sign-in sheet; it never blocks anything else.
 *
 * Laid out after the owner's reference: the rows in rounded blocks, and the
 * delete on its own at the foot of the screen. Signed out, that delete is the
 * one Profile used to carry — erasing the skin profile, shelf and history on
 * this phone.
 */
export default function Account() {
  const status = useAuth((s) => s.status);
  const session = useAuth((s) => s.session);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingErase, setConfirmingErase] = useState(false);
  const resetApp = useAppStore((s) => s.resetApp);
  // Leaving the screen with a confirmation open must not bring it back the next time.
  useFocusEffect(
    useCallback(
      () => () => {
        setConfirmingDelete(false);
        setConfirmingErase(false);
      },
      [],
    ),
  );

  // Signed out, the one irreversible action here: it wipes the profile, the
  // saved shelf and the whole history, then clears AsyncStorage so the wipe
  // survives a relaunch.
  const erase = () => {
    setConfirmingErase(false);
    resetApp();
    noteProfileErased();
    router.replace("/onboarding");
  };

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
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, gap: 14, paddingBottom: 40 }}>
        {status === "loading" ? (
          <ActivityIndicator color={MUTED} accessibilityLabel="Loading" />
        ) : status === "signed-in" && session ? (
          <SignedIn
            summary={accountSummary(session)}
            working={working}
            onLeave={leave}
            onDownload={download}
          />
        ) : (
          <>
            <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>
              {ACCOUNT_PITCH}
            </Text>
            <PrimaryButton
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

        {/* The delete, on its own at the foot of the screen. */}
        {status === "loading" ? null : (
          <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", paddingTop: SPACE.gutter }}>
            <Pressable
              onPress={() => (status === "signed-in" && session ? setConfirmingDelete(true) : setConfirmingErase(true))}
              disabled={working}
              accessibilityRole="button"
              accessibilityLabel={status === "signed-in" && session ? "Delete account" : "Delete my profile"}
              style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: SPACE.text, paddingHorizontal: SPACE.block }}
              className="active:opacity-70"
            >
              <Ionicons name="trash-outline" size={20} color={MUTED} />
              <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: MUTED }}>
                {status === "signed-in" && session ? "Delete account" : "Delete my profile"}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={confirmingDelete}
        title="Are you sure?"
        line={DELETE_WARNING}
        keepLabel="Keep my account"
        confirmLabel="Delete my account"
        busy={working}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void remove()}
      />
      <ConfirmSheet
        visible={confirmingErase}
        title="Are you sure?"
        line={ERASE_WARNING}
        keepLabel="Keep my profile"
        confirmLabel="Yes, delete my profile"
        onClose={() => setConfirmingErase(false)}
        onConfirm={erase}
      />
    </View>
  );
}

function SignedIn({
  summary,
  working,
  onLeave,
  onDownload,
}: {
  summary: ReturnType<typeof accountSummary>;
  working: boolean;
  onLeave: (everywhere: boolean) => void;
  onDownload: () => void;
}) {
  return (
    <>
      <MenuGroup>
        {summary.email ? <MenuRow icon="mail" label="Email" value={summary.email} /> : null}
        <MenuRow icon="log-out" label="Sign out" disabled={working} onPress={() => onLeave(false)} />
      </MenuGroup>
      <View style={{ gap: 4, paddingHorizontal: SPACE.text }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>Signed in with {summary.providers}</Text>
        {summary.isHiddenEmail ? (
          // A relay address looks like a typo to anyone who didn't set it up
          // knowingly; saying what it is keeps it from reading as an error.
          <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{HIDDEN_EMAIL_NOTE}</Text>
        ) : null}
      </View>

      <MenuGroup>
        <MenuRow icon="phone-portrait" label="Sign out on every device" disabled={working} onPress={() => onLeave(true)} />
        <MenuRow icon="download" label="Download my data" disabled={working} onPress={onDownload} />
      </MenuGroup>
      <View style={{ gap: SPACE.text, paddingHorizontal: SPACE.text }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{EVERY_DEVICE_NOTE}</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{EXPORT_EXPLAINER}</Text>
      </View>
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
  "A file with your saved products, notes, routine steps and starred ingredients, and any products you added from a label photo. Your scan history and skin profile stay on this phone and aren't part of your account, so they're not in it.";

/** The confirmation says exactly what goes, and what stays. */
export const DELETE_WARNING =
  "This deletes your account and everything saved to it: your shelf, notes, routine steps and starred ingredients, on every phone. Products you added to the catalogue stay there for everyone, no longer linked to you. Your scan history and skin profile stay on this phone. It can't be undone.";

/** Signed out, what "Delete my profile" erases (it used to live on Profile). */
export const ERASE_WARNING = "This erases your profile, shelf and history on this phone. It can't be undone.";

const EVERY_DEVICE_NOTE =
  "Sign out on every device is for a lost or stolen phone: every phone and tablet on this account will need to sign in again.";

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
