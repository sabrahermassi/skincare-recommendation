-- Record a formula's change timestamp in the same transaction as the
-- formula itself.
--
-- scripts/reconcile-obf.mjs used to write `formula_changed_at` as a second,
-- separate UPDATE after this RPC had already committed the new formula.
-- Found by Codex on PR #122: if that second statement failed for any
-- reason after the RPC succeeded, the formula was genuinely different but
-- the change was never recorded — and worse, the *next* reconciliation run
-- would compare against the already-replaced formula, see no difference,
-- and have no way to ever notice or repair the gap. This is exactly the
-- class of bug migration 0008 exists to prevent, one column further out:
-- two non-transactional writes where the first can durably succeed while
-- the second is lost.
--
-- Adds `p_formula_changed_at timestamptz default null` as its own
-- parameter rather than folding it into `p_product`: every column in
-- `p_product` is written unconditionally on every call, but this one must
-- not be — the three existing callers (product-lookup, label-ocr,
-- import-obf.mjs) never pass it and must never accidentally clear a value
-- reconciliation previously set. `coalesce(p_formula_changed_at,
-- products.formula_changed_at)` in the update leaves it untouched when a
-- caller has nothing to say about it, and sets it only when one — today,
-- only reconcile-obf.mjs — explicitly does.
--
-- A new parameter changes the function's signature, so this is a drop and
-- recreate rather than `create or replace`: Postgres cannot replace a
-- function's argument list in place. Both statements run inside this one
-- migration's transaction, so there is no window where the function is
-- callable-but-missing from a live Edge Function's point of view.
drop function replace_product_with_ingredients(jsonb, jsonb, text);

create function replace_product_with_ingredients(
  p_product     jsonb,
  -- [{ "inci_name": text, "position": int }, ...] — already deduped by the
  -- caller (see dedupe() in both functions), so positions are unique.
  p_ingredients jsonb,
  -- The note stored on a stub row. Differs per caller: product-lookup got the
  -- name from a third-party formula, label-ocr read it off a photograph.
  p_stub_note   text,
  -- See the header comment above: only reconcile-obf.mjs ever passes this.
  p_formula_changed_at timestamptz default null
)
returns void
language plpgsql
-- SECURITY INVOKER (the default), stated rather than implied. The only caller
-- is an Edge Function or operator script holding the service-role key,
-- which bypasses RLS already, so DEFINER would buy nothing here — and would
-- turn any future loosening of the grants at the bottom of this file into
-- privilege escalation instead of a mistake.
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id text := p_product ->> 'id';
begin
  -- Without this the DELETE below degrades to `where product_id is null`,
  -- which matches nothing but reports success.
  if v_id is null then
    raise exception 'p_product must carry an id';
  end if;

  -- 1 ── Stubs first: product_ingredients.inci_name is a foreign key onto
  -- ingredients, so every name has to exist before step 4. Never "curated" —
  -- nothing has reviewed these, they exist so the join has something to point
  -- at. See migration 0007. A name we already hold keeps whatever it has.
  insert into ingredients (inci_name, source, safety, verified, note)
  select i.inci_name, 'unmatched', 'safe', false, p_stub_note
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint)
  on conflict (inci_name) do nothing;

  -- 2 ── The product itself. jsonb_populate_record does the casting:
  -- `source` is an enum and suitable_for/targets are text[], both of which
  -- would need spelling out under jsonb_to_record.
  insert into products (
    id, barcode, brand, name, type, area, description, image_url, volume,
    in_stock, suitable_for, targets, source, attribution, expires_at,
    formula_changed_at
  )
  select r.id, r.barcode, r.brand, r.name, r.type, r.area, r.description,
         r.image_url, r.volume, r.in_stock, r.suitable_for, r.targets,
         r.source, r.attribution, r.expires_at, p_formula_changed_at
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
    formula_changed_at = coalesce(p_formula_changed_at, products.formula_changed_at);

  -- 3 ── Clear the old formula. An empty p_ingredients is valid and must stay
  -- valid: product-lookup's barcode_db tier deliberately stores a product with
  -- no formula at all, and this still has to clear any stale list.
  delete from product_ingredients where product_id = v_id;

  -- 4 ── ...and write the new one. jsonb_to_recordset('[]') yields no rows.
  insert into product_ingredients (product_id, inci_name, position)
  select v_id, i.inci_name, i.position
    from jsonb_to_recordset(p_ingredients) as i(inci_name text, position smallint);
end;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default, and in
-- Supabase that means anon can call it over PostgREST. Without these two
-- statements this function would be an anonymous write path into the
-- catalogue — the exact opposite of the invariant every table here holds, that
-- reads are public and every write goes through the service-role key
-- server-side (docs/threat-model.md §1).
revoke all on function replace_product_with_ingredients(jsonb, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function replace_product_with_ingredients(jsonb, jsonb, text, timestamptz)
  to service_role;
