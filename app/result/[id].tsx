import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { FactorBar } from "@/components/FactorBar";
import { ProductIllustration } from "@/components/ProductIllustration";
import { ScoreRing } from "@/components/ScoreRing";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct, verdictHeadline, type MatchResult, type Verdict } from "@/lib/matching";
import { COMEDOGENIC_FLAG_THRESHOLD, isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * "Why this score" — screen 2 of the Skintel Screens design.
 *
 * The whole app funnels here. It answers the Olive Young question (INCIDecoder
 * → comedogenic check → review site) in one view: a score, the factors behind
 * it, and the two risks people actually ask about.
 *
 * Every number on this screen is derived from the formula. Where the design
 * called for data we do not hold — an EWG hazard score, a written verdict —
 * the card shows something we can actually source instead of a plausible
 * fabrication.
 */

const PANEL: Record<Verdict, { bg: string; border: string; label: string; ink: string }> = {
  good: { bg: "#EAF3EC", border: "#DCEBE0", label: "Good match", ink: "#4B7A5E" },
  mixed: { bg: "#FBF0E4", border: "#F2E2CE", label: "Worth a look", ink: "#8A6314" },
  poor: { bg: "#FBEAEC", border: "#F2D8DC", label: "Not for you", ink: "#A2521F" },
  unknown: { bg: "#F3EFEA", border: "#E9E4DD", label: "Can't tell yet", ink: "#5C5566" },
};

const RING_TONE: Record<Verdict, "good" | "mixed" | "poor" | "unknown"> = {
  good: "good",
  mixed: "mixed",
  poor: "poor",
  unknown: "unknown",
};

export default function ScanResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(true);

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const recordView = useAppStore((s) => s.recordView);
  const saved = savedProducts.some((p) => p.id === id);
  const loggedId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProduct(id)
      .then((result) => {
        if (cancelled) return;
        setProduct(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProduct failed:", err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!product || loggedId.current === product.id) return;
    loggedId.current = product.id;
    const { score, warnings } = matchProduct(product, useAppStore.getState().profile);
    recordView({ id: product.id, known: true, score, warnings: warnings.length });
  }, [product, recordView]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!product) {
    return (
      <View className="flex-1 bg-canvas">
        <ScreenHeader />
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="font-display text-2xl text-ink">Product not found</Text>
          <Pressable
            onPress={() => router.replace("/scan")}
            className="h-[52px] items-center justify-center rounded-control bg-accent px-8 active:bg-accent-deep"
          >
            <Text className="text-sm font-semibold text-white">Scan another</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const match = matchProduct(product, profile);
  const panel = PANEL[match.verdict];
  const total = product.ingredients.length;
  const recognised = product.ingredients.filter(isVerified).length;

  async function share() {
    if (!product) return;
    const line =
      match.score === null
        ? `${product.brand} ${product.name} — checked on Skintel`
        : `${product.brand} ${product.name} — ${match.score}/100 for my skin, on Skintel`;
    try {
      await Share.share({ message: line });
    } catch (err) {
      console.warn("share failed:", err);
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        right={
          <Pressable onPress={share} hitSlop={12} accessibilityLabel="Share this result">
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 15.5V3.4M7.8 7.6 12 3.4l4.2 4.2M5 13.6V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5.4"
                stroke="#453F4E"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        }
      />

      <ScrollView contentContainerClassName="pb-4">
        {/* Which product this is about, stated once and compactly. */}
        <View className="flex-row items-center gap-3.5 px-6 pt-5">
          <ProductIllustration type={product.type} size={58} radius="rounded-chip" />
          <View className="flex-1 gap-1">
            <Text className="text-[16.5px] font-medium leading-[22px] tracking-tight text-ink">
              {product.name}
            </Text>
            <Text className="text-[11.5px] text-ink-muted">
              {[product.volume, product.type].filter(Boolean).join(" / ")}
            </Text>
          </View>
        </View>

        {/* The verdict, before anything else. Never colour alone — the panel
            carries a word too. */}
        <View
          className="mx-6 mt-5 flex-row items-center gap-5 rounded-card border p-5"
          style={{ backgroundColor: panel.bg, borderColor: panel.border }}
        >
          <ScoreRing
            score={match.score}
            size={82}
            label="/100"
            tone={RING_TONE[match.verdict]}
          />
          <View className="flex-1 gap-1.5 pr-6">
            <Text
              className="font-display text-[21px] leading-[23px] tracking-tight"
              style={{ color: panel.ink }}
            >
              {panel.label}
            </Text>
            <Text className="text-[13px] leading-[18px] text-ink-muted">
              {verdictHeadline(match)}
            </Text>
          </View>

          <Pressable
            onPress={() => toggleSaved(product.id)}
            hitSlop={10}
            accessibilityLabel={saved ? "Remove from shelf" : "Save to my shelf"}
            accessibilityState={{ selected: saved }}
            className="absolute right-4 top-4"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill={saved ? panel.ink : "none"}>
              <Path
                d="M12 20.2s-7.6-4.7-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.8c0 5-7.6 9.7-7.6 9.7Z"
                stroke={panel.ink}
                strokeWidth={1.7}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>

        {match.factors.length > 0 ? (
          <>
            <Text className="pt-3.5 text-center text-[10.5px] text-ink-muted">
              Why? We read {recognised} of {total} ingredients.
            </Text>
            <View className="px-6 pt-4">
              {match.factors.map((factor) => (
                <FactorBar key={factor.category} factor={factor} />
              ))}
            </View>
          </>
        ) : (
          <Text className="px-6 pt-5 text-center text-[12.5px] leading-[18px] text-ink-muted">
            Nothing in this formula matched a rule we hold, so there is no
            breakdown to show — the score above is the whole answer.
          </Text>
        )}

        {/* This screen is a judgement, so the caveat belongs on it. */}
        <View className="mx-6 mt-4 flex-row items-center justify-center gap-2.5 rounded-control bg-hairline/50 px-4 py-3">
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={9} stroke={COLORS.inkMuted} strokeWidth={1.8} />
            <Path
              d="M12 11v5.4M12 7.7v.1"
              stroke={COLORS.inkMuted}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          </Svg>
          <Text className="text-center text-[10.5px] leading-[15px] text-ink-muted">
            Based on your skin profile and public ingredient data. Not medical advice.
          </Text>
        </View>

        {/* The two risks people actually ask about, both computed rather than
            quoted: nothing here is an EWG-style hazard number. */}
        <View className="flex-row gap-3 px-6 pt-3.5">
          <RiskCard
            title={"Irritation\nrisk"}
            {...irritationRisk(product, match)}
            icon={
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 3.2 5 6v5.6c0 4.3 2.9 7.6 7 9.2 4.1-1.6 7-4.9 7-9.2V6l-7-2.8Z"
                  stroke="#6D9A7E"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            }
          />
          <RiskCard
            title={"Pore-clogging\nrisk"}
            {...poreRisk(product, match)}
            icon={
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Circle cx={8} cy={8} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
                <Circle cx={15.6} cy={9.4} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
                <Circle cx={10} cy={15.4} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
                <Circle cx={16.4} cy={16} r={1.4} stroke="#6D9A7E" strokeWidth={1.7} />
              </Svg>
            }
          />
        </View>

        {product.attribution ? (
          <Text className="px-6 pt-5 text-[10.5px] leading-4 text-ink-faint">
            {product.attribution}
          </Text>
        ) : null}
      </ScrollView>

      {/* Thumb zone: the two things you do next. */}
      <View className="gap-3 border-t border-hairline bg-canvas px-6 pb-8 pt-3.5">
        <Pressable
          onPress={() =>
            total > 0
              ? router.push({ pathname: "/ingredients/[id]", params: { id: product.id } })
              : router.push(`/scan-label?barcode=${product.barcode}`)
          }
          className="h-[52px] items-center justify-center rounded-control bg-accent active:bg-accent-deep"
        >
          <Text className="text-[14.5px] font-medium text-white">
            {total > 0 ? "View ingredients" : "Photograph the ingredients"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => toggleSaved(product.id)}
          className={`h-[52px] flex-row items-center justify-center gap-2.5 rounded-control border ${
            saved ? "border-accent bg-tint-lilac" : "border-hairline bg-surface active:bg-canvas"
          }`}
        >
          <Svg width={17} height={17} viewBox="0 0 24 24" fill={saved ? COLORS.ink : "none"}>
            <Path
              d="M12 20.2s-7.6-4.7-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.8c0 5-7.6 9.7-7.6 9.7Z"
              stroke={COLORS.ink}
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          <Text className="text-[14.5px] font-medium text-ink">
            {saved ? "Saved to my shelf" : "Save to my shelf"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RiskCard({
  title,
  icon,
  level,
  note,
}: {
  title: string;
  icon: React.ReactNode;
  level: string;
  note: string;
}) {
  return (
    <View className="flex-1 gap-[7px] rounded-control border border-panel-success-line bg-panel-success px-4 pb-4 pt-3.5">
      <View className="flex-row items-start gap-2">
        <View className="mt-px">{icon}</View>
        <Text className="flex-1 text-[11.5px] leading-[15px] text-ink-muted">{title}</Text>
      </View>
      <Text className="font-display text-[19px] leading-[20px] text-status-safe">{level}</Text>
      <Text className="text-[10.5px] text-ink-muted">{note}</Text>
    </View>
  );
}

/**
 * Irritation risk, from the EU regulatory status of what is actually in the
 * bottle plus anything contraindicated for this profile. Not a hazard score —
 * a count of restricted entries, said in words.
 */
function irritationRisk(
  product: ProductWithIngredients,
  match: MatchResult
): { level: string; note: string } {
  const restricted = product.ingredients.filter(
    (i) => isVerified(i) && i.safety !== "safe"
  ).length;
  const personal = match.warnings.length;

  if (product.ingredients.length === 0) return { level: "Unknown", note: "Label not read yet" };
  if (personal > 0) {
    return { level: "Elevated", note: `${personal} flagged for your skin` };
  }
  if (restricted === 0) return { level: "Low", note: "Nothing restricted" };
  if (restricted <= 2) return { level: "Moderate", note: `${restricted} restricted entries` };
  return { level: "Elevated", note: `${restricted} restricted entries` };
}

/**
 * Pore-clogging risk. CosIng rates no ingredient for this — `comedogenic` is
 * null for every real row — so where the rating is absent this falls back to
 * the rule table's own pore-clogging category, which is where that judgement
 * actually lives.
 */
function poreRisk(
  product: ProductWithIngredients,
  match: MatchResult
): { level: string; note: string } {
  if (product.ingredients.length === 0) return { level: "Unknown", note: "Label not read yet" };

  const rated = product.ingredients.filter((i) => isVerified(i) && i.comedogenic > 0);
  const worst = Math.max(0, ...rated.map((i) => i.comedogenic));
  const fromRules = match.factors.find((f) => f.category === "pore-clogging" && f.delta < 0);

  if (worst >= COMEDOGENIC_FLAG_THRESHOLD) {
    return { level: "Elevated", note: `Rated ${worst}/5 at worst` };
  }
  if (fromRules) {
    return { level: "Moderate", note: fromRules.ingredients[0] ?? "One ingredient" };
  }
  if (worst > 0) return { level: "Low", note: `Rated ${worst}/5 at worst` };
  return { level: "Low", note: "Nothing flagged" };
}
