import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChoosePhotoInstead } from "@/components/ChoosePhotoInstead";
import { SCAN_SIDE_INSET, SCAN_TOP_GAP, ScanViewfinder, WINDOW_RADIUS, type Box } from "@/components/ScanViewfinder";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { coverFitCropRect, shrinkWidth, type Rect, type Size } from "@/lib/crop-to-guide";
import { deleteTempFile, LIBRARY_MAX_WIDTH, pickLabelPhoto } from "@/lib/pick-label-photo";
import { readLabelPhoto } from "@/lib/read-label-photo";
import { CAMERA_STAGE, CANVAS, INK, MUTED, SELECTED, TOUCH_TARGET, TYPE, withAlpha } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// The design system (design/DESIGN_SYSTEM.md). The live camera view stays plain
// black, same reasoning as the scanner's own dark stage — only the
// surrounding light-surface chrome (permission screens, the shutter button)
// moves to this system.

/**
 * Photograph the ingredient list.
 *
 * This is the tier that makes scanning viable at all. Open Beauty Facts holds
 * 37 products tagged South Korea against a market of 10,000+ SKUs, so a
 * barcode alone misses nearly everything — but the formula is printed on the
 * box the user is already holding. Reading stores nothing: the list is handed
 * on to the add-product screen, which saves it with the barcode and a name so
 * nobody has to do it for that product again.
 */

type Status =
  | { kind: "framing" }
  | { kind: "reading" }
  // Required, not optional: a capture failure whose retryability nobody
  // decided defaults to "retryable" by accident, which is exactly the bug
  // Codex caught on #121 — every reason but one genuinely is retryable, and
  // the one that isn't (`not_configured`) needs its caller to say so.
  | { kind: "failed"; message: string; hint?: string; retryable: boolean };

type Props = {
  /** Handed over by whoever sent the user here after a miss; the list read is added under it. */
  barcode?: string;
  /**
   * Whether to hold the camera. False while another screen covers this one —
   * most devices give the camera to one view at a time.
   */
  active?: boolean;
  /** Shows an X at the top-left when given. */
  onClose?: () => void;
  /** Called once a photo has been read and its list is being held for the add-product screen. */
  onRead: () => void;
  /** Room to leave clear at the bottom, e.g. for the scanner's mode switcher. */
  bottomInset?: number;
  /** How far below the safe area the frame starts, to clear whatever sits across the top. */
  frameTopOffset?: number;
  /**
   * When the scanner screen owns the camera and the frame (so Barcode and Photo
   * share them and a switch is seamless), it hands them in: this then draws only
   * the instruction, the shutter and the reading, and crops to `window` using
   * `cameraSize`. Without them this is a screen of its own (the /scan-label
   * route) and draws its own.
   */
  camera?: RefObject<CameraView | null>;
  cameraSize?: Size | null;
  window?: Box | null;
};

