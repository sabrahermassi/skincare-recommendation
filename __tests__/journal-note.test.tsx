import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { NoteEditor } from "@/components/ProductNote";
import { MAX_NOTE_CHARS, NOTE_COPY, cleanNote, tooLongCopy } from "@/lib/journal";
import { applyOps, planPush, shelfAsSaves } from "@/lib/shelf";
import { useAppStore } from "@/store/useAppStore";

// The note editor is a BottomSheet (#313), which pads for the home indicator.
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

/**
 * The journal note (#228): kept as written, never cut down silently, synced
 * like the rest of the shelf, and never lost for want of a signal.
 */

jest.setTimeout(30000);

describe("the note itself", () => {
  it("is kept as written, only trimmed, and an empty one is no note", () => {
    expect(cleanNote("  Loved it, would rebuy.\n")).toBe("Loved it, would rebuy.");
    expect(cleanNote("   ")).toBeNull();
  });

  it("asks about the product, never about skin", () => {
    expect(NOTE_COPY.prompt).not.toMatch(/skin|reaction|feel|symptom|break ?out/i);
    expect(NOTE_COPY.placeholder).not.toMatch(/skin|reaction|feel|symptom|break ?out/i);
  });

  it("says exactly how far over the cap a note is", () => {
    expect(tooLongCopy(MAX_NOTE_CHARS + 1)).toMatch(/^1 character over/);
    expect(tooLongCopy(MAX_NOTE_CHARS + 112)).toMatch(/^112 characters over/);
  });
});

describe("the editor", () => {
  it("never cuts a pasted note down: it says how much is over and waits", async () => {
    const onSave = jest.fn();
    await render(<NoteEditor visible initial="" onClose={() => {}} onSave={onSave} />);
    const long = "a".repeat(MAX_NOTE_CHARS + 12);
    await act(async () => fireEvent.changeText(screen.getByLabelText(NOTE_COPY.heading), long));
    expect(screen.getByDisplayValue(long)).toBeTruthy();
    expect(screen.getByText(tooLongCopy(long.length))).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByText(NOTE_COPY.save)));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves a note that fits, trimmed", async () => {
    const onSave = jest.fn();
    await render(<NoteEditor visible initial="" onClose={() => {}} onSave={onSave} />);
    await act(async () => fireEvent.changeText(screen.getByLabelText(NOTE_COPY.heading), " Worth it. "));
    await act(async () => fireEvent.press(screen.getByText(NOTE_COPY.save)));
    expect(onSave).toHaveBeenCalledWith("Worth it.");
  });

  it("deletes an existing note", async () => {
    const onSave = jest.fn();
    await render(<NoteEditor visible initial="Old note" onClose={() => {}} onSave={onSave} />);
    await act(async () => fireEvent.press(screen.getByText(NOTE_COPY.delete)));
    expect(onSave).toHaveBeenCalledWith(null);
  });
});

describe("syncing a note", () => {
  it("writes the last version per product, and a deletion as null", () => {
    const push = planPush([
      { kind: "set-product-note", id: "a", note: "first" },
      { kind: "set-product-note", id: "a", note: "second" },
      { kind: "set-product-note", id: "b", note: null },
    ]);
    expect(push.productNotes).toEqual([
      { id: "a", note: "second" },
      { id: "b", note: null },
    ]);
  });

  it("drops a note for a product removed after it", () => {
    expect(
      planPush([
        { kind: "set-product-note", id: "a", note: "x" },
        { kind: "remove-product", id: "a" },
      ]).productNotes,
    ).toEqual([]);
  });

  it("shows a note written mid-sync over the server's shelf, and a deletion", () => {
    const written = applyOps({ products: [{ id: "a", savedAt: 1 }], ingredients: [] }, [
      { kind: "set-product-note", id: "a", note: "mine" },
    ]);
    expect(written.products[0].note).toBe("mine");
    const deleted = applyOps(written, [{ kind: "set-product-note", id: "a", note: null }]);
    expect(deleted.products[0]).toEqual({ id: "a", savedAt: 1 });
  });

  it("carries a pre-accounts note into the account", () => {
    expect(shelfAsSaves({ products: [{ id: "a", savedAt: 1, note: "kept" }], ingredients: [] }, 0)).toContainEqual({
      kind: "set-product-note",
      id: "a",
      note: "kept",
    });
  });

  it("queues a note for the account, and keeps it on the phone until it syncs", () => {
    useAppStore.setState({ savedProducts: [{ id: "a", savedAt: 1 }], shelfOwner: "u", shelfQueue: [] });
    useAppStore.getState().setNote("a", "written in the shop");
    expect(useAppStore.getState().savedProducts[0].note).toBe("written in the shop");
    expect(useAppStore.getState().shelfQueue).toEqual([{ kind: "set-product-note", id: "a", note: "written in the shop" }]);
    // A server read that comes back while the note is still queued lays it
    // back on top rather than losing it.
    useAppStore.getState().applyServerShelf("u", [], { products: [{ id: "a", savedAt: 1 }], ingredients: [] });
    expect(useAppStore.getState().savedProducts[0].note).toBe("written in the shop");
  });
});
