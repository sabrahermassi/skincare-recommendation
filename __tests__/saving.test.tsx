import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Saving is open to everyone (#300): a guest's save happens at the tap and
 * stays on the phone, sign-in is offered in Account and never at the
 * tap, and notes and routine steps stay signed-in only.
 */

jest.setTimeout(30000);

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
    useLocalSearchParams: () => ({ id: "hanbang-rice-serum" }),
    useIsFocused: () => true,
    useScrollToTop: () => undefined,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Accounts exist: a backend is configured, even though the catalogue below
// is the bundled sample.
jest.mock("@/lib/supabase", () => ({ isSupabaseConfigured: true, supabase: null }));

const { useAuth } = require("@/lib/auth") as typeof import("@/lib/auth");
const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
const ProductScreen = (require("@/app/product/[id]") as { default: () => React.JSX.Element }).default;
const Saved = (require("@/app/(tabs)/saved") as { default: () => React.JSX.Element }).default;

const SERUM = { id: "hanbang-rice-serum", savedAt: 1 };

function signIn(id: string) {
  useAuth.setState({ status: "signed-in", session: { user: { id, user_metadata: {} } } as never });
  useAppStore.setState({ shelfOwner: id });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.setState({ status: "signed-out", session: null });
  // A skin profile, so the no-profile sheet doesn't rise over the product: these tests are about saving.
  useAppStore.setState({ savedProducts: [], savedIngredients: [], shelfOwner: null, shelfQueue: [], profile: { concerns: [], baseSkinType: "dry", sensitivity: null, pregnancyStatus: null } });
});

describe("the heart on a product", () => {
  it("saves a guest's product at the tap, and asks nothing", async () => {
    await render(<ProductScreen />);
    await act(async () => fireEvent.press(await screen.findByLabelText("Save")));
    expect(useAppStore.getState().savedProducts.map((p) => p.id)).toEqual(["hanbang-rice-serum"]);
    expect(mockPush).not.toHaveBeenCalled();
    // A guest's save isn't queued for any account; sign-in carries it.
    expect(useAppStore.getState().shelfQueue).toEqual([]);
  });

  it("saves and queues for someone signed in", async () => {
    signIn("u1");
    await render(<ProductScreen />);
    await act(async () => fireEvent.press(await screen.findByLabelText("Save")));
    expect(useAppStore.getState().shelfQueue).toEqual([expect.objectContaining({ kind: "save-product", id: "hanbang-rice-serum" })]);
  });

  it("never asks to remove something", async () => {
    useAppStore.setState({ savedProducts: [SERUM] });
    await render(<ProductScreen />);
    await act(async () => fireEvent.press(await screen.findByLabelText("Remove from saved")));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useAppStore.getState().savedProducts).toEqual([]);
  });
});

describe("the note on a saved product", () => {
  it("isn't offered to a guest, whose note would overwrite the account's at sign-in", async () => {
    useAppStore.setState({ savedProducts: [SERUM] });
    await render(<ProductScreen />);
    await screen.findByLabelText("Remove from saved");
    expect(screen.queryByText(/Add a note/)).toBeNull();
  });

  it("sits in a scroll view that lets a tap through while the keyboard is up (#313)", async () => {
    // The note sheet is a Modal, but touches follow the React tree, so the
    // product page's scroll view sees them first. Left at its default, it
    // spent the first tap on "Save note" closing the keyboard.
    signIn("u1");
    useAppStore.setState({ savedProducts: [SERUM] });
    await render(<ProductScreen />);
    type Node = { props: Record<string, unknown>; parent: unknown } | null;
    let node: Node = await screen.findByText(/Add a note/);
    while (node && node.props.keyboardShouldPersistTaps === undefined) node = node.parent as Node;
    expect(node?.props.keyboardShouldPersistTaps).toBe("handled");
  });
});

describe("the sign-in sheet", () => {
  it("closes when a session arrives", async () => {
    const SignIn = (require("@/app/sign-in") as { default: () => React.JSX.Element }).default;
    await render(<SignIn />);
    await act(async () => useAuth.setState({ status: "signed-in", session: {} as never }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe("the Saved tab", () => {
  // The guest line and its sign-in link are gone (owner): sign-ups are to be
  // asked for another way.
  it("says nothing about accounts on the shelf, to a guest or anyone", async () => {
    await render(<Saved />);
    await screen.findByText("No products saved yet");
    expect(screen.queryByText(/Saves stay on this phone/)).toBeNull();
    expect(screen.queryByText(/Sign in to keep them/)).toBeNull();
  });

  // A saved card is the same as a History one (owner): no routine step under it.
  it("shows no routine step under a saved card, to a guest or signed in", async () => {
    for (const owner of [null, "u1"]) {
      if (owner) signIn(owner);
      useAppStore.setState({ savedProducts: [SERUM] });
      await render(<Saved />);
      await screen.findByText("Hanbang Rice Ferment Hydrating Serum");
      expect(screen.queryByText(/our guess/)).toBeNull();
      expect(screen.queryByText("Change")).toBeNull();
      await act(async () => screen.unmount());
    }
  });
});
