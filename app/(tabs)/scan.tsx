import { CameraView, useCameraPermissions } from "expo-camera";
import { Link, router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Text";

import { fetchProductByBarcode } from "@/data/api";
import { matchProduct } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";

/**
 * SDK 54's expo-camera decodes only QR codes on web (it uses jsQR).
 * Native iOS/Android handle the full format list, including the EAN-13 /
 * UPC-A codes printed on actual product packaging.
 */
const IS_WEB = Platform.OS === "web";
const BARCODE_TYPES = IS_WEB
  ? (["qr"] as const)
  : (["ean13", "ean8", "upc_a", "upc_e", "qr", "code128"] as const);

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  /** Set only for a code we couldn't resolve — a hit navigates away instead. */
  const [missedCode, setMissedCode] = useState<string | null>(null);

  const profile = useAppStore((s) => s.profile);
  const recordView = useAppStore((s) => s.recordView);

  // The camera keeps firing while the async lookup is in flight, so a ref —
  // not state — is what actually stops one bottle being logged five times.
  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Coming back from a product detail should leave the scanner live again.
      return () => {
        setMissedCode(null);
        busy.current = false;
      };
    }, [])
  );

  const handleBarcode = useCallback(
    async (data: string) => {
      if (busy.current) return;
      busy.current = true;

      const product = await fetchProductByBarcode(data);

      if (product) {
        const { score, warnings } = matchProduct(product, profile);
        // Scanning is checking, not saving — this goes to the history log, and
        // the shelf stays whatever the user explicitly hearted.
        recordView({
          id: product.id,
          known: true,
          score,
          warnings: warnings.length,
        });
        router.push(`/product/${product.id}`);
        return; // `busy` is cleared by the blur cleanup above.
      }

      recordView({ id: data, known: false, score: null, warnings: 0 });
      setMissedCode(data);
      busy.current = false;
    },
    [profile, recordView]
  );

  if (!permission) {
    // Permission state still loading.
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
          We need camera access to scan product barcodes.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="rounded-control bg-accent px-6 py-3 active:bg-accent-deep"
        >
          <Text className="text-base font-sans-semibold text-white">Grant permission</Text>
        </Pressable>
        <Link href="/" className="text-sm text-ink-muted underline">
          Back to home
        </Link>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={
          missedCode
            ? undefined // pause after a miss until the user resets
            : ({ data }) => {
                void handleBarcode(data);
              }
        }
      />

      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/70 p-6">
        {IS_WEB && (
          <Text className="text-sm text-tint-peach">
            On web only QR codes are supported. Product barcodes (EAN-13 /
            UPC-A) scan on iOS and Android.
          </Text>
        )}

        {missedCode ? (
          <>
            <Text className="text-base font-sans-semibold text-white">
              Not in our catalogue yet
            </Text>
            <Text className="text-sm tabular-nums text-tint-lilac">{missedCode}</Text>
            <Text className="text-sm text-white/70">
              We&apos;ve logged it under History so you know you&apos;ve checked it.
            </Text>
          </>
        ) : (
          <Text className="text-base font-sans-semibold text-white">
            Point the camera at a barcode…
          </Text>
        )}

        {missedCode && (
          <Pressable
            onPress={() => {
              setMissedCode(null);
              busy.current = false;
            }}
            className="self-start rounded-control bg-white px-5 py-2.5 active:bg-hairline"
          >
            <Text className="font-sans-semibold text-ink">Scan another</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
