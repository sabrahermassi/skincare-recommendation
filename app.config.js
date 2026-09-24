/**
 * Everything static lives in app.json; this file adds only what depends on
 * the environment.
 *
 * Google sign-in (#218): the native module needs its iOS URL scheme in
 * Info.plist so the Google sheet can hand control back to the app. That
 * scheme is the iOS OAuth client ID reversed, so one variable —
 * EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID, which lib/auth.ts also reads — drives
 * both. Without it the plugin is left out entirely rather than given a
 * placeholder, and lib/auth.ts hides the Google button. Listing the plugin
 * with no options would switch it to its Firebase mode, which adds Android
 * Google Services build steps this app does not use.
 */
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return config;

  const suffix = ".apps.googleusercontent.com";
  if (!iosClientId.endsWith(suffix)) {
    throw new Error(`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID should end with "${suffix}".`);
  }
  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.slice(0, -suffix.length)}`;

  return {
    ...config,
    plugins: [...(config.plugins ?? []), ["@react-native-google-signin/google-signin", { iosUrlScheme }]],
  };
};
