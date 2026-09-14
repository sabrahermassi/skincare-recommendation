-- Advance products.fetched_at when a formula is rewritten.
--
-- 0008 deliberately left fetched_at out of the do-update set, to preserve the
-- behaviour of the PostgREST upsert it replaced: default on insert, untouched
-- on update. Nothing else writes the column either — not the Edge Functions,
-- not the importers — so in practice fetched_at has only ever meant "when this
-- row was first inserted". Two things read it as if it meant something else.
--
-- The client's freshness key is the exact row count plus the newest
-- fetched_at (`fetchWatermark` in data/api.ts). A formula rewrite changes
-- neither: product_ingredients is a different table, and the product row
-- already existed. So the watermark matches on the next launch, the 24h window
-- is renewed by `touchCatalogue`, and a device that reopens the app regularly
-- can keep serving an obsolete formula — and the verdict computed from it —
-- indefinitely. That is the failure this migration closes.
--
-- The second reader is the user. `app/product/[id].tsx` renders "This formula
-- was read {relative time}" past six months, and `app/ingredients/[id].tsx`
-- captions the list "Label read {relative time}". Both describe a *formula*
-- read, so a re-photographed bottle should reset that clock — and today it does
-- not, because the update leaves the original insert's timestamp in place.
--
-- Bumping unconditionally on update is honest here because this function has
-- no metadata-only path: steps 3 and 4 below delete and rewrite the formula on
-- every call, including the barcode_db tier that writes an empty one. If a
-- caller is ever added that updates a product without touching its formula, it
-- must not use this function.
--
-- Everything else is 0008 verbatim; see that file for why the body is shaped
-- the way it is.

create or replace function replace_product_with_ingredients(
  p_product     jsonb,
  p_ingredients jsonb,
  p_stub_note   text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id text := p_product ->> 'id';
begin
  if v_id is null then
    raise exception 'p_product must carry an id';
  end if;

  -- 1 ── Stubs first, so step 4's foreign key has something to point at.
  insert into ingredients (inci_name, source, safety, verified, note)
  select i.inci_name, 'unmatched', 'safe', false, p_stub_note
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint)
  on conflict (inci_name) do nothing;

  -- 2 ── The product itself. price_krw is still absent from both the column
  -- list and the do-update set, so it stays preserved across updates.
  insert into products (
    id, barcode, brand, name, type, area, description, image_url, volume,
    in_stock, suitable_for, targets, source, attribution, expires_at
  )
  select r.id, r.barcode, r.brand, r.name, r.type, r.area, r.description,
         r.image_url, r.volume, r.in_stock, r.suitable_for, r.targets,
         r.source, r.attribution, r.expires_at
    from jsonb_populate_record(null::products, p_product) as r
  on conflict (id) do update set
    barcode      = excluded.barcode,
    brand        = excluded.brand,
    name         = excluded.name,
    type         = excluded.type,
    area         = excluded.area,
    description  = excluded.description,
    image_url    = excluded.image_url,
    volume       = excluded.volume,
    in_stock     = excluded.in_stock,
    suitable_for = excluded.suitable_for,
    targets      = excluded.targets,
    source       = excluded.source,
    attribution  = excluded.attribution,
    expires_at   = excluded.expires_at,
    -- The line this migration exists for. now() is the statement timestamp, so
    -- every row written by one call shares it.
    fetched_at   = now();

  -- 3 ── Clear the old formula.
  delete from product_ingredients where product_id = v_id;

  -- 4 ── ...and write the new one.
  insert into product_ingredients (product_id, inci_name, position)
  select v_id, i.inci_name, i.position
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint);
end;
$$;

-- CREATE OR REPLACE preserves the privileges 0008 set, so these are a
-- restatement rather than a change: the function must never be callable by
-- anon or authenticated, and this file is what a reader of the latest
-- definition will check. See docs/threat-model.md §1.
revoke all on function replace_product_with_ingredients(jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function replace_product_with_ingredients(jsonb, jsonb, text)
  to service_role;
