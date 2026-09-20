import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { launchImageLibraryAsync } from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SCAN_SIDE_INSET, SCAN_TOP_GAP, ScanViewfinder, WINDOW_RADIUS, type Box } from "@/components/ScanViewfinder";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { analyseLabel } from "@/data/api";
import { coverFitCropRect, shrinkWidth, type Rect, type Size } from "@/lib/crop-to-guide";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";
import { CAMERA_STAGE, CANVAS, CTA, INK, MUTED, SELECTED, TOUCH_TARGET, TYPE, withAlpha } from "@/lib/tokens";
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
 * box the user is already holding. What we read is written back against the
 * barcode, so nobody has to do it for that product again.
 */

type Status =
  | { kind: "framing" }
  | { kind: "reading" }
  // Required, not optional: a capture failure whose retryability nobody
  // decided defaults to "retryable" by accident, which is exactly the bug
  // Codex caught on #121 — every reason but one genuinely is retryable, and
  // the one that isn't (`not_configured`) needs its caller to say so.
  | { kind: "failed"; message: string; hint?: string; retryable: boolean };

/** The widest a picked photo is sent: the ingredient text stays readable, the upload stays small. */
const LIBRARY_MAX_WIDTH = 2000;

type Props = {
  /** Handed over by whoever sent the user here after a miss; the product read is saved under it. */
  barcode?: string;
  /**
   * Whether to hold the camera. False while another screen covers this one —
   * most devices give the camera to one view at a time.
   */
  active?: boolean;
  /** Shows an X at the top-left when given. */
  onClose?: () => void;
  /** Called with the result screen's params once a photo has been read. */
  onResult: (params: { id: string; offerBarcode?: string; scanToken?: string }) => void;
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
  onResult,
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

    try {
      // A picture already on the phone skips the camera. The picker hands back
      // its own copy in cache, cleaned up below like the camera's.
      let photo;
      if (source === "library") {
        const picked = await launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
        if (picked.canceled || !picked.assets?.[0]) {
          setStatus({ kind: "framing" });
          return;
        }
        photo = picked.assets[0];
        setPreview(photo.uri);
        // Scaled down first: a full-size phone photo can be too large to send.
        const width = shrinkWidth(photo.width, LIBRARY_MAX_WIDTH);
        if (width) {
          const resized = await manipulateAsync(photo.uri, [{ resize: { width } }], {
            base64: true,
            compress: 0.8,
            format: SaveFormat.JPEG,
          });
          croppedUri = resized.uri;
          photo = { ...photo, uri: resized.uri, base64: resized.base64, width: resized.width, height: resized.height };
        }
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
          } catch {
            // Fall through with the uncropped photo — see comment above.
          }
        }
      }

      // A phone photo carries GPS coordinates, a device identifier and a
      // capture timestamp in its EXIF block, and this image is on its way to
      // Google Vision — so a home address would cross a third-party boundary
      // attached to a picture of a bottle. `skipProcessing: true` above makes
      // that worse on Android, where it hands back the raw sensor JPEG.
      // `expo-image-manipulator` re-encodes as part of cropping and could
      // reintroduce its own metadata, so this still runs unconditionally on
      // whichever image — cropped or not — is about to be sent.
      //
      // `label-ocr` strips again on ingest and that is the actual control;
      // this pass is what keeps the coordinates from leaving the handset in
      // the first place. Failing closed rather than falling back to the
      // original: an image we cannot parse is an image we should not forward.
      const clean = stripBase64ImageMetadata(imageBase64);
      if (!clean.ok) {
        setStatus({
          kind: "failed",
          message:
            clean.reason === "too_large"
              ? "That photo is too large to read."
              : "We couldn't read that image.",
          hint:
            clean.reason === "too_large"
              ? "Try again — the ingredient panel alone is enough, it doesn't need the whole box."
              : "Try again with steadier hands or better light.",
          retryable: true,
        });
        return;
      }

      const result = await analyseLabel(clean.base64, { barcode });

      // The server's "did we find enough text to try" check happens before it
      // knows whether any of that text is actually an ingredient. A photo of
      // something else entirely — a wall, a receipt, a face — can still clear
      // that bar if the OCR returns a handful of comma-separated words, and
      // this is what let a random photo through to a product screen showing
      // "Can't tell yet" instead of an honest failure: recognising literally
      // nothing is not a product, it's a label we couldn't read, and it
      // deserves the same message as one, not a page that looks like a scan
      // succeeded.
      if (result.ok && (result.total === 0 || result.recognised === 0)) {
        setStatus({
          kind: "failed",
          message: "That doesn't look like an ingredient list.",
          hint: "Make sure the ingredient panel fills the frame, then try again.",
          retryable: true,
        });
        return;
      }

      if (result.ok) {
        // No barcode was in hand for this scan — the row `label-ocr` just
        // wrote is on a grace timer and nobody else can ever find it (see
        // migration 0014 and resolve-scan). Flagging it here is what lets
        // the product screen offer the "scan the barcode too?" follow-up
        // only on the visit that just created the row, not on every later
        // visit to it. `scanToken` is threaded along too — without it
        // there is nothing safe to resolve the offer with (see
        // resolve-scan's ownership check), so the product screen treats a
        // missing token the same as no offer at all.
        onResult(
          barcode || !result.scanToken
            ? { id: result.product.id }
            : { id: result.product.id, offerBarcode: "1", scanToken: result.scanToken }
        );
        return;
      }

      setStatus({ kind: "failed", ...failureCopy(result.reason, !!barcode) });
    } catch {
      setStatus({
        kind: "failed",
        message: "Something went wrong reading that.",
        hint: "Try again - and check you have a connection.",
        retryable: true,
      });
    } finally {
      setPreview(null);
      deleteTempFile(capturedUri);
      deleteTempFile(croppedUri);
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
        <Pressable
          onPress={requestPermission}
          style={{
            height: 52,
            paddingHorizontal: 24,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 14,
            backgroundColor: CTA,
          }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: INK }}>Grant permission</Text>
        </Pressable>
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

      {/* A picture from the library, in the frame while it is read. */}
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

