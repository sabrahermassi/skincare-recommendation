-- The signed-in shelf (#219): the first tables in this project that an end
-- user owns. Every RLS table before this one is service-role only (0016's
-- `rate_limits`, 0024's `scan_log`), so this migration sets the pattern for a
-- user-owned table rather than following one:
--
--  - `user_id` defaults to `auth.uid()`, so a client never has to send it.
--  - RLS is on in this file, never in a follow-up.
--  - One policy per command, all `to authenticated`, all keyed on
--    `user_id = auth.uid()`. Nothing for `anon`: a guest has no rows here by
--    construction (#221 makes the shelf signed-in only).
--
-- What is deliberately NOT here:
--
--  - No `skin_profiles` table. The profile stays on the device (#219's
--    reasoning): the MVP does not ask for it to sync, and pregnancy status may
--    be Art. 9 health data whose determination (#14) has not been made.
--    Adding sync later is additive; removing it later means deleting health
--    data off a server and out of backups.
--  - No scan history. It stays on the device for everyone
--    (docs/device-storage-policy.md, row 2).
--  - No foreign key to `products`. Catalogue rows expire and get pruned
--    (`expires_at`, `evict-expired-products`); a cascading delete would
--    silently remove a saved item, and a restricting one would stop the
--    catalogue being pruned. A saved row must outlive the catalogue entry it
--    points at — the app already handles an id it cannot resolve.
--
-- The foreign key to `auth.users` IS here, with `on delete cascade`: deleting
-- an account deletes its shelf in the same statement, which is what #224's
-- "delete the account and personal data" needs, and nothing can be left
-- behind pointing at a user who no longer exists.

create table saved_products (
  user_id            uuid not null default auth.uid()
                       references auth.users (id) on delete cascade,
  -- A catalogue product id, or a raw barcode for something scanned that is
  -- not in the catalogue — the same thing `SavedProduct.id` holds on the
  -- device. Bounded so a client cannot store an essay in a key column.
  product_id         text not null check (char_length(product_id) between 1 and 200),
  saved_at           timestamptz not null default now(),
  -- The product's own `fetchedAt` at the moment it was saved: which formula
  -- the user actually saw. The "this formula changed since you saved it"
  -- notice compares against this rather than `saved_at` — see
  -- `SavedProduct.formulaFetchedAt` in store/useAppStore.ts. Null for a save
  -- that never recorded one.
  formula_fetched_at timestamptz,
  -- The journal note (#228): the user's own words, the most personal thing
  -- this app holds. Capped here as well as in the UI, so the database is not
  -- trusting a client to enforce it.
  note               text check (note is null or char_length(note) <= 500),
  -- The user's own routine step (#227), overriding the guess derived from
  -- `products.type`. Null means "not assigned", which falls back to the
  -- guess; it never means step 0.
  routine_step       smallint check (routine_step in (1, 2, 3)),
  primary key (user_id, product_id)
);

create table saved_ingredients (
  user_id    uuid not null default auth.uid()
               references auth.users (id) on delete cascade,
  -- An ingredient name as starred on the ingredient screen — the same string
  -- `savedIngredients` holds on the device. No foreign key to `ingredients`,
  -- for the same reason as above: the dictionary is rebuilt by imports.
  inci_name  text not null check (char_length(inci_name) between 1 and 200),
  saved_at   timestamptz not null default now(),
  primary key (user_id, inci_name)
);

alter table saved_products enable row level security;
alter table saved_ingredients enable row level security;

-- Grants first, policies second: a policy only narrows what a grant allows.
-- `anon` gets nothing at all, not even a filtered read.
revoke all on saved_products, saved_ingredients from public, anon, authenticated;
grant select, insert, update, delete on saved_products, saved_ingredients to authenticated;
grant all on saved_products, saved_ingredients to service_role;

-- `(select auth.uid())` rather than a bare `auth.uid()`: Postgres evaluates
-- the sub-select once per statement instead of once per row, which is
-- Supabase's own guidance for RLS and costs nothing in meaning.
--
-- UPDATE carries both clauses: `using` stops a user touching someone else's
-- row, `with check` stops them handing their own row to someone else by
-- rewriting `user_id`.

create policy saved_products_select on saved_products
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_products_insert on saved_products
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy saved_products_update on saved_products
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saved_products_delete on saved_products
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy saved_ingredients_select on saved_ingredients
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy saved_ingredients_insert on saved_ingredients
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy saved_ingredients_update on saved_ingredients
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy saved_ingredients_delete on saved_ingredients
  for delete to authenticated
  using (user_id = (select auth.uid()));
