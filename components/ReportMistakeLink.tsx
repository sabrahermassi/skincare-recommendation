import { Image } from "expo-image";
import { useState } from "react";
import { Linking, Pressable, TextInput, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { Text } from "@/components/Text";
import { mistakeReportUrl, type MistakeSubject } from "@/lib/report-mistake";
import { supportEmail } from "@/lib/support-email";
import { BUTTON, DESTRUCTIVE_OUTLINE, DISPLAY_FONT, FONT_SCALE, INK, MUTED, OPTION_LINE, PLACEHOLDER, STONE, TOUCH_TARGET, TYPE } from "@/lib/tokens";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";

const REPORT_ART = require("@/assets/illustrations/report-mistake.webp");

/**
 * "Report a mistake" at the foot of the product and ingredient pages (#327).
 * The link is hidden when no support address is set, the same rule
 * `app/support.tsx` keeps. The button is always there (owner, v9): where
 * reports go is still to be built, so with no address its sheet takes what
 * was typed, sends it nowhere, and says thank you.
 *
 * As a `button` (v9, inside the ingredient box) it is the soft red pill, and
 * opens a sheet: a picture, "What looks wrong about this product?", a text
 * box, and Send report — which hands what was typed to a pre-filled email to
 * support, then says thank you. As a link (the ingredient page) it opens that
 * email straight away. When the phone has no mail app, both say where to
 * write instead, in text that can be copied.
 */
export function ReportMistakeLink({ subject, button = false }: { subject: MistakeSubject; button?: boolean }) {
  const email = supportEmail();
  const [mailFailed, setMailFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  if (!email && !button) return null;

  const send = (text = ""): Promise<boolean> => {
    if (!email) {
      // TODO(owner): nothing receives a report yet; the backend comes later.
      console.warn("[report-mistake] no support address set: this report was not sent");
      return Promise.resolve(true);
    }
    return Linking.openURL(mistakeReportUrl(email, subject, text))
      .then(() => {
        setMailFailed(false);
        return true;
      })
      .catch(() => {
        setMailFailed(true);
        return false;
      });
  };
  const failure = mailFailed && email ? (
    <Text selectable style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
      {`We couldn't open a mail app on this phone. You can write to ${email} instead.`}
    </Text>
  ) : null;

  if (!button) {
    return (
      <View style={{ gap: 4 }}>
        <Pressable
          onPress={() => void send()}
          accessibilityRole="link"
          accessibilityLabel="Report a mistake"
          accessibilityHint="Opens an email to us"
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Report a mistake</Text>
        </Pressable>
        {failure}
      </View>
    );
  }

  const ready = note.trim().length > 0;
  const close = () => setOpen(false);
  return (
    <>
      <Pressable
        onPress={() => {
          setSent(false);
          setNote("");
          setMailFailed(false);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Report a mistake"
        style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, alignItems: "center", justifyContent: "center", backgroundColor: DESTRUCTIVE_OUTLINE.fill }}
        className="active:opacity-80"
      >
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: DESTRUCTIVE_OUTLINE.label }}>Report a mistake</Text>
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={close}
        floating
        corner={
          <IconCircle onPress={close} accessibilityLabel="Close">
            <CloseCross />
          </IconCircle>
        }
      >
        <View style={{ alignItems: "center", paddingHorizontal: 8 }}>
          <Image source={REPORT_ART} contentFit="contain" accessibilityLabel="" style={{ width: 132, height: 132 }} />
          <Text accessibilityRole="header" style={{ marginTop: 8, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            {sent ? "Thank you" : "Report a mistake"}
          </Text>
          <Text style={{ marginTop: 8, maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
            {sent ? "We'll check this product and fix it if something's off." : "What looks wrong about this product?"}
          </Text>
          {sent ? null : (
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="e.g. The ingredient list is from an older version."
              placeholderTextColor={PLACEHOLDER}
              maxFontSizeMultiplier={FONT_SCALE.ui}
              accessibilityLabel="What looks wrong"
              style={{
                alignSelf: "stretch",
                minHeight: 96,
                marginTop: 16,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: ready ? BUTTON.primary.fill : OPTION_LINE,
                backgroundColor: STONE,
                fontSize: TYPE.card,
                lineHeight: 24,
                color: INK,
                textAlignVertical: "top",
              }}
            />
          )}
          {failure ? <View style={{ marginTop: 12 }}>{failure}</View> : null}
          <Pressable
            onPress={() => {
              if (sent) return close();
              void send(note).then((ok) => setSent(ok));
            }}
            disabled={!sent && !ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !sent && !ready }}
            style={{
              alignSelf: "stretch",
              height: 48,
              marginTop: 16,
              borderRadius: 24,
              alignItems: "center",
              justifyContent: "center",
              // Done is the filled sage button; Send report is the soft red one, grey until something is typed.
              backgroundColor: sent ? BUTTON.primary.fill : ready ? DESTRUCTIVE_OUTLINE.fill : STONE,
            }}
            className="active:opacity-80"
          >
            <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.16, color: sent ? BUTTON.primary.label : ready ? DESTRUCTIVE_OUTLINE.label : PLACEHOLDER }}>{sent ? "Done" : "Send report"}</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
}
