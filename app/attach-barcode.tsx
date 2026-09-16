import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { attachBarcodeToScan } from "@/data/api";
import { CAMERA_STAGE, CANVAS, CTA, INK, MUTED } from "@/lib/tokens";

/**
 * The "Scan barcode" half of `BarcodeOfferPrompt` — a single-purpose camera,
 * not a smaller copy of the main scanner. No label-photo mode, no mode
 * switcher: there is exactly one thing to do here, attach a barcode to the
 * product this screen was pushed for.
 *
 * Same barcode formats `app/(tabs)/index.tsx` scans for — kept in step
 * deliberately, since a code this screen fails to recognise but the main
 * scanner would have is a worse experience than either screen having its
 * own list quietly drift from the other's.
 */
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "qr", "code128"] as const;

type Status =
  | { kind: "idle" }
  | { kind: "attaching"; code: string }
  | { kind: "failed"; message: string; hint?: string };

export default function AttachBarcode() {
  const insets = useSafeAreaInsets();
  const { productId, scanToken } = useLocalSearchParams<{ productId: string; scanToken: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = useRef(false);

  async function onBarcode(code: string) {
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: "attaching", code });

    const result = await attachBarcodeToScan(productId, code, scanToken);
    if (result.ok) {
      // Replace — `BarcodeOfferPrompt` already replaced the stale
      // `offerBarcode` screen with this one rather than pushing on top of
      // it (see that component's own comment on why), so there is nothing
      // left underneath to worry about landing back on.
      router.replace({ pathname: "/product/[id]", params: { id: productId } });
      return;
    }

    busy.current = false;
    if (result.reason === "barcode_taken") {
      setStatus({
        kind: "failed",
        message: "That barcode is already linked to another product.",
        hint: "Double-check it's the right bottle, or try a different code.",
      });
      return;
    }
    if (result.reason === "not_found") {
      // The grace timer beat the user to it, or "No thanks" was already
      // tapped elsewhere (e.g. another tab) — either way there is nothing
      // left to attach to.
      setStatus({
        kind: "failed",
        message: "This scan is no longer available to update.",
      });
      return;
    }
    setStatus({
      kind: "failed",
      message: "Couldn't save that just now.",
      hint: "Check your connection and try again.",
    });
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
          We need camera access to scan the barcode.
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

  const live = status.kind === "idle";
  const announcement =
    status.kind === "attaching"
      ? "Barcode found. Saving."
      : status.kind === "failed"
        ? status.hint
          ? `${status.message} ${status.hint}`
          : status.message
        : "";

  return (
    <View style={{ flex: 1, backgroundColor: CAMERA_STAGE }}>
      <ScreenReaderAnnouncer message={announcement} />
      {live && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={({ data }) => onBarcode(data)}
        />
      )}

      <View
        className="absolute inset-x-0 top-0 px-6"
        style={{ paddingTop: insets.top + 16 }}
        pointerEvents="none"
      >
        <Text className="text-center text-base font-semibold text-white">
          Line up the barcode
        </Text>
      </View>

      {status.kind === "attaching" && (
        <View style={StyleSheet.absoluteFill} className="items-center justify-center" pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}

      <View
        style={{
          backgroundColor: "rgba(0,0,0,0.75)",
          paddingBottom: Math.max(24, insets.bottom + 12),
        }}
        className="absolute inset-x-0 bottom-0 gap-3 px-6 pt-6"
      >
        {status.kind === "failed" && (
          <View accessible accessibilityLabel={announcement} className="gap-1">
            <Text className="text-base font-semibold text-tint-peach">{status.message}</Text>
            {status.hint && (
              <Text style={{ color: "rgba(255,255,255,0.7)" }} className="text-sm">
                {status.hint}
              </Text>
            )}
            <Pressable onPress={() => setStatus({ kind: "idle" })} className="mt-2 self-start">
              <Text style={{ color: "rgba(255,255,255,0.8)" }} className="text-sm font-medium underline">
                Try again
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable onPress={() => router.back()} hitSlop={12} className="items-center py-1">
          <Text style={{ color: "rgba(255,255,255,0.8)" }} className="text-sm font-medium underline">
            Cancel
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
