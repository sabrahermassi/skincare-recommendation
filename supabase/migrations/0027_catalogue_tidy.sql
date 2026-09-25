-- Catalogue tidy-up (#199, items 1–4). Each of these was a rule the code kept
-- and the schema didn't; each is now the database's to enforce.
--
-- Item 5 (source precedence per barcode) is deferred to #181, which owns the
-- precedence rule and the correction path it shares an answer with — two
-- independently designed precedence orders in one database is the drift this
-- repo already had with score cutoffs. Item 6 (the dead mock-era columns) is
-- out of scope: dropping them changes the Edge Functions' response shape.
--
-- Checked against staging before writing, and it applies cleanly there: no
-- product with a null barcode, a type outside the list below, or an `ocr` row
-- carrying a deadline. If production holds one, this migration fails as a
-- whole and changes nothing — the operator's run is the check.

-- 1 ── A product has a barcode. ─────────────────────────────────────────────
-- "A product exists only with a name, a barcode and an ingredient list" was
-- enforced only inside `replace_product_with_ingredients` (0022), and several
-- operator scripts write `products` directly with the service role. The
-- incomplete rows are pruned; this keeps it that way.
alter table products alter column barcode set not null;

-- 2 ── Nobody but the scheduler evicts. ──────────────────────────────────────
-- `evict_expired_products()` (0001) kept PostgreSQL's default EXECUTE for
-- PUBLIC, so it was callable as `rpc/evict_expired_products` with the anon
-- key. Harmless only because of a second control — it is security-invoker and
-- `products` has no delete policy for anon — which is exactly the argument
-- for fixing it: add either and it becomes a catalogue wipe. The hourly
-- pg_cron job (0002) runs as the job's owner, so it is unaffected. Same
-- pattern as `consume_rate_limit` and `purge_rate_limits` in 0016.
revoke all on function evict_expired_products() from public, anon, authenticated;
grant execute on function evict_expired_products() to service_role;

-- 3 ── `type` is one of the app's product types. ─────────────────────────────
-- It was free text that the client cast to `ProductType` unchecked, so a
-- classifier typo became a silent "unknown" on screen — and #227's routine
-- steps and #200's type pick both read it. The list is `PRODUCT_TYPES` in
-- `supabase/functions/_shared/product-text.ts`, itself held to `ProductType`
-- in data/types.ts; `__tests__/product-text.test.ts` fails if this list
-- drifts from either. A new product type needs a migration too.
alter table products add constraint products_type_known check (type in (
  'cleanser', 'micellar-water', 'toner', 'essence', 'serum', 'ampoule',
  'moisturizer', 'sunscreen', 'body-wash', 'body-lotion', 'hand-cream',
  'eye-cream', 'facial-oil', 'night-mask', 'exfoliator', 'lip-balm', 'perfume',
  'facial-mist', 'sheet-mask', 'deodorant', 'shampoo', 'conditioner', 'hair-oil',
  'hair-mask', 'body-butter', 'body-scrub', 'foot-cream', 'face-mask',
  'eye-patch', 'pimple-patch', 'unknown'
));

-- 4 ── The barcode-less OCR design is gone; so are its exceptions. ───────────
-- 0014 let a barcode-less `ocr` row carry a 24-hour grace deadline, and 0011's
-- dictionary view hid ingredients used only by such rows. Every product now
-- has a barcode (item 1) and `resolve-scan` is deleted, so both exceptions
-- guard a row that can no longer exist. Back to the original rule: exactly
-- the cached `inci_api` rows carry a deadline, and nothing we hold outright
-- ever silently expires.
alter table products drop constraint cached_sources_must_expire;
alter table products add constraint cached_sources_must_expire check (
  (source = 'inci_api' and expires_at is not null) or
  (source <> 'inci_api' and expires_at is null)
);

-- Same columns, same `security_invoker`, same grant (a replaced view keeps
-- its privileges); only the OCR predicate goes.
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
     where pi.inci_name = i.inci_name
  );
