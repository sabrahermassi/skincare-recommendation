import { useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { BUTTON_WIDTH } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { mistakeReportUrl, type MistakeSubject } from "@/lib/report-mistake";
import { supportEmail } from "@/lib/support-email";
import { BUTTON, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * A quiet "Report a mistake" link at the foot of the product and ingredient
 * pages (#327): opens a pre-filled email to support. Hidden when no support
 * address is set, the same rule `app/support.tsx` keeps. When the phone has
 * no mail app, says where to write instead, in text that can be copied.
 */
export function ReportMistakeLink({ subject, button = false }: { subject: MistakeSubject; button?: boolean }) {
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
        accessibilityRole={button ? "button" : "link"}
        accessibilityLabel="Report a mistake"
        accessibilityHint="Opens an email to us"
        style={
          button
            ? // v9: a sage 220pt button under the full ingredient list.
              { alignSelf: "center", width: BUTTON_WIDTH.secondary, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: BUTTON.primary.fill }
            : { minHeight: TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }
        }
        className={button ? "active:opacity-90" : "active:opacity-70"}
      >
        {button ? (
          <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.16, color: BUTTON.primary.label }}>Report a mistake</Text>
        ) : (
          <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Report a mistake</Text>
        )}
      </Pressable>
      {mailFailed ? (
        <Text selectable style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
          {`We couldn't open a mail app on this phone. You can write to ${email} instead.`}
        </Text>
      ) : null}
    </View>
  );
}
