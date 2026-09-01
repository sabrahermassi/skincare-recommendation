-- Catalogue schema.
--
-- The unusual part of this schema is `products.expires_at`, and it is not a
-- performance decision — it is a licence boundary made physical.
--
--   Open Beauty Facts  ODbL / DbCL / CC-BY-SA images. Permanent mirroring and
--                      commercial use are explicitly allowed, with attribution.
--   EU CosIng          CC BY 4.0. Ours to keep.
--   MFDS (data.go.kr)  Korean government open data. Ours to keep.
--   INCI API           Proprietary. Their terms forbid bulk-downloading the
--                      database and permit caching only "in accordance with
--                      returned cache headers". So those rows are a CACHE with
--                      a deadline, not a mirror.
--
-- Mixing both kinds of row in one table is what the app needs; letting anyone
-- forget which kind they are holding is what the CHECK constraint prevents.

create type product_source as enum ('obf', 'inci_api', 'curated');
create type ingredient_source as enum ('cosing', 'mfds', 'obf', 'curated');
create type safety_level as enum ('safe', 'caution', 'avoid');

-- ── Ingredients ─────────────────────────────────────────────────────────────
-- Every source here is openly licensed, so there is no expiry: this table is
-- ours outright. INCI name is the natural key — it is the identifier printed
-- on the packaging and the one every source agrees on.

create table ingredients (
  inci_name      text primary key,
  korean_name    text,
  cas_number     text,
  functions      text[] not null default '{}',
  -- 0 = will not clog pores, 5 = highly pore-clogging. Nullable because most
  -- ingredients have no published rating and a guessed 0 would read as a fact.
  comedogenic    smallint check (comedogenic between 0 and 5),
  safety         safety_level not null default 'safe',
  note           text,
  source         ingredient_source not null,

  -- Whether this name was matched against an authoritative dictionary
  -- (CosIng / MFDS) rather than merely parsed off a label.
  --
  -- This is not defensive programming, it is a measured need: Open Beauty
  -- Facts ingredient text is crowdsourced and frequently OCR-mangled. A real
  -- record in the live data reads "Sodium Lauroyl nicus Branch/Fruit/Leaf
  -- Extract" and "Ulmus Davidiana Root raria Lobata Root" — two ingredients
  -- fused, with fragments dropped. Rendering that as a definitive INCI list
  -- under a safety verdict would be presenting garbage as fact, so unverified
  -- names are shown as unverified.
  verified       boolean not null default false,

  updated_at     timestamptz not null default now()
);

create index ingredients_korean_name_idx on ingredients (korean_name)
  where korean_name is not null;

-- ── Products ────────────────────────────────────────────────────────────────

create table products (
  id             text primary key,
  barcode        text unique,
  brand          text not null,
  name           text not null,
  type           text not null,
  area           text not null check (area in ('face', 'body')),
  description    text,
  image_url      text,
  volume         text,
  price_krw      integer,
  in_stock       boolean not null default true,
  suitable_for   text[] not null default '{}',
  targets        text[] not null default '{}',

  source         product_source not null,
  -- Human-readable credit rendered in the UI, e.g.
  -- "Data from Open Beauty Facts, ODbL". Stored per row because the obligation
  -- travels with the row, not with the table.
  attribution    text,

  -- NULL  = we hold this row under a licence that permits keeping it.
  -- Set    = cached under someone else's terms; must be evicted on time.
  expires_at     timestamptz,
  fetched_at     timestamptz not null default now(),

  -- The rule that must not be forgotten, enforced rather than documented.
  constraint cached_sources_must_expire check (
    (source = 'inci_api' and expires_at is not null) or
    (source <> 'inci_api' and expires_at is null)
  )
);

create index products_barcode_idx on products (barcode) where barcode is not null;
create index products_area_type_idx on products (area, type);
create index products_expires_at_idx on products (expires_at) where expires_at is not null;

-- ── Join: ordered INCI list ─────────────────────────────────────────────────
-- `position` exists because INCI order is regulated information, not
-- presentation: ingredients are listed in descending concentration, so the
-- 2nd entry and the 30th mean very different things.

create table product_ingredients (
  product_id   text not null references products (id) on delete cascade,
  inci_name    text not null references ingredients (inci_name),
  position     smallint not null,
  primary key (product_id, position)
);

create index product_ingredients_inci_idx on product_ingredients (inci_name);

-- ── Eviction ────────────────────────────────────────────────────────────────
-- Called on a schedule. Deliberately deletes only rows that carry a deadline,
-- so an owned row can never be dropped by a bug in the caller.

create or replace function evict_expired_products()
returns integer
language plpgsql
as $$
declare
  removed integer;
begin
  delete from products
   where expires_at is not null
     and expires_at < now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ── Read-only public access ─────────────────────────────────────────────────
-- There are no user accounts. The catalogue is public reference data, so anon
-- may read it and nothing may write it: every write goes through an Edge
-- Function using the service role, which is also where the INCI API key lives.

alter table ingredients enable row level security;
alter table products enable row level security;
alter table product_ingredients enable row level security;

create policy "catalogue is publicly readable"
  on ingredients for select to anon, authenticated using (true);
create policy "catalogue is publicly readable"
  on products for select to anon, authenticated using (true);
create policy "catalogue is publicly readable"
  on product_ingredients for select to anon, authenticated using (true);
