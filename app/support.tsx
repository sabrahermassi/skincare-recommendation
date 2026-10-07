import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { PageTitle } from "@/components/PageTitle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import { supportEmail } from "@/lib/support-email";
import { CANVAS, CARD_RADIUS, HAIRLINE, INK, LINK, MUTED, SPACE, SURFACE, TYPE, LEADING } from "@/lib/tokens";
import { FitScrollView } from "@/components/FitScrollView";
import { noOrphan } from "@/lib/text";

// Where to write to. Until it is set, the screen shows the help below and no
// contact button rather than a made-up address.
const SUPPORT_EMAIL = supportEmail();

const HELP: { title: string; body: string }[] = [
  // v9's four questions (read off the hand-off), then the one v7 answer it
  // dropped that people still need.
  {
    title: "Why is there no score?",
    // A score needs at least 3 identified ingredients and a quarter of the
    // list (lib/matching.ts); below that the result still lists them.
    body: "We need to recognise enough of the list to score it fairly. We still show what's in it.",
  },
  {
    title: "Why can't I find a product?",
    // A photo gives a result, never a catalogue entry: users can't add
    // products (owner), so the catalogue only holds products we imported.
    body: "It isn't in our library yet. Take a photo of its ingredient list and we'll read it for you.",
  },
  {
    title: "How do I change my skin profile?",
    body: "Go to Profile, then Skin profile, and tap Change next to any answer.",
  },
  {
    title: "Is my data sold?",
    // The design adds "no brand deals"; the privacy policy doesn't promise
    // that, so this says only what it does.
    body: "Never. No ads, and we never sell your data.",
  },
  {
    title: "The ingredients look wrong",
    // Not "photograph it again to refresh what we hold": `label-ocr` leaves a
    // product that already has ingredients as it is (#293).
    body: "Formulas change and labels can be misread. Photograph the ingredient list on your bottle to get a result for exactly what it says, and check the packaging for anything that matters.",
  },
];

/** Support — answers to the questions people actually have, and a way to write to us. */
export default function Support() {
  // `Linking.openURL` rejects when the phone has no mail app set up to take a mailto link.
  const [mailFailed, setMailFailed] = useState(false);
  // The first answer starts open (v9); one at a time.
  const [open, setOpen] = useState<string | null>(HELP[0].title);
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <FitScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: 48 }}>
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
                  <Ionicons name="chevron-down" size={16} color={LINK} style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }} />
                </Pressable>
                {isOpen ? <Text style={{ paddingBottom: SPACE.gutter, fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{item.body}</Text> : null}
              </View>
            );
          })}
        </View>

        {SUPPORT_EMAIL ? (
          <View style={{ marginTop: SPACE.section + SPACE.text, alignItems: "center", gap: SPACE.block }}>
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
              <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>
                {noOrphan(`We couldn't open a mail app on this phone. You can write to ${SUPPORT_EMAIL} instead.`)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </FitScrollView>
    </View>
  );
}
