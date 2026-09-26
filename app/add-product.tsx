import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { TypeChip } from "@/components/TypeChip";
import { failureMessage, fetchProductByBarcode, forgetScanned, saveScannedProduct } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { clearLabelRead, heldLabelRead } from "@/lib/pending-label";
import { READ_TOKEN_TTL_MS } from "@/supabase/functions/_shared/read-token";
import {
  BORDER_INACTIVE,
  CAMERA_STAGE,
  CANVAS,
  CTA,
  INK,
  MUTED,
  MUTED_FAINT,
  RADIUS_SELECTOR,
  SPACE,
  TOUCH_TARGET,
  TYPE,
  withAlpha,
} from "@/lib/tokens";
import { haptic } from "@/lib/haptics";

/**
 * Adding a product we don't have.
 *
 * The user has just photographed an ingredient list (parked in
 * `lib/pending-label`). A product exists only with a barcode, a name and that
 * list, so this screen collects whichever of the first two is still missing —
 * scan the barcode (when the photo was taken first), then type the name — and
 * saves all three together. Nothing is stored before then.
 */
export default function AddProduct() {
  const { barcode: barcodeParam } = useLocalSearchParams<{ barcode?: string }>();
  const [read] = useState(heldLabelRead);
  const [barcode, setBarcode] = useState<string | undefined>(barcodeParam ?? read?.barcode);

  if (!read) return <NothingToAdd />;

  if (!barcode) {
    return (
      <BarcodeStep
        onKnown={(id) => {
          // The barcode they scanned turned out to be in the catalogue after all:
          // nothing to add, so show it. `dismissTo`, not `replace`: this screen
          // is reached by a push from `/label-result` (#214) now, not always a
          // direct push from the scanner — `replace` only swaps this screen,
          // leaving the old, now-stale verdict underneath on the back stack.
          // `dismissTo` pops everything back to (and lands on) the target.
          clearLabelRead();
          router.dismissTo({ pathname: "/result/[id]", params: { id, from: "label" } });
        }}
        onUnknown={setBarcode}
      />
    );
  }

  return (
    <NameStep
      barcode={barcode}
      ingredients={read.ingredients}
      readToken={read.readToken}
      receivedAt={read.receivedAt}
    />
  );
}

function NothingToAdd() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, color: MUTED }}>
          There&apos;s no ingredient list to add. Scan a product and photograph its ingredients to start.
        </Text>
        <PrimaryButton size={56} label="Back to the scanner" onPress={() => router.back()} />
      </View>
    </View>
  );
}

/**
 * The barcode, when the ingredients were photographed first. A single-purpose
 * camera: retail barcodes only, because anything else can never be saved.
 */
/**
 * The types the product form offers, the catalogue's most common first — as
 * counted from the live catalogue on 2026-09-19. Fixed on purpose: a rough
 * guide set once, not re-sorted on every import.
 */
const LEADING_TYPES: ProductType[] = [
  "sunscreen",
  "moisturizer",
  "cleanser",
  "serum",
  "lip-balm",
  "hand-cream",
  "exfoliator",
  "body-wash",
  "sheet-mask",
  "toner",
  "body-lotion",
  "essence",
];

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"] as const;
const BARCODE_SETTINGS = { barcodeTypes: [...BARCODE_TYPES] };

type BarcodeStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "failed"; message: string };

