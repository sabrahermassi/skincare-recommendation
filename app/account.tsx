import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConfirmSheet } from "@/components/ConfirmSheet";
import { MenuGroup, MenuRow } from "@/components/MenuRows";
import { PageTitle } from "@/components/PageTitle";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import { deleteMyAccount, exportMyData, type DeleteOutcome, type ExportOutcome } from "@/lib/account";
import { ACCOUNT_PITCH, accountSummary, signOut, signOutEverywhere, useAuth } from "@/lib/auth";
import { noteProfileErased } from "@/lib/erase-notice";
import { CANVAS, INK, MUTED, MUTED_FAINT, SPACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { FitScrollView } from "@/components/FitScrollView";

/**
 * Account (#220, #224): who is signed in, and the ways out — sign out of
 * this phone or of every device, take a copy of the account's data, or
 * delete the account. Reached from the Profile menu, so deletion is easy to
 * find (App Store Guideline 5.1.1(v)). Signed out, it explains what an
 * account is for and offers the sign-in sheet; it never blocks anything else.
 *
 * Laid out in v7's groups — who you're signed in with, your data, delete —
 * each a stone card under a caps label (v9), with its note under it. v9's
 * rows are actions, not pages, so none carries a chevron. Signed out,
 * the delete is the one Profile used to carry — erasing the skin profile,
 * shelf and history on this phone.
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

  const signedIn = status === "signed-in" && session !== null;
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <FitScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: 48 }}>
        <PageTitle title="Account" />
        {status === "loading" ? (
          <ActivityIndicator color={MUTED} accessibilityLabel="Loading" style={{ marginTop: SPACE.section }} />
        ) : signedIn && session ? (
          <SignedIn summary={accountSummary(session)} working={working} onLeave={leave} onDownload={download} />
        ) : (
          <View style={{ gap: SPACE.gutter, marginTop: SPACE.block }}>
            <Text style={{ paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{ACCOUNT_PITCH}</Text>
            <PrimaryButton
              label="Sign in"
              onPress={() => {
                setNotice(null);
                router.push({ pathname: "/sign-in", params: { from: "account" } });
              }}
            />
          </View>
        )}

        {/* A "you're signed out" line is about the moment it was shown; once
            someone signs back in it would contradict the card above it
            (#272 review). The one notice that belongs to a signed-in screen
            is the sign-out that failed. */}
        {notice && (status !== "signed-in" || SIGNED_IN_NOTICES.has(notice)) ? (
          <Text accessibilityLiveRegion="polite" style={{ marginTop: SPACE.gutter, paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 21, color: INK }}>
            {notice}
          </Text>
        ) : null}
      </FitScrollView>

      {/* The delete, as quiet words with a bin at the foot of the screen
          (owner's reference). Signed out it is the one Profile used to carry:
          erasing this phone's profile, shelf and history. What it removes is
          said in the sheet it opens. */}
      {status === "loading" ? null : (
        <Pressable
          onPress={() => (signedIn ? setConfirmingDelete(true) : setConfirmingErase(true))}
          disabled={working}
          accessibilityRole="button"
          accessibilityLabel={signedIn ? "Delete my account" : "Delete my profile"}
          accessibilityState={{ disabled: working }}
          style={{ alignSelf: "center", minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: SPACE.text, paddingHorizontal: SPACE.gutter, marginBottom: Math.max(SPACE.section, insets.bottom + SPACE.text), opacity: working ? 0.6 : 1 }}
          className="active:opacity-70"
        >
          <Ionicons name="trash-outline" size={20} color={MUTED_FAINT} />
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: MUTED_FAINT }}>{signedIn ? "Delete my account" : "Delete my profile"}</Text>
        </Pressable>
      )}

      <ConfirmSheet
        visible={confirmingDelete}
        title="Are you sure?"
        line={DELETE_WARNING}
        keepLabel="Keep my account"
        confirmLabel="Delete my account"
        busy={working}
        stacked
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void remove()}
      />
      <ConfirmSheet
        visible={confirmingErase}
        title="Are you sure?"
        line={ERASE_WARNING}
        keepLabel="Keep my profile"
        confirmLabel="Yes, delete my profile"
        stacked
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
      <SectionLabel title={`Signed in with ${summary.providers}`} first />
      <MenuGroup>
        {summary.email ? <MenuRow label="Email" value={summary.email} /> : null}
        <MenuRow label="Sign out" chevron={false} disabled={working} onPress={() => onLeave(false)} />
        <MenuRow label="Sign out on every device" chevron={false} disabled={working} onPress={() => onLeave(true)} />
      </MenuGroup>
      {summary.isHiddenEmail ? <Note>{HIDDEN_EMAIL_NOTE}</Note> : null}
      <Note>{EVERY_DEVICE_NOTE}</Note>

      <SectionLabel title="Your data" />
      <MenuGroup>
        <MenuRow label="Download my data" chevron={false} disabled={working} onPress={onDownload} />
      </MenuGroup>
      <Note>{EXPORT_EXPLAINER}</Note>
    </>
  );
}

/** A group's note under its card (v7): 13pt, secondary. */
function Note({ children }: { children: string }) {
  return <Text style={{ paddingTop: SPACE.text, paddingHorizontal: 4, fontSize: TYPE.caption, lineHeight: 18.2, color: MUTED }}>{children}</Text>;
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
