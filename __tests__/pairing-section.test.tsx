import { render, screen } from "@testing-library/react-native";

import { PairingSection } from "@/components/VerdictExplanation";
import { pairingNotesFor } from "@/lib/active-pairings";
import type { Ingredient } from "@/data/types";

const ing = (name: string): Ingredient => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true });

describe("PairingSection", () => {
  it("renders a header and every note for a retinoid", async () => {
    await render(<PairingSection notes={pairingNotesFor([ing("retinol")])} />);
    expect(screen.getByRole("header", { name: "In a routine" })).toBeTruthy();
    expect(screen.getByText(/evening routine/)).toBeTruthy();
    expect(screen.getByText(/another product with BHA/)).toBeTruthy();
  });

  it("renders nothing when there are no notes", async () => {
    await render(<PairingSection notes={pairingNotesFor([ing("glycerin")])} />);
    expect(screen.queryByRole("header")).toBeNull();
  });

  // #264 review: PairingSection reuses NotesSection with ContextNudgesSection,
  // but a pairing note isn't uniformly neutral the way a context nudge is —
  // the evening-routine note is pure scheduling, while the layering note
  // states a real irritation cost, so only the evening note gets the calmer
  // indicator.
  it("gives the evening note a neutral indicator and the layering note a caution one", async () => {
    await render(<PairingSection notes={pairingNotesFor([ing("retinol")])} />);
    expect(screen.getAllByText("•")).toHaveLength(1);
    expect(screen.getAllByText("−")).toHaveLength(1);
  });
});
