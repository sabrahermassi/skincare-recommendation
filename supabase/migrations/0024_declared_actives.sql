-- Product-specific Drug Facts metadata. Ingredient definitions are shared,
-- but an active strength belongs to one labelled product, so it cannot live
-- on `ingredients` without leaking across formulas.
alter table products
  add column declared_actives jsonb not null default '[]'::jsonb;

alter table products
  add constraint products_declared_actives_is_array
  check (jsonb_typeof(declared_actives) = 'array');

comment on column products.declared_actives is
  'Ordered [{"ingredient": normalized INCI, "strengthPercent": number|null}] from a Drug Facts label; empty when unstated.';
