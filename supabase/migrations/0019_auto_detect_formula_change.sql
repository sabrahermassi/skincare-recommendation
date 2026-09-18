-- Detect a genuine formula change inside the transaction, instead of
-- trusting each caller to say so.
--
-- Found by Codex on PR #122, on top of migration 0018: `import-obf.mjs`
-- calls this same RPC whenever it re-imports a product already in the
-- catalogue, and never passes `p_formula_changed_at` — so a re-import that
-- genuinely changes a formula left `formula_changed_at` untouched. A later
-- reconciliation run then compares against the already-updated formula,
-- sees no difference, and can never recover the missed notification.
--
-- Rather than teach every caller to detect its own changes (import-obf.mjs
-- would be the second copy of that comparison, after reconcile-obf.mjs's
-- own), the function now compares the old ingredient list against the new
-- one itself, before replacing them, and sets `formula_changed_at`
-- whenever they genuinely differ — regardless of which caller wrote them.
-- This also closes the same blind spot for product-lookup and label-ocr,
-- which never thought about this column at all.
--
-- `p_formula_changed_at` stays as an explicit override (still passed by
-- reconcile-obf.mjs) and wins when given; auto-detection is the fallback
-- for the three callers that don't pass it.
--
-- A brand-new product has no old formula to compare against
-- (`array_agg` over zero existing rows is null), so it is never treated as
-- a "change" — creation is not a change, and nobody could have saved it
-- before it existed anyway.
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
  v_old_formula text[];
  v_new_formula text[];
  v_detected_changed_at timestamptz;
begin
  if v_id is null then
    raise exception 'p_product must carry an id';
  end if;

  -- Captured before anything below touches product_ingredients. Ordered by
  -- position, same as reconcile-obf.mjs's own client-side `formulaChanged` —
  -- a reordering is a real change even with identical names, since position
  -- weighting reads the formula in concentration order.
  select array_agg(inci_name order by position) into v_old_formula
    from product_ingredients where product_id = v_id;

  select array_agg(i.inci_name order by i.position) into v_new_formula
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint);

  v_detected_changed_at := case
    when v_old_formula is not null and v_old_formula is distinct from v_new_formula
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