function BarcodeStep({ onKnown, onUnknown }: { onKnown: (id: string) => void; onUnknown: (barcode: string) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<BarcodeStatus>({ kind: "idle" });
  const busy = useRef(false);

  async function onBarcode(code: string) {
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: "checking" });

    const result = await fetchProductByBarcode(code);
    if (!result.ok) {
      busy.current = false;
      setStatus({ kind: "failed", message: failureMessage(result.failure) });
      return;
    }
    if (result.value) onKnown(result.value.id);
    else onUnknown(code);
  }

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <Text style={{ color: MUTED }}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <ScreenHeader />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.block, paddingHorizontal: SPACE.gutter }}>
          <Text style={{ textAlign: "center", fontSize: TYPE.body, color: MUTED }}>
            We need camera access to scan the barcode.
          </Text>
          <PrimaryButton
            size={56}
            label="Grant permission"
            // Once the system will not ask again, asking does nothing: send them to
            // settings, where the camera can be turned back on.
            onPress={permission.canAskAgain === false ? () => void Linking.openSettings() : requestPermission}
          />
        </View>
      </View>
    );
  }

  const announcement =
    status.kind === "checking" ? "Barcode found. Checking it." : status.kind === "failed" ? status.message : "";

  return (
    <View style={{ flex: 1, backgroundColor: CAMERA_STAGE }}>
      <ScreenReaderAnnouncer message={announcement} />
      {status.kind === "idle" ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={BARCODE_SETTINGS}
          onBarcodeScanned={({ data }) => void onBarcode(data)}
        />
      ) : null}

      <View
        pointerEvents="none"
        style={{ position: "absolute", left: SPACE.gutter, right: SPACE.gutter, top: insets.top + SPACE.block, gap: SPACE.text / 2 }}
      >
        <Text style={{ textAlign: "center", fontSize: TYPE.body, fontWeight: "600", color: CANVAS }}>
          Now scan its barcode
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.label, color: withAlpha(CANVAS, 0.75) }}>
          So the next person who scans it finds it.
        </Text>
      </View>

      {status.kind === "checking" ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          <ActivityIndicator color={CANVAS} />
        </View>
      ) : null}

      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          gap: SPACE.text,
          paddingHorizontal: SPACE.gutter,
          paddingTop: SPACE.gutter,
          paddingBottom: Math.max(SPACE.gutter, insets.bottom + SPACE.block),
          backgroundColor: withAlpha(CAMERA_STAGE, 0.75),
        }}
      >
        {status.kind === "failed" ? (
          <View accessible accessibilityLabel={announcement} style={{ gap: SPACE.text }}>
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: CTA }}>{status.message}</Text>
            <Pressable
              onPress={() => {
                busy.current = false;
                setStatus({ kind: "idle" });
              }}
              accessibilityRole="button"
              style={{ alignSelf: "flex-start", minHeight: TOUCH_TARGET, justifyContent: "center" }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: TYPE.label, fontWeight: "500", color: withAlpha(CANVAS, 0.8), textDecorationLine: "underline" }}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {status.kind !== "checking" ? (
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={{ alignItems: "center", minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
            <Text style={{ fontSize: TYPE.label, fontWeight: "500", color: withAlpha(CANVAS, 0.8), textDecorationLine: "underline" }}>
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type SaveFailure =
  | "unreadable_list"
  | "expired"
  | "rate_limited"
  | "failed"
  | "not_configured"
  | "network_error"
  | "already_saved"
  | "name_has_url"
  | "name_unreadable"
  | "name_repeats";

const SAVE_FAILURE_COPY: Record<SaveFailure, string> = {
  unreadable_list: "That ingredient list didn't look right. Go back and photograph it again.",
  expired: "That photo is too old to save now. Scan it again.",
  rate_limited: "That's a lot of products in a short time. Give it a few minutes and try again.",
  failed: "Couldn't save that just now. Check your connection and try again.",
  not_configured: "Adding products isn't available in this build.",
  network_error: "Couldn't reach our servers. Check your connection and try again.",
  // It did save — the write already committed server-side before the parse
  // that hit this failed (#188). "Show me that product" below looks it up
  // by the barcode just submitted, rather than re-saving with a read token
  // that's already been spent.
  already_saved: "That saved, but we couldn't open it just now.",
  // Refused before anything was saved (#200), so the same read can be saved
  // again once the name is fixed.
  name_has_url: "Product names can't include a web address. Type just the name on the pack.",
  name_unreadable: "That name needs some letters or numbers. Type it as it's printed on the pack.",
  name_repeats: "That name repeats itself a lot. Type it as it's printed on the pack.",
};

// Shown under `already_saved` when the recovery lookup itself fails too.
// The product is still saved, so the ask is only to try the lookup again.
const LOOKUP_FAILED_COPY = "Still couldn't open it — check your connection and tap Show me that product again.";

/**
 * `expired` (unlike the other failures) has no useful retry: the read token is
 * gone and the held list can no longer be saved under it. Save is not just
 * disabled here — swapped for the one action that can actually fix it,
 * retracing the same `clearLabelRead` + `/scan-label` path as the review
 * section's own "Retake the photo" below. See issue #193.
 */
function retakePhoto(barcode: string) {
  clearLabelRead();
  router.replace({ pathname: "/scan-label", params: { barcode } });
}

/** The last step: review the read, then a name, then everything is saved together. */
function NameStep({
  barcode,
  ingredients,
  readToken,
  receivedAt,
}: {
  barcode: string;
  ingredients: string[];
  readToken: string;
  /** From `heldLabelRead`. Elapsed-since-receipt, not the token's own server-epoch deadline — see `HeldLabel`. */
  receivedAt: number;
}) {
  const [name, setName] = useState("");
  // null is "Not sure", which the server stores as "unknown" (#200).
  const [type, setType] = useState<ProductType | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(
    // The 30-minute window (`READ_TOKEN_TTL_MS`) exists to bound an
    // unauthenticated write, not to be raced — checking with a name and a
    // list of ingredients to read through is a real way to meet it. Caught
    // here so the screen never offers a Save button that can only fail.
    //
    // Measured from `receivedAt`, not the token's own deadline: comparing
    // that server-signed deadline straight to `Date.now()` means a device
    // clock running ahead of the server marks a fresh token expired on the
    // spot, and every retake lands in the same loop. Elapsed time since a
    // receipt stamped on this same device isn't exposed to that skew.
    () => (Date.now() - receivedAt > READ_TOKEN_TTL_MS ? "expired" : null)
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  // Set when the `already_saved` recovery lookup itself fails or misses.
  // Kept apart from `failure` so that state — and its lookup button —
  // survives: see `findSavedProduct`.
  const [lookupFailed, setLookupFailed] = useState(false);
  const trimmed = name.trim();
  const expired = failure === "expired";
  const alreadySaved = failure === "already_saved";

  async function save() {
    if (saving || !trimmed) return;
    setSaving(true);
    setFailure(null);
    const result = await saveScannedProduct({ barcode, name: trimmed, ingredients, readToken, type: type ?? undefined });
    if (result.ok) {
      haptic.success();
      clearLabelRead();
      // `dismissTo`, not `replace` — see the same note on `onKnown` above.
      router.dismissTo({ pathname: "/result/[id]", params: { id: result.product.id, from: "label" } });
      return;
    }
    setSaving(false);
    setFailure(result.reason);
  }

  /**
   * Recovery for `already_saved` (#188): the write already committed
   * server-side, so a plain retry would resubmit a now-consumed read token
   * and land on `expired` instead — a real save reported as a lost one. The
   * barcode just submitted now resolves, since the row exists, so this looks
   * it up directly rather than re-saving.
   */
  async function findSavedProduct() {
    if (saving) return;
    setSaving(true);
    setLookupFailed(false);
    const result = await fetchProductByBarcode(barcode);
    setSaving(false);
    if (result.ok && result.value) {
      clearLabelRead();
      router.dismissTo({ pathname: "/result/[id]", params: { id: result.value.id, from: "label" } });
      return;
    }
    // This lookup can itself cache a miss (the cascade hasn't indexed the
    // just-saved row yet) for up to an hour — evict it, or the next tap of
    // "Show me that product" reads that same stale miss back and never
    // reaches the network at all (#258 review, found after the pre-lookup
    // miss above it was already fixed the same way).
    forgetScanned(barcode);
    // The lookup failed or missed, but the row is still saved — so stay in
    // `already_saved` and let the lookup be tried again. Dropping back to
    // `failed` would swap this button for Save, which resubmits the spent
    // read token and lands on `expired` (#258 review).
    setLookupFailed(true);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenReaderAnnouncer
        message={alreadySaved && lookupFailed ? LOOKUP_FAILED_COPY : failure ? SAVE_FAILURE_COPY[failure] : ""}
      />
      <ScreenHeader title="Add this product" />
      {/*
        Scrolls the whole form, not just the ingredient panel above: on a
        short display, a landscape orientation, or with the keyboard open,
        an expanded review plus the name field and Save can be taller than
        the viewport even with the 220px cap on the ingredient list, and a
        fixed `View` would strand Retake/Save off-screen. `keyboardShouldPersistTaps`
        so a tap on Retake or the review toggle isn't swallowed by the
        keyboard dismissing first.
      */}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, gap: SPACE.block, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter, paddingBottom: SPACE.gutter }}
      >
        <View style={{ gap: SPACE.text }}>
          <Text style={{ fontSize: TYPE.body, color: INK }}>
            We don&apos;t have this product yet. Name it and we&apos;ll save it with the {ingredients.length} ingredients
            you photographed, so the next scan finds it.
          </Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Barcode {barcode}</Text>
        </View>

        {/*
          Collapsed by default so the name field stays the first thing tapped —
          this is a check, not a new required step. Read-only: the server signs
          the list against the exact names it read, so an edited list would
          fail verification anyway. Printed order is preserved deliberately —
          `positionWeight` in lib/matching.ts scores concentration from it, so
          sorting alphabetically here would misrepresent what the label says.
        */}
        <View style={{ borderRadius: RADIUS_SELECTOR, borderWidth: 1, borderColor: BORDER_INACTIVE }}>
          <Pressable
            onPress={() => setReviewOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel={`${ingredients.length} ingredients read. ${reviewOpen ? "Collapse" : "Check them"}.`}
            accessibilityState={{ expanded: reviewOpen }}
            style={{
              minHeight: TOUCH_TARGET,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: SPACE.block,
            }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
              {ingredients.length} ingredients read — check them
            </Text>
            <ArrowIcon direction={reviewOpen ? "up" : "down"} size={16} color={INK} />
          </Pressable>

          {reviewOpen ? (
            <View
              style={{
                paddingHorizontal: SPACE.block,
                paddingBottom: SPACE.text,
                borderTopWidth: 1,
                borderTopColor: BORDER_INACTIVE,
                paddingTop: SPACE.text,
              }}
            >
              {/*
                A read can hold up to 400 ingredients (label-ocr's own cap), far
                more than this panel has room for — an unscrolled list that long
                would push "Retake" and everything below it off-screen. Only the
                names themselves scroll; Retake stays outside so it's reachable
                whatever the list's length.
              */}
              <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 4 }}>
                {ingredients.map((ingredient, index) => (
                  <Text key={`${ingredient}-${index}`} style={{ fontSize: TYPE.caption, color: INK }}>
                    {index + 1}. {ingredient}
                  </Text>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => {
                  if (saving) return;
                  retakePhoto(barcode);
                }}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Retake the photo"
                style={{ alignSelf: "flex-start", minHeight: TOUCH_TARGET, justifyContent: "center" }}
                className="active:opacity-70"
              >
                <Text
                  style={{
                    fontSize: TYPE.label,
                    fontWeight: "500",
                    color: saving ? MUTED_FAINT : MUTED,
                    textDecorationLine: "underline",
                  }}
                >
                  Not right? Retake the photo
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Product name, e.g. Brand Hydrating Toner"
          placeholderTextColor={MUTED_FAINT}
          accessibilityLabel="Product name"
          autoFocus
          autoCorrect={false}
          maxLength={200}
          editable={!expired && !alreadySaved}
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={{
            minHeight: TOUCH_TARGET + SPACE.text,
            borderRadius: RADIUS_SELECTOR,
            borderWidth: 1,
            borderColor: BORDER_INACTIVE,
            backgroundColor: CANVAS,
            paddingHorizontal: SPACE.block,
            fontSize: TYPE.body,
            color: INK,
          }}
        />

        {/*
          Optional. A photographed list gives no basis for guessing a type, so
          without a pick the product is saved as "unknown" — which scores its
          benefits at a quarter (`contactWeight`). The catalogue's most
          common types, largest first; the rarer types aren't offered here.
        */}
        <View style={{ gap: SPACE.text }}>
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>What kind of product is it?</Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <TypeChip label="Not sure" selected={type === null} disabled={saving} onPress={() => setType(null)} />
            {LEADING_TYPES.map((option) => (
              <TypeChip
                key={option}
                label={PRODUCT_TYPE_LABEL[option]}
                selected={type === option}
                disabled={saving}
                onPress={() => setType(option)}
              />
            ))}
          </View>
        </View>

        {failure ? (
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{SAVE_FAILURE_COPY[failure]}</Text>
        ) : null}
        {alreadySaved && lookupFailed ? (
          <Text style={{ fontSize: TYPE.label, color: MUTED }}>{LOOKUP_FAILED_COPY}</Text>
        ) : null}

        {expired ? (
          <PrimaryButton size={56} label="Scan it again" onPress={() => retakePhoto(barcode)} />
        ) : alreadySaved ? (
          <PrimaryButton
            size={56}
            label={saving ? "Opening…" : "Show me that product"}
            disabled={saving}
            onPress={() => void findSavedProduct()}
          />
        ) : (
          <PrimaryButton
            size={56}
            label={saving ? "Saving…" : "Save and see my match"}
            disabled={!trimmed || saving}
            onPress={() => void save()}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
