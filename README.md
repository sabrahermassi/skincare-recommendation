# skincare-recommendation

Skincare product & ingredient lookup — one codebase for iOS, Android and web.

Built on **Expo SDK 54** (React Native 0.81.5) with Expo Router, NativeWind, Zustand
and `expo-camera` barcode scanning.

## Run it

```bash
npm install
npx expo start        # then press w for web, or scan the QR with Expo Go
npx expo start --web  # web only
```

### On your phone (Expo Go)

- **iPhone** — install Expo Go from the App Store. The store build tracks SDK 54,
  which matches this project. Scan the terminal QR with the Camera app.
- **Android** — the Play Store build may be newer than SDK 54 and will then refuse
  the project. Get the matching build with `npx expo-go download android 54`
  (or [expo.dev/go](https://expo.dev/go) → SDK 54), sideload it, and scan the QR
  from inside Expo Go.

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
- **Barcode scanning on web is QR-only.** SDK 54's `expo-camera` uses jsQR in the
  browser. EAN-13 / UPC-A product barcodes scan on iOS and Android only; the scan
  screen shows a notice on web rather than failing silently.
- Web camera needs a secure context — `localhost` is fine, a LAN IP is not.
- `experiments.reactCompiler` is off; it conflicts with NativeWind's
  `jsxImportSource`. Re-enable and retest once the app is stable.
