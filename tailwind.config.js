/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Skintel Screens (Claude Design, project 9c113a1f) — replaces the
        // milky-pastel palette. Values taken directly from the mockup HTML
        // (Result/Scanner/Quiz), not invented, except where noted below.
        canvas: "#FAF7F3",
        surface: "#FFFFFF",

        // The five Milky pastel colors, untouched. All five sit between
        // 1.22:1 and 1.33:1 against white, so they are surfaces only —
        // never text, never a button fill, never behind white text.
        // Assigned per product family so the tint carries meaning.
        //
        // pink/peach/mint not yet re-sourced from the new design — the three
        // mockups read so far don't demonstrate them (ProductIllustration /
        // ProductCard are Phase 2). `lilac` IS touched here: it's the panel/
        // chip tint the two Phase-1 screens use (profile-summary chip,
        // no-formula banner), so it's updated now to the mockup's own
        // profile-chip background.
        tint: {
          pink: "#F7D9DA", // Baby pink — cleansers
          peach: "#FBE4D8", // Soft peach — moisturizers
          mint: "#D9EDE3", // Mint whisper — serums, treatments
          lilac: "#EDE9F6", // Lilac milk — SPF, masks, app panels
        },

        // Single accent. Phase 1 read #7A6BB0 / #5C4F73 off the Scanner and
        // Result mockups; the other ten screens are unanimous on a different
        // pair, so these are the majority values now. #8B7FB6 fills every
        // button, toggle track, step dot and selected border; #625786 is
        // every piece of accent-coloured text, link and active tab label.
        //
        // WARNING: white on #8B7FB6 is 3.62:1 — below AA for the 15-16px
        // semibold label the design puts on its primary buttons (the old
        // #7A6BB0 was 4.61:1 and passed). This is the design's own value,
        // recorded rather than silently darkened — same treatment as
        // `ink.muted` below. `deep` doubles as the pressed state and is
        // 6.51:1 on white, so a held button is fine; it is the resting
        // state that fails.
        accent: {
          DEFAULT: "#8B7FB6", // was #7A6BB0 — white label 3.62:1, see above
          deep: "#625786", // pressed — 6.51:1 with white
          text: "#625786", // 5.45:1 on tint-lilac, 6.09:1 on canvas
        },

        // Base and muted are both taken directly from the mockups (heading
        // text vs. meta/caption text). `faint` has no third tier in any
        // mockup read — it's *computed* here rather than guessed: same
        // ~2.6:1-on-canvas contrast the old faint held, recalculated against
        // the new canvas and hue, since an additive RGB offset (the old
        // derivation) collapses onto `muted` once the base is this much
        // darker than before.
        //
        // Muted's own contrast against the new canvas is 3.34:1 — AA for
        // large text, NOT AA for body text (the old value was 4.60:1). This
        // is the mockup's own color, used there for body-size meta text
        // (e.g. "250 ml / Toner" at 11.5px) — flagging rather than silently
        // darkening it past what the design shows.
        ink: {
          DEFAULT: "#332E3A", // 12.35:1 on canvas (was 9.58:1)
          muted: "#8C8592", // 3.34:1 on canvas — below AA for body text, see above
          faint: "#9E98A3", // ~2.63:1 on canvas — computed, decorative / large text only
        },

        // `DEFAULT` is the card/control border. `soft` is the list-row
        // separator: the design draws rows a shade lighter than the boxes
        // they sit in, so a long list reads as one surface rather than a
        // stack of ruled boxes.
        hairline: {
          DEFAULT: "#EFEAE4",
          soft: "#F2EDE7",
        },

        // Per-profile fit, from the design's legend. Softer than `status`
        // and kept separate from it on purpose: `status` carries a regulatory
        // verdict that is true for everyone, `tone` carries "does this suit
        // *you*", which changes with the profile. Conflating them would let a
        // personal preference read as a safety finding.
        //
        // `flag` unchanged — no mockup read so far shows a third, more severe
        // tone distinct from `watch`; the Result screen's negative-effect
        // factors (Fragrance, Pore-clogging risk) render in amber (`watch`),
        // not a separate red, so `FactorBar` now uses `watch` for negatives
        // instead of `flag`. `flag` stays defined for its other callers
        // (ingredient-tone screens, Phase 2).
        tone: {
          good: "#79A98A", // was #8FCBAE
          watch: "#E0A063", // was #EBB68E
          flag: "#E29AA0",
        },

        // Functional, deliberately outside the brand palette: a risk verdict
        // must not shift when the brand does.
        status: {
          safe: "#3F7D5F", // 4.87:1 with white
          caution: "#8A6314", // 5.42:1 with white
          watch: "#A2521F", // 5.58:1 with white
          avoid: "#B04A3F", // 5.39:1 with white
        },

        // The same risk ladder as `status`, drawn soft instead of solid.
        // The design uses tinted pills and a coloured dot on the list
        // screens (ingredient list, ingredient detail) and keeps the solid
        // fills for the places a verdict has to shout (Compare, the tier
        // headers on product detail). Both spellings exist because the
        // design uses both — this is not a duplicate palette, it is the
        // quiet register of the same four rungs.
        //
        // Rungs map onto `SafetyLevel`: good→safe, watch→caution,
        // avoid→avoid, neutral→the unknown/unmatched tier.
        //
        // `ink` on `tint` runs 3.51:1 (watch) to 4.29:1 (avoid) — all below
        // AA for body text at the 11px the design sets them. Pills always
        // carry a word, and the row states the same thing in `ink` at full
        // contrast, so the pill is never the only channel.
        level: {
          good: { DEFAULT: "#6FA783", tint: "#E7F1E9", ink: "#4E7A5F" },
          watch: { DEFAULT: "#E2A45E", tint: "#FBEBD5", ink: "#A9713C" },
          neutral: { DEFAULT: "#C3BDC7", tint: "#EFEBE6", ink: "#797280" },
          avoid: { DEFAULT: "#DE7E93", tint: "#FBE2E7", ink: "#A4526A" },
        },

        // A calm affirmative panel, distinct from `tint-mint`: it carries a
        // border as well as a fill, which is what lets it hold a whole block
        // of text (the "how it fits your skin" verdict, the product match
        // band) rather than acting as a plain tinted tile.
        panel: {
          success: "#EAF3EC",
          "success-line": "#DCEBE0",
        },
      },

      // control/card bumped 1-3px toward the mockups' own values (13-15px
      // across button, card and shelf-row radii); chip/sheet left as-is —
      // no mockup read so far isolates a pill-badge or bottom-sheet radius
      // distinctly from these.
      borderRadius: {
        chip: "8px", // tags, filter chips, score pills
        control: "13px", // buttons, inputs — was 10px
        card: "15px", // cards, tiles, thumbnails — was 14px
        sheet: "18px", // modals, bottom sheets
        // `full` stays for genuinely circular things only: avatars, the FAB,
        // step dots, the toggle knob.
      },

      fontFamily: {
        // Playfair Display for display, replacing Newsreader — every mockup
        // read agrees (wordmark, screen titles, verdict text, stat-card
        // values). Set at 500 rather than a heavy weight, matching how the
        // mockups use it: large, once per screen, never at small sizes.
        display: ["PlayfairDisplay_500Medium"],
        "display-medium": ["PlayfairDisplay_600SemiBold"],
        // Body text is the OS system font now, not a loaded Google font — the
        // mockups use `-apple-system, "SF Pro Text", system-ui`, and RN's
        // Text already renders the platform system font when no fontFamily
        // is set. "System" is graceful here on both platforms: iOS resolves
        // it to San Francisco; anything that doesn't recognise it (Android)
        // falls back to its own default (Roboto) rather than erroring.
        //
        // Weight is carried by Tailwind's plain `font-medium`/`font-semibold`/
        // `font-bold` utilities now (RN's `fontWeight`), not by a separate
        // named family per weight the way the loaded Google Fonts worked —
        // every `font-sans-{medium,semibold,bold}` call site was renamed to
        // match. `sans-medium/-semibold/-bold` are gone: nothing calls them.
        sans: ["System"],
        // Small monospace eyebrows are a signature of the design.
        mono: ["ui-monospace", "Menlo", "monospace"],
      },

      // Elevation stays on Tailwind's built-in `shadow-sm` / `shadow-md`,
      // which NativeWind reliably maps to RN's shadow props on native. A
      // custom multi-layer boxShadow string renders on web but silently
      // drops on native, which would leave cards flat on the phone.
    },
  },
  plugins: [],
};
