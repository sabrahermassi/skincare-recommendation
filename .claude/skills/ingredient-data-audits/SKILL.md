---
name: ingredient-data-audits
description: Populate and audit the ingredients dictionary — the imports that fill it (CosIng, OBF taxonomy, OBF products, Wikidata and Korean MFDS synonyms) and the read-only checks for duplicates, safety labels, function tags and coverage. Use when running a dictionary import, checking data quality on `ingredients`, or fixing duplicate ingredient rows.
---

# Ingredient dictionary imports and audits

**Dictionary imports** — populate `ingredients` (what `verified` is judged
against). All take `--dry-run`; writing needs `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` in the shell (not in `.env` — get it from the
dashboard or `supabase projects api-keys --project-ref <ref>`).

**Every DB script goes through `connect({ write })` in `scripts/lib/db.mjs`.**
Reads need only those two. **A write also needs `SUPABASE_ENV=staging|production`,
and `SUPABASE_ENV=production` needs `--prod` on the command line too.** Each run
prints the project ref it touches — read it.

```bash
npm run import:inci-dictionary       # Open Beauty Facts taxonomy (~31k rows, the bulk)
npm run import:cosing                # EU CosIng; no argument = the mirrored export
npm run import:obf                   # products, not the dictionary
npm run import:wikidata-synonyms     # ingredient_synonyms only, CAS-matched (e.g. "glycérine" → glycerin)
npm run import:mfds                  # Korean names from Korea's MFDS register (e.g. "글리세린" → glycerin)
```

`import:mfds` (#201) reads 식품의약품안전처_화장품 원료성분정보 on data.go.kr,
whose licence says 이용허락범위 제한 없음 (no restriction on use). It needs
`MFDS_SERVICE_KEY` in the shell: a data.go.kr service key the operator applies
for on that dataset's page. Each record is matched to a verified ingredient by
its English name, then by a CAS number only one ingredient holds, and never by
the Korean name. Its Korean standard name and alternative names become
`ingredient_synonyms` rows with `locale = 'ko'` and `source = 'mfds'`. It
**adds, never takes over**: a synonym another source already holds is left
alone, and a clash is counted in the output. It rebuilds only its own rows, so
a re-run after the Wikidata import is safe. `ingredients.korean_name` is not
used: synonyms are the one home for another language's name. The register
lists no purpose per ingredient, so it adds nothing to `functions`. There is
no Japanese equivalent; kana and kanji resolve only through whatever Wikidata
carries.

`import:cosing` never overwrites a row another source already verified —
re-running it is safe. `import:inci-dictionary` likewise only rewrites its own
rows. On either one, `-- --prune` also clears names an earlier run wrote that
it no longer produces (deleted if unused, returned to unverified if a product
uses them). For `import:cosing` that is only the shortened spellings its old
naming rule made — a name missing from today's file is left alone, because
CosIng exports differ and another one may have written it.

## Read-only data-quality audits

`npm run audit:duplicate-ingredients` lists verified names that look
like one ingredient stored twice, by spelling or by shared CAS number, and flags
the pairs whose safety or functions disagree, or whose CAS numbers actively
contradict each other, or where a CAS number is on file for only some of the
group's rows (two distinct substances, like optical isomers, can normalise to
the same spelling key, and one half of such a pair may simply not have been
matched to a CAS number yet).

`npm run audit:safety-labels` counts the `safe` labels that are only
the column default (no EU annex lists the ingredient, which is not a verdict),
and lists labels that disagree with the annex citation in their own note, and
`avoid`/`caution` labels with no note.

`npm run audit:function-tags` checks the CosIng function tags the
scoring reads: how many verified rows carry each scored function, stored tags
that are a misspelling of one, rows with no functions, and well-known
ingredients missing the tag CosIng gives them.

`npm run audit:data` runs every read-only ingredient check in one go
(duplicates, safety labels, function tags, coverage `--check`). The coverage
step fails loudly if the committed ledger (`docs/ingredient-stub-review.json`)
is stale — run `npm run audit:ingredient-coverage -- --write` first if so.

## Fixing duplicates

`npm run fix:duplicate-ingredients` (plan-only by default, `-- --apply` to
write) merges duplicate ingredients where it's unambiguous: names that only
differ in spelling and whose rows already agree on safety and functions. A
shared CAS number or any disagreement is left for a person — see the file's
own comment for why.
