import { CameraView, type BarcodeScanningResult } from "expo-camera";
import { useEffect, useState, type RefObject } from "react";
import { Animated, Easing, type LayoutChangeEvent, Platform, StyleSheet } from "react-native";

import { CAMERA_STAGE } from "@/lib/tokens";

/**
 * Every code the scanner reads, on every platform, as of SDK 57 (issue #11).
 *
 * This used to narrow web to `["qr"]`, because expo-camera decoded QR codes
 * only in the browser at SDK 54 — it used jsQR. That is no longer true:
 * `expo-camera@57.0.4` uses the browser's own `BarcodeDetector` where it
 * exists and falls back to the `barcode-detector` ponyfill it now depends on,
 * and both handle the EAN-13 / UPC-A printed on packaging. See
 * `node_modules/expo-camera/build/web/WebBarcodeScanner.js`, whose format map
 * covers ean_13, ean_8, upc_a, upc_e and code_128. QR and Code 128 are read
 * so that pointing at one says "That's not a product barcode" rather than
 * nothing at all.
 */
const ALL_CODES = { barcodeTypes: [...(["ean13", "ean8", "upc_a", "upc_e", "qr", "code128"] as const)] };

/** Retail barcodes only, for a step where nothing else could ever be saved (add-product). */
const RETAIL_CODES = { barcodeTypes: [...(["ean13", "ean8", "upc_a", "upc_e"] as const)] };

/**
 * The one barcode camera (#204), used by the scanner and by add-product's
 * barcode step, which had a second camera of its own with its own states.
 *
 * Its start-up is kept out of sight. A camera that has just started spends a
 * moment finding its exposure, and in front of a plain wall that shows as a
 * burst of white before the picture settles. A dark veil holds the stage until
 * the camera reports ready (or a moment has passed, in case it never says so),
 * then fades. It is mounted fresh each time the camera is, so every start-up
 * gets one.
 *
 * It stays mounted while a read is being looked up: the caller ignores reads
 * while it is busy, rather than unmounting the camera, which showed a black
 * screen while checking.
 */
export function ScanCamera({
  cameraRef,
  onScanned,
  onLayout,
  enableTorch = false,
  retailOnly = false,
}: {
  /** Handed in when the caller also takes photos with this camera (the scanner's Photo mode). */
  cameraRef?: RefObject<CameraView | null>;
  onScanned: (result: BarcodeScanningResult) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  /** `expo-camera@~57.0.4`'s own prop — no `@platform` restriction, and
   *  genuinely implemented on web too. A device that can't do it just gets
   *  an inert button; that's a note, not a defect (#195). */
  enableTorch?: boolean;
  /** Reads only retail barcodes (EAN / UPC). */
  retailOnly?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [veil] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Not waiting on a "ready" that may never come.
    const fallback = setTimeout(() => setReady(true), 1600);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // A beat after ready, so the exposure has settled, then fade the veil away.
    const t = setTimeout(() => {
      Animated.timing(veil, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }, 350);
    return () => clearTimeout(t);
  }, [ready, veil]);

  return (
    <>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={enableTorch}
        // One object for the life of the app. Built inline it was a new value
        // every render, and the camera reads a changed setting as a reason to
        // reconfigure.
        barcodeScannerSettings={retailOnly ? RETAIL_CODES : ALL_CODES}
        onBarcodeScanned={onScanned}
        onLayout={onLayout}
        onCameraReady={() => setReady(true)}
      />
      <Animated.View pointerEvents="none" style={{ ...StyleSheet.absoluteFill, backgroundColor: CAMERA_STAGE, opacity: veil }} />
    </>
  );
}
