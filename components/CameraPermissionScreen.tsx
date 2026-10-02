import type { useCameraPermissions } from "expo-camera";
import type { ReactNode } from "react";
import { Linking } from "react-native";

import { ScanIntro } from "@/components/ScanIntro";
import { scanStateCopy } from "@/lib/scan-copy";

// A camera with an unlocked padlock (new-watercolor/camera_permission_transparent.png).
const CAMERA_ART = require("@/assets/illustrations/camera-permission.webp");

/**
 * The one screen asking for camera access (#204), for both scanner modes:
 * white, the watercolor, a serif title, one sentence, one button. There were three, which said "Open camera" and "Grant
 * permission" for the same action.
 *
 * Two reasons there is no camera, and it says which: access not asked for yet
 * ("Turn on the camera"), or refused — there is no prompt left to show then,
 * so the button opens the system settings instead. Photo mode adds "Choose a
 * photo instead" (`extra`), the way forward that needs no camera.
 */
export function CameraPermissionScreen({
  permission,
  requestPermission,
  mode,
  topInset,
  bottomInset,
  extra,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  mode: "barcode" | "photo";
  /** Room to leave at the top, for the scanner's top row. */
  topInset: number;
  /** Room to leave at the bottom, clear of the home indicator. */
  bottomInset: number;
  /** An alternative offered under the button when there is one (Photo mode's "choose a photo"). */
  extra?: ReactNode;
}) {
  const refused = permission?.canAskAgain === false;
  const copy = scanStateCopy({ kind: "camera-off", mode, refused });
  return (
    <ScanIntro
      illustration={CAMERA_ART}
      title={copy.title ?? ""}
      body={copy.line ?? ""}
      actionLabel={copy.action ?? ""}
      onAction={refused ? () => void Linking.openSettings() : requestPermission}
      topInset={topInset}
      bottomInset={bottomInset}
    >
      {extra}
    </ScanIntro>
  );
}
