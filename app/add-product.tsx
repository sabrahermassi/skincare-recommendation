import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { failureMessage, fetchProductByBarcode, saveScannedProduct } from "@/data/api";
import { clearLabelRead, heldLabelRead } from "@/lib/pending-label";
import { BORDER_INACTIVE, CAMERA_STAGE, CANVAS, CTA, INK, MUTED, MUTED_FAINT, TYPE, withAlpha } from "@/lib/tokens";

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

  return <NameStep barcode={barcode} ingredients={read.ingredients} />;
}

function NothingToAdd() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 24 }}>
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
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 24 }}>
          <Text style={{ textAlign: "center", fontSize: TYPE.body, color: MUTED }}>
            We need camera access to scan the barcode.
          </Text>
          <PrimaryButton tone="cta" size={56} label="Grant permission" onPress={requestPermission} />
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

      <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, top: insets.top + 16 }}>
        <Text style={{ textAlign: "center", fontSize: 16, fontWeight: "600", color: CANVAS }}>
          Now scan its barcode
        </Text>
        <Text style={{ textAlign: "center", marginTop: 4, fontSize: TYPE.label, color: withAlpha(CANVAS, 0.75) }}>
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
          gap: 12,
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: Math.max(24, insets.bottom + 12),
          backgroundColor: withAlpha(CAMERA_STAGE, 0.75),
        }}
      >
        {status.kind === "failed" ? (
          <View accessible accessibilityLabel={announcement} style={{ gap: 4 }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: CTA }}>{status.message}</Text>
            <Pressable
              onPress={() => {
                busy.current = false;
                setStatus({ kind: "idle" });
              }}
              accessibilityRole="button"
              className="mt-2 self-start"
            >
              <Text style={{ fontSize: TYPE.label, fontWeight: "500", color: withAlpha(CANVAS, 0.8), textDecorationLine: "underline" }}>
                Try again
              </Text>
            </Pressable>
          </View>
        ) : null}

        {status.kind !== "checking" ? (
          <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" className="items-center py-1">
            <Text style={{ fontSize: TYPE.label, fontWeight: "500", color: withAlpha(CANVAS, 0.8), textDecorationLine: "underline" }}>
              Cancel
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type SaveFailure = "unreadable_list" | "rate_limited" | "failed" | "not_configured";

const SAVE_FAILURE_COPY: Record<SaveFailure, string> = {
  unreadable_list: "That ingredient list didn't look right. Go back and photograph it again.",
  rate_limited: "That's a lot of products in a short time. Give it a few minutes and try again.",
  failed: "Couldn't save that just now. Check your connection and try again.",
  not_configured: "Adding products isn't available in this build.",
};

/** The last step: a name, then everything is saved together. */
function NameStep({ barcode, ingredients }: { barcode: string; ingredients: string[] }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const trimmed = name.trim();

  async function save() {
    if (saving || !trimmed) return;
    setSaving(true);
    setFailure(null);
    const result = await saveScannedProduct({ barcode, name: trimmed, ingredients });
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
      <View style={{ flex: 1, gap: 20, paddingHorizontal: 24, paddingTop: 24 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: INK }}>
            We don&apos;t have this product yet. Name it and we&apos;ll save it with the {ingredients.length} ingredients
            you photographed, so the next scan finds it.
          </Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Barcode {barcode}</Text>
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
          returnKeyType="done"
          onSubmitEditing={() => void save()}
          style={{
            height: 52,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: BORDER_INACTIVE,
            backgroundColor: CANVAS,
            paddingHorizontal: 20,
            fontSize: TYPE.body,
            color: INK,
          }}
        />

        {failure ? (
          <Text style={{ fontSize: TYPE.label, lineHeight: 19, fontWeight: "600", color: INK }}>
            {SAVE_FAILURE_COPY[failure]}
          </Text>
        ) : null}

        <PrimaryButton
          tone="cta"
          size={56}
          label={saving ? "Saving…" : "Save and see my match"}
          disabled={!trimmed || saving}
          onPress={() => void save()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
