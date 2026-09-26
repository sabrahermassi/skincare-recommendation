/**
 * Where support email goes, from the app's environment. Unset → no contact
 * button or link anywhere, rather than a made-up address (`app/support.tsx`,
 * `components/ReportMistakeLink.tsx`).
 */
export function supportEmail(): string | undefined {
  return process.env.EXPO_PUBLIC_SUPPORT_EMAIL || undefined;
}
