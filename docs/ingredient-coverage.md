# Ingredient coverage review

This closes catalogue-plan step 19 without changing what `verified` means.
An ingredient is verified only when it matches a checked source. Repetition is
not verification: a typo, generic colour name, or corrupted scan can appear on
three products just as easily as on one, and promoting it would attach a safety
record that may belong to a different ingredient.

## Recorded decision

Do **not** promote unverified stubs because they occur on three or more
products. Frequency remains useful for prioritising future research, but never
as evidence of identity.

The sources already loaded into the dictionary remain the trust boundary:

- the EU CosIng-derived inventory and Open Beauty Facts ingredient taxonomy;
- MFDS ingredient data;
- the synonym table built by joining Wikidata names to verified ingredients on
  CAS number rather than by guessing from similar text.

`data/ingredient-stub-review.json` is the line-by-line disposition of the live
catalogue snapshot taken on 21 September 2026. It records the name, source,
number of product references, decision, reason, and safe target where one
exists. Its inventory SHA-256 makes later catalogue drift visible.

## Snapshot result

The review covered all 929 unverified names present in the snapshot:

| Decision | Names | Meaning |
| --- | ---: | --- |
| Remove because unused | 442 | No product references the stub, so deleting it changes no formula. |
| Normalise | 9 | A used spelling/alias resolves conservatively to one verified name. |
| Remove as non-ingredient | 9 | Reviewed packaging, prose, or code with no ingredient identity. |
| Leave: ambiguous | 12 | The wording could identify more than one ingredient or omits a required plant/chemical part. |
| Leave: multiple ingredients | 73 | Several ingredients were fused into one stored name; choosing one would lose information. |
| Leave: invalid source text | 7 | Corrupted text may still contain a real ingredient, so it is not deleted or guessed. |
| Leave: no authoritative match | 377 | Plausible text, but no single safe target exists in the checked sources. |

The 487 names still referenced by products account for 547 formula rows. Names
left unmapped continue to lower confidence in the app; they do not inherit a
safety rating from a guessed neighbour.

Examples of deliberate non-matches are `iron oxides` (several colour indexes),
`citrus aurantium peel oil` (the plant variety is missing), and `butyrospermum
parkii` (the plant part is missing). `arnebia nobilis root extract` remains
unmapped because the checked dictionary has no safe target. Corrupted text such
as a valid ingredient followed by `&quot` also remains unmapped rather than
being silently rewritten.

## Reproduce and maintain the review

The audit is read-only and can use the app's public catalogue key:

```text
npm run audit:ingredient-coverage
npm run audit:ingredient-coverage -- --check
npm run audit:ingredient-coverage -- --write
```

`--check` compares the live inventory hash with the committed ledger. `--write`
regenerates the ledger after a person reviews any new names or policy changes.
It does not change Supabase.

The existing cleanup remains dry-run by default. With `--apply`, it repoints
safe variants and now also deletes every unreferenced unverified stub. Used
ambiguous, corrupt, and unsupported names are deliberately preserved:

```text
npm run clean:stubs
npm run clean:stubs -- --apply
```

Production cleanup should be run only after the PR is merged and its dry-run
plan has been checked. The committed ledger records the decision independently
of whether that operational cleanup has run yet.
