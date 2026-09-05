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
  {
    // eslint-config-expo's SDK 57 bump promoted this to an error. Several
    // screens intentionally reset a loading flag at the top of a
    // data-fetching effect when its dependency (an id/param) changes —
    // correct at runtime, just not the "track request identity instead"
    // shape this rule wants. Downgraded rather than refactored while that
    // cleanup is still pending; see the SDK 57 upgrade notes.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
