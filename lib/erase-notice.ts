/**
 * "Your profile is erased", shown once on the onboarding screen right after
 * Profile's erase. Held in memory rather than passed in the URL (#29): a
 * `?erased=1` on the route could be set by any link, so the message would
 * show to people whose profile was never touched.
 */
let pending = false;

/** Profile's erase calls this just before it opens onboarding. */
export function noteProfileErased(): void {
  pending = true;
}

/** Whether an erase is waiting to be acknowledged. Reading it doesn't clear it. */
export function profileErasedNoticePending(): boolean {
  return pending;
}

/** Called once the notice has been shown, so it shows once. */
export function clearProfileErasedNotice(): void {
  pending = false;
}
