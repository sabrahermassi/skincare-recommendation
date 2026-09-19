import { router, useLocalSearchParams } from "expo-router";

import { LabelCamera } from "@/components/LabelCamera";

/**
 * Photograph the ingredient list — the full-screen route. The camera and the
 * reading live in `components/LabelCamera.tsx`, which the scanner's
 * Ingredients mode uses too; this route is for the places that send someone
 * here from outside the scanner (a formula-less product, Saved's recorded
 * miss), with a barcode in hand when they have one.
 */
export default function ScanLabel() {
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();

  return (
    <LabelCamera
      barcode={barcode}
      onClose={() => router.back()}
      // replace, not push: reading is finished either way, so this screen has no
      // business staying on the back stack under the result.
      onResult={(params) => router.replace({ pathname: "/result/[id]", params })}
    />
  );
}
