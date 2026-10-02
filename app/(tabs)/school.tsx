import { useScrollToTop } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeartMark } from "@/components/icons/HeartMark";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { SearchBar } from "@/components/SearchBar";
import { TabTitle } from "@/components/TabTitle";
import { Text } from "@/components/Text";
import type { SchoolQuestion } from "@/data/school";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { fallbackSuggestions, SCHOOL_CHAT_COPY, SCHOOL_QUESTIONS, searchSchool } from "@/lib/school-chat";
import { SCAN_BUTTON_LIFT, tabBarClearance, tabRootTop } from "@/lib/tab-bar";
import { BUTTON, CANVAS, CHOSEN, INK, LINE, MUTED, SPACE, SURFACE, TYPE } from "@/lib/tokens";
import { FitScrollView } from "@/components/FitScrollView";

// The School's face: a plain circle with the app's own heart mark, the one
// the app icon is drawn from, until there is a mascot of its own (#352).
const AVATAR = 32;
// A suggested question's card (v7).
const CARD_WIDTH = 200;
const CARD_MIN_HEIGHT = 56;

/** One turn of the conversation. Kept for this visit only, never saved. */
type Turn =
  | { kind: "asked"; item: SchoolQuestion }
  | { kind: "unanswered"; text: string; suggestions: SchoolQuestion[] };
type Message = Turn & { key: string };

/**
 * Skincare School (#235), as a chat (#352): a greeting, then questions asked
 * from suggestion cards or the search box, each answered with its curated
 * answer from `data/school.ts`. Nothing is generated: a search that finds no
 * question says so and offers ones it can answer. A tab of its own (#351),
 * still at `/school`.
 *
 * Nothing is sent or kept: no network, no saved history, no analytics.
 */
export default function SkincareSchool() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  // Tapping the tab again scrolls back to the top, as on the other tabs.
  useScrollToTop(scrollRef);

  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState("");
  const [announcement, setAnnouncement] = useState("");
  // Scrolled to once its bubble has laid out.
  const [latestKey, setLatestKey] = useState<string | null>(null);
  const nextKey = useRef(0);
  const announceFrame = useRef<number | null>(null);
  // Nothing is spoken for a screen that has gone.
  useEffect(
    () => () => {
      if (announceFrame.current !== null) cancelAnimationFrame(announceFrame.current);
    },
    [],
  );
  const keyboardUp = useKeyboardUp();

  const askedIds = useMemo(
    () => new Set(messages.flatMap((message) => (message.kind === "asked" ? [message.item.id] : []))),
    [messages],
  );
  const unasked = SCHOOL_QUESTIONS.filter((item) => !askedIds.has(item.id));
  const searching = query.trim().length >= 2;
  const matches = useMemo(() => (searching ? searchSchool(query) : []), [query, searching]);

  function add(turn: Turn) {
    const key = String(nextKey.current++);
    setMessages((current) => [...current, { ...turn, key }]);
    setLatestKey(key);
  }

  // The announcer speaks when its text changes, so it's cleared first:
  // asking the same question again, or a second search with no answer, is
  // still spoken rather than skipped as a repeat.
  function announce(text: string) {
    setAnnouncement("");
    if (announceFrame.current !== null) cancelAnimationFrame(announceFrame.current);
    announceFrame.current = requestAnimationFrame(() => {
      announceFrame.current = null;
      setAnnouncement(text);
    });
  }

  function ask(item: SchoolQuestion) {
    add({ kind: "asked", item });
    setQuery("");
    // Focus stays on the card that was tapped; the answer is read out.
    announce(`Answer: ${item.answer}`);
  }

  // The keyboard's Search key: the best match, or the honest no-answer reply.
  function submit() {
    const text = query.trim();
    if (!text) return;
    if (matches.length > 0) {
      ask(matches[0]);
      return;
    }
    add({ kind: "unanswered", text, suggestions: fallbackSuggestions(askedIds) });
    setQuery("");
    announce(SCHOOL_CHAT_COPY.noAnswer);
  }

  function scrollTo(y: number) {
    scrollRef.current?.scrollTo({ y: Math.max(0, y - SPACE.text), animated: !reduceMotionNow() });
    setLatestKey(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      {/* A tab: its title on the left, as on every tab, and no back chevron. */}
      <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: tabRootTop(insets.top), paddingBottom: SPACE.text }}>
        <TabTitle>Skincare School</TabTitle>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FitScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          // 8 above the first bubble and 8 under the title: a scrolled chat is cut off clear of the title, not against it.
          contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: SPACE.block, gap: SPACE.block }}
        >
          <AppBubble label={`Skincare School says: ${SCHOOL_CHAT_COPY.greeting}`}>
            <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>{SCHOOL_CHAT_COPY.greeting}</Text>
          </AppBubble>

          {messages.map((message) => (
            <View
              key={message.key}
              style={{ gap: SPACE.block }}
              onLayout={message.key === latestKey ? (e) => scrollTo(e.nativeEvent.layout.y) : undefined}
            >
              {message.kind === "asked" ? (
                <>
                  <UserBubble text={message.item.question} />
                  <AppBubble label={`Answer: ${message.item.answer}`}>
                    <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>{message.item.answer}</Text>
                  </AppBubble>
                </>
              ) : (
                <>
                  <UserBubble text={message.text} />
                  {/* Not one accessible block: the cards inside have to stay buttons. */}
                  <AppBubble>
                    <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>{SCHOOL_CHAT_COPY.noAnswer}</Text>
                    <View style={{ gap: SPACE.text, marginTop: 10 }}>
                      {message.suggestions.map((item) => (
                        <QuestionCard key={item.id} item={item} onPress={() => ask(item)} />
                      ))}
                    </View>
                  </AppBubble>
                </>
              )}
            </View>
          ))}
        </FitScrollView>

        <View
          style={{
            gap: SPACE.block,
            paddingTop: SPACE.block,
            // Clear of the floating tab bar and the scan button rising out of
            // it: this sits still, so nothing scrolls out from under the
            // button. With the keyboard up, just above the keyboard.
            paddingBottom: keyboardUp ? SPACE.text : tabBarClearance(insets.bottom) + SCAN_BUTTON_LIFT,
            borderTopWidth: 0.5,
            borderTopColor: LINE,
            backgroundColor: CANVAS,
          }}
        >
          {searching ? (
            <Matches matches={matches} onAsk={ask} />
          ) : (
            <Suggestions unasked={unasked} onAsk={ask} />
          )}
          <View style={{ paddingHorizontal: SPACE.gutter, flexDirection: "row" }}>
            <SearchBar value={query} onChangeText={setQuery} onSubmitEditing={submit} placeholder={SCHOOL_CHAT_COPY.searchPlaceholder} />
          </View>
        </View>
      </KeyboardAvoidingView>

      <ScreenReaderAnnouncer message={announcement} />
    </View>
  );
}

