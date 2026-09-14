-- Advance products.fetched_at when a formula changes, whoever changed it.
--
-- 0009 put the bump in `replace_product_with_ingredients`, which is the write
-- path both Edge Functions use. It is not the only write path.
-- `scripts/import-obf.mjs` upserts products directly and then deletes and
-- reinserts their `product_ingredients` rows itself, never calling the
-- function — so an OBF re-import that changes an existing formula still moves
-- neither term of the client's freshness key: the row count is unchanged
-- because the product already existed, and `fetched_at` is unchanged because
-- the importer never writes it. The watermark matches on the next launch,
-- `touchCatalogue` renews the 24h window, and the device keeps serving the old
-- formula. That is the same failure 0009 closed, reopened by a different
-- writer.
--
-- Fixing the importer would close it for the importer. This closes it for
-- every writer, including the next one — which matters, because the history of
-- this column is three separate writers each independently not writing it:
-- 0008 left it out of the upsert deliberately, the Edge Functions never set
-- it, and the importer does not either. A rule enforced per writer is a rule
-- the next writer forgets.
--
-- Statement-level rather than per-row: the transition table gives one UPDATE
-- per statement, not one per ingredient link, which matters on an import that
-- inserts joins in batches of 500.
--
-- Both triggers fire inside `replace_product_with_ingredients`, whose delete
-- and insert run in one transaction. `now()` is the transaction timestamp, so
-- the two bumps write the same value and the double fire is free.

create or replace function bump_product_fetched_at()
returns trigger
language plpgsql
-- Runs as the caller, like the RPC it complements. Every writer here already
-- holds the service-role key; DEFINER would buy nothing and would turn a
-- future grant mistake into privilege escalation.
security invoker
set search_path = public, pg_temp
as $$
begin
  -- `changed` is the transition table, named by the `referencing` clause on
  -- each trigger below. A product deleted in this same statement is simply not
  -- matched — its row is already gone — so the cascade from `delete from
  -- products` is a no-op here rather than an error.
  update products p
     set fetched_at = now()
   where p.id in (select distinct product_id from changed);
  return null;
end;
$$;

drop trigger if exists product_ingredients_bump_fetched_at_insert on product_ingredients;
create trigger product_ingredients_bump_fetched_at_insert
  after insert on product_ingredients
  referencing new table as changed
  for each statement
  execute function bump_product_fetched_at();

drop trigger if exists product_ingredients_bump_fetched_at_delete on product_ingredients;
create trigger product_ingredients_bump_fetched_at_delete
  after delete on product_ingredients
  referencing old table as changed
  for each statement
  execute function bump_product_fetched_at();

-- The function is only ever reached through a trigger, never called directly,
-- but Postgres grants EXECUTE to PUBLIC on a new function by default and in
-- Supabase that means anon can call it over PostgREST. Revoked for the same
-- reason 0008 revokes its own: nothing in this schema is an anonymous write
-- path (docs/threat-model.md §1). Triggers run regardless of EXECUTE grants.
revoke all on function bump_product_fetched_at() from public, anon, authenticated;
