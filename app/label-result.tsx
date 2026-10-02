import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ResultTabs } from "@/components/result/ResultTabs";
import { PageTitle } from "@/components/PageTitle";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { resolveIngredientNames } from "@/data/api";
import type { Ingredient } from "@/data/types";
import { track } from "@/lib/analytics";
import { decodeNeed, needProfile, type Need } from "@/lib/journey";
import { isLowCoverage, matchProduct } from "@/lib/matching";
import { photoScannerHref } from "@/lib/open-scanner";
import { labelName } from "@/lib/label-title";
import { clearLabelRead, heldLabelRead, type HeldLabel } from "@/lib/pending-label";
import { historyWarningCount, isVerified } from "@/lib/safety";
import { CANVAS, INK, MUTED, SPACE, STONE, TYPE } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

/**
 * The verdict from a photographed label alone — score, reasons, confidence,
 * the parsed list — with no product name or barcode required first (issue
 * #214). This screen is where every successful label read lands.
 *
 * Reads the held list (`lib/pending-label`) for a photo just taken, and logs
 * it in History once. Opened from History instead (`?entry=<id>`), it reads
 * that entry's saved list and logs nothing new. A link can only name an
 * entry already on this phone: nothing in the address becomes the list (#29).
 */
export default function LabelResult() {
  const { entry, from, need } = useLocalSearchParams<{ entry?: string; from?: string; need?: string }>();
  const saved = useAppStore((s) => (entry ? s.history.find((h) => h.id === entry)?.label : undefined));
  const [held] = useState(heldLabelRead);
  const read: HeldLabel | null = entry ? (saved ? { ingredients: saved } : null) : held;

  if (!read) return <NothingToShow />;

  return <Verdict read={read} entry={entry || undefined} journey={from === "journey" ? (decodeNeed(need) ?? undefined) : undefined} />;
}

function NothingToShow() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: SPACE.block, paddingHorizontal: SPACE.gutter }}>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, color: MUTED }}>
          There&apos;s no ingredient list to show. Scan a product and photograph its ingredients to start.
        </Text>
        <PrimaryButton label="Back to the scanner" onPress={() => router.back()} />
      </View>
    </View>
  );
}

/**
 * Photographing a label again after a refusal or an unrecognised read
 * (`clearLabelRead` first) — the only way forward when the formula couldn't
 * be scored at all. Back to the scanner in Photo mode (#204): `dismissTo`
 * closes this screen onto the scanner underneath, or opens one if there isn't.
 */
function retake() {
  clearLabelRead();
  router.dismissTo(photoScannerHref());
}

function Verdict({ read, entry, journey }: { read: HeldLabel; /** The History entry it was opened from, if it was. */ entry?: string; journey?: Need }) {
  const fromHistory = entry !== undefined;
  // The History entry this result is: the one it was opened from, or the one
  // it writes below. Its number names it ("Product 2").
  const [entryId] = useState(() => entry ?? `label-${Date.now()}`);
  const labelNo = useAppStore((s) => s.history.find((h) => h.id === entryId)?.labelNo);
  // A scan from Skin needs is read for what was picked there today, not the
  // saved skin profile (owner): this profile, made from the pick, only feeds
  // its warnings. History keeps the skin profile's score, below.
  const ownProfile = useAppStore((s) => s.profile);
  const profile = useMemo(() => (journey ? needProfile(journey) : ownProfile), [journey, ownProfile]);
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);

  useEffect(() => track("verdict_viewed", { path: "label" }), []);

  useEffect(() => {
    let cancelled = false;
    // Never strict: a lookup outage degrades to unverified stubs (the same
    // thing `resolveIngredientNames` always does for an unrecognised name),
    // which reads as low confidence rather than an error screen for
    // something the user can't fix by retrying — no retry button needed.
    resolveIngredientNames(read.ingredients).then((resolved) => {
      if (cancelled) return;
      setIngredients(resolved);
      // A new photo goes into History once, with the list it read, so the
      // same result can be opened from there later (owner). An empty read has
      // nothing to reopen; one opened from History is already there.
      if (fromHistory || resolved.length === 0) return;
      const { profile: now, recordView } = useAppStore.getState();
      const seen = matchProduct({ type: "unknown", ingredients: resolved }, now);
      recordView({ id: entryId, known: false, score: seen.score, warnings: historyWarningCount(seen.warnings), label: read.ingredients });
    });
    return () => {
      cancelled = true;
    };
    // `read.ingredients` is the same array for the life of this screen (held
    // in `lib/pending-label` until cleared), so this runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No id, no name, no brand: `matchProduct` only ever reads `.type` and
  // `.ingredients` (see its own `Pick<...>` signature), and #214's decision 2
  // is explicit that this reads as `type: "unknown"` rather than guessing one
  // from the label text — an unnamed read must never outscore the same
  // product once it's actually saved with a real type.
  const product = useMemo(
    () => ({ id: "", type: "unknown" as const, ingredients: ingredients ?? [], fetchedAt: undefined }),
    [ingredients]
  );

  if (ingredients === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const total = product.ingredients.length;
  const recognised = product.ingredients.filter(isVerified).length;
  const lowCoverage = isLowCoverage(product.ingredients);

  return (
    // v9: the header is on stone and the result a white sheet over it, as on a catalogue product.
    <View style={{ flex: 1, backgroundColor: STONE }}>
      {/* The same two tabs as a catalogue product (design_handoff_skincare_cards). */}
      <ResultTabs
        nav={<ScreenHeader title="Product details" />}
        // No product to name: what was read, as the header.
        header={
          <View style={{ paddingHorizontal: SPACE.gutter }}>
            <PageTitle title={labelName(labelNo)} line={total > 0 ? `Read from your photo · ${recognised} of ${total} names recognised` : "Nothing was read"} />
          </View>
        }
        // Scanned from Skin needs: read against what was picked there.
        need={journey}
        ingredients={product.ingredients}
        type={product.type}
        match={match}
        profile={profile}
        onIngredientPress={(ingredient) => router.push({ pathname: "/ingredient/[inci]", params: { inci: ingredient.name, ...(journey ? { from: "journey" } : {}) } })}
        footer={lowCoverage ? <PrimaryButton label="Retake the photo" onPress={() => retake()} /> : null}
      />
    </View>
  );
}
