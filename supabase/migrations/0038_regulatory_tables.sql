-- The official Annex II and III text, as tables (issue 456, 7 October 2026; step 3 of 9).
--
-- `scripts/import-eu-annexes.mjs` reads the EU's consolidated Regulation (EC) No 1223/2009 and
-- `--apply` writes every entry into `regulatory_entries`. `ingredient_regulatory` is the join that
-- step 4 fills: which dictionary ingredient an entry is about, and how that was decided.
--
-- Both tables are separate from `ingredients` on purpose. Nothing here touches `ingredients`, so its
-- `updated_at` (the dictionary's sync watermark, trigger `ingredients_bump_updated_at`, 0011) does
-- not move when an entry is written, and every device's dictionary cache stays valid. Each table
-- has its own `updated_at`, bumped by its own trigger, for the app's freshness mark of its own.
--
-- Public read, service-role write, like the catalogue tables (0001): RLS is on and there is no write
-- policy, so only the service role (which bypasses RLS) can write.

create table if not exists regulatory_entries (
  -- "II" (prohibited substances) or "III" (restricted substances).
  annex text not null check (annex in ('II', 'III')),
  -- The reference number as the regulation prints it: "1339", "15a".
  entry text not null,
  -- The chemical name or class as printed: Annex II's "Chemical name / INN", Annex III's column b.
  wording text not null,
  -- Annex III's Common Ingredients Glossary name (column c), where the entry has one.
  inci_name text,
  cas_numbers text[] not null default '{}',
  ec_numbers text[] not null default '{}',
  -- Annex III's restriction columns (product type, maximum concentration, other, wording), one object per
  -- row of the entry; null for Annex II.
  conditions jsonb,
  -- The substances listed under a class entry (borates), each with its own CAS and EC numbers.
  members jsonb not null default '[]'::jsonb,
  -- The amendment mark in effect for the entry ("B", "M32", "C6") and the act it names.
  mark text,
  amended_by text,
  -- When the entry took effect. The consolidated text does not print it per entry, so it is null until
  -- a later step reads it from the amending act.
  effective_date date,
  source_url text,
  -- The consolidated text this row was read from (CELEX with its date, "02009R1223-20260518") and its SHA-256.
  source_version text not null,
  source_hash text not null,
  -- The date of the consolidated text the row was last checked against: stable for the same text, so
  -- a second import of the same file changes no row.
  last_verified date not null,
  -- "deleted": the regulation moved or deleted the entry, or a newer text no longer lists it. Never removed.
  status text not null check (status in ('active', 'deleted')),
  updated_at timestamptz not null default now(),
  primary key (annex, entry)
);

create table if not exists ingredient_regulatory (
  inci_name text not null references ingredients (inci_name) on update cascade on delete cascade,
  annex text not null,
  entry text not null,
  -- How the ingredient was tied to the entry: by CAS number, EC number, CosIng's own record, a class the
  -- entry names, or by hand.
  matched_by text not null check (matched_by in ('cas', 'ec', 'cosing', 'class', 'manual')),
  reviewed_by text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  -- One row per ingredient and entry.
  primary key (inci_name, annex, entry),
  foreign key (annex, entry) references regulatory_entries (annex, entry) on update cascade on delete cascade
);

-- Which ingredients an entry is about, for the app's read by entry.
create index if not exists ingredient_regulatory_entry on ingredient_regulatory (annex, entry);

-- `updated_at` moves only when something changed, so an import that writes identical values (or none)
-- leaves every row, and the freshness mark built on them, where it was. Same rule as 0011.
create or replace function bump_regulatory_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists regulatory_entries_bump_updated_at on regulatory_entries;
create trigger regulatory_entries_bump_updated_at
  before update on regulatory_entries
  for each row
  when (old.* is distinct from new.*)
  execute function bump_regulatory_updated_at();

drop trigger if exists ingredient_regulatory_bump_updated_at on ingredient_regulatory;
create trigger ingredient_regulatory_bump_updated_at
  before update on ingredient_regulatory
  for each row
  when (old.* is distinct from new.*)
  execute function bump_regulatory_updated_at();

revoke all on function bump_regulatory_updated_at() from public, anon, authenticated;

alter table regulatory_entries enable row level security;
alter table ingredient_regulatory enable row level security;

drop policy if exists "regulatory entries are publicly readable" on regulatory_entries;
create policy "regulatory entries are publicly readable"
  on regulatory_entries for select to anon, authenticated using (true);
drop policy if exists "ingredient regulatory is publicly readable" on ingredient_regulatory;
create policy "ingredient regulatory is publicly readable"
  on ingredient_regulatory for select to anon, authenticated using (true);

-- Belt and braces beside the missing write policies: no grant to write either, for anyone but the service role.
revoke insert, update, delete, truncate on regulatory_entries, ingredient_regulatory from anon, authenticated;