export function LabelCamera({
  barcode,
  active = true,
  onClose,
  onRead,
  bottomInset,
  frameTopOffset,
  camera: externalCamera,
  cameraSize: externalCameraSize,
  window: externalWindow,
}: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: "framing" });
  // The picture chosen from the library, shown in the frame while it is read.
  const [preview, setPreview] = useState<string | null>(null);
  const ownCamera = useRef<CameraView>(null);
  const camera = externalCamera ?? ownCamera;

  // Reaching this screen at all — from "Label photo" mode, a barcode miss, a
  // formula-less product, or Saved's recorded miss — is a scan starting the
  // same way a barcode read is, and (tabs)/index.tsx only clears the
  // just-finished-the-quiz banner from its own barcode path. Without this,
  // finishing the quiz and going straight to Label photo left the banner set
  // for the rest of the session, resurfacing stale the next time Barcode mode
  // was visible. One mount-time clear here covers every entry point instead
  // of patching each launcher. Found by Codex in review on #126.
  const dismissQuizAcknowledgement = useAppStore((s) => s.dismissQuizAcknowledgement);
  useEffect(() => {
    dismissQuizAcknowledgement();
  }, [dismissQuizAcknowledgement]);

  // Measured via onLayout rather than `Dimensions.get('window')`: this route
  // is presented as a modal (`app/_layout.tsx`) and whether that costs any
  // vertical space to a header is not something worth depending on. Both are
  // populated well before `capture()` can run (the shutter button doesn't
  // exist until this view has already rendered once), so a missing
  // measurement here only ever means "layout hasn't happened yet" and is
  // handled by falling back to the uncropped photo, never by guessing.
  const [ownCameraSize, setCameraSize] = useState<Size | null>(null);
  const [ownGuideRect, setGuideRect] = useState<Rect | null>(null);
  const cameraSize = externalCameraSize ?? ownCameraSize;
  const guideRect = externalWindow ?? ownGuideRect;
  // What gets cropped and sent is exactly the frame that is drawn (issue #16).
  // Declared up here, before the permission screens return early, so the hooks
  // run in the same order on every render.
  const onWindow = useCallback((box: Box) => setGuideRect(box), []);

  function onCameraLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setCameraSize({ width, height });
  }

  async function capture(source: "camera" | "library" = "camera") {
    if (status.kind === "reading") return;
    setStatus({ kind: "reading" });

    // Both files, once they exist, are deleted in `finally` below regardless
    // of how this function exits. iOS gives a freshly-created file
    // NSFileProtectionCompleteUntilFirstUserAuthentication by default (no
    // entitlement needed) and Android's cache directory is encrypted at rest
    // via File-Based Encryption since API 29 — reasonable against a
    // powered-off device, but neither is a reason to let a photographed
    // ingredient label sit in cache indefinitely. Community experience with
    // this exact library confirms neither file is cleaned up on its own. See
    // issue #27.
    let capturedUri: string | undefined;
    let croppedUri: string | undefined;
    let resizedUri: string | undefined;
    // The picker's copies of a chosen picture, which stay behind when it is shrunk.
    let releasePick: (() => void) | undefined;

    try {
      // A picture already on the phone skips the camera. The picker hands back
      // its own copy in cache, cleaned up below like the camera's.
      let photo: { uri: string; base64?: string; width?: number; height?: number } | undefined;
      if (source === "library") {
        const picked = await pickLabelPhoto();
        if (!picked) {
          setStatus({ kind: "framing" });
          return;
        }
        releasePick = picked.cleanup;
        setPreview(picked.previewUri);
        photo = { uri: picked.previewUri, base64: picked.base64 };
      } else {
        photo = await camera.current?.takePictureAsync({
          base64: true,
          // The panel is dense small print, so resolution matters more than
          // file size — but not so much that the upload stalls on shop wifi.
          quality: 0.8,
          skipProcessing: true,
        });
      }

      if (!photo?.base64) {
        setStatus({ kind: "failed", message: "The camera didn't return an image.", retryable: true });
        return;
      }
      capturedUri = photo.uri;
      // Freeze the viewfinder on the captured frame while it's read — the
      // library path already does this via `preview` above.
      if (source === "camera") setPreview(photo.uri);

      // Crop to the on-screen guide box before anything leaves the device.
      // Until this existed, the box drawn below was decoration only —
      // takePictureAsync returns the full sensor frame regardless of what's
      // drawn over it, so whatever sat around the bottle (a hand, a shelf,
      // the rest of the room) was sent to Google Vision along with the
      // label. See issue #16: "send the minimum."
      //
      // The camera preview fills its container the way CSS `background-size:
      // cover` does — scaled up and clipped, not stretched — so the guide
      // box's on-screen position has to be mapped through that same
      // transform to land on the right pixels of the actual photo, which
      // `coverFitCropRect` does. A failure here (a manipulation error, or a
      // layout measurement that hasn't landed yet) falls back to the
      // uncropped photo rather than blocking the scan — this is a privacy
      // improvement layered on top of the server-side controls in
      // `label-ocr`, not a replacement for them, so losing it for one scan
      // is not a correctness problem.
      let imageBase64 = photo.base64;
      let imageWidth = photo.width;
      // A picked picture is already the user's own framing: no guide box to crop to.
      if (source === "camera" && cameraSize && guideRect && photo.width && photo.height) {
        const crop = coverFitCropRect(cameraSize, { width: photo.width, height: photo.height }, guideRect);
        if (crop) {
          try {
            const cropped = await manipulateAsync(photo.uri, [{ crop }], {
              base64: true,
              compress: 0.8,
              format: SaveFormat.JPEG,
            });
            croppedUri = cropped.uri;
            if (cropped.base64) imageBase64 = cropped.base64;
            imageWidth = cropped.width;
            // Swap the frozen frame to what's actually inside the guide
            // window — the raw sensor frame set at capture is a much wider
            // field of view, so leaving it in place made the window look
            // like it zoomed out the moment the shutter was pressed.
            setPreview(cropped.uri);
          } catch {
            // Fall through with the uncropped photo — see comment above. It's
            // the largest one there is, so it still needs the resize below.
          }
        }
      }

      // `takePictureAsync` never resizes, unlike the library pick — a 48–50 MP
      // sensor lands well past `MAX_IMAGE_CHARS` (`label-ocr:53`), which reads
      // to the user as an unreadable photo (#188). Shares `LIBRARY_MAX_WIDTH`
      // and `shrinkWidth` with the library path so the two caps cannot drift.
      // Runs on the cropped photo when cropping succeeded, and on the
      // uncropped fall-through above when it didn't — whichever is largest.
      if (source === "camera" && imageWidth) {
        const width = shrinkWidth(imageWidth, LIBRARY_MAX_WIDTH);
        if (width) {
          try {
            const resized = await manipulateAsync(croppedUri ?? photo.uri, [{ resize: { width } }], {
              base64: true,
              compress: 0.8,
              format: SaveFormat.JPEG,
            });
            resizedUri = resized.uri;
            if (resized.base64) imageBase64 = resized.base64;
          } catch {
            // Send what we already have rather than block the scan on a
            // resize failure — the crop's own fallback above takes the same
            // approach.
          }
        }
      }

      const outcome = await readLabelPhoto(imageBase64, barcode);
      if (outcome.kind === "read") {
        // Back to the ready camera before leaving: this screen stays mounted under
        // the next one, so swiping back must find a camera to use, not "Reading…".
        setStatus({ kind: "framing" });
        onRead();
        return;
      }
      setStatus({ kind: "failed", message: outcome.message, hint: outcome.hint, retryable: outcome.retryable });
    } catch {
      setStatus({
        kind: "failed",
        message: "Something went wrong reading that.",
        hint: "Try again - and check you have a connection.",
        retryable: true,
      });
    } finally {
      setPreview(null);
      releasePick?.();
      deleteTempFile(capturedUri);
      deleteTempFile(croppedUri);
      deleteTempFile(resizedUri);
    }
  }

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <Text style={{ color: MUTED }}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          paddingHorizontal: 24,
          backgroundColor: CANVAS,
        }}
      >
        <Text style={{ textAlign: "center", fontSize: 16, color: MUTED }}>
          We need camera access to read the ingredient list. To do that we
          send the photo to Google Cloud Vision — we crop to the frame first,
          strip location data, and never store the image.
        </Text>
        <PrimaryButton
          tone="cta"
          size={52}
          label="Grant permission"
          // Once the system will not ask again, asking does nothing: send them to
          // settings, where the camera can be turned back on.
          onPress={permission.canAskAgain === false ? () => void Linking.openSettings() : requestPermission}
        />
        {/* Reading a chosen picture needs no camera, so this is not a dead end. */}
        <ChoosePhotoInstead barcode={barcode} onRead={onRead} />
      </View>
    );
  }

  // What a screen reader is told, per state. The failure case is the one that
  // matters: the button below re-labels itself to "Try again", so focus
  // sitting on it may re-announce that much, but the *reason* was never
  // spoken — and the reason is the value here, since the hints say what to do
  // differently ("the ingredient panel alone is enough"). Without it the
  // retry is a guess that fails the same way.
  const failureSpeech =
    status.kind === "failed"
      ? status.hint
        ? `${status.message} ${status.hint}`
        : status.message
      : status.kind === "reading"
        ? "Reading the ingredient list."
        : "";

  // A `failed` status whose reason isn't retryable (`not_configured` — see
  // `failureCopy`) disables the capture button rather than offering "Try
  // again": retaking the photo re-runs the exact same check against the
  // exact same missing configuration and fails the exact same way every
  // time. Found in review on #121.
  const cannotRetry = status.kind === "failed" && !status.retryable;

  const clearance = bottomInset ?? Math.max(24, insets.bottom + 12);
  // With an X across the top the frame sits a little lower to clear it.
  const frameTopInset = insets.top + (frameTopOffset ?? (onClose ? 32 : 0));

  return (
    <View style={{ flex: 1, backgroundColor: externalCamera ? "transparent" : CAMERA_STAGE }}>
      <ScreenReaderAnnouncer message={failureSpeech} />
      {!externalCamera && active ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          onLayout={onCameraLayout}
        />
      ) : null}

      {/* The same window the barcode scanner draws, so switching modes does not
          move it. "Fill this box with the ingredients" is the single
          instruction that most improves what the OCR gets back, and the box is
          what actually gets cropped and sent: see onWindow and coverFitCropRect
          above. */}
      {externalCamera ? null : (
        <ScanViewfinder
          topInset={frameTopInset}
          bottomInset={clearance}
          locked={false}
          frame="full"
          sweep={false}
          description={null}
          onWindow={onWindow}
        />
      )}

      {/* The captured or picked photo, frozen in the frame while it is read —
          otherwise the live camera view keeps moving under a photo that has
          already been taken. */}
      {preview && guideRect ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: guideRect.x,
            top: guideRect.y,
            width: guideRect.width,
            height: guideRect.height,
            borderRadius: WINDOW_RADIUS,
            overflow: "hidden",
            backgroundColor: CAMERA_STAGE,
            borderWidth: 2,
            borderColor: CANVAS,
          }}
        >
          <Image source={{ uri: preview }} contentFit="contain" accessibilityLabel="" style={{ flex: 1 }} />
          <View style={{ ...StyleSheet.absoluteFill, backgroundColor: withAlpha(CAMERA_STAGE, 0.4) }} />
        </View>
      ) : null}

      {onClose ? (
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{
            position: "absolute",
            left: 16,
            top: insets.top + 8,
            width: TOUCH_TARGET,
            height: TOUCH_TARGET,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="close" size={26} color={CANVAS} />
        </Pressable>
      ) : null}

      {/* The instruction, inside the frame at its top. */}
      {status.kind === "framing" ? (
        <FadeIn
          style={{
            position: "absolute",
            left: SCAN_SIDE_INSET + 12,
            right: SCAN_SIDE_INSET + 12,
            top: frameTopInset + SCAN_TOP_GAP + 14,
            alignItems: "center",
          }}
        >
          <View
            style={{
              alignItems: "center",
              gap: 2,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 18,
              backgroundColor: withAlpha(CANVAS, 0.95),
            }}
          >
            <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK }}>
              Fill the frame with the ingredient list
            </Text>
            <Text style={{ textAlign: "center", fontSize: 11, color: MUTED }}>
              Hold steady. The photo is sent to Google to read the text, then discarded.
            </Text>
          </View>
        </FadeIn>
      ) : null}

      {/* The shutter, inside the frame at its bottom, with what it is doing above it. */}
      <FadeIn
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: clearance + 20,
          alignItems: "center",
          gap: 12,
          paddingHorizontal: SCAN_SIDE_INSET + 12,
        }}
      >
        {status.kind === "failed" ? (
          // Grouped so the message and its hint read as one sentence rather
          // than two fragments. The announcement itself is made by
          // `ScreenReaderAnnouncer` above — a live region on this
          // conditionally-rendered block would be silent on iOS and web.
          <View accessible accessibilityLabel={failureSpeech} style={{ alignItems: "center", gap: 2 }}>
            <Text style={{ textAlign: "center", fontSize: 15, fontWeight: "600", color: SELECTED }}>
              {status.message}
            </Text>
            {status.hint ? (
              <Text style={{ textAlign: "center", fontSize: TYPE.label - 1, color: withAlpha(CANVAS, 0.8) }}>
                {status.hint}
              </Text>
            ) : null}
          </View>
        ) : status.kind === "reading" ? (
          <Text style={{ fontSize: 15, fontWeight: "600", color: CANVAS }}>Reading the ingredient list…</Text>
        ) : null}

        <View style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
        <Pressable
          onPress={() => capture("library")}
          disabled={status.kind === "reading" || cannotRetry}
          accessibilityRole="button"
          accessibilityLabel="Choose a photo of the ingredient list from your library"
          style={{
            position: "absolute",
            left: 8,
            width: TOUCH_TARGET,
            height: TOUCH_TARGET,
            alignItems: "center",
            justifyContent: "center",
          }}
          className="active:opacity-80"
        >
          <Ionicons name="images-outline" size={26} color={status.kind === "reading" || cannotRetry ? withAlpha(CANVAS, 0.4) : CANVAS} />
        </Pressable>
        <Pressable
          onPress={() => capture()}
          disabled={status.kind === "reading" || cannotRetry}
          accessibilityRole="button"
          accessibilityLabel={status.kind === "failed" ? "Try again" : "Take a photo of the ingredient list"}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            borderWidth: 4,
            borderColor: cannotRetry ? withAlpha(CANVAS, 0.4) : CANVAS,
            alignItems: "center",
            justifyContent: "center",
          }}
          className="active:opacity-80"
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: cannotRetry ? withAlpha(CANVAS, 0.4) : CANVAS,
            }}
          >
            {status.kind === "reading" ? <ActivityIndicator color={INK} /> : null}
          </View>
        </Pressable>
        </View>
      </FadeIn>
    </View>
  );
}

/** Eases its children in when it mounts, so switching to Photo does not pop. */
function FadeIn({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
