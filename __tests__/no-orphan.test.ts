import { noOrphan } from "@/lib/text";

describe("noOrphan", () => {
  it("keeps a heading's last two words together", () => {
    expect(noOrphan("What would you like to work on?")).toBe("What would you like to work on?");
  });

  it("leaves one or two words alone", () => {
    expect(noOrphan("Saved")).toBe("Saved");
    expect(noOrphan("Product details")).toBe("Product details");
  });

  it("is the same text to a reader: only the last space differs", () => {
    const text = "It covers 1 of the 3 recommendations for your skin.";
    expect(noOrphan(text).replace(/ /g, " ")).toBe(text);
  });
});
