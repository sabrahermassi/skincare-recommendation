# skincare-recommendation

Skincare product & ingredient lookup — one codebase for iOS, Android and web.

Built on **Expo SDK 57** with Expo Router, NativeWind, Zustand and
`expo-camera` barcode scanning.

## Run it

```bash
npm install
npx expo start        # then press w for web, or scan the QR with Expo Go
npx expo start --web  # web only
```

### On your phone (Expo Go)

- **iPhone** — check that Expo Go's current App Store build actually matches
  this project's SDK version first ([expo.dev/go](https://expo.dev/go) lists
  it). The App Store build lags behind the newest SDKs, so a plain install
  may refuse this project; if so, use `eas go` (needs an Apple Developer
  Program membership and TestFlight) or sign.expo.dev re-signing instead.
- **Android** — the Play Store build can be newer *or* older than this
  project and will then refuse it either way. Get a matching build with
  `npx expo-go download android <sdk>` (swap `<sdk>` for whatever this
  project is on — see `package.json`'s `expo` version) or via
  [expo.dev/go](https://expo.dev/go), sideload it, and scan the QR from
  inside Expo Go.

Phone and computer must share a Wi-Fi network. If the QR doesn't connect, allow
Node.js through Windows Firewall on private networks, or use `npx expo start --tunnel`.

## Layout

```
app/                 file-based routes (expo-router)
  _layout.tsx        root Stack; imports global.css
  index.tsx          home
  details.tsx        second screen
  scan.tsx           barcode scanner
store/useAppStore.ts skin profile, saved products, onboarding flag
global.css           tailwind directives
tailwind.config.js   nativewind preset + content globs
```

## Notes

- **Tailwind must stay on v3.** NativeWind 4's runtime declares `tailwindcss: "~3"`
  as a hard peer; Tailwind 4 breaks it.
- **Barcode scanning on web was QR-only as of SDK 54** (`expo-camera` used jsQR
  in the browser; EAN-13 / UPC-A scanned on iOS and Android only, with the scan
  screen showing a notice on web rather than failing silently) — **unverified
  since the SDK 57 upgrade**, which added a `barcode-detector` ponyfill with
  full web format support. See `CLAUDE.md` and issue #11.
- Web camera needs a secure context — `localhost` is fine, a LAN IP is not.
- `experiments.reactCompiler` is off; it conflicts with NativeWind's
  `jsxImportSource`. Re-enable and retest once the app is stable.
