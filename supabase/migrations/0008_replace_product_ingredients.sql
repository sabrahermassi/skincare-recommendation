-- One transactional write for "here is a product and its formula".
--
-- Both Edge Functions used to do this in three PostgREST calls: upsert the
-- ingredient stubs, upsert the product, then DELETE every product_ingredients
-- row for that product and INSERT the new ones. PostgREST has no
-- multi-statement transaction, so each call committed on its own.
--
-- Both legs of the delete/insert pair were already error-checked, so a failed
-- insert returned a 502 rather than a false success. The problem was the state
-- left behind: the DELETE had committed, so the product survived with **zero
-- ingredients** and nothing marking it as half-written. Every later read — the
-- catalogue short-circuit in product-lookup, label-ocr's "we already hold a
-- formula for this barcode" check, an ordinary product fetch — then saw a
-- known product with an empty formula and treated it as legitimate rather than
-- as a write that needs retrying. That is the bug this function closes
-- (issue #40).
--
-- PostgREST runs an RPC call inside a single implicit transaction, so a raise
-- anywhere below rolls back all four statements. The replacement is still
-- written as delete-then-insert; what changed is that the delete is now only
-- durable if the insert also succeeds.

create or replace function replace_product_with_ingredients(
  p_product     jsonb,
  -- [{ "inci_name": text, "position": int }, ...] — already deduped by the
  -- caller (see dedupe() in both functions), so positions are unique.
  p_ingredients jsonb,
  -- The note stored on a stub row. Differs per caller: product-lookup got the
  -- name from a third-party formula, label-ocr read it off a photograph.
  p_stub_note   text
)
returns void
language plpgsql
-- SECURITY INVOKER (the default), stated rather than implied. The only caller
-- is an Edge Function holding the service-role key, which bypasses RLS
-- already, so DEFINER would buy nothing here — and would turn any future
-- loosening of the grants at the bottom of this file into privilege
-- escalation instead of a mistake.
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

  -- 2 ── The product itself. The column list is exactly the 15 keys both
  -- callers build, which is deliberate rather than lazy: price_krw and
  -- fetched_at are left out so they behave as they did under the PostgREST
  -- upsert this replaces — fetched_at takes its default on insert and is
  -- untouched on update, price_krw is preserved. Adding a column here means
  -- adding it in three places (the select, and the do-update set).
  --
  -- jsonb_populate_record does the casting: `source` is an enum and
  -- suitable_for/targets are text[], both of which would need spelling out
  -- under jsonb_to_record.
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
    expires_at   = excluded.expires_at;

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
revoke all on function replace_product_with_ingredients(jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function replace_product_with_ingredients(jsonb, jsonb, text)
  to service_role;
