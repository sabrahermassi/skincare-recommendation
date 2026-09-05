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
  {
    // Issue #12. AsyncStorage is plaintext at its own layer, and
    // localStorage is not a secure store on any platform. Confining these
    // imports to the files that are allowed to hold them is what makes
    // "tokens never touch AsyncStorage" a build failure instead of a thing
    // someone has to remember. See docs/device-storage-policy.md.
    files: ['**/*.{ts,tsx}'],
    ignores: [
      'store/useAppStore.{ts,tsx}', // the approved AsyncStorage seam (issue #2)
      // 'lib/secure-storage.{ts,tsx}', // uncomment with the auth PR — the only
                                   // file permitted to import expo-secure-store
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '@react-native-async-storage/async-storage',
            message:
              'AsyncStorage may only be used from store/useAppStore.ts, and only ' +
              'for the non-credential classes in docs/device-storage-policy.md. ' +
              'Auth/session material must never go here.',
          },
          {
            name: 'expo-secure-store',
            message:
              'expo-secure-store may only be imported from lib/secure-storage.ts. ' +
              'Create it per docs/device-storage-policy.md and add it to the ' +
              'allowlist in eslint.config.js in the same commit.',
          },
        ],
      }],
      // no-restricted-imports does not see require() or dynamic import().
      'no-restricted-syntax': ['error',
        {
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/async-storage|expo-secure-store/]",
          message: 'Same rule as no-restricted-imports — see docs/device-storage-policy.md.',
        },
        {
          selector: "ImportExpression[source.value=/async-storage|expo-secure-store/]",
          message: 'Same rule as no-restricted-imports — see docs/device-storage-policy.md.',
        },
      ],
      // The web half of "never localStorage" — bare identifier form.
      'no-restricted-globals': ['error',
        { name: 'localStorage', message: 'Not a secure store. See docs/device-storage-policy.md.' },
        { name: 'sessionStorage', message: 'Not a secure store. See docs/device-storage-policy.md.' },
      ],
      // ...and the qualified forms, which no-restricted-globals does not see.
      'no-restricted-properties': ['error',
        { object: 'window', property: 'localStorage', message: 'See docs/device-storage-policy.md.' },
        { object: 'window', property: 'sessionStorage', message: 'See docs/device-storage-policy.md.' },
        { object: 'globalThis', property: 'localStorage', message: 'See docs/device-storage-policy.md.' },
        { object: 'globalThis', property: 'sessionStorage', message: 'See docs/device-storage-policy.md.' },
      ],
    },
  },
]);
