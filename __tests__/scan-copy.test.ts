import {
  labelFailureState,
  lookupFailureState,
  saveFailureState,
  scanStateCopy,
  scanStateSpeech,
  type LabelFailureReason,
  type SaveFailureReason,
  type ScanState,
} from "@/lib/scan-copy";

/**
 * #204: one table for every scan state's words. What must hold: the three
 * messages fixed in FOR_ME_MVP.md §22, one sentence per line, and "couldn't
 * read it" (the thing pointed at) never confused with "couldn't reach us"
 * (the network, a rate limit, our server).
 */

const EVERY_STATE: ScanState[] = [
  { kind: "ready", mode: "barcode" },
  { kind: "ready", mode: "photo" },
  { kind: "working", step: "lookup" },
  { kind: "working", step: "photo" },
  { kind: "working", step: "save" },
  { kind: "found" },
  { kind: "not-ours-yet" },
  { kind: "couldnt-read", why: "not-a-product-code" },
  { kind: "couldnt-read", why: "photo" },
  { kind: "couldnt-read", why: "not-a-list" },
  { kind: "couldnt-read", why: "unrecognised" },
  { kind: "couldnt-read", why: "retake" },
  { kind: "couldnt-reach", why: "default" },
  { kind: "couldnt-reach", why: "rate-limit" },
  { kind: "camera-off", mode: "barcode", refused: false },
  { kind: "camera-off", mode: "photo", refused: false },
  { kind: "camera-off", mode: "barcode", refused: true },
];

describe("scanStateCopy", () => {
  it("says the three messages FOR_ME_MVP.md §22 fixes, word for word", () => {
    expect(scanStateCopy({ kind: "not-ours-yet" })).toMatchObject({
      title: "We don't have this product yet",
      line: "Photograph its ingredient list and we'll add it.",
      action: "Photograph the ingredients",
    });
    expect(scanStateCopy({ kind: "couldnt-read", why: "photo" })).toMatchObject({
      title: "We couldn't read the ingredients",
      line: "Get closer so the small print fills the frame, and tilt away from any glare.",
      action: "Try again",
    });
    expect(scanStateCopy({ kind: "couldnt-reach", why: "default" })).toMatchObject({
      title: "We couldn't check that just now",
      line: "It's us or the connection, not your scan.",
      action: "Try again",
    });
  });

  // No dead ends (#204): every state where something went wrong says what
  // happened and offers the way forward.
  it("gives every failure a title, a line and an action", () => {
    for (const state of EVERY_STATE.filter((s) => s.kind === "couldnt-read" || s.kind === "couldnt-reach" || s.kind === "not-ours-yet" || s.kind === "camera-off")) {
      const copy = scanStateCopy(state);
      expect([JSON.stringify(state), Boolean(copy.title && copy.line && copy.action)]).toEqual([JSON.stringify(state), true]);
    }
  });

  it("calls the search screen Search, never Browse", () => {
    for (const state of EVERY_STATE) {
      expect(JSON.stringify(scanStateCopy(state))).not.toMatch(/Browse/);
    }
  });

  it("tells people what to add, so they don't photograph food packaging", () => {
    expect(scanStateCopy({ kind: "not-ours-yet" }).note).toBe("Only skincare and body care can be added.");
  });
});

describe("couldn't read it, and couldn't reach us, stay apart", () => {
  const PHOTO: LabelFailureReason[] = ["unreadable", "too_little_text", "too_large", "not_a_list", "unrecognised_names"];
  const OURS: LabelFailureReason[] = ["network_error", "server_unavailable", "rate_limited"];

  it.each(PHOTO)("a photo that failed (%s) is the photo's", (reason: LabelFailureReason) => {
    expect(labelFailureState(reason).kind).toBe("couldnt-read");
  });

  it.each(OURS)("a read we couldn't make (%s) is ours, not the photo's", (reason: LabelFailureReason) => {
    expect(labelFailureState(reason).kind).toBe("couldnt-reach");
  });

  it("puts a rate limit in its own words, wherever it happens", () => {
    expect(labelFailureState("rate_limited")).toEqual({ kind: "couldnt-reach", why: "rate-limit" });
    expect(lookupFailureState({ kind: "rate-limited" })).toEqual({ kind: "couldnt-reach", why: "rate-limit" });
    expect(saveFailureState("rate_limited")).toEqual({ kind: "couldnt-reach", why: "rate-limit" });
  });

  it("treats every other failed lookup as ours", () => {
    for (const failure of [{ kind: "offline" }, { kind: "timeout" }, { kind: "server", message: "500" }] as const) {
      expect(lookupFailureState(failure)).toEqual({ kind: "couldnt-reach", why: "default" });
    }
  });

  it.each(["unreadable_list", "expired"] as const)("a save needing a new photo (%s) asks to retake it", (reason: SaveFailureReason) => {
    expect(scanStateCopy(saveFailureState(reason)).action).toBe("Retake the photo");
  });
});

describe("scanStateSpeech", () => {
  it("reads the title and the line as one announcement", () => {
    expect(scanStateSpeech(scanStateCopy({ kind: "couldnt-reach", why: "default" }))).toBe(
      "We couldn't check that just now. It's us or the connection, not your scan.",
    );
    expect(scanStateSpeech(scanStateCopy({ kind: "working", step: "photo" }))).toBe(
      "Checking our database… Hang on, this takes a few seconds.",
    );
  });
});
