/**
 * The funnel's content rule (#225), pinned over the event schema rather than
 * left to review: no ingredient list, product name, barcode, image or profile
 * field can ever be an event property, because every property is a closed
 * list of fixed values and none is named after anything personal.
 */

const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockConstruct = jest.fn();
jest.mock("posthog-react-native", () => ({
  __esModule: true,
  default: class {
    constructor(...args: unknown[]) {
      mockConstruct(...args);
    }
    capture = (...args: unknown[]) => mockCapture(...args);
    identify = (...args: unknown[]) => mockIdentify(...args);
    reset = () => mockReset();
  },
}));

import { EVENTS } from "@/lib/analytics";

/** Names that would mean content, identity or health data went into an event. */
const FORBIDDEN = /ingredient|inci|product_?(id|name)|name|brand|barcode|image|photo|label_?text|concern|skin|sensitiv|pregnan|profile|email|note|query|search|score|verdict_?text/i;

describe("the event schema", () => {
  it("names no property after content, identity or the skin profile", () => {
    for (const [event, props] of Object.entries(EVENTS)) {
      for (const name of Object.keys(props)) {
        expect(`${event}.${name}`).not.toMatch(new RegExp(`\\.(${FORBIDDEN.source})`, "i"));
      }
    }
  });

  it("gives every property a short, closed list of fixed values — never free text", () => {
    for (const props of Object.values(EVENTS)) {
      for (const values of Object.values(props) as readonly unknown[][]) {
        expect(Array.isArray(values)).toBe(true);
        expect(values.length).toBeGreaterThan(0);
        expect(values.length).toBeLessThanOrEqual(4);
        for (const value of values) {
          expect(["string", "boolean"]).toContain(typeof value);
          if (typeof value === "string") expect(value).toMatch(/^[a-z_]{2,16}$/);
        }
      }
    }
  });

  it("is exactly the funnel #225 asks for, so a new event is a deliberate change", () => {
    expect(Object.keys(EVENTS).sort()).toEqual(["save_tapped", "scan_started", "sign_in_shown", "signed_in", "verdict_viewed"]);
  });
});

describe("sending", () => {
  const load = (key?: string) => {
    const saved = process.env;
    process.env = { ...saved, EXPO_PUBLIC_POSTHOG_KEY: key };
    let analytics!: typeof import("@/lib/analytics");
    jest.isolateModules(() => {
      analytics = require("@/lib/analytics") as typeof import("@/lib/analytics");
    });
    process.env = saved;
    return analytics;
  };

  beforeEach(() => jest.clearAllMocks());

  it("does nothing at all without a project key", () => {
    const analytics = load(undefined);
    analytics.track("scan_started", { path: "barcode" });
    analytics.identifyAccount("user-a");
    expect(mockConstruct).not.toHaveBeenCalled();
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("sends only what the event declares, with replay, geo lookup and screen capture off", () => {
    const analytics = load("phc_test");
    analytics.track("save_tapped", { target: "product", signed_in: false });
    expect(mockCapture).toHaveBeenCalledWith("save_tapped", { target: "product", signed_in: false });
    const options = mockConstruct.mock.calls[0][1] as Record<string, unknown>;
    expect(options).toMatchObject({ enableSessionReplay: false, disableGeoip: true, persistence: "file" });
    expect(options).not.toHaveProperty("captureScreens");
  });

  it("links the account by id alone, and forgets it on sign-out", () => {
    const analytics = load("phc_test");
    analytics.identifyAccount("user-a");
    expect(mockIdentify).toHaveBeenCalledWith("user-a");
    analytics.forgetAccount();
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("never lets a failure reach the app", () => {
    const analytics = load("phc_test");
    mockCapture.mockImplementationOnce(() => {
      throw new Error("queue full");
    });
    expect(() => analytics.track("scan_started", { path: "label" })).not.toThrow();
  });
});

describe("telling a new account from a returning one", () => {
  it("counts an account created in the last minute as new", () => {
    const { isNewAccount } = require("@/lib/auth") as typeof import("@/lib/auth");
    const now = Date.parse("2026-09-24T12:00:00Z");
    expect(isNewAccount("2026-09-24T11:59:30Z", now)).toBe(true);
    expect(isNewAccount("2026-09-20T09:00:00Z", now)).toBe(false);
    expect(isNewAccount(undefined, now)).toBe(false);
  });
});
