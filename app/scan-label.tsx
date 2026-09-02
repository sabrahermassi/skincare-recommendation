import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Text";
import { analyseLabel } from "@/data/api";

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

      const result = await analyseLabel(photo.base64, { barcode });

      if (result.ok) {
        router.replace({ pathname: "/result/[id]", params: { id: result.product.id } });
        return;
      }

      setStatus({ kind: "failed", ...failureCopy(result.reason) });
    } catch {
      setStatus({
        kind: "failed",
        message: "Something went wrong reading that.",
        hint: "Try again — and check you have a connection.",
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
          className="rounded-control bg-accent px-6 py-3 active:bg-accent-deep"
        >
          <Text className="text-base font-semibold text-white">Grant permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" />

      {/* A frame, because "fill this box with the ingredients" is the single
          instruction that most improves what the OCR gets back. */}
      <View className="flex-1 items-center justify-center px-6" pointerEvents="none">
        <View className="h-[38%] w-full rounded-card border-2 border-white/80" />
      </View>

      <View className="absolute inset-x-0 top-0 px-6 pt-16" pointerEvents="none">
        <Text className="text-center text-base font-semibold text-white">
          Fill the frame with the ingredient list
        </Text>
        <Text className="mt-1 text-center text-sm text-white/70">
          Usually the smallest print on the back. Hold steady.
        </Text>
      </View>

      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/75 p-6">
        {status.kind === "failed" && (
          <View className="gap-1">
            <Text className="text-base font-semibold text-tint-peach">{status.message}</Text>
            {status.hint && <Text className="text-sm text-white/70">{status.hint}</Text>}
          </View>
        )}

        <Pressable
          onPress={capture}
          disabled={status.kind === "reading"}
          className={`h-[52px] flex-row items-center justify-center gap-2 rounded-control ${
            status.kind === "reading" ? "bg-white/40" : "bg-white active:bg-hairline"
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
          <Text className="text-sm font-medium text-white/80 underline">Cancel</Text>
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
