import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import { mistakeReportUrl, type MistakeSubject } from "@/lib/report-mistake";
import { supportEmail } from "@/lib/support-email";
import { MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * A quiet "Report a mistake" link at the foot of the product and ingredient
 * pages (#327): opens a pre-filled email to support. Hidden when no support
 * address is set, the same rule `app/support.tsx` keeps. When the phone has
 * no mail app, says where to write instead, in text that can be copied.
 */
export function ReportMistakeLink({ subject }: { subject: MistakeSubject }) {
  const email = supportEmail();
  const [mailFailed, setMailFailed] = useState(false);
  if (!email) return null;
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        onPress={() => {
          Linking.openURL(mistakeReportUrl(email, subject))
            .then(() => setMailFailed(false))
            .catch(() => setMailFailed(true));
        }}
        accessibilityRole="link"
        accessibilityHint="Opens an email to us"
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: TYPE.caption, color: MUTED, textDecorationLine: "underline" }}>Report a mistake</Text>
      </Pressable>
      {mailFailed ? (
        <Text selectable style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
          {`We couldn't open a mail app on this phone. You can write to ${email} instead.`}
        </Text>
      ) : null}
    </View>
  );
}
