/**
 * The account export's file is deleted once the share sheet closes: it holds
 * the person's notes, and a copy left in the cache folder would outlive
 * signing out.
 */
const mockFiles = new Set<string>();

jest.mock("expo-file-system", () => ({
  Paths: { cache: "cache" },
  File: class {
    uri: string;
    constructor(dir: string, name: string) {
      this.uri = `${dir}/${name}`;
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    create() {
      mockFiles.add(this.uri);
    }
    write() {}
    delete() {
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock("@/data/api", () => ({
  deleteAccount: jest.fn(),
  fetchAccountExport: jest.fn(async () => ({
    ok: true,
    value: { savedProducts: [], savedIngredients: [], productsAdded: [] },
  })),
}));
jest.mock("@/lib/auth", () => ({
  useAuth: { getState: () => ({ session: { user: { user_metadata: {} } } }) },
  accountSummary: () => ({ email: "a@example.com", providers: ["apple"] }),
  confirmWithApple: jest.fn(),
  forgetDeletedAccount: jest.fn(),
}));

import { Share } from "react-native";

import { exportMyData } from "@/lib/account";

beforeEach(() => mockFiles.clear());

describe("the account export's file", () => {
  it("is deleted after it is shared", async () => {
    const share = jest.spyOn(Share, "share").mockImplementation(async () => {
      expect(mockFiles.size).toBe(1);
      return { action: Share.sharedAction };
    });
    expect(await exportMyData()).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(mockFiles.size).toBe(0);
  });

  it("is deleted when the share sheet fails too", async () => {
    jest.spyOn(Share, "share").mockRejectedValue(new Error("no share sheet"));
    expect(await exportMyData()).toBe("failed");
    expect(mockFiles.size).toBe(0);
  });
});
