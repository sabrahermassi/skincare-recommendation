import { isTabEmpty } from "@/lib/saved-tabs";

const none = { saved: 0, history: 0, ingredients: 0 };

describe("isTabEmpty", () => {
  it("is empty when the tab's own list has nothing", () => {
    expect(isTabEmpty("saved", none, null)).toBe(true);
    expect(isTabEmpty("history", none, null)).toBe(true);
    expect(isTabEmpty("ingredients", none, null)).toBe(true);
  });

  it("is not empty when the tab's own list has rows, whatever the others hold", () => {
    expect(isTabEmpty("saved", { ...none, saved: 2 }, null)).toBe(false);
    expect(isTabEmpty("saved", { ...none, history: 2, ingredients: 2 }, null)).toBe(true);
    expect(isTabEmpty("history", { ...none, history: 1 }, null)).toBe(false);
    expect(isTabEmpty("ingredients", { ...none, ingredients: 3 }, null)).toBe(false);
  });

  it("keeps the list on screen while its own undo is pending", () => {
    expect(isTabEmpty("saved", none, "saved")).toBe(false);
    expect(isTabEmpty("history", none, "history")).toBe(false);
  });

  it("ignores an undo that belongs to the other tab", () => {
    expect(isTabEmpty("saved", none, "history")).toBe(true);
    expect(isTabEmpty("history", none, "saved")).toBe(true);
  });

  it("has no undo on the ingredients tab", () => {
    expect(isTabEmpty("ingredients", none, "saved")).toBe(true);
  });
});
