import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Text } from "@/components/Text";
import {
  ACCOUNT_PITCH,
  isAppleSignInAvailable,
  isGoogleSignInConfigured,
  signInFailureCopy,
  signInWithApple,
  signInWithGoogle,
  useAuth,
  type Provider,
  type SignInResult,
} from "@/lib/auth";
import { completePendingSave, dropPendingSave } from "@/lib/save-gate";
import { CANVAS, INK, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/** The same height as the app's own detail-screen buttons (`PrimaryButton` size 52). */
const APPLE_BUTTON_HEIGHT = 52;

/**
 * The sign-in sheet (#220): Sign in with Apple and Sign in with Google, and
 * nothing else — no form, no password, no email to type (#217). Reached only
 * from the Save prompt (#221) and the account screen; there is no sign-in wall
 * anywhere else.
 *
 * Closing the provider's own sheet is someone changing their mind, not an
 * error, so it leaves this screen exactly as it was. A real failure gets one
 * honest line under the buttons.
 */
export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // A sign-in can finish after the sheet has already been closed ("Not now",
  // or a swipe down). Going back then would pop whatever screen is under it
  // (#272 review), so navigation only happens while the sheet is still up.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void isAppleSignInAvailable().then((available) => {
      if (!cancelled) setAppleAvailable(available);
    });
    return () => {
      cancelled = true;
      mounted.current = false;
      // Closed without signing in: the save that opened this sheet is dropped
      // (#221). After a sign-in it has already run, so this does nothing.
      dropPendingSave();
    };
  }, []);

  // Signed in — by a button here, or by a stored session that finished
  // loading after a Save tap opened this sheet. Either way the save the
  // person asked for happens now, and the sheet gets out of the way.
  const status = useAuth((s) => s.status);
  useEffect(() => {
    if (status !== "signed-in") return;
    completePendingSave();
    router.back();
  }, [status]);

  const signIn = async (provider: Provider) => {
    if (busy) return;
    setBusy(provider);
    setFailure(null);
    const result: SignInResult = provider === "apple" ? await signInWithApple() : await signInWithGoogle();
    if (!mounted.current) return;
    setBusy(null);
    // Success needs nothing here: the session arrives through `useAuth`, and
    // the effect above closes the sheet.
    if (result.ok) return;
    if (result.reason === "failed") {
      setFailure(signInFailureCopy(result.kind, provider));
    } else if (result.reason === "unavailable") {
      setFailure(UNAVAILABLE);
    }
  };

  const anyProvider = appleAvailable || isGoogleSignInConfigured;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 28, paddingBottom: insets.bottom + 32, gap: 18 }}>
        <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 26, color: INK }}>Keep your shelf</Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>
          {ACCOUNT_PITCH}
        </Text>

        <View style={{ gap: 12, paddingTop: 8, alignItems: "center" }}>
          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={APPLE_BUTTON_HEIGHT / 2}
              style={{ width: "100%", height: APPLE_BUTTON_HEIGHT }}
              onPress={() => void signIn("apple")}
            />
          ) : null}
          {isGoogleSignInConfigured ? (
            <GoogleSignInButton disabled={busy !== null} onPress={() => void signIn("google")} />
          ) : null}
          {busy ? <ActivityIndicator color={MUTED} accessibilityLabel="Signing in" /> : null}
        </View>

        {failure ? (
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 13.5, lineHeight: 20, color: INK }}>
            {failure}
          </Text>
        ) : null}

        {anyProvider ? (
          <Text style={{ fontSize: 13, lineHeight: 19, color: MUTED }}>{HIDE_MY_EMAIL_NOTE}</Text>
        ) : (
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: MUTED }}>{UNAVAILABLE}</Text>
        )}

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={{ minHeight: TOUCH_TARGET, alignSelf: "center", justifyContent: "center", paddingHorizontal: 16 }}
        >
          <Text style={{ fontSize: 14.5, fontWeight: "600", color: INK }}>Not now</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * Apple and Google accounts that share a verified email become one account
 * (docs/decisions.md, "Accounts"). Hide My Email is the one way the same
 * person ends up with two, so the sheet says so before it happens rather than
 * after they find an empty shelf. Exported for the tests.
 */
export const HIDE_MY_EMAIL_NOTE =
  "If you choose Hide My Email with Apple, that account stays separate from any Google one.";

/** Web, Expo Go without the Google module, or a build with no sign-in set up. */
export const UNAVAILABLE = "Signing in works in the for.me app on iPhone.";
