import { ScrollView, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { CANVAS, INK, MUTED, MUTED_FAINT, TYPE } from "@/lib/tokens";

// The facts behind each line are recorded in docs/privacy-disclosures.md.
const SECTIONS: { title: string; lines: string[] }[] = [
  {
    title: "Stays on your phone",
    lines: [
      "Your skin profile — your concerns, skin type, sensitivity and pregnancy answer — and your scan history never leave this phone, whether or not you have an account.",
      "They can be included in your phone's own backups. Delete my profile, in Profile, erases them, along with your shelf.",
    ],
  },
  {
    title: "If you sign in",
    lines: [
      "You don't need an account to scan or see a verdict. You need one to keep a shelf.",
      "Signing in gives us your email address and an account ID. With Apple, the address can be a Hide My Email one, and we don't ask Apple for your name.",
      "Google always shares your name and profile picture when you sign in with it, and they're kept with your account. The app doesn't show or use them, and deleting your account deletes them.",
      "Your saved products — with any note you write and the routine step you pick — and your starred ingredients are kept with your account on our servers, so they're on every phone you sign in on. Only you can read them. Notes are never shared or counted.",
      "Profile → Account lets you download everything in your account as a file, or delete your account. Deleting it removes the account and everything saved to it straight away.",
    ],
  },
  {
    title: "What is sent to look things up",
    lines: [
      "When you scan a barcode, the barcode number is sent to our server and on to the product databases we look it up in. Nothing from your profile or history is.",
    ],
  },
  {
    title: "Photographing an ingredient list",
    lines: [
      "Only when you use Photo. A picture taken with the camera is cropped to the frame; one you choose from your library is sent whole. Either way it is stripped of location and device details and sent to Google Cloud Vision to read the text.",
      "We never store the picture. What we keep is the text we read, saved against the product. Google says it does not use what is sent to train its models.",
    ],
  },
  {
    // The credit each product used to carry at the foot of its own screen. Open
    // Beauty Facts data is licensed under the ODbL, which asks for it to be
    // credited; it is kept here rather than on every product.
    title: "Where product data comes from",
    lines: [
      "Product data from Open Beauty Facts, used under ODbL.",
      "Label data from DailyMed (U.S. National Library of Medicine), public domain.",
      "Some products are identified through UPCitemdb, which does not provide ingredients.",
    ],
  },
  {
    title: "Counting what gets used",
    lines: [
      "We count a few steps — starting a scan, seeing a verdict, tapping Save, signing in — to learn where people stop. PostHog processes these counts for us, on servers in the EU.",
      "A count never includes what you scanned, a product name, a photo, or anything from your skin profile. Counts are tied to a random number made on your phone, and to your account only if you sign in. Signing out starts a new random number.",
    ],
  },
  {
    title: "What we do not do",
    lines: [
      "We do not take photos of your face or skin, and we do not track you across other apps or websites.",
    ],
  },
];

/** Privacy policy — what is kept, what leaves the phone, and why. */
export default function Privacy() {
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Privacy policy" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24, paddingBottom: 60 }}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={{ gap: 8 }}>
            <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, color: INK }}>{section.title}</Text>
            {section.lines.map((line) => (
              <Text key={line} style={{ fontSize: 13.5, lineHeight: 20, color: MUTED }}>
                {line}
              </Text>
            ))}
          </View>
        ))}
        <Text style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED_FAINT }}>
          Ingredient assessments are based on your skin profile and public ingredient data. They are not medical advice.
        </Text>
      </ScrollView>
    </View>
  );
}
