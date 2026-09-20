-- A product must have a name, a barcode and an ingredient list, or it is not
-- written at all.
--
-- The catalogue had grown three kinds of half-product: a barcode and a name
-- with no ingredients (the generic barcode database's `barcode_db` rows), a
-- formula with no barcode (label photos on a 24-hour grace timer, and the
-- DailyMed import), and both of those together. None of them can answer a scan
-- with a verdict, so none of them is worth storing. The refusal lives in the
-- function every writer goes through, so no source can bring one back.
--
-- With nothing barcode-less left to resolve, the capability table behind the
-- "scan the barcode too?" follow-up (0015) has no purpose and goes.
--
-- Deleting the existing incomplete rows is scripts/prune-incomplete-products.mjs,
-- run by hand after reading its dry run; this migration only stops new ones.

drop table if exists scan_tokens;

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

  -- A product exists only when it is complete: a name, a barcode and at least
  -- one ingredient. Half a product (a barcode with no formula, a formula with
  -- no barcode) cannot be found or judged by anyone, so it is refused here,
  -- whichever source is writing.
  if coalesce(btrim(p_product ->> 'name'), '') = '' then
    raise exception 'a product needs a name';
  end if;
  if coalesce(btrim(p_product ->> 'barcode'), '') = '' then
    raise exception 'a product needs a barcode';
  end if;
  if p_ingredients is null or jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'a product needs an ingredient list';
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
