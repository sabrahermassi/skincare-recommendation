import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { ReportMistakeLink } from "@/components/ReportMistakeLink";
import { mistakeReportUrl, type MistakeSubject } from "@/lib/report-mistake";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #327: "Report a mistake" opens a pre-filled email naming the product or
 * ingredient and the app version — and nothing about the person.
 */

jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.2.3" } } }));

const PRODUCT: MistakeSubject = { kind: "product", id: "obf-8801234567890", name: "Toner", brand: "Brand", barcode: "8801234567890" };

function decoded(url: string) {
  const [address, query] = url.split("?");
  const params = new URLSearchParams(query);
  return { address, subject: params.get("subject") ?? "", body: params.get("body") ?? "" };
}

describe("mistakeReportUrl", () => {
  it("names the product, its id, barcode and the app version, with a line to write on", () => {
    const { address, subject, body } = decoded(mistakeReportUrl("help@example.com", PRODUCT));
    expect(address).toBe("mailto:help@example.com");
    expect(subject).toBe("Mistake report: Brand Toner");
    expect(body.startsWith("What's wrong?\n")).toBe(true);
    expect(body).toContain("Product id: obf-8801234567890");
    expect(body).toContain("Barcode: 8801234567890");
    expect(body).toContain("App version: 1.2.3");
  });

  it("names an ingredient by its INCI name", () => {
    const { subject, body } = decoded(mistakeReportUrl("help@example.com", { kind: "ingredient", name: "sodium hyaluronate" }));
    expect(subject).toBe("Mistake report: sodium hyaluronate");
    expect(body).toContain("Ingredient (INCI name): sodium hyaluronate");
  });

  it("leaves out a barcode the product doesn't have", () => {
    const { body } = decoded(mistakeReportUrl("help@example.com", { ...PRODUCT, barcode: "" }));
    expect(body).not.toContain("Barcode");
  });

  it("carries nothing about the person, whatever their profile says", () => {
    useAppStore.setState({
      profile: { ...EMPTY_PROFILE, concerns: ["acne-prone"], baseSkinType: "oily", sensitivity: "high", pregnancyStatus: "pregnant" },
    });
    const { subject, body } = decoded(mistakeReportUrl("help@example.com", PRODUCT));
    for (const text of [subject, body]) {
      expect(text).not.toMatch(/pregnan|acne|oily|sensitiv|skin type|concern|account|user/i);
    }
  });
});

describe("ReportMistakeLink", () => {
  const original = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  afterEach(() => {
    // Assigning undefined would store the string "undefined", which reads as an address.
    if (original === undefined) delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    else process.env.EXPO_PUBLIC_SUPPORT_EMAIL = original;
    jest.restoreAllMocks();
  });

  it("is hidden when no support address is set", async () => {
    delete process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
    await render(<ReportMistakeLink subject={PRODUCT} />);
    expect(screen.queryByText("Report a mistake")).toBeNull();
  });

  it("opens the pre-filled email when tapped", async () => {
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "help@example.com";
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(<ReportMistakeLink subject={PRODUCT} />);
    await fireEvent.press(screen.getByText("Report a mistake"));
    expect(openURL).toHaveBeenCalledWith(mistakeReportUrl("help@example.com", PRODUCT));
  });

  it("says where to write when the phone has no mail app", async () => {
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL = "help@example.com";
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("no mail app"));
    await render(<ReportMistakeLink subject={PRODUCT} />);
    await fireEvent.press(screen.getByText("Report a mistake"));
    await act(async () => {});
    expect(screen.getByText(/You can write to help@example.com instead/)).toBeTruthy();
  });
});
