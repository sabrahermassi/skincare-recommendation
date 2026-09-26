import { Redirect, useLocalSearchParams } from "expo-router";

import { barcodeParam as barcodeParamOf } from "@/lib/route-params";

/**
 * An old link. This was a second, full-screen label camera for the places
 * outside the scanner (Saved's recorded miss, a retake). #204 folded it into
 * the scanner's Photo mode, which is the one camera now, so a link here —
 * a share, a bookmark — opens that, with the barcode when there was one.
 */
export default function ScanLabel() {
  // From a link, so only a real barcode is kept (#29).
  const barcode = barcodeParamOf(useLocalSearchParams<{ barcode?: string }>().barcode);
  return <Redirect href={{ pathname: "/scanner", params: { mode: "photo", ...(barcode ? { barcode } : {}) } }} />;
}
