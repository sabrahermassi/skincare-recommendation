import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";

import { Text } from "@/components/Text";
import { analyseLabel } from "@/data/api";
import { coverFitCropRect, type Rect, type Size } from "@/lib/crop-to-guide";
import { stripBase64ImageMetadata } from "@/lib/image-metadata";

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
  | { kind: "failed"; message: string; hint?: string };

export default function ScanLabel() {
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: "framing" });
  const camera = useRef<CameraView>(null);

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

    try {
      const photo = await camera.current?.takePictureAsync({
        base64: true,
        // The panel is dense small print, so resolution matters more than
        // file size — but not so much that the upload stalls on shop wifi.
        quality: 0.8,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        setStatus({ kind: "failed", message: "The camera didn't return an image." });
        return;
      }

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
        });
        return;
      }

      if (result.ok) {
        router.replace({ pathname: "/result/[id]", params: { id: result.product.id } });
        return;
      }

      setStatus({ kind: "failed", ...failureCopy(result.reason) });
    } catch {
      setStatus({
        kind: "failed",
        message: "Something went wrong reading that.",
        hint: "Try again - and check you have a connection.",
      });
    }
  }

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <Text className="text-ink-muted">Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-surface px-6">
        <Text className="text-center text-base text-ink-muted">
          We need camera access to read the ingredient list.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={{ height: 52 }}
          className="items-center justify-center rounded-control bg-accent px-6 active:bg-accent-deep"
        >
          <Text className="text-base font-semibold text-white">Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
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

      <View className="absolute inset-x-0 top-0 px-6 pt-16" pointerEvents="none">
        <Text className="text-center text-base font-semibold text-white">
          Fill the frame with the ingredient list
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.7)" }} className="mt-1 text-center text-sm">
          Usually the smallest print on the back. Hold steady.
        </Text>
      </View>

      <View
        style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
        className="absolute inset-x-0 bottom-0 gap-3 p-6"
      >
        {status.kind === "failed" && (
          <View className="gap-1">
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
          disabled={status.kind === "reading"}
          style={{
            height: 52,
            backgroundColor: status.kind === "reading" ? "rgba(255,255,255,0.4)" : undefined,
          }}
          className={`flex-row items-center justify-center gap-2 rounded-control ${
            status.kind === "reading" ? "" : "bg-white active:bg-hairline"
          }`}
        >
          {status.kind === "reading" && <ActivityIndicator color="#000" />}
          <Text className="text-base font-semibold text-ink">
            {status.kind === "reading"
              ? "Reading the label…"
              : status.kind === "failed"
                ? "Try again"
                : "Read the ingredients"}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} className="items-center py-1">
          <Text style={{ color: "rgba(255,255,255,0.8)" }} className="text-sm font-medium underline">
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Each failure gets a different next action, because they have different fixes. */
function failureCopy(reason: "not_configured" | "unreadable" | "too_little_text" | "rate_limited") {
  switch (reason) {
    case "too_little_text":
      return {
        message: "We couldn't find an ingredient list in that photo.",
        hint: "Get closer so the small print fills the frame, and avoid glare.",
      };
    case "rate_limited":
      return {
        message: "That's a lot of label reads in a short time.",
        hint: "Give it a few minutes and try again.",
      };
    case "not_configured":
      return {
        message: "Label reading isn't switched on yet.",
        hint: "The Vision API key hasn't been set on the server.",
      };
    case "unreadable":
      return {
        message: "We couldn't read that image.",
        hint: "Try again with steadier hands or better light.",
      };
  }
}
