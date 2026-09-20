-- Let a caller say "this formula differs only because the parser got better."
--
-- Migration 0019 made `replace_product_with_ingredients` stamp
-- `formula_changed_at` whenever the list it is handed differs from the stored
-- one, and the product screen turns that stamp into a "reformulated" notice for
-- everyone who saved the product. That is right when the label changed and wrong
-- when only the parser did: the ingredient-list parser (issue #101) now reads
-- names the old one stored as junk ("ingredients: aqua"), so re-importing an
-- unchanged product would write a different list and tell its savers their
-- moisturiser was reformulated.
--
-- The database cannot tell the two apart — it never sees the label text — so the
-- caller says so. `p_parser_refresh` = true suppresses the automatic stamp for
-- this write and nothing else: a caller that also passes an explicit
-- `p_formula_changed_at` still gets it, and the stored stamp is never cleared.
-- The default is false, so every existing caller — including the two Edge
-- Functions, which only ever write a new or formula-less product — behaves
-- exactly as under 0020.
--
-- A new parameter changes the signature, so this is a drop and recreate (as in
-- 0018), inside one migration's transaction. The grants are restated for the new
-- signature: a function recreated without them would be executable by anon over
-- PostgREST (docs/threat-model.md §1).
drop function replace_product_with_ingredients(jsonb, jsonb, text, timestamptz);

create function replace_product_with_ingredients(
  p_product     jsonb,
  -- [{ "inci_name": text, "position": int }, ...] — already deduped by the
  -- caller, so positions are unique.
  p_ingredients jsonb,
  -- The note stored on a stub row. Differs per caller.
  p_stub_note   text,
  -- Explicit override; wins over auto-detection. See migration 0018.
  p_formula_changed_at timestamptz default null,
  -- True when the new list differs from the stored one only because the parser
  -- improved. Suppresses auto-detection for this write.
  p_parser_refresh boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id text := p_product ->> 'id';
  v_product_existed boolean;
  v_old_formula text[];
  v_new_formula text[];
  v_detected_changed_at timestamptz;
begin
  if v_id is null then
    raise exception 'p_product must carry an id';
  end if;

  select exists(select 1 from products where id = v_id) into v_product_existed;

  select array_agg(inci_name order by position) into v_old_formula
    from product_ingredients where product_id = v_id;

  select array_agg(i.inci_name order by i.position) into v_new_formula
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint);

  v_detected_changed_at := case
    when not coalesce(p_parser_refresh, false)
         and v_product_existed
         and v_old_formula is distinct from v_new_formula
      then now()
    else null
  end;

  insert into ingredients (inci_name, source, safety, verified, note)
  select i.inci_name, 'unmatched', 'safe', false, p_stub_note
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint)
  on conflict (inci_name) do nothing;

  insert into products (
    id, barcode, brand, name, type, area, description, image_url, volume,
    in_stock, suitable_for, targets, source, attribution, expires_at,
    formula_changed_at
  )
  select r.id, r.barcode, r.brand, r.name, r.type, r.area, r.description,
         r.image_url, r.volume, r.in_stock, r.suitable_for, r.targets,
         r.source, r.attribution, r.expires_at,
         coalesce(p_formula_changed_at, v_detected_changed_at)
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
    formula_changed_at = coalesce(p_formula_changed_at, v_detected_changed_at, products.formula_changed_at);

  delete from product_ingredients where product_id = v_id;

  insert into product_ingredients (product_id, inci_name, position)
  select v_id, i.inci_name, i.position
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint);
end;
$$;

revoke all on function replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean)
  to service_role;
