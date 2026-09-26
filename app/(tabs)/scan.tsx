import { Redirect } from "expo-router";

/**
 * Holds the scan button's place in the tab bar (`app/(tabs)/_layout.tsx`). The
 * button opens the scanner modal directly, so this is only reached by a link
 * to `/scan` — which goes to the scanner too.
 */
export default function ScanTab() {
  return <Redirect href="/scanner" />;
}
