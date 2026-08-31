import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function Welcome() {
  return (
    <View className="flex-1 justify-center gap-8 bg-white px-8">
      <View className="gap-3">
        <Text className="text-4xl font-bold text-slate-900">
          Find K-beauty that suits your skin
        </Text>
        <Text className="text-base leading-6 text-slate-500">
          Answer two quick questions and every product gets a match score
          against your profile.
        </Text>
      </View>

      <View className="gap-3">
        <Link
          href="/onboarding/skin-type"
          className="rounded-xl bg-teal-600 px-6 py-4 text-center text-base font-semibold text-white active:bg-teal-700"
        >
          Get started
        </Link>
        <Link
          href="/"
          className="py-2 text-center text-sm font-medium text-slate-500"
        >
          Skip for now
        </Link>
      </View>

      <Text className="text-center text-xs text-slate-400">Step 1 of 3</Text>
    </View>
  );
}
