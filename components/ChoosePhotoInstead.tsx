import { useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { pickLabelPhoto } from "@/lib/pick-label-photo";
import { failureFromState, readLabelPhoto } from "@/lib/read-label-photo";
import { scanStateCopy } from "@/lib/scan-copy";
import { INK, MUTED, TOUCH_TARGET } from "@/lib/tokens";
import { haptic } from "@/lib/haptics";

type State =
  | { kind: "idle" }
  // The photo library is open. Not "reading" yet: nothing has been chosen,
  // and saying "Reading the ingredient list…" behind the picker claimed work
  // that hadn't started (#295).
  | { kind: "picking" }
  | { kind: "reading" }
  | { kind: "failed"; message: string; hint?: string; action?: string; retryable: boolean };

const READING = scanStateCopy({ kind: "working", step: "photo" });
const CHOOSE_A_PHOTO = scanStateCopy({ kind: "couldnt-read", why: "photo" }).link;

/**
 * "Choose a photo instead" — for the permission screens. Someone who turned the
 * camera off can still read an ingredient list from a picture already on their
 * phone, which needs no camera access, so a denied camera is not a dead end.
 * Picks, reads and reports through the same steps the label camera uses
 * (`pickLabelPhoto`, `readLabelPhoto`), and says what went wrong in the same
 * words when it fails.
 */
export function ChoosePhotoInstead({
  barcode,
  onRead,
  isStillWanted,
}: {
  /** Handed over by whoever sent the user here after a miss; the product read is saved under it. */
  barcode?: string;
  /** Called once the photo has been read and its list is held for the add-product screen. */
  onRead: () => void;
  /** Same as `LabelCamera`'s own prop of the same name — see its comment (issue #191). */
  isStillWanted?: () => boolean;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // Cancel (#204) moves this on, so a read that lands afterwards is dropped.
  const attempt = useRef(0);
  const reading = state.kind === "reading";
  const busy = reading || state.kind === "picking";
  const cannotRetry = state.kind === "failed" && !state.retryable;

  async function choose() {
    if (busy || cannotRetry) return;
    const mine = ++attempt.current;
    const cancelled = () => attempt.current !== mine;
    setState({ kind: "picking" });
    let picked: Awaited<ReturnType<typeof pickLabelPhoto>> = null;
    try {
      picked = await pickLabelPhoto();
      if (!picked) {
        setState({ kind: "idle" });
        return;
      }
      if (!picked.base64) {
        setState({ kind: "failed", ...failureFromState({ kind: "couldnt-read", why: "photo" }) });
        return;
      }
      setState({ kind: "reading" });
      const outcome = await readLabelPhoto(picked.base64, barcode, () => !cancelled() && (isStillWanted?.() ?? true));
      if (cancelled()) return;
      if (outcome.kind === "read") {
        haptic.success();
        setState({ kind: "idle" });
        onRead();
        return;
      }
      setState({ kind: "failed", message: outcome.message, hint: outcome.hint, action: outcome.action, retryable: outcome.retryable });
    } catch {
      if (!cancelled()) setState({ kind: "failed", ...failureFromState({ kind: "couldnt-reach", why: "default" }) });
    } finally {
      picked?.cleanup();
    }
  }

  const speech =
    state.kind === "failed"
      ? state.hint
        ? `${state.message} ${state.hint}`
        : state.message
      : reading
        ? READING.title ?? ""
        : "";

  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      <ScreenReaderAnnouncer message={speech} />
      {state.kind === "failed" ? (
        <View accessible accessibilityLabel={speech} style={{ alignItems: "center", gap: 2, paddingHorizontal: 12 }}>
          <Text style={{ textAlign: "center", fontSize: 13.5, fontWeight: "600", color: INK }}>{state.message}</Text>
          {state.hint ? <Text style={{ textAlign: "center", fontSize: 12.5, color: MUTED }}>{state.hint}</Text> : null}
        </View>
      ) : null}
      <Pressable
        onPress={() => void choose()}
        disabled={busy || cannotRetry}
        accessibilityRole="button"
        accessibilityLabel="Choose a photo of the ingredient list from your library"
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 12 }}
        className="active:opacity-70"
      >
        <Text
          style={{
            fontSize: 12.5,
            color: MUTED,
            textDecorationLine: "underline",
            opacity: busy || cannotRetry ? 0.5 : 1,
          }}
        >
          {reading ? READING.title : CHOOSE_A_PHOTO}
        </Text>
      </Pressable>
      {reading ? (
        <Pressable
          onPress={() => {
            attempt.current++;
            setState({ kind: "idle" });
          }}
          accessibilityRole="button"
          accessibilityLabel={READING.link}
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 12 }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: 12.5, color: MUTED, textDecorationLine: "underline" }}>{READING.link}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
