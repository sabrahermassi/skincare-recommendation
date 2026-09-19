import { CameraView, useCameraPermissions } from "expo-camera";
import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { analyseLabel } from "@/data/api";
import { coverFitCropRect, type Rect, type Size } from "@/lib/crop-to-guide";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";
import { CANVAS, CTA, INK, MUTED, withAlpha } from "@/lib/tokens";
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

export default function ScanLabel() {
  const insets = useSafeAreaInsets();
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: "framing" });
  const camera = useRef<CameraView>(null);

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
  const [cameraSize, setCameraSize] = useState<Size | null>(null);
  const [guideRect, setGuideRect] = useState<Rect | null>(null);

  function onCameraLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setCameraSize({ width, height });
  }

  function onGuideLayout(event: LayoutChangeEvent) {
    const { x, y, width, height } = event.nativeEvent.layout;
    setGuideRect({ x, y, width, height });
  }

  async function capture() {
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
      const photo = await camera.current?.takePictureAsync({
        base64: true,
        // The panel is dense small print, so resolution matters more than
        // file size — but not so much that the upload stalls on shop wifi.
        quality: 0.8,
        skipProcessing: true,
      });

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
      if (cameraSize && guideRect && photo.width && photo.height) {
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
        router.replace({
          pathname: "/result/[id]",
          params:
            barcode || !result.scanToken
              ? { id: result.product.id }
              : { id: result.product.id, offerBarcode: "1", scanToken: result.scanToken },
        });
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

  return (
    <View className="flex-1 bg-black">
      <ScreenReaderAnnouncer message={failureSpeech} />
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        onLayout={onCameraLayout}
      />

      {/* A frame, because "fill this box with the ingredients" is the single
          instruction that most improves what the OCR gets back — and, as of
          issue #16, what actually gets cropped and sent: see onGuideLayout
          and coverFitCropRect above. */}
      <View className="flex-1 items-center justify-center px-6" pointerEvents="none">
        <View
          onLayout={onGuideLayout}
          style={{ height: "38%", width: "100%", borderColor: "rgba(255,255,255,0.8)" }}
          className="rounded-card border-2"
        />
      </View>

      <View
        className="absolute inset-x-0 top-0 px-6"
        style={{ paddingTop: insets.top + 16 }}
        pointerEvents="none"
      >
        <Text className="text-center text-base font-semibold text-white">
          Fill the frame with the ingredient list
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.7)" }} className="mt-1 text-center text-sm">
          Usually the smallest print on the back. Hold steady.
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.55)" }} className="mt-3 text-center text-xs">
          The photo is sent to Google to read the text, then discarded.
        </Text>
      </View>

      <View
        style={{
          backgroundColor: "rgba(0,0,0,0.75)",
          paddingBottom: Math.max(24, insets.bottom + 12),
        }}
        className="absolute inset-x-0 bottom-0 gap-3 px-6 pt-6"
      >
        {status.kind === "failed" && (
          <View
            // Grouped so the message and its hint read as one sentence rather
            // than two fragments. The announcement itself is made by
            // `ScreenReaderAnnouncer` above — a live region on this
            // conditionally-rendered block would be silent on iOS and web.
            accessible
            accessibilityLabel={failureSpeech}
            className="gap-1"
          >
            <Text className="text-base font-semibold text-tint-peach">{status.message}</Text>
            {status.hint && (
              <Text style={{ color: "rgba(255,255,255,0.7)" }} className="text-sm">
                {status.hint}
              </Text>
            )}
          </View>
        )}

        <Pressable
          onPress={capture}
          disabled={status.kind === "reading" || cannotRetry}
          style={{
            height: 52,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 14,
            backgroundColor: status.kind === "reading" || cannotRetry ? withAlpha(CANVAS, 0.75) : CTA,
          }}
          className="active:opacity-90"
        >
          {status.kind === "reading" && <ActivityIndicator color={INK} />}
          <Text style={{ fontSize: 16, fontWeight: "600", color: INK }}>
            {status.kind === "reading"
              ? "Reading the ingredient list…"
              : cannotRetry
                ? "Not available"
                : status.kind === "failed"
                  ? "Try again"
                  : "Read the ingredients"}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} hitSlop={12} className="items-center py-1">
          <Text style={{ color: "rgba(255,255,255,0.8)" }} className="text-sm font-medium underline">
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
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
