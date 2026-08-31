import { CameraView, useCameraPermissions } from "expo-camera";
import { Link } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

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
  const [scanned, setScanned] = useState<string | null>(null);
  const toggleSaved = useAppStore((s) => s.toggleSaved);

  if (!permission) {
    // Permission state still loading.
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <Text className="text-slate-500">Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-white px-6">
        <Text className="text-center text-base text-slate-600">
          We need camera access to scan product barcodes.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="rounded-xl bg-teal-600 px-6 py-3 active:bg-teal-700"
        >
          <Text className="text-base font-semibold text-white">
            Grant permission
          </Text>
        </Pressable>
        <Link href="/" className="text-sm text-slate-500 underline">
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
          scanned
            ? undefined // pause after a hit until the user resets
            : ({ data, type }) => {
                setScanned(`${type}: ${data}`);
                toggleSaved(data);
              }
        }
      />

      <View className="absolute inset-x-0 bottom-0 gap-3 bg-black/70 p-6">
        {IS_WEB && (
          <Text className="text-sm text-amber-300">
            On web only QR codes are supported. Product barcodes (EAN-13 /
            UPC-A) scan on iOS and Android.
          </Text>
        )}

        <Text className="text-base font-semibold text-white">
          {scanned ?? "Point the camera at a barcode…"}
        </Text>

        {scanned && (
          <Pressable
            onPress={() => setScanned(null)}
            className="self-start rounded-xl bg-white px-5 py-2.5 active:bg-slate-200"
          >
            <Text className="font-semibold text-slate-900">Scan another</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
