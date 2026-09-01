-- Other names for an ingredient we already hold.
--
-- The catalogue kept failing on names that are not missing at all, only
-- written differently. Measured on real products: `glycérine` (the French half
-- of a bilingual label), `mineral oil` (INCI says `paraffinum liquidum`),
-- `iron oxides` (INCI says `ci 77491`). None of these is a gap in the
-- dictionary; each is the same substance under another name.
--
-- Why a table rather than more rows in `ingredients`:
--
--   * The existing alias trick — writing a full duplicate ingredient row per
--     alias, see COMMON_NAME_ALIASES in scripts/import-inci-dictionary.mjs —
--     inflates the dictionary, so "how many ingredients do we know" stops
--     meaning anything, and it loses which source claimed the alias.
--   * `ingredients.korean_name` is a single column. It cannot also hold the
--     Japanese and Chinese display names, and cosmetics labels in those
--     markets are printed in local script.
--
-- Locale is nullable on purpose: a trivial name like `mineral oil` belongs to
-- no language in particular, it is just what people write instead of the INCI
-- name. Adding Japanese or Chinese later is an INSERT, not a migration.

create table ingredient_synonyms (
  -- Normalised at write time by the same normalise() the parser uses, so a
  -- lookup is a primary-key hit rather than a scan.
  synonym    text primary key,
  inci_name  text not null references ingredients (inci_name) on delete cascade,
  -- BCP-47-ish: 'fr', 'ja', 'zh', 'ko'. Null = a common/trivial name.
  locale     text,
  source     ingredient_source not null,
  created_at timestamptz not null default now(),

  -- A synonym that equals the name it points at earns nothing and would let a
  -- careless import quietly double the table.
  constraint synonym_is_not_its_own_target check (synonym <> inci_name)
);

create index ingredient_synonyms_inci_idx on ingredient_synonyms (inci_name);

alter table ingredient_synonyms enable row level security;

create policy "catalogue is publicly readable"
  on ingredient_synonyms for select
  to anon, authenticated
  using (true);
