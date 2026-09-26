import { fireEvent, render, screen } from "@testing-library/react-native";

import SkincareSchool from "@/app/(tabs)/school";
import { SCHOOL_CHAT_COPY, SCHOOL_QUESTIONS } from "@/lib/school-chat";

/**
 * Skincare School as a chat (#352): the greeting, a question asked from a
 * card or the search box and answered with its curated answer, and the
 * honest reply when a search finds nothing.
 */

jest.mock("expo-router", () => ({ router: { back: jest.fn() }, useScrollToTop: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const first = SCHOOL_QUESTIONS[0];
const niacinamide = SCHOOL_QUESTIONS.find((item) => item.id === "niacinamide")!;

describe("Skincare School screen", () => {
  it("opens on the greeting, a card for every question and the search box", async () => {
    await render(<SkincareSchool />);
    expect(screen.getByText(SCHOOL_CHAT_COPY.greeting)).toBeTruthy();
    expect(screen.getByText(SCHOOL_CHAT_COPY.prompt)).toBeTruthy();
    for (const item of SCHOOL_QUESTIONS) expect(screen.getByRole("button", { name: `Ask: ${item.question}` })).toBeTruthy();
    expect(screen.getByLabelText(SCHOOL_CHAT_COPY.searchPlaceholder)).toBeTruthy();
  });

  it("answers a tapped card with its curated answer, in reading order, and drops the card", async () => {
    await render(<SkincareSchool />);
    expect(screen.queryByText(first.answer)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: `Ask: ${first.question}` }));

    expect(screen.getByLabelText(`You asked: ${first.question}`)).toBeTruthy();
    expect(screen.getByLabelText(`Answer: ${first.answer}`)).toBeTruthy();
    expect(screen.getByText(first.answer)).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Ask: ${first.question}` })).toBeNull();
  });

  it("finds a question as you type, and answers it when tapped", async () => {
    await render(<SkincareSchool />);
    await fireEvent.changeText(screen.getByLabelText(SCHOOL_CHAT_COPY.searchPlaceholder), "niacin");
    expect(screen.queryByText(SCHOOL_CHAT_COPY.prompt)).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: `Ask: ${niacinamide.question}` }));

    expect(screen.getByLabelText(`Answer: ${niacinamide.answer}`)).toBeTruthy();
    expect(screen.getByLabelText(SCHOOL_CHAT_COPY.searchPlaceholder).props.value).toBe("");
  });

  it("asks the best match when the search is submitted", async () => {
    await render(<SkincareSchool />);
    const box = screen.getByLabelText(SCHOOL_CHAT_COPY.searchPlaceholder);
    await fireEvent.changeText(box, "Niacinamide");
    await fireEvent(box, "submitEditing");
    expect(screen.getByLabelText(`Answer: ${niacinamide.answer}`)).toBeTruthy();
  });

  it("says it has no answer, never makes one up, and offers three questions it can answer", async () => {
    await render(<SkincareSchool />);
    const box = screen.getByLabelText(SCHOOL_CHAT_COPY.searchPlaceholder);
    await fireEvent.changeText(box, "how do I cure eczema overnight");
    expect(screen.getByText(SCHOOL_CHAT_COPY.noMatchWhileTyping)).toBeTruthy();

    await fireEvent(box, "submitEditing");

    expect(screen.getByLabelText("You asked: how do I cure eczema overnight")).toBeTruthy();
    // Also spoken, through the screen reader announcer.
    expect(screen.getAllByText(SCHOOL_CHAT_COPY.noAnswer).length).toBeGreaterThan(0);
    for (const item of SCHOOL_QUESTIONS) expect(screen.queryByLabelText(`Answer: ${item.answer}`)).toBeNull();
    // The three offered in the reply, plus the same three among the cards below.
    for (const item of SCHOOL_QUESTIONS.slice(0, 3)) {
      expect(screen.getAllByRole("button", { name: `Ask: ${item.question}` })).toHaveLength(2);
    }

    await fireEvent.press(screen.getAllByRole("button", { name: `Ask: ${first.question}` })[0]);
    expect(screen.getByLabelText(`Answer: ${first.answer}`)).toBeTruthy();
  });
});
