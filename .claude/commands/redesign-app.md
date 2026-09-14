Work autonomously through this entire task without pausing for approval between steps. Edit files, generate assets, and run the build, test and lint commands this project already defines, then summarize everything at the end.

Keep the work inside this repository. **Stop and ask me first** before any of these three, even if it blocks the step you are on: adding, removing or upgrading a dependency; running anything destructive (deleting files you did not create, `git reset --hard`, force-pushing, rewriting history); or anything that changes state outside this checkout (pushing, opening a PR, deploying, calling a paid API, writing to the database). Everything else proceeds without asking.

If you encounter an ambiguous design decision, make the most reasonable choice consistent with the rest of this spec, note it in your final report, and keep going — do not stop to ask me, beyond the three exceptions above. Only stop if you hit something genuinely blocking (something you truly cannot proceed past), and if so, explain it clearly and continue with everything else you can do.

I'm making changes to my React Native / Expo skincare app "for.me". Do everything in code — I do not want to create or export any design assets manually. Where something genuinely cannot be done in code (e.g. a color baked into a bitmap illustration), flag it clearly at the end instead of guessing or silently skipping it.

0. Fonts — bundle these (all Google Fonts, OFL-licensed, safe to embed):

Pinyon Script — for the "for.me" wordmark.
Nunito Sans (weights 300, 400) — for the tagline and body copy, if not already bundled.
Keep whatever serif I currently use for headlines. Load fonts via expo-font / useFonts and hold the splash until they're ready (see item 1).

1. Add a branded splash screen (wordmark built in code — no image asset).

Show a splash on every cold launch (app fully closed → opened), before onboarding. Do not show it on warm resume (background → foreground).

Use expo-splash-screen to hold the native splash until fonts/assets load (no flash of unstyled content), then show a custom animated splash component, then transition into the first onboarding screen.

Build the wordmark lockup entirely in code, centered vertically and horizontally on cream (
#F5EFE6):

The text for.me rendered as live text in Pinyon Script, color terracotta
#BC6650, large (around 56–64px).
Verify the dot in "for.me" reads clearly in Pinyon Script; if the period gets visually lost in the script flourishes, nudge its size/spacing so "for.me" stays legible.
A small outline heart drawn as an inline SVG (not an image file), same terracotta, positioned at the top-right of the wordmark.
The tagline directly beneath the wordmark (see item 7).

Animation (respect reduce-motion — if enabled, skip fades and hold static for the same total duration):

Fade in over 300ms (ease-out) → hold 900ms → fade out over 400ms (ease-in) while transitioning to the first onboarding screen. Total ~1.6s.

2. Remove the wordmark and heart from ALL onboarding screens.

Delete the "for.me" logo and the floating outline heart from the top of every onboarding screen — branding now lives on the splash. Reclaim that vertical space so the illustration and headline have more room; don't leave an awkward empty gap.

3. App icon and nav-bar mark = the heart, not the script.

Generate the app icon in code as an SVG: the terracotta heart centered on a solid cream (
#F5EFE6) square (app icons cannot be transparent). Then wire it up as the app icon via app.json / expo config, generating/exporting the required PNG sizes for iOS and Android from that source. If any step of icon generation can't be done purely in code within this project and needs a one-time asset export, do the export yourself as part of the task and place the files in the correct location — do not hand this back to me unless it's truly impossible.
If any nav bar or header currently shows the script wordmark, replace it with the same inline-SVG heart mark.

4. Pagination dots on every onboarding screen.

Make the pagination progress dots appear consistently on ALL onboarding screens, including the first. Active dot terracotta (
#C1654F or existing accent), inactive dots a muted tone. Consistent style across all screens.

5. Fix "Skip" contrast.

The "Skip" text (top-right of onboarding) is low-contrast light grey on cream. Change it to terracotta or a darker taupe so it's clearly legible and passes accessibility contrast.

6. Restyle the scanning illustration's phone.

On the "Scan any skincare product" screen, the phone in the woman's hand is a dark near-black/green that's too heavy and pulls focus from the headline. If the phone is a separate asset/SVG/component, recolor it to a lighter sage or slate that fits the palette. If it's baked into the illustration bitmap and can't be recolored in code, flag this at the end as the one item needing a re-exported image — this is the expected exception.

7. Tagline spec (splash screen only — never repeated on onboarding screens).

Place the tagline directly beneath the wordmark, left-aligned to the start of "for" (not centered under the whole wordmark):

Text: skincare, understood for you. (all lowercase; keep the comma and period)
Font: Nunito Sans, weight 300.
Size: ~13px (roughly a third of the wordmark's cap height).
Color: muted taupe
#A98C7D — distinctly lighter than the terracotta wordmark; do not make it black or the same terracotta.
Letter-spacing: ~1.5px.

General constraints:

Keep existing brand colors, the serif-headline + sans-body pairing, and the watercolor illustration style consistent everywhere else.
No arrows on buttons — deliberate style choice.
Prefer in-code/SVG solutions over image files everywhere it's reasonable.

Acceptance checklist — verify each before reporting done:

Pinyon Script, Nunito Sans (300/400), and the existing headline serif are all bundled and loaded via expo-font; splash waits for them.
Splash appears on cold launch and transitions automatically into the first onboarding screen.
Splash does not appear on warm resume.
Wordmark for.me renders in Pinyon Script, terracotta
#BC6650, ~56–64px, with the dot clearly legible.
Heart is an inline SVG (not an image file), terracotta, at top-right of the wordmark.
Splash fade-in 300ms → hold 900ms → fade-out 400ms (~1.6s total) is implemented.
Reduce-motion is respected (no fades, equivalent static hold).
No flash of unstyled content before the animated splash.
Tagline present on splash: correct text, Nunito Sans 300, ~13px,
#A98C7D, ~1.5px letter-spacing, left-aligned to "for".
Tagline appears only on the splash, not on any onboarding screen.
Wordmark and heart removed from every onboarding screen; reclaimed space used cleanly.
App icon generated in code as terracotta heart on cream square, wired into app.json, with required iOS/Android PNG sizes produced and placed correctly.
Any nav-bar/header branding uses the inline-SVG heart, not the script.
Pagination dots on every onboarding screen including the first, consistent style, correct active/inactive colors.
"Skip" restyled to terracotta or dark taupe, clearly legible on cream.
Scanning-screen phone lightened to sage/slate — or flagged as the one item needing a re-exported bitmap.
Buttons have no arrows.
Existing brand colors, serif/sans pairing, and watercolor style unchanged elsewhere.
Final report lists what was done in code vs. the single expected exception (illustration phone), if applicable.

When finished, give me: (1) a summary of everything changed, (2) any assumptions you made on ambiguous points, (3) the single flagged exception if the phone was baked into a bitmap, and (4) the exact command to run to preview the app.
