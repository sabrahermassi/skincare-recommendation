import { TYPE } from "@/lib/tokens";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwind = require("../tailwind.config.js") as {
  theme: { extend: { fontSize: Record<string, string> } };
};

/**
 * The type scale exists in two places — `tailwind.config.js` for classNames and
 * `TYPE` in `lib/tokens.ts` for the inline `fontSize` styles most of this app
 * actually uses. Both are needed (see `TYPE`'s own note on why this is a mirror
 * rather than a migration), which means both can drift.
 *
 * The palette has the same duplication and the same standing instruction to
 * keep it in sync. This is that instruction, enforced: a scale that disagrees
 * with itself is worse than the 24 ad-hoc sizes it replaced, because it looks
 * like a system.
 */

const scale = tailwind.theme.extend.fontSize;

describe("the type scale", () => {
  it("defines the same steps in both places", () => {
    expect(Object.keys(scale).sort()).toEqual(Object.keys(TYPE).sort());
  });

  it("defines the same value for every step", () => {
    for (const [step, css] of Object.entries(scale)) {
      expect(`${TYPE[step as keyof typeof TYPE]}px`).toBe(css);
    }
  });

  /**
   * The point of the collapse: v7's seven sizes (13 / 15 / 17 / 20 / 24 / 30 /
   * 34), each at least 2px from the next. `label` and `body` share 15 on
   * purpose — v7 sets interface text and prose at the same size — so the
   * check is on the distinct sizes.
   */
  it("keeps every distinct size at least 2px from its neighbour", () => {
    const values = [...new Set(Object.values(TYPE))].sort((a, b) => a - b);
    for (let i = 1; i < values.length; i++) {
      expect(values[i] - values[i - 1]).toBeGreaterThanOrEqual(2);
    }
  });

  /**
   * The floor. A third of the old declarations sat below 12px, and in this
   * product the small text is disproportionately the cautionary text.
   */
  it("never goes below 12px", () => {
    for (const value of Object.values(TYPE)) {
      expect(value).toBeGreaterThanOrEqual(12);
    }
  });

  /** v7: running prose is 15px (read off the hand-off), and interface text is never larger than it. */
  it("keeps running prose at 15px, with interface text no larger", () => {
    expect(TYPE.body).toBe(15);
    expect(TYPE.label).toBeLessThanOrEqual(TYPE.body);
  });
});
