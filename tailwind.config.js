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

        // Single accent — the fill behind every primary button, toggle track,
        // step dot, selected border and selected chip.
        //
        // The design uses two values for this: #8B7FB6 on ten screens, and
        // #7A6BB0 on the Scanner and Result screens. They are the same hue,
        // three steps apart in lightness, and only one of them works: white
        // on #8B7FB6 is 3.61:1, below AA for the 15-16px semibold label the
        // design sets on its buttons, while #7A6BB0 is 4.61:1 and passes.
        //
        // That difference is not academic. A washed-out label on a pale
        // lavender pill is what a low-contrast button *looks* like — the
        // button reads as disabled, or as a placeholder, even when its size
        // and radius are exactly right. Earlier passes took the majority
        // value and recorded the failure in a comment instead of acting on
        // it, which left every primary action in the app looking unfinished.
        //
        // Taking the design's own darker value is both the accessible choice
        // and a faithful one: it is a colour these mockups specify, not an
        // invention.
        accent: {
          DEFAULT: "#7A6BB0", // white label 4.61:1 — AA. See above for why not #8B7FB6.
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
          // Long-form body copy. The design does NOT set running prose in
          // `muted` — the ingredient-detail screen, which carries the most
          // continuous text in the app, uses #4A4453 for it and reserves
          // #8C8592 for captions and meta lines. Reading `muted` as "any text
          // that isn't a heading" was a misreading, and it put 3.34:1 text
          // under whole paragraphs. This is 8.02:1 on canvas — comfortably AA.
          body: "#4A4453",
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
          // The result screen's two risk cards. A hair cooler and lighter than
          // the match panel above them, which is what keeps the panel reading
          // as the verdict and these as its footnotes. Both pairs are in the
          // mockup; they are not a duplicate of each other.
          risk: "#EDF4EF",
          "risk-line": "#DFEBE3",
          // The flat warm wash under the two disclaimer strips.
          wash: "#F3EFEA",
        },
      },

      // Read off the mockups rather than rounded to a scale — the design uses
      // six distinct radii and they are not interchangeable. The one that
      // matters most is `control`: every primary button in all twelve screens
      // is 11px, and it was set to 13px here, which is the *compact card*
      // radius. Buttons drawn at a card's radius read as panels.
      borderRadius: {
        chip: "8px", // filter chips, score pills, tier badges
        control: "11px", // buttons, segment controls, info strips
        tile: "12px", // browse-row thumbnails, ingredient-detail panels
        field: "13px", // the compact two-up cards on the profile screen
        card: "15px", // option cards, quick actions, product hero
        panel: "16px", // the shadowed shelf card on Saved
        sheet: "18px", // modals, bottom sheets
        // `full` stays for genuinely circular things only: avatars, the FAB,
        // step dots, the toggle knob, and the pill-shaped filter tabs.
      },

      fontFamily: {
        // Playfair Display for display, replacing Newsreader — every mockup
        // read agrees (wordmark, screen titles, verdict text, stat-card
        // values). Set at 500 rather than a heavy weight, matching how the
        // mockups use it: large, once per screen, never at small sizes.
        display: ["PlayfairDisplay_500Medium"],
        "display-medium": ["PlayfairDisplay_600SemiBold"],
        // There is deliberately NO `sans` override here, and `Text` no longer
        // injects a family class. The mockups set body text in the OS UI font
        // (`-apple-system, "SF Pro Text", system-ui`), and every platform
        // already renders exactly that when no fontFamily is given: iOS uses
        // San Francisco, Android uses Roboto, and react-native-web's own Text
        // base style (`font: 14px System`) is rewritten by RNW's style
        // compiler into the real `-apple-system, BlinkMacSystemFont, "Segoe
        // UI", Roboto, …` stack.
        //
        // Naming the family was the bug. A `sans: ["System"]` token emitted
        // literal `font-family: System` into the web stylesheet — and that
        // CSS class bypasses RNW's compiler, so the browser saw an unknown
        // family and fell back to its default serif. Every word of body text
        // in the app rendered in Times New Roman.
        //
        // Weight is carried by Tailwind's plain `font-medium`/`font-semibold`/
        // `font-bold` utilities (RN's `fontWeight`), not by a separate named
        // family per weight the way the loaded Google Fonts worked.
        // No third family. The design sets its eyebrows in IBM Plex Mono, and
        // a `mono` token existed for them, but one seven-pixel line on two
        // screens does not earn a font dependency — those now render in the UI
        // font with wide tracking (components/Wordmark.tsx), and the app is
        // down to exactly two faces.
      },

      // Elevation stays on Tailwind's built-in `shadow-sm` / `shadow-md`,
      // which NativeWind reliably maps to RN's shadow props on native. A
      // custom multi-layer boxShadow string renders on web but silently
      // drops on native, which would leave cards flat on the phone.
    },
  },
  plugins: [],
};
