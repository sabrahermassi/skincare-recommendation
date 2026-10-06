import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { Pressable } from "react-native";

import { Text } from "@/components/Text";
import { BUTTON, CHOSEN, TYPE } from "@/lib/tokens";

/** A link that leaves the app: the label, and the "opens a website" arrow (owner) every such link wears. */
export function ReferenceLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => void WebBrowser.openBrowserAsync(url).catch((err) => console.warn("openBrowserAsync failed:", err))}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint="Opens in your browser"
      style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6 }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: CHOSEN.accent }}>{label}</Text>
      <Ionicons name="open-outline" size={16} color={BUTTON.primary.fill} />
    </Pressable>
  );
}
