import { Linking, ScrollView, View } from "react-native";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { CANVAS, INK, MUTED, TYPE } from "@/lib/tokens";

// Where to write to. Set it in the app's environment; until it is, the screen
// shows the help below and no contact button rather than a made-up address.
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;

const HELP: { title: string; body: string }[] = [
  {
    title: "A product isn't in our catalogue",
    body: "Open the scanner, choose Photo and photograph its ingredient list. We read it and add the product, so the next scan finds it.",
  },
  {
    title: "The ingredients look wrong",
    body: "Formulas change and labels can be misread. Photograph the ingredient list again to refresh what we hold, and check the packaging for anything that matters.",
  },
  {
    title: "How the score is worked out",
    body: "It compares the ingredient list with your skin profile. Open a product and tap “Why this score” to see which ingredients moved it.",
  },
  {
    title: "Change your answers",
    body: "Profile → Skin profile. Nothing is re-scored until you tap “Find my matches”.",
  },
];

/** Support — answers to the questions people actually have, and a way to write to us. */
export default function Support() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Support" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 22, paddingBottom: 60 }}>
        {HELP.map((item) => (
          <View key={item.title} style={{ gap: 4 }}>
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{item.title}</Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: MUTED }}>{item.body}</Text>
          </View>
        ))}

        {SUPPORT_EMAIL ? (
          <View style={{ gap: 10, paddingTop: 6 }}>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: MUTED }}>Still stuck? Write to us.</Text>
            <PrimaryButton tone="cta" size={52} label="Email support" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}
