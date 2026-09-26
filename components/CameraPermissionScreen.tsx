import type { useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Linking, Pressable } from "react-native";

import { ScanIntro } from "@/components/ScanIntro";
import { Text } from "@/components/Text";
import { scanStateCopy } from "@/lib/scan-copy";
import { MUTED, TOUCH_TARGET } from "@/lib/tokens";

// Watercolor art from the onboarding set.
const ONB2_SCAN = require("@/assets/illustrations/onboarding/onb2-scan.webp");

/**
 * The one screen asking for camera access (#204), for both scanner modes and
 * add-product's barcode step: cream, the watercolor, a serif title, one
 * sentence, one button. There were three, which said "Open camera" and "Grant
 * permission" for the same action.
 *
 * Two reasons there is no camera, and it says which: access not asked for yet
 * ("Turn on the camera"), or refused — there is no prompt left to show then,
 * so the button opens the system settings instead. Either way the Search link
 * is a way forward that needs no camera, and Photo mode adds "Choose a photo
 * instead" (`extra`).
 */
export function CameraPermissionScreen({
  permission,
  requestPermission,
  mode,
  bottomInset,
  title,
  line,
  extra,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  mode: "barcode" | "photo";
  /** Room to leave at the bottom, e.g. for the scanner's mode switcher. */
  bottomInset: number;
  /** Replaces the not-yet-asked title and sentence, for a screen whose purpose differs (add-product). */
  title?: string;
  line?: string;
  /** An alternative offered under the button when there is one (Photo mode's "choose a photo"). */
  extra?: ReactNode;
}) {
  const refused = permission?.canAskAgain === false;
  const copy = scanStateCopy({ kind: "camera-off", mode, refused });
  return (
    <ScanIntro
      illustration={ONB2_SCAN}
      title={(!refused && title) || copy.title || ""}
      body={(!refused && line) || copy.line || ""}
      actionLabel={copy.action ?? ""}
      onAction={refused ? () => void Linking.openSettings() : requestPermission}
      bottomInset={bottomInset}
    >
      {extra}
      {/* This shows at the worst moment — camera access just failed — so the
          way forward has to actually be one: underlined, a full-size target,
          and it goes to Search rather than only naming it. `dismissTo`, since
          the scanner is a modal (#313): a push would open the tabs inside it. */}
      <Pressable
        onPress={() => router.dismissTo("/browse")}
        accessibilityRole="link"
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 12 }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: 12.5, color: MUTED, textDecorationLine: "underline" }}>{copy.link}</Text>
      </Pressable>
    </ScanIntro>
  );
}
