import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { INK, MUTED, TYPE } from "@/lib/tokens";

/**
 * The scanner's two "before the camera" screens — asking for camera access, and
 * the Label photo entry — as one light, illustrated screen. They used to be
 * a dark box with small grey text and a yellow pill, which was the first thing
 * a new user saw and looked nothing like the rest of the app.
 *
 * Sits on the app's cream canvas (the caller paints it) with the watercolor art
 * from the onboarding set, a serif title, one sentence, and one button.
 * `bottomInset` is how much room to leave for the floating mode switcher.
 */
export function ScanIntro({
  illustration,
  title,
  body,
  actionLabel,
  onAction,
  bottomInset,
  children,
}: {
  illustration: number;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  bottomInset: number;
  /** A quiet secondary option under the button. */
  children?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center", paddingHorizontal: 32, paddingBottom: bottomInset }}>
      <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}>
        <Image
          source={illustration}
          style={{ width: "100%", maxWidth: 340, aspectRatio: 1 }}
          contentFit="contain"
          accessibilityLabel=""
        />
      </View>

      <View style={{ width: "100%", alignItems: "center", gap: 10 }}>
        <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, color: INK }}>
          {title}
        </Text>
        <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>{body}</Text>
        <View style={{ width: "100%", marginTop: 8 }}>
          <PrimaryButton size={56} label={actionLabel} onPress={onAction} />
        </View>
        {children}
      </View>
    </View>
  );
}
