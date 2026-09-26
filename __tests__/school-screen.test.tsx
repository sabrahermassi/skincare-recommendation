import { fireEvent, render, screen } from "@testing-library/react-native";

import SkincareSchool from "@/app/(tabs)/school";
import { SCHOOL } from "@/data/school";

/**
 * The Skincare School accordion's accessibility contract (#235): every
 * question header is a button that exposes its expanded state, and its
 * answer appears only once it's opened.
 */

jest.mock("expo-router", () => ({ useScrollToTop: () => undefined }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const first = SCHOOL[0].questions[0];

describe("Skincare School screen", () => {
  it("renders every category and every question", async () => {
    await render(<SkincareSchool />);
    for (const category of SCHOOL) {
      expect(screen.getByRole("header", { name: category.title })).toBeTruthy();
      for (const item of category.questions) expect(screen.getByRole("button", { name: item.question })).toBeTruthy();
    }
  });

  it("exposes each question as a collapsed button, and shows the answer only once opened", async () => {
    await render(<SkincareSchool />);
    const header = screen.getByRole("button", { name: first.question });

    expect(header.props.accessibilityState).toMatchObject({ expanded: false });
    expect(screen.queryByText(first.answer)).toBeNull();

    await fireEvent.press(header);
    expect(screen.getByRole("button", { name: first.question }).props.accessibilityState).toMatchObject({
      expanded: true,
    });
    expect(screen.getByText(first.answer)).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: first.question }));
    expect(screen.queryByText(first.answer)).toBeNull();
  });
});
