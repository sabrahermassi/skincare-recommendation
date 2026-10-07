-- When the ingredient list was photographed (issue 446, 7 October 2026).
--
-- A barcode result shows Open Beauty Facts' copy of the ingredient list, and
-- nothing stored said how old that copy is. `fetched_at` is when we last read
-- the row, and OBF's own `last_modified_t` moves whenever one of its bots
-- touches the product. The only date that follows the formula is when somebody
-- photographed the ingredient list: the upload time of the image OBF has
-- selected as the ingredients picture. The importers read it from OBF's
-- `images`; the product screen says so when it is old or unknown.
--
-- Nullable, no default, no backfill, like `formula_changed_at` (0017): null is
-- "OBF has no ingredient photo" or "not read yet", and the screen treats both
-- as "we don't know how old this list is".
--
-- "if not exists", because this file was first pushed as 0033, the same number
-- as 0033_annex_boron_followup, and staging applied it under that number. The
-- runner tracks migrations by number alone, so renamed to 0034 it runs there
-- once more, and must find its own column without failing. Anywhere else it
-- runs once, as written.
alter table products add column if not exists ingredients_photographed_at timestamptz;

-- Every writer goes through this function, and it names its columns, so a new
-- one is dropped silently unless it is listed. This is 0022's function with
-- the date added and nothing else changed. The signature is the same, so it is
-- replaced in place and 0022's grants (service_role only) stay as they are.
create or replace function replace_product_with_ingredients(
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
  p_parser_refresh boolean default false,
  -- True to leave alone a product (same id or same barcode) that already has
  -- ingredients, writing nothing. False replaces, as every importer expects.
  p_insert_only boolean default false
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

  if p_insert_only then
    -- One writer at a time per barcode: without this, two saves that both looked
    -- and found nothing would both write, the later replacing the earlier.
    perform pg_advisory_xact_lock(hashtext(p_product ->> 'barcode'));
    if exists (
      select 1
        from products p
        join product_ingredients pi on pi.product_id = p.id
       where p.id = v_id or p.barcode = p_product ->> 'barcode'
    ) then
      return;
    end if;
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
    ingredients_photographed_at, formula_changed_at
  )
  select r.id, r.barcode, r.brand, r.name, r.type, r.area, r.description,
         r.image_url, r.volume, r.in_stock, r.suitable_for, r.targets,
         r.source, r.attribution, r.expires_at,
         r.ingredients_photographed_at,
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
    -- A writer that did not look at the photos sends no key, and the date it
    -- cannot know is kept. A key that is there, null included, is what the
    -- source says now.
    ingredients_photographed_at = case
      when p_product ? 'ingredients_photographed_at' then excluded.ingredients_photographed_at
      else products.ingredients_photographed_at
    end,
    formula_changed_at = coalesce(p_formula_changed_at, v_detected_changed_at, products.formula_changed_at);

  delete from product_ingredients where product_id = v_id;

  insert into product_ingredients (product_id, inci_name, position)
  select v_id, i.inci_name, i.position
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint);
end;
$$;
