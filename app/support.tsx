import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";

import { PageTitle } from "@/components/PageTitle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import { supportEmail } from "@/lib/support-email";
import { CANVAS, CARD_RADIUS, HAIRLINE, INK, LINK, MUTED, ROW_CHEVRON, SPACE, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

// Where to write to. Until it is set, the screen shows the help below and no
// contact button rather than a made-up address.
const SUPPORT_EMAIL = supportEmail();

const HELP: { title: string; body: string }[] = [
  {
    title: "A product isn't in our catalogue",
    // A photo gives a result, never a catalogue entry: users can't add
    // products (owner), so the catalogue only holds products we imported.
    body: "Open the scanner, choose Photo and photograph its ingredient list: you get a result straight away, even for a product our catalogue doesn't have.",
  },
  {
    title: "The ingredients look wrong",
    // Not "photograph it again to refresh what we hold": `label-ocr` leaves a
    // product that already has ingredients as it is (#293).
    body: "Formulas change and labels can be misread. Photograph the ingredient list on your bottle to get a result for exactly what it says, and check the packaging for anything that matters.",
  },
  {
    title: "How the score is worked out",
    body: "It compares the ingredient list with your skin profile. Open a product to see which ingredients moved it, and tap the match under the score to read how every score works.",
  },
  {
    title: "Change your answers",
    body: "Profile → Skin profile, then Change on any answer. Every score updates straight away.",
  },
];

/** Support — answers to the questions people actually have, and a way to write to us. */
export default function Support() {
  // `Linking.openURL` rejects when the phone has no mail app set up to take a mailto link.
  const [mailFailed, setMailFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: 48 }}>
        <PageTitle title="Support" />

        {/* The questions, each opening its answer in place (v7). */}
        <SectionLabel title="Common questions" first />
        <View style={{ borderRadius: CARD_RADIUS, backgroundColor: SURFACE, overflow: "hidden" }}>
          {HELP.map((item, index) => {
            const isOpen = open === item.title;
            return (
              <View key={item.title} style={{ marginLeft: SPACE.gutter, paddingRight: SPACE.gutter, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: HAIRLINE }}>
                <Pressable
                  onPress={() => setOpen(isOpen ? null : item.title)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  accessibilityState={{ expanded: isOpen }}
                  style={{ minHeight: 48, paddingVertical: SPACE.block, flexDirection: "row", alignItems: "center", gap: SPACE.block }}
                  className="active:opacity-70"
                >
                  <Text style={{ flex: 1, fontSize: TYPE.label, fontWeight: "600", color: INK }}>{item.title}</Text>
                  <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={16} color={ROW_CHEVRON} />
                </Pressable>
                {isOpen ? <Text style={{ paddingBottom: SPACE.gutter, fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{item.body}</Text> : null}
              </View>
            );
          })}
        </View>

        {/* The whole of how a score works, one tap away (#325). */}
        <Pressable
          onPress={() => router.push("/scoring")}
          accessibilityRole="link"
          style={{ minHeight: TOUCH_TARGET, marginTop: SPACE.text, paddingHorizontal: 4, justifyContent: "center", alignSelf: "flex-start" }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>How scoring works</Text>
        </Pressable>

        {SUPPORT_EMAIL ? (
          <View style={{ marginTop: SPACE.section, alignItems: "center", gap: SPACE.block }}>
            <Text style={{ fontSize: TYPE.body, color: MUTED }}>Still stuck? Write to us.</Text>
            <PrimaryButton
              label="Email support"
              style={{ width: BUTTON_WIDTH.secondary }}
              onPress={() => {
                Linking.openURL(`mailto:${SUPPORT_EMAIL}`)
                  .then(() => setMailFailed(false))
                  .catch(() => setMailFailed(true));
              }}
            />
            {mailFailed ? (
              <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
                {`We couldn't open a mail app on this phone. You can write to ${SUPPORT_EMAIL} instead.`}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
