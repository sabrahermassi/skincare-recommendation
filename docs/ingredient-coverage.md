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
- the synonym table built by joining Wikidata names to verified ingredients on
  CAS number rather than by guessing from similar text.

Korean MFDS data is not one of them. The schema has had an `mfds` source value
since the first migration, but no import script has ever loaded it.

`docs/ingredient-stub-review.json` accounts for every unverified name in the
live catalogue: the name, source, number of product references, decision,
reason, and safe target where one exists. It was first taken on 21 September
2026 and regenerated the same day after the cleanup ran, so it now lists only
the names that were left.

**It is sorted by rule, not read name by name.** A person decided two short
lists in `scripts/clean-ingredient-stubs.mjs` — the 12 ambiguous names and the 9
confirmed non-ingredients — and everything else is what the cleanup rules make
of the text. In particular "no authoritative match" means "no rule matched", not
"looks like a real ingredient": that group holds misspellings (`salicylc acid`),
other-language names (`nicotinamida`), and leftover packaging text (`new york`,
`rinse well`) side by side. All of them are left alone, which is the safe
outcome for each.

Its SHA-256 covers each name, source and decision. Use counts are left out: they
move with every scan, and only a decision changing means the ledger needs
another look.

## Snapshot result

The review covered all 929 unverified names present before the cleanup:

| Decision | Names | Meaning |
| --- | ---: | --- |
| Remove because unused | 442 | No product references the stub, so deleting it changes no formula. |
| Normalise | 10 | A used spelling/alias resolves conservatively to one verified name. |
| Remove as non-ingredient | 9 | A person confirmed it is packaging, prose, or a code. The cleanup drops it from the products that carry it, then deletes it. |
| Leave: ambiguous | 12 | The wording could identify more than one ingredient or omits a required plant/chemical part. |
| Leave: multiple ingredients | 73 | Several ingredients were fused into one stored name; choosing one would lose information. |
| Leave: invalid source text | 7 | Corrupted text may still contain a real ingredient, so it is not deleted or guessed. |
| Leave: no authoritative match | 376 | No rule matched and no single safe target exists in the checked sources. Not individually read; see above. |

The cleanup ran against the live catalogue on 21 September 2026 and removed the
first three groups (442 + 10 + 9 names), leaving 468 names across 527 formula
rows (547 before: 10 rows now point at a verified name, 9 packaging rows and 1
duplicate water row were dropped). A second run on 23 September 2026 applied
three rules added since: two more normalisations (`methylene
bis-benzotriazolyl tetramethylbutylphenol nano`, `yellow 5`) and one more
non-ingredient (`aus kontrolliert biologischem anbau`). With two new stubs
from a later import (`hydrogenated poly`, `poly`), the committed ledger holds 467 names,
every one still used by a product, across 519 formula rows. Names left unmapped continue to lower
confidence in the app; they do not inherit a safety rating from a guessed
neighbour.

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

`--check` answers two questions: whether the committed ledger still agrees with
its own hash (an entry edited by hand does not), and whether it still describes
the live catalogue. `--write` regenerates the ledger after a person reviews any
new names or policy changes. Neither changes Supabase.

The ledger is a snapshot, so `--check` is expected to fail once the catalogue
moves on: whenever a scan adds a name the dictionary does not know, or the
cleanup below removes some. That is the signal to read the new names and run
`--write`, not a fault.

The existing cleanup remains dry-run by default. With `--apply`, it repoints
safe variants, drops the confirmed non-ingredients from the products that carry
them, and now also deletes every unreferenced unverified stub. It reads uses
again just before each delete, so a stub a scan has started using in the
meantime is kept. Used ambiguous, corrupt, and unsupported names are
deliberately preserved:

```text
npm run clean:stubs
npm run clean:stubs -- --apply
```

Run the cleanup only after reading its dry-run plan, then regenerate the ledger
with `--write` so it describes what is left.
