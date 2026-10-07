import { Image } from "expo-image";
import type { ReactNode } from "react";
import { View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { DISPLAY_FONT, INK, MUTED, SPACE, TYPE, LEADING, TRACKING } from "@/lib/tokens";
import { noOrphan } from "@/lib/text";

/**
 * The scanner's two "before the camera" screens — asking for camera access, and
 * the Label photo entry — as one light, illustrated screen. They used to be
 * a dark box with small grey text and a yellow pill, which was the first thing
 * a new user saw and looked nothing like the rest of the app.
 *
 * Sits on the app's white canvas (the caller paints it) with the watercolor art
 * from the onboarding set, a serif title, one sentence, and the full-width
 * button at the bottom (v9). `topInset` leaves room for the scanner's top row.
 */
export function ScanIntro({
  illustration,
  title,
  body,
  actionLabel,
  onAction,
  topInset,
  bottomInset,
  children,
}: {
  illustration: number;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  /** Room to leave at the top, for the scanner's top row. */
  topInset: number;
  bottomInset: number;
  /** A quiet secondary option under the button. */
  children?: ReactNode;
}) {
  return (
    <View style={{ flex: 1, paddingTop: topInset, paddingBottom: bottomInset }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Image source={illustration} style={{ width: ART_SIZE, height: ART_SIZE }} contentFit="contain" accessibilityLabel="" />
        <Text
          accessibilityRole="header"
          style={{ marginTop: SPACE.block, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}
        >
          {noOrphan(title)}
        </Text>
        <Text style={{ marginTop: SPACE.text, maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{noOrphan(body)}</Text>
        {children ? <View style={{ marginTop: SPACE.block, alignItems: "center" }}>{children}</View> : null}
      </View>
      <View style={{ paddingHorizontal: SPACE.gutter }}>
        <PrimaryButton label={actionLabel} onPress={onAction} />
      </View>
    </View>
  );
}

// The illustration's box (v9).
const ART_SIZE = 220;
