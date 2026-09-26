import { useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CameraPermissionScreen } from "@/components/CameraPermissionScreen";
import { ScanCamera } from "@/components/ScanCamera";
import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { TypeChip } from "@/components/TypeChip";
import { fetchProductByBarcode, forgetScanned, saveScannedProduct } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductType } from "@/data/types";
import { clearLabelRead, heldLabelRead } from "@/lib/pending-label";
import { lookupFailureState, saveFailureState, scanStateCopy, scanStateSpeech, type SaveFailureReason, type ScanState } from "@/lib/scan-copy";
import { READ_TOKEN_TTL_MS } from "@/supabase/functions/_shared/read-token";
import {
  BORDER_INACTIVE,
  CAMERA_STAGE,
  CANVAS,
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
import { photoScannerHref } from "@/lib/open-scanner";
import { barcodeParam as barcodeParamOf } from "@/lib/route-params";

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
  // From a link, so only a real barcode is kept (#29); anything else leaves the step to ask for one.
  const barcodeParam = barcodeParamOf(useLocalSearchParams<{ barcode?: string }>().barcode);
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

/** What the barcode step asks for, and why. */
const ADD_BARCODE = { title: "Now scan its barcode", line: "So the next person who scans it finds it." };

type BarcodeStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "failed"; state: ScanState };

/**
 * The barcode, when the ingredients were photographed first. The scanner's own
 * camera (`ScanCamera`, #204), reading retail barcodes only — anything else
 * could never be saved — and the scanner's words for each state.
 */
function BarcodeStep({ onKnown, onUnknown }: { onKnown: (id: string) => void; onUnknown: (barcode: string) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<BarcodeStatus>({ kind: "idle" });
  const busy = useRef(false);
  const lastCode = useRef<string | null>(null);

  async function onBarcode(code: string) {
    if (busy.current) return;
    busy.current = true;
    lastCode.current = code;
    setStatus({ kind: "checking" });

    const result = await fetchProductByBarcode(code);
    if (!result.ok) {
      setStatus({ kind: "failed", state: lookupFailureState(result.failure) });
      return;
    }
    if (result.value) onKnown(result.value.id);
    else onUnknown(code);
  }

  function tryAgain() {
    const code = lastCode.current;
    busy.current = false;
    setStatus({ kind: "idle" });
    if (code) void onBarcode(code);
  }

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: CANVAS }} />;
  }

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: CANVAS }}>
        <ScreenHeader />
        <CameraPermissionScreen
          permission={permission}
          requestPermission={requestPermission}
          mode="barcode"
          bottomInset={Math.max(SPACE.gutter, insets.bottom + SPACE.block)}
          title={ADD_BARCODE.title}
          line={`${ADD_BARCODE.line} Nothing leaves your phone except the barcode number.`}
        />
      </View>
    );
  }

  const copy =
    status.kind === "checking"
      ? scanStateCopy({ kind: "working", step: "lookup" })
      : status.kind === "failed"
        ? scanStateCopy(status.state)
        : null;
  const announcement = copy ? scanStateSpeech(copy) : "";

  return (
    <View style={{ flex: 1, backgroundColor: CAMERA_STAGE }}>
      <ScreenReaderAnnouncer message={announcement} />
      {/* Stays up while a code is checked; reads are ignored while busy. */}
      <ScanCamera retailOnly onScanned={({ data }) => void onBarcode(data)} />

      <View
        pointerEvents="none"
        style={{ position: "absolute", left: SPACE.gutter, right: SPACE.gutter, top: insets.top + SPACE.block, gap: SPACE.text / 2 }}
      >
        <Text style={{ textAlign: "center", fontSize: TYPE.body, fontWeight: "600", color: CANVAS }}>
          {ADD_BARCODE.title}
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.label, color: withAlpha(CANVAS, 0.75) }}>
          {ADD_BARCODE.line}
        </Text>
      </View>

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
        {copy ? (
          <View
            accessible
            accessibilityLabel={announcement}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 18, padding: 12, backgroundColor: withAlpha(CANVAS, 0.95) }}
          >
            {status.kind === "checking" ? <ActivityIndicator color={INK} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "bold", color: INK }}>{copy.title}</Text>
              <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{copy.line}</Text>
            </View>
          </View>
        ) : null}

        {status.kind === "failed" ? <PrimaryButton size={48} label={copy?.action ?? ""} onPress={tryAgain} /> : null}

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

/**
 * What each save failure says. The scan-flow ones (a stale or refused read, a
 * rate limit, the network) are `scanStateCopy`'s words (#204); the rest are
 * about the name typed here, or the one case where the save did happen.
 */
const SAVE_FAILURE_COPY: Record<SaveFailure, string> = {
  unreadable_list: saveFailureSpeech("unreadable_list"),
  expired: saveFailureSpeech("expired"),
  rate_limited: saveFailureSpeech("rate_limited"),
  failed: saveFailureSpeech("failed"),
  // A build with no backend: a developer's message, never a real person's.
  not_configured: "Adding products isn't available in this build.",
  network_error: saveFailureSpeech("network_error"),
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

const RETAKE_ACTION = scanStateCopy({ kind: "couldnt-read", why: "retake" }).action ?? "";
const SAVING = scanStateCopy({ kind: "working", step: "save" }).title ?? "";

function saveFailureSpeech(reason: SaveFailureReason): string {
  return scanStateSpeech(scanStateCopy(saveFailureState(reason)));
}

// Shown under `already_saved` when the recovery lookup itself fails too.
// The product is still saved, so the ask is only to try the lookup again.
const LOOKUP_FAILED_COPY = "Still couldn't open it — check your connection and tap Show me that product again.";

/**
 * `expired` and `unreadable_list` (unlike the other failures) have no useful
 * retry: the read token is gone, or the server refused the list, so the held
 * list can't be saved. Save is not just disabled — swapped for the one action
 * that can fix it, the same as the review section's own "Retake the photo"
 * below (#193, #204): back to the scanner in Photo mode for this barcode.
 */
function retakePhoto(barcode: string) {
  clearLabelRead();
  router.dismissTo(photoScannerHref({ barcode }));
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
  // Needs a new photo (#204): the read is too old, or the server refused its list.
  const expired = failure === "expired" || failure === "unreadable_list";
  const alreadySaved = failure === "already_saved";
  // A build with no backend can never save: Save stays off rather than
  // failing the same way on every tap (#204).
  const cannotSave = failure === "not_configured";

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
          <PrimaryButton size={56} label={RETAKE_ACTION} onPress={() => retakePhoto(barcode)} />
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
            label={saving ? SAVING : "Save and see my match"}
            disabled={!trimmed || saving || cannotSave}
            onPress={() => void save()}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
