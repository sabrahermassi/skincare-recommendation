import { useState } from "react";
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
    // A photo alone gives a result, never a catalogue entry: a product is only
    // added with a name, a barcode and an ingredient list, enforced in
    // `replace_product_with_ingredients` (#293).
    body: "Open the scanner, choose Photo and photograph its ingredient list: you get a result straight away. To add it to the catalogue so the next scan finds it, tap “Name and add this product” — we need its name, its barcode and the ingredient list.",
  },
  {
    title: "The ingredients look wrong",
    // Not "photograph it again to refresh what we hold": `label-ocr` leaves a
    // product that already has ingredients as it is (#293).
    body: "Formulas change and labels can be misread. Photograph the ingredient list on your bottle to get a result for exactly what it says, and check the packaging for anything that matters.",
  },
  {
    title: "How the score is worked out",
    body: "It compares the ingredient list with your skin profile. Open a product and tap “Why this score” to see which ingredients moved it.",
  },
  {
    title: "Change your answers",
    body: "Profile → Skin profile. Nothing is re-scored until you tap “Save”.",
  },
];

/** Support — answers to the questions people actually have, and a way to write to us. */
export default function Support() {
  // `Linking.openURL` rejects when the phone has no mail app set up to take a mailto link.
  const [mailFailed, setMailFailed] = useState(false);
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
            <PrimaryButton
              size={52}
              label="Email support"
              onPress={() => {
                Linking.openURL(`mailto:${SUPPORT_EMAIL}`)
                  .then(() => setMailFailed(false))
                  .catch(() => setMailFailed(true));
              }}
            />
            {mailFailed ? (
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: MUTED }}>
                {`We couldn't open a mail app on this phone. You can write to ${SUPPORT_EMAIL} instead.`}
              </Text>
            ) : null}
          </View>
        ) : null}

      </ScrollView>
    </View>
  );
}
