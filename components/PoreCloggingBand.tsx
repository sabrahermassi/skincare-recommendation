import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { positionWeightLabel } from "@/lib/matching";
import { poreVerdict, type CloggerHit } from "@/lib/pore-clogging";

/**
 * The pore-clogging answer, directly under the match verdict and above the
 * fold — the one question this app exists to answer faster than the
 * copy-the-list-into-a-website routine it replaces.
 *
 * Two things here that the external checkers do not do:
 *
 *   - It says *where* in the list a clogger sits. INCI order is regulated
 *     descending-concentration data, so coconut oil at #4 of 31 and the same
 *     name at #29 are not the same finding. The web checkers flag both
 *     identically.
 *   - It has a third state. "We recognised 12 of 31 names" is not the same
 *     claim as "this is clean", and a checker that goes quiet when it does not
 *     know something looks exactly like one delivering good news.
 *
 * Contested entries — the ones published lists disagree about — are counted
 * and shown but never drive the warning tone.
 */

type Tone = { bg: string; border: string; ink: string; body: string };

const TONE: Record<"avoid" | "watch" | "quiet" | "good", Tone> = {
  avoid: { bg: "#FBE2E7", border: "#F4D2D9", ink: "#A4526A", body: "#7A4657" },
  watch: { bg: "#FBEBD5", border: "#F3DFC4", ink: "#A9713C", body: "#7F5730" },
  quiet: { bg: "#EFEBE6", border: "#E5E0D9", ink: "#797280", body: "#6B6572" },
  good: { bg: "#E7F1E9", border: "#DCEBE0", ink: "#4E7A5F", body: "#4A6B57" },
};

function AlertIcon({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
      <Path d="M12 7.4v5.8M12 16.4v.1" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
      <Path
        d="m8 12.3 2.7 2.7L16 9.7"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ChevronIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="m9 5 7 7-7 7"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "#4 of 31 · significant" — position is the honest half of this answer. */
function positionLine(hit: CloggerHit): string {
  return `#${hit.position} of ${hit.total} · ${positionWeightLabel(hit.position)}`;
}

export function PoreCloggingBand({
  ingredients,
  onPress,
}: {
  ingredients: Ingredient[];
  /** Opens the ingredient list filtered to these. Omit to render inert. */
  onPress?: () => void;
}) {
  const verdict = poreVerdict(ingredients);

  let tone: Tone;
  let title: string;
  let body: string;
  let hits: CloggerHit[] = [];

  if (verdict.kind === "hits") {
    hits = verdict.hits;
    const warned = verdict.warned;
    const worst = warned.some((h) => h.confidence === "high") ? "avoid" : "watch";

    if (warned.length === 0) {
      tone = TONE.quiet;
      title = `${plural(hits.length, "ingredient")} some sources flag`;
      body =
        "Published lists disagree about these, so this is a heads-up rather than a warning.";
    } else {
      tone = TONE[worst];
      title = plural(warned.length, "pore-clogging ingredient");
      body =
        hits.length > warned.length
          ? `Plus ${hits.length - warned.length} more that sources disagree about.`
          : "Listed in order of how much is in the formula.";
    }
  } else if (verdict.kind === "clean") {
    tone = TONE.good;
    title = "No known pore-clogging ingredients";
    body = "Nothing in this formula appears on the published pore-clogging lists.";
  } else {
    tone = TONE.quiet;
    title = "Can't tell yet";
    body =
      verdict.total === 0
        ? "We haven't read this formula, so there is nothing to check."
        : `We only recognised ${verdict.recognised} of ${verdict.total} ingredients — too little to call it clean.`;
  }

  const showing = hits.slice(0, 4);
  const rest = hits.length - showing.length;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}. ${body}`}
      style={{
        marginHorizontal: 24,
        marginTop: 12,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 10,
        backgroundColor: tone.bg,
        borderColor: tone.border,
      }}
      className="rounded-card border active:opacity-80"
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {verdict.kind === "clean" ? (
          <CheckIcon color={tone.ink} />
        ) : (
          <AlertIcon color={tone.ink} />
        )}
        <Text
          style={{ color: tone.ink, flex: 1 }}
          className="text-[15px] font-semibold tracking-tight"
        >
          {title}
        </Text>
        {onPress ? <ChevronIcon color={tone.ink} /> : null}
      </View>

      {showing.length > 0 ? (
        <View style={{ gap: 7 }}>
          {showing.map((hit) => (
            <View
              key={`${hit.name}-${hit.position}`}
              style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
            >
              <Text
                style={{ color: tone.ink, flexShrink: 1 }}
                className="text-[12.5px] font-medium capitalize"
              >
                {hit.name}
              </Text>
              <Text style={{ color: tone.body }} className="text-[11px]">
                {positionLine(hit)}
              </Text>
            </View>
          ))}
          {rest > 0 ? (
            <Text style={{ color: tone.body }} className="text-[11px]">
              and {rest} more
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={{ color: tone.body }} className="text-[11.5px] leading-[16px]">
        {body}
      </Text>
    </Pressable>
  );
}
