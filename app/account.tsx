import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { ACCOUNT_PITCH, accountSummary, signOut, signOutEverywhere, useAuth } from "@/lib/auth";
import { CANVAS, CARD_SHADOW, INK, MUTED, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * Account (#220): who is signed in, and the ways out — sign out of this
 * phone, or of every device. Reached from the Profile menu. Signed out, it
 * explains what an account is for and offers the sign-in sheet; it never
 * blocks anything else.
 */
export default function Account() {
  const status = useAuth((s) => s.status);
  const session = useAuth((s) => s.session);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
          <SignedIn summary={accountSummary(session)} working={working} onLeave={leave} />
        ) : (
          <>
            <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>
              {ACCOUNT_PITCH}
            </Text>
            <PrimaryButton tone="cta" size={52} label="Sign in" onPress={() => router.push("/sign-in")} />
          </>
        )}

        {notice ? (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 13.5, lineHeight: 20, color: INK }}>
            {notice}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SignedIn({
  summary,
  working,
  onLeave,
}: {
  summary: ReturnType<typeof accountSummary>;
  working: boolean;
  onLeave: (everywhere: boolean) => void;
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
    </>
  );
}

/** Exported for the tests. */
export const HIDDEN_EMAIL_NOTE =
  "This is the address Apple made with Hide My Email. It forwards to your own inbox.";
export const SIGNED_OUT_EVERYWHERE = "You're signed out on every device.";
export const SIGN_OUT_FAILED = "We couldn't sign you out on this phone. Restart the app and try again.";
export const SIGNED_OUT_HERE_ONLY =
  "You're signed out on this phone, but we couldn't reach our servers to sign out your other devices. Sign in and try again when you have a signal.";
