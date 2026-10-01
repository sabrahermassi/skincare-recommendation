import { useLocalSearchParams } from "expo-router";

import type { ScanContext } from "@/lib/open-scanner";

/**
 * The context a scan was opened with (`openScanner`), read back off the
 * scanner's route so it can be handed on to the result it opens. Only the
 * keys that carry it, so nothing else in the link travels along (#29).
 */
export function useScanContext(): Omit<ScanContext, "mode"> {
  const params = useLocalSearchParams<{ from?: string; concerns?: string; step?: string }>();
  return {
    ...(params.from === "journey" ? { from: "journey" as const, concerns: params.concerns ?? "" } : {}),
    ...(params.step ? { step: params.step } : {}),
  };
}
