import { Linking, Pressable } from "react-native";

import { Text } from "@/components/Text";
import type { RuleSource } from "@/lib/rules";
import { INK, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * "Source: <label>" under a claim (#326), opening the page the claim was
 * checked against. Shown only where a rule carries a source — the rules
 * themselves never get one that wasn't opened and read as supporting them.
 */
export function SourceLink({ source }: { source: RuleSource }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(source.url).catch((err) => console.warn("openURL failed:", err))}
      accessibilityRole="link"
      accessibilityLabel={`Source: ${source.label}`}
      accessibilityHint="Opens in your browser"
      // A caption line is far shorter than a finger; the slop makes up the
      // difference without spacing the claims apart.
      hitSlop={{ top: (TOUCH_TARGET - 18) / 2, bottom: (TOUCH_TARGET - 18) / 2 }}
      style={{ alignSelf: "flex-start" }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
        Source:{" "}
        <Text style={{ fontSize: TYPE.caption, color: INK, textDecorationLine: "underline" }}>{source.label}</Text>
      </Text>
    </Pressable>
  );
}
