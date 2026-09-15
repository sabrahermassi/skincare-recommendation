-- Make the ingredient dictionary fetchable once, and its changes detectable.
--
-- Two halves of one problem. The client's catalogue read currently inlines
-- every ingredient column inside the `product_ingredients` join, so each
-- definition travels once per product that contains it: 3,819 rows for 1,049
-- distinct ingredients, every definition sent 3.6 times on average. Sending
-- the dictionary once instead needs somewhere to read it from that is neither
-- "all 36,000 rows" nor "a 1,049-item IN list built from the response we just
-- parsed". That is the view.
--
-- The second half is the reason this file also carries a trigger. Once the
-- dictionary is fetched separately it is also cached separately, and the
-- client's freshness key counts *products* — so a CosIng re-import that
-- rewrites twenty thousand notes and adds no products would move neither term
-- of that key, and every device would keep serving the old definitions
-- indefinitely.
--
-- `ingredients.updated_at` exists and looks like the answer. It is not, yet:
-- nothing writes it. It takes its default on insert and is never touched on
-- update — by the CosIng import, the INCI dictionary import, the OBF import,
-- or either Edge Function. This is the third time this exact shape has turned
-- up in this schema (see 0009 and 0010 for `products.fetched_at`), so it gets
-- the same treatment rather than a fourth rediscovery: a trigger, not a
-- convention every writer has to remember.

-- 1 ── Keep `updated_at` honest, whoever writes the row.
create or replace function bump_ingredient_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Row-level rather than statement-level, unlike 0010: there is no transition
  -- table here because the value is written into the row being updated rather
  -- than into a different table.
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ingredients_bump_updated_at on ingredients;
create trigger ingredients_bump_updated_at
  before update on ingredients
  for each row
  -- Only when something actually changed. An idempotent re-import that writes
  -- identical values must not move the timestamp, or every run would invalidate
  -- every client's dictionary cache and the whole point would be lost.
  when (old.* is distinct from new.*)
  execute function bump_ingredient_updated_at();

revoke all on function bump_ingredient_updated_at() from public, anon, authenticated;

-- 2 ── The dictionary the catalogue actually needs.
--
-- Scoped to ingredients used by at least one product the client can reach,
-- which is the same population `IDENTIFIABLE_SQL` selects in `data/api.ts`:
-- a row is reachable if it did not come from OCR, or if it carries a barcode.
-- Keeping that predicate here rather than in the client is what lets the
-- dictionary be one paginated read instead of a filter built from a response.
--
-- `security_invoker` so the underlying tables' RLS still applies to the
-- caller. Without it the view would run as its owner and quietly become a
-- read path around the policies on `ingredients` — the kind of hole a view is
-- famous for opening.
create or replace view catalogue_ingredients
with (security_invoker = true) as
  select
    i.inci_name,
    i.comedogenic,
    i.safety,
    i.note,
    i.verified,
    i.functions,
    i.updated_at
  from ingredients i
  where exists (
    select 1
      from product_ingredients pi
      join products p on p.id = pi.product_id
     where pi.inci_name = i.inci_name
       and (p.source <> 'ocr' or p.barcode is not null)
  );

-- Reads are public across this schema; the view is no exception and must not
-- be narrower than the table it reads, or the dictionary would come back short
-- for anonymous callers and products would render with unresolved names.
grant select on catalogue_ingredients to anon, authenticated;

-- 3 ── What the freshness check reads.
--
-- Deliberately NOT the view. The client asks two questions of the dictionary:
-- "give me every definition" (the view, once per refetch) and "has anything
-- changed?" (this, on every launch and every return to the foreground). Running
-- the second through the view would evaluate that `exists` once per ingredient
-- row — ~36,000 of them — on a path step 1 spent real effort making nearly
-- free.
--
-- So the watermark reads `ingredients` directly, and this index makes that a
-- single index lookup. The cost is that it is a *superset*: it moves when any
-- ingredient changes, including one no product references, so a CosIng import
-- touching only unused rows makes every device refetch once for nothing. That
-- is the safe direction to be wrong in, and CosIng is a quarterly manual
-- check — see the cadence table in the data-strategy plan.
--
-- `nulls last` matches the client's `order("updated_at", { nullsFirst: false })`,
-- so the ordering can be served from the index rather than re-sorted. The
-- column is `not null`, which makes that moot today and correct if it ever
-- stops being.
create index if not exists ingredients_updated_at_idx
  on ingredients (updated_at desc nulls last);

-- No index is added on `product_ingredients (inci_name)` for the `exists`
-- above: `0001_catalogue.sql` already creates `product_ingredients_inci_idx`
-- on exactly that column. An earlier draft of this file added a second one
-- under a different name — `if not exists` guards the name, not the column
-- set, so it would have shipped a duplicate B-tree maintained on every
-- formula insert, in a schema whose import path writes them 500 at a time.
