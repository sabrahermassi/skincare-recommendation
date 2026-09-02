/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#FDFBF9", // Cloud white
        surface: "#FFFFFF",

        // The five Milky pastel colors, untouched. All five sit between
        // 1.22:1 and 1.33:1 against white, so they are surfaces only —
        // never text, never a button fill, never behind white text.
        // Assigned per product family so the tint carries meaning.
        tint: {
          pink: "#F7D9DA", // Baby pink — cleansers
          peach: "#FBE4D8", // Soft peach — moisturizers
          mint: "#D9EDE3", // Mint whisper — serums, treatments
          lilac: "#E3DCF0", // Lilac milk — SPF, masks, app panels
        },

        // Derived from Lilac milk. Lilac leads rather than pink because a
        // rose primary sits perceptually between red and neutral, and this
        // app's whole job is a red/amber/green safety verdict.
        accent: {
          DEFAULT: "#6B5E96", // 5.73:1 with white
          deep: "#544879", // pressed
          text: "#5E5288", // 5.19:1 on tint-lilac
        },

        // Muted and faint are the base lightened by a uniform per-channel
        // offset (+48, and +89/+89/+92), which is exactly how they related to
        // the previous base — so the family keeps its internal spacing.
        ink: {
          DEFAULT: "#4A3F52", // 9.58:1 on canvas
          muted: "#7A6F82", // 4.60:1 on canvas — AA, but only just
          faint: "#A398AE", // 2.66:1 on canvas — decorative / large text only
        },

        hairline: "#E8DFE4",

        // Per-profile fit, from the design's legend. Softer than `status`
        // and kept separate from it on purpose: `status` carries a regulatory
        // verdict that is true for everyone, `tone` carries "does this suit
        // *you*", which changes with the profile. Conflating them would let a
        // personal preference read as a safety finding.
        tone: {
          good: "#8FCBAE",
          watch: "#EBB68E",
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
      },

      // Softened one notch from the first cut (6/8/12/16). Pills were the
      // outlier — a 6px score badge read architectural rather than classy,
      // and at chip scale a couple of px is the difference between a garment
      // label and a hard rectangle. Still well short of the bubbly 24px the
      // app started from.
      borderRadius: {
        chip: "8px", // tags, filter chips, score pills
        control: "10px", // buttons, inputs
        card: "14px", // cards, tiles, thumbnails
        sheet: "18px", // modals, bottom sheets
        // `full` stays for genuinely circular things only: avatars, the FAB,
        // step dots, the toggle knob.
      },

      fontFamily: {
        // Per the Skin Match Scanner design: Newsreader for display, Plus
        // Jakarta Sans for everything else. Newsreader is set at 400 rather
        // than a heavy weight — the design uses it large and light, as an
        // editorial voice, never for emphasis at small sizes.
        display: ["Newsreader_400Regular"],
        "display-medium": ["Newsreader_500Medium"],
        sans: ["PlusJakartaSans_400Regular"],
        "sans-medium": ["PlusJakartaSans_500Medium"],
        "sans-semibold": ["PlusJakartaSans_600SemiBold"],
        "sans-bold": ["PlusJakartaSans_700Bold"],
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
