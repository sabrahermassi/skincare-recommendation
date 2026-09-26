import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import { MAX_NOTE_CHARS, NOTE_COPY, cleanNote, tooLongCopy } from "@/lib/journal";
import { useNoteTextStyle } from "@/lib/note-font";
import {
  BORDER_INACTIVE,
  CANVAS,
  CARD_SHADOW,
  DANGER,
  INK,
  MUTED,
  MUTED_FAINT,
  RADIUS_SELECTOR,
  SPACE,
  SURFACE,
  TOUCH_TARGET,
  TYPE,
  WARN,
} from "@/lib/tokens";

/**
 * The journal note on a saved product (#228): the note when there is one,
 * "Add a note" when there isn't, and the editor behind both. Only ever shown
 * for a product on the shelf — a note lives on the saved row.
 *
 * The note is the person's own words and is shown exactly as written; the
 * app never audits, rewrites or refuses it for what it says. There is no
 * share or copy-out affordance, on purpose.
 */
export function ProductNote({ note, onSave }: { note: string | undefined; onSave: (note: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const noteStyle = useNoteTextStyle(note ?? "", "card");
  return (
    <>
      {note ? (
        <View style={{ borderRadius: 16, backgroundColor: SURFACE, padding: SPACE.block, gap: SPACE.text, ...CARD_SHADOW }}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={{ flex: 1, fontSize: TYPE.label, fontWeight: "600", color: MUTED }}>{NOTE_COPY.heading}</Text>
            <Pressable onPress={() => setEditing(true)} accessibilityRole="button" hitSlop={12}>
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{NOTE_COPY.edit}</Text>
            </Pressable>
          </View>
          <Text style={{ ...noteStyle, color: INK }}>{note}</Text>
        </View>
      ) : (
        <Pressable
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}
        >
          <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
            {NOTE_COPY.add}
            <Text style={{ fontWeight: "400", color: MUTED }}>{`  ·  ${NOTE_COPY.prompt}`}</Text>
          </Text>
        </Pressable>
      )}
      <NoteEditor
        visible={editing}
        initial={note ?? ""}
        onClose={() => setEditing(false)}
        onSave={(next) => {
          onSave(next);
          setEditing(false);
        }}
      />
    </>
  );
}

/**
 * The two lines of a note on a Saved card — the same handwriting decision as
 * the product screen's, at the card's size.
 */
export function NotePreview({ note }: { note: string }) {
  const noteStyle = useNoteTextStyle(note, "preview");
  return (
    <Text numberOfLines={2} style={{ ...noteStyle, marginTop: 6, color: MUTED }}>
      {note}
    </Text>
  );
}

/**
 * Writing the note. No `maxLength` on the input: that would cut a pasted
 * note down without a word, and a note is the last thing to lose silently.
 * Instead the count turns into a plain sentence saying how much is over, and
 * saving waits until it fits.
 */
export function NoteEditor({
  visible,
  initial,
  onClose,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSave: (note: string | null) => void;
}) {
  const [text, setText] = useState(initial);
  const [lastOpened, setLastOpened] = useState(visible);
  // Each opening starts from the saved note, not from an abandoned edit.
  if (visible !== lastOpened) {
    setLastOpened(visible);
    if (visible) setText(initial);
  }
  const over = text.length > MAX_NOTE_CHARS;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
        <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 19, color: INK }}>{NOTE_COPY.prompt}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={NOTE_COPY.placeholder}
          placeholderTextColor={MUTED_FAINT}
          accessibilityLabel={NOTE_COPY.heading}
          multiline
          autoFocus
          textAlignVertical="top"
          style={{
            minHeight: 120,
            borderRadius: RADIUS_SELECTOR,
            borderWidth: 1,
            borderColor: over ? WARN : BORDER_INACTIVE,
            backgroundColor: CANVAS,
            padding: SPACE.block,
            fontSize: TYPE.body,
            lineHeight: 22,
            color: INK,
          }}
        />
        <Text accessibilityLiveRegion="polite" style={{ fontSize: TYPE.caption, color: over ? WARN : MUTED, fontWeight: over ? "600" : "400" }}>
          {over ? tooLongCopy(text.length) : `${text.length}/${MAX_NOTE_CHARS}`}
        </Text>
        <PrimaryButton
          size={50}
          label={NOTE_COPY.save}
          disabled={over}
          onPress={() => onSave(cleanNote(text))}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          {initial ? (
            <Pressable onPress={() => onSave(null)} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}>
              <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: DANGER }}>{NOTE_COPY.delete}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable onPress={onClose} accessibilityRole="button" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }}>
            <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{NOTE_COPY.cancel}</Text>
          </Pressable>
        </View>
    </BottomSheet>
  );
}
