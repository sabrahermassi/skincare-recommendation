-- A current copy of CosIng, the Commission's ingredient and substance database (issue 457, 8 October
-- 2026; step 4 of 9).
--
-- An Annex entry names a substance; a label names an INCI ingredient. CosIng is the Commission's own
-- link between the two: a record carries an INCI name, its CAS and EC numbers, and the annex
-- reference CosIng gives it. `scripts/match-regulatory.mjs` reads this table, the Annex text in
-- `regulatory_entries` (0038) and the dictionary, and fills `ingredient_regulatory`.
--
-- Not a replacement for the 2016 dictionary rows or their functions: nothing here touches
-- `ingredients`, so its `updated_at` (the dictionary's sync watermark, trigger
-- `ingredients_bump_updated_at`, 0011) does not move and every device's dictionary cache stays valid.
--
-- Unlike the regulatory tables this one is not public. CosIng's reuse terms are the owner's to confirm,
-- and the app has no reason to read it: RLS is on with no policy and no grant, so only the service role
-- (which bypasses RLS) can read or write it.

create table if not exists cosing_records (
  -- CosIng's own record id.
  cosing_ref text primary key,
  -- "ingredient" (the inventory of ingredients) or "substance" (the substances of the annexes).
  kind text not null check (kind in ('ingredient', 'substance')),
  inci_name text,
  cas_numbers text[] not null default '{}',
  ec_numbers text[] not null default '{}',
  -- The annex references CosIng gives this record, as it prints them: "II/1339", "III/14". CosIng's
  -- numbers can be older than the regulation's; the matcher treats the regulation text as the authority.
  annex_refs text[] not null default '{}',
  -- CosIng's status for the record ("Active" or "Inactive").
  status text,
  -- Where and when this copy was read, and the SHA-256 of what was read.
  source_url text not null,
  source_hash text not null,
  fetched_on date not null,
  updated_at timestamptz not null default now()
);

-- The matcher looks a dictionary name up by INCI name, case-insensitively.
create index if not exists cosing_records_inci_lower on cosing_records (lower(inci_name));

-- `updated_at` moves only when something changed, so a run that reads identical records leaves every
-- row where it was. Same rule as 0011 and 0038, and the same function.
drop trigger if exists cosing_records_bump_updated_at on cosing_records;
create trigger cosing_records_bump_updated_at
  before update on cosing_records
  for each row
  when (old.* is distinct from new.*)
  execute function bump_regulatory_updated_at();

alter table cosing_records enable row level security;
revoke all on cosing_records from anon, authenticated;
