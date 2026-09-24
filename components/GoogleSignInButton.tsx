import type { ComponentType } from "react";

import type { GoogleSigninButtonProps } from "@react-native-google-signin/google-signin";

type NativeButton = ComponentType<GoogleSigninButtonProps> & { Size: { Wide: number } };

/**
 * Required inside a try rather than imported: the module's native half is
 * missing from Expo Go, and importing it there throws at load time — which
 * would take down every screen that imports this file, not just the button.
 */
function loadNativeButton(): NativeButton | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("@react-native-google-signin/google-signin") as { GoogleSigninButton: NativeButton })
      .GoogleSigninButton;
  } catch {
    return null;
  }
}

const NativeGoogleButton = loadNativeButton();

/**
 * Google's own Sign in with Google button, drawn by its SDK — so its colours,
 * logo and wording follow Google's brand rules rather than this app's tokens
 * (#220), and no Google artwork ships in this app's assets. Renders nothing
 * where the native module is absent.
 */
export function GoogleSignInButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  if (!NativeGoogleButton) return null;
  return (
    <NativeGoogleButton size={NativeGoogleButton.Size.Wide} color="light" disabled={disabled} onPress={onPress} />
  );
}
