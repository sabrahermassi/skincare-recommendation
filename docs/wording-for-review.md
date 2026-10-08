# Wording that names a condition or claims an effect (#473)

The owner approved every row on 8 October 2026 and the strings were changed the
same day, without waiting for the lawyer. This is the list for the lawyer, who
may ask for more. Only what a person can see today is here: Skin needs is
hidden until an expert has checked it (#467), so `lib/skin-needs-data.ts` and
the Skin needs goals in `lib/journey.ts` are listed in the follow-up issue
instead.

Only labels moved. The stored concern keys (`acne-prone`, `atopic`,
`post-acne-marks`, ...) are unchanged, so no saved profile is touched, and
`__tests__/condition-wording.test.ts` pins both the new words and the keys.

## Concern names (`lib/profile.ts`)

| Before | After |
|---|---|
| Acne or pimples | Breakouts |
| acne (inside sentences) | breakouts |
| Redness or rosacea | Redness |
| Post-acne marks / post-acne marks | Marks left by breakouts / marks left by breakouts |
| Eczema-prone | Very dry or reactive |
| eczema-prone skin | very dry or reactive skin |
| Fine lines and wrinkles | kept: an appearance claim |

## Ingredient rules (`lib/rules.ts`)

| Before | After |
|---|---|
| Ceramides supply barrier lipids that dry, reactive and eczema-prone skin can run short of | Ceramides supply barrier lipids that dry and reactive skin can run short of |
| Colloidal oatmeal is a classic comforting barrier ingredient for eczema-prone skin | Colloidal oatmeal is a classic comforting barrier ingredient for very dry or reactive skin |
| A rich plant lipid that replaces what an eczema-prone barrier leaks | A rich plant lipid that helps a dry skin barrier hold water |
| Microbiome-derived ferments used in eczema-prone ranges to help calm reactivity | Microbiome-derived ferments used in ranges for reactive skin |
| Tea tree oil has real evidence against blemishes, and is a common irritant on reactive skin | Tea tree oil is common in products for breakout-prone skin, and is a common irritant on reactive skin |
| Commonly implicated in congestion on acne-prone skin | Commonly implicated in congestion |
| Benzoyl peroxide is a strong blemish active with a high drying and irritation cost | Benzoyl peroxide is a strong active with a high drying and irritation cost |
| Houttuynia is the calming anti-blemish botanical Korean acne ranges are built around | Houttuynia is a calming botanical common in Korean ranges for breakout-prone skin |
| Ginseng is antioxidant and circulation-boosting, an anchor of Korean anti-ageing formulas | Ginseng is an antioxidant, an anchor of Korean formulas for mature skin |

Kept: "blemish care" and "blemish-prone skin", the usual cosmetic wording.

## Pore-clogging notes (`lib/pore-clogging.ts`)

| Before | After |
|---|---|
| Algae and seaweed extracts are flagged across the acne-clinic lists, which is why they turn up in so many 'why did this break me out' posts | Algae and seaweed extracts are flagged across published pore-clogging lists |
| A rich, oleic-heavy oil; listed as a moderate clogger for acne-prone skin | A rich, oleic-heavy oil; listed as a moderate pore-clogger |
| Flagged by some acne clinics and explicitly cleared by others; widely tolerated in practice, so shown here rather than warned about | Flagged on some pore-clogging lists and cleared on others; widely tolerated in practice, so shown here rather than warned about |
| The D&C Red pigment series is flagged across the acne-clinic lists, most often in blushes, lipsticks and tinted bases | The D&C Red pigment series is flagged across published pore-clogging lists, often in blushes, lipsticks and tinted bases |
| Salt appears on several acne-clinic lists, usually attributed to irritation rather than to blocking a follicle | Salt appears on several pore-clogging lists, usually attributed to irritation rather than to blocking a follicle |

## School and tips (`data/school.ts`, `lib/skin-tips.ts`)

| Before | After |
|---|---|
| Sunscreens and some blemish products sold in the US carry a "Drug Facts" box | Sunscreens and some products for breakout-prone skin sold in the US carry a "Drug Facts" box |
| (A "Drug Facts" box, on some sunscreens and blemish products, is the exception…) | (A "Drug Facts" box, on some sunscreens and products for breakout-prone skin, is the exception…) |
| …this app weighs them more heavily if you've told it your skin is acne-prone. | …this app weighs them more heavily if you've told it your skin is breakout-prone. |
| Oat soothes and softens. It's a good pick on nights your skin feels tight. | Oat feels soft and comforting. It's a good pick on nights your skin feels tight. |

Kept: "For a skin problem, a dermatologist is the right person to ask." It sends
people to a doctor and claims nothing.

## Found after the owner approved the table, not changed

Visible lines the approved table did not list. They need the owner's say before
they change (#492 carries them):

- `app/ingredient/[inci].tsx`: "…it may clog pores, most of all on acne-prone
  skin." (a high-confidence pore-clogger's note on the ingredient sheet).
- `data/ingredients.ts`: the sample-product notes "Highly pore-clogging - risky
  for acne-prone skin." and "…generally acne-safe." Shown only when the app runs
  without a backend (checkouts and tests), never to a person with the live
  catalogue.
- `data/types.ts`: the product type "Pimple patch", a product category name.

## One thing for the lawyer in particular

The EU allows benzoyl peroxide in cosmetics only in nail products (Annex III,
entry 94). On skin it is a medicine in the EU. The app scores it as a help for
"breakouts" (it said "acne" before), and its rule still reads "a strong active
with a high drying and irritation cost".

## Not changed

- The stored concern keys and the scoring rules behind them.
- A few words that survive in sources people cannot see (code comments, the
  rules' internal grouping names).
- Pre-existing wording outside the approved list, for example the Pregnancy
  note and the EU regulatory notes, which have their own sources.
