import { Redirect } from "expo-router";

/**
 * An old link. This was a second, full-screen label camera for the places
 * outside the scanner. #204 folded it into the scanner's Photo mode, which is
 * the one camera now, so a link here — a share, a bookmark — opens that. A
 * barcode on the link is ignored: a read is only shown, never saved under one.
 */
export default function ScanLabel() {
  return <Redirect href={{ pathname: "/scanner", params: { mode: "photo" } }} />;
}
