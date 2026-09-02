// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // Edge Functions run on Deno, not React Native: different globals,
    // URL imports, and its own type-checker. Linting them with the app's
    // config reports errors that are not errors there.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
