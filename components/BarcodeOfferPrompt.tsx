import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { discardUnreachableScan } from "@/data/api";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, TYPE } from "@/lib/tokens";

/**
 * "Want to scan the barcode too?" — step 5b's row-accrual answer (Option 2
 * in the data-strategy plan). Shown once, right after a barcode-less label
 * scan, via `app/product/[id].tsx` reading the `offerBarcode` param
 * `scan-label.tsx` sets on a fresh scan — never on a later, ordinary visit
 * to the same product.
 *
 * The row this is about is not permanent yet: `label-ocr` wrote it with a
 * 24h grace expiry (migration 0014), so declining here is a convenience,
 * not the only way it goes away — walking off without answering has the
 * same effect once that timer runs out. Only the "Scan barcode" path
 * changes the outcome.
 *
 * `scanToken` is the capability `resolve-scan` requires before it will
 * touch this row — `products` is publicly readable, so an id alone would
 * let anyone resolve anyone else's pending scan (see that function's own
 * header comment). Both actions below pass it through unchanged.
 */
export function BarcodeOfferPrompt({
  productId,
  scanToken,
}: {
  productId: string;
  scanToken: string;
}) {
  const [discarding, setDiscarding] = useState(false);

  async function decline() {
    setDiscarding(true);
    // Best-effort: if this fails (offline, a dropped connection), the grace
    // expiry still cleans the row up on its own — nothing here needs to
    // retry or block on the network succeeding.
    await discardUnreachableScan(productId, scanToken);
    router.replace("/scanner");
  }

  return (
    <View
      style={{
        marginHorizontal: 24,
        padding: 20,
        gap: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: CANVAS,
      }}
    >
      <View style={{ gap: 4 }}>
        <Text
          style={{
            fontFamily: "PlayfairDisplay_500Medium",
            fontSize: TYPE.title,
            lineHeight: 25,
            color: INK,
          }}
        >
          Help the next person find this
        </Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 20, color: MUTED }}>
          Scan the barcode too, and this becomes a real product anyone can look
          up — not just something on your phone.
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <PrimaryButton
          tone="cta"
          size={50}
          label="Scan barcode"
          // `replace`, not `push` — review on PR #109 caught that pushing
          // left this screen (with its now-stale `offerBarcode` param)
          // underneath attach-barcode in the stack. After a successful
          // attach that screen replaced only the top of the stack, so
          // Back from the clean product screen returned to this exact
          // prompt for a product that already had its barcode — offering
          // to attach one "already taken" by itself, or discard a row
          // that no longer exists. Replacing here instead means there is
          // nothing stale left underneath once attach-barcode takes over.
          onPress={() =>
            router.replace({ pathname: "/attach-barcode", params: { productId, scanToken } })
          }
          style={{ flex: 1 }}
        />
        <Pressable
          onPress={decline}
          disabled={discarding}
          style={{ paddingHorizontal: 14, alignItems: "center", justifyContent: "center" }}
        >
          <Text
            style={{
              fontSize: TYPE.label,
              fontWeight: "600",
              color: discarding ? MUTED : INK,
              textDecorationLine: "underline",
            }}
          >
            No thanks
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
