-- Access rules for migration 0026's product authors (#241).
--
-- The point of a separate table is that nobody can read who added what —
-- except the person themselves. So: an anonymous caller reads nothing, a
-- signed-in person reads only their own rows (paired with the positive check,
-- because an empty result on its own proves nothing), nobody but the service
-- role writes, and deleting an account keeps the product and forgets the
-- person.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

insert into products (id, barcode, brand, name, type, area, source) values
  ('ocr-1', '1000000000001', 'Brand', 'A''s product', 'serum', 'face', 'ocr'),
  ('ocr-2', '1000000000002', 'Brand', 'B''s product', 'serum', 'face', 'ocr'),
  ('obf-3', '1000000000003', 'Brand', 'Imported', 'serum', 'face', 'obf');

insert into product_authors (product_id, user_id) values
  ('ocr-1', '00000000-0000-0000-0000-00000000000a'),
  ('ocr-2', '00000000-0000-0000-0000-00000000000b');

-- ── Anonymous ───────────────────────────────────────────────────────────────

set local role anon;
do $$
begin
  begin
    perform 1 from product_authors;
    assert false, 'anon can read product authors';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── Signed in as A ──────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
begin
  assert (select count(*) from product_authors) = 1, 'A should see exactly A''s one product';
  assert (select product_id from product_authors) = 'ocr-1', 'A saw someone else''s row';
  begin
    insert into product_authors (product_id, user_id) values ('obf-3', '00000000-0000-0000-0000-00000000000a');
    assert false, 'A claimed authorship of a product';
  exception when insufficient_privilege then null;
  end;
  begin
    update product_authors set user_id = null where product_id = 'ocr-1';
    assert false, 'A rewrote an author row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from product_authors where product_id = 'ocr-1';
    assert false, 'A deleted an author row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── Account deletion keeps the product, forgets the person ─────────────────

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';

do $$
begin
  assert exists (select 1 from products where id = 'ocr-2'), 'deleting the author deleted the product';
  assert (select user_id from product_authors where product_id = 'ocr-2') is null,
    'a deleted account''s id outlived it';
end $$;

-- ── Deleting the product takes its author row with it ──────────────────────

delete from products where id = 'ocr-1';
do $$
begin
  assert not exists (select 1 from product_authors where product_id = 'ocr-1'),
    'an author row outlived its product';
end $$;

rollback;

\echo 'product_authors: all assertions passed'
