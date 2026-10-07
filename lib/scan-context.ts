import { useLocalSearchParams } from "expo-router";

import { useSkinNeedsEnabled } from "@/lib/features";
import type { ScanContext } from "@/lib/open-scanner";

/**
 * The context a scan was opened with (`openScanner`), read back off the
 * scanner's route so it can be handed on to the result it opens. Only the
 * keys that carry it, so nothing else in the link travels along (#29).
 *
 * A Skin needs context is dropped while Skin needs is hidden (#467): an old
 * or hand-written link then opens an ordinary scan.
 */
export function useScanContext(): Omit<ScanContext, "mode"> {
  const params = useLocalSearchParams<{ from?: string; need?: string; step?: string }>();
  const skinNeeds = useSkinNeedsEnabled();
  return {
    ...(skinNeeds && params.from === "journey" ? { from: "journey" as const, need: params.need ?? "" } : {}),
    ...(params.step ? { step: params.step } : {}),
  };
}