/**
 * Remove a temp photo file from cache once `capture()` no longer needs it —
 * see issue #27. Best-effort: a file the OS will eventually reclaim from
 * cache on its own is a smaller problem than a cleanup step throwing and
 * masking the scan result the user is already looking at.
 *
 * The `file://` guard isn't just defensive — `CameraCapturedPicture.uri`'s
 * own doc comment says web has no filesystem and returns the base64 string
 * as `uri` instead, so this is a correct, self-documented no-op there rather
 * than something that happens to survive by falling into the `catch`.
 */
function deleteTempFile(uri: string | undefined) {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to do — see above.
  }
}

/**
 * Each failure gets a different next action, because they have different
 * fixes.
 *
 * `hasBarcode` is whoever navigated here having already handed one over —
 * from a catalogue miss (`(tabs)/index.tsx`), a recorded miss in Saved, or a
 * recognised product with no formula yet (`product/[id].tsx`). In all three,
 * the barcode already ran and either missed or led here; telling that user
 * to "try the barcode" sends them straight back through the same loop. Only
 * the bare "photograph a label" entry point (no barcode in hand at all) can
 * usefully be pointed at it. Found in review on #121.
 */
function failureCopy(
  reason: "not_configured" | "server_unavailable" | "unreadable" | "too_little_text" | "rate_limited",
  hasBarcode: boolean,
) {
  switch (reason) {
    case "too_little_text":
      return {
        message: "We couldn't find an ingredient list in that photo.",
        hint: "Get closer so the small print fills the frame, and avoid glare.",
        retryable: true,
      };
    case "rate_limited":
      return {
        message: "That's a lot of ingredient photos in a short time.",
        hint: "Give it a few minutes and try again.",
        retryable: true,
      };
    case "not_configured":
      // This install has no Supabase credentials at all — see
      // `LabelAnalysis`'s comment in `data/api.ts`. Permanent for this
      // build, so no "temporarily", no "try again", and — per Codex's next
      // finding on #121 — no retry button either: retaking the photo would
      // run the exact same check and fail the exact same way.
      console.warn("[scan-label] label-ocr not available: this app has no Supabase credentials configured");
      return {
        message: "Reading ingredient lists isn't available in this build.",
        hint: hasBarcode
          ? "Look the product up in Browse instead."
          : "Try the barcode instead, or look the product up in Browse.",
        retryable: false,
      };
    case "server_unavailable":
      // The server answered 503 because its Vision API key is unset — an
      // ops problem, genuinely temporary and worth retrying later, unlike
      // `not_configured` above. Kept out of the user-facing copy per #96.
      console.warn("[scan-label] label-ocr unavailable: server's Vision API key is unset");
      return {
        message: "Reading ingredient lists is temporarily unavailable.",
        hint: hasBarcode
          ? "Look the product up in Browse, or try again later."
          : "Try the barcode instead, or look the product up in Browse.",
        retryable: true,
      };
    case "unreadable":
      return {
        message: "We couldn't read that image.",
        hint: "Try again with steadier hands or better light.",
        retryable: true,
      };
  }
}
