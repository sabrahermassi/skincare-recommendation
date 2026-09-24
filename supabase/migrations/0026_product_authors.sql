-- Who added a catalogue product (#241, item 3).
--
-- `label-ocr` writes a product for everyone, permanently, from one person's
-- photo and the name they typed. Without an author there is no way to tell
-- whose entry a bad row was, to find the rest of what one bad actor added, or
-- — later, with #181's correction path — to let someone correct their own
-- entry rather than anyone's.
--
-- A table of its own rather than a `products.created_by` column: `products`
-- is publicly readable (migration 0001), so a column there would publish every
-- contributor's account id to anyone with the anon key, and tie together
-- everything one person has scanned. Here nobody but the service role writes,
-- and a signed-in person can read only their own rows — which is what lets
-- the account export (#224) include "products you added".
--
-- Nullable author, by design:
--   * every existing and every imported row has none — they simply have no
--     row here;
--   * a guest's save has none;
--   * a deleted account's rows keep the product and lose the person
--     (`on delete set null`): the product was never theirs to take with them,
--     and an orphaned id must not outlive the account it named.

create table product_authors (
  product_id  text primary key references products (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- "Everything one person added", for moderation and for the export.
create index product_authors_user_idx on product_authors (user_id) where user_id is not null;

alter table product_authors enable row level security;

revoke all on product_authors from public, anon, authenticated;
grant select on product_authors to authenticated;
grant all on product_authors to service_role;

create policy product_authors_select_own on product_authors
  for select to authenticated
  using (user_id = (select auth.uid()));
