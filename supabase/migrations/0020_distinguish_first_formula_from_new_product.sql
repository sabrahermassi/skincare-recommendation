-- Distinguish "this product is brand new" from "this product already
-- existed with no formula, and now has one."
--
-- Found by Codex on PR #122, on top of migration 0019: `v_old_formula is
-- not null` was used as a stand-in for "this product already existed," but
-- `array_agg` over zero product_ingredients rows is null in *both* cases —
-- a genuinely new product, and an existing one that had no formula yet.
-- `product-lookup`'s `barcode_db` tier deliberately creates exactly that
-- second case (a recognised product with no ingredients at all, until
-- someone photographs the label). A user can save that bare row, and when
-- `label-ocr` later calls this same RPC to add its first real formula, the
-- old check saw a null aggregate and silently treated it as "not a
-- change" — exactly the case a saved-product user most needs to hear
-- about, since their saved item went from nothing to score against to a
-- real formula.
--
-- Checks whether the product id already existed directly, rather than
-- inferring it from whether it had ingredients.
create or replace function replace_product_with_ingredients(
  p_product     jsonb,
  p_ingredients jsonb,
  p_stub_note   text,
  p_formula_changed_at timestamptz default null
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
    when v_product_existed and v_old_formula is distinct from v_new_formula
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