/** Whether the keyboard is showing, so the composer can drop the tab bar's room. */
function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setUp(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return up;
}

/** The School's side of the conversation: on the left, beside its avatar. */
function AppBubble({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: SPACE.text, maxWidth: "92%" }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: AVATAR,
          height: AVATAR,
          borderRadius: AVATAR / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CHOSEN.fill,
        }}
      >
        <HeartMark size={16} variant="filled" color={BUTTON.primary.fill} />
      </View>
      <View
        accessible={label !== undefined}
        accessibilityLabel={label}
        style={{
          flexShrink: 1,
          paddingHorizontal: SPACE.gutter,
          paddingVertical: SPACE.block,
          borderWidth: 1,
          borderColor: LINE,
          backgroundColor: SURFACE,
          // v9: a slightly tighter top-left corner, the tail at bottom left.
          borderRadius: 18,
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 6,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** What the person asked, on the right. */
function UserBubble({ text }: { text: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`You asked: ${text}`}
      style={{
        alignSelf: "flex-end",
        maxWidth: "85%",
        paddingHorizontal: SPACE.gutter,
        paddingVertical: SPACE.block,
        backgroundColor: CHOSEN.fill,
        borderRadius: 18,
        borderTopLeftRadius: 16,
        borderBottomRightRadius: 6,
      }}
    >
      <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>{text}</Text>
    </View>
  );
}

/** "What would you like to know?" and a card for each question not asked yet. */
function Suggestions({ unasked, onAsk }: { unasked: readonly SchoolQuestion[]; onAsk: (item: SchoolQuestion) => void }) {
  return (
    <View style={{ gap: SPACE.block }}>
      <Text style={{ paddingHorizontal: SPACE.gutter, fontSize: TYPE.label, fontWeight: "600", color: INK }}>
        {unasked.length > 0 ? SCHOOL_CHAT_COPY.prompt : SCHOOL_CHAT_COPY.allAsked}
      </Text>
      {unasked.length > 0 ? (
        <FitScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // Room under the cards for their shade: a scroll view clips what falls outside it.
          contentContainerStyle={{ gap: SPACE.block, paddingHorizontal: SPACE.gutter, paddingBottom: 4 }}
        >
          {unasked.map((item) => (
            <QuestionCard key={item.id} item={item} width={CARD_WIDTH} onPress={() => onAsk(item)} />
          ))}
        </FitScrollView>
      ) : null}
    </View>
  );
}

/** While typing: the curated questions that match, or a line saying none do. */
function Matches({ matches, onAsk }: { matches: readonly SchoolQuestion[]; onAsk: (item: SchoolQuestion) => void }) {
  if (matches.length === 0) {
    return (
      <Text style={{ paddingHorizontal: SPACE.gutter, fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>
        {SCHOOL_CHAT_COPY.noMatchWhileTyping}
      </Text>
    );
  }
  return (
    <FitScrollView
      style={{ maxHeight: 220 }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: SPACE.text, paddingHorizontal: SPACE.gutter, paddingBottom: 6 }}
    >
      {matches.map((item) => (
        <QuestionCard key={item.id} item={item} onPress={() => onAsk(item)} />
      ))}
    </FitScrollView>
  );
}

/** A question to ask. Its own label says what tapping it does. */
function QuestionCard({ item, width, onPress }: { item: SchoolQuestion; width?: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Ask: ${item.question}`}
      style={{
        width,
        minHeight: CARD_MIN_HEIGHT,
        justifyContent: "center",
        paddingHorizontal: SPACE.gutter,
        paddingVertical: SPACE.block,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: LINE,
        backgroundColor: SURFACE,
      }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: TYPE.body, lineHeight: 20.25, color: INK }}>{item.question}</Text>
    </Pressable>
  );
}
