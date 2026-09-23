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
import { failureMessage, fetchProductByBarcode, saveScannedProduct } from "@/data/api";
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
          // nothing to add, so show it.
          clearLabelRead();
          router.replace({ pathname: "/result/[id]", params: { id } });
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
        <PrimaryButton tone="cta" size={56} label="Back to the scanner" onPress={() => router.back()} />
      </View>
    </View>
  );
}

/**
 * The barcode, when the ingredients were photographed first. A single-purpose
 * camera: retail barcodes only, because anything else can never be saved.
 */
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
            tone="cta"
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
              style={{ alignSelf: "flex-start" }}
            >
              <Text style={{ fontSize: TYPE.label, fontWeight: "500", color: withAlpha(CANVAS, 0.8), textDecorationLine: "underline" }}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {status.kind !== "checking" ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" style={{ alignItems: "center" }}>
            <Text style={{ fontSize: TYPE.label, fontWeight: "500", color: withAlpha(CANVAS, 0.8), textDecorationLine: "underline" }}>
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type SaveFailure = "unreadable_list" | "expired" | "rate_limited" | "failed" | "not_configured";

const SAVE_FAILURE_COPY: Record<SaveFailure, string> = {
  unreadable_list: "That ingredient list didn't look right. Go back and photograph it again.",
  expired: "That photo is too old to save now. Scan it again.",
  rate_limited: "That's a lot of products in a short time. Give it a few minutes and try again.",
  failed: "Couldn't save that just now. Check your connection and try again.",
  not_configured: "Adding products isn't available in this build.",
};

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
  const trimmed = name.trim();
  const expired = failure === "expired";

  async function save() {
    if (saving || !trimmed) return;
    setSaving(true);
    setFailure(null);
    const result = await saveScannedProduct({ barcode, name: trimmed, ingredients, readToken });
    if (result.ok) {
      clearLabelRead();
      router.replace({ pathname: "/result/[id]", params: { id: result.product.id } });
      return;
    }
    setSaving(false);
    setFailure(result.reason);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenReaderAnnouncer message={failure ? SAVE_FAILURE_COPY[failure] : ""} />
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
                hitSlop={8}
                style={{ alignSelf: "flex-start", marginTop: SPACE.text / 2 }}
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
          editable={!expired}
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

        {failure ? (
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{SAVE_FAILURE_COPY[failure]}</Text>
        ) : null}

        {expired ? (
          <PrimaryButton tone="cta" size={56} label="Scan it again" onPress={() => retakePhoto(barcode)} />
        ) : (
          <PrimaryButton
            tone="cta"
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
