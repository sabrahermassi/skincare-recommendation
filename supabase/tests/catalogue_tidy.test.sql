-- Migration 0027's rules (#199). Each refusal is paired with the row that the
-- same rule accepts, so a constraint that refuses everything cannot pass.

\set ON_ERROR_STOP on

begin;

do $$
begin
  -- 1: a barcode is required.
  insert into products (id, barcode, brand, name, type, area, source)
    values ('ok-1', '3000000000001', 'B', 'Has a barcode', 'serum', 'face', 'ocr');
  begin
    insert into products (id, barcode, brand, name, type, area, source)
      values ('no-barcode', null, 'B', 'No barcode', 'serum', 'face', 'ocr');
    assert false, 'a product without a barcode was accepted';
  exception when not_null_violation then null;
  end;

  -- 3: the type is one the app knows.
  insert into products (id, barcode, brand, name, type, area, source)
    values ('ok-2', '3000000000002', 'B', 'Known type', 'unknown', 'face', 'obf');
  begin
    insert into products (id, barcode, brand, name, type, area, source)
      values ('typo', '3000000000003', 'B', 'Typo', 'moisturiser', 'face', 'obf');
    assert false, 'a product type outside the list was accepted';
  exception when check_violation then null;
  end;

  -- 4: only a cached inci_api row carries a deadline — an ocr row no longer may.
  insert into products (id, barcode, brand, name, type, area, source, expires_at)
    values ('ok-3', '3000000000004', 'B', 'Cached', 'serum', 'face', 'inci_api', now() + interval '1 day');
  begin
    insert into products (id, barcode, brand, name, type, area, source, expires_at)
      values ('ocr-deadline', '3000000000005', 'B', 'Grace', 'serum', 'face', 'ocr', now() + interval '1 day');
    assert false, 'an ocr row with a deadline was accepted';
  exception when check_violation then null;
  end;

  -- 2: nobody but the service role may evict.
  assert not has_function_privilege('anon', 'evict_expired_products()', 'execute'), 'anon can evict';
  assert not has_function_privilege('authenticated', 'evict_expired_products()', 'execute'), 'authenticated can evict';
  assert has_function_privilege('service_role', 'evict_expired_products()', 'execute'), 'service_role cannot evict';
end $$;

-- 4: an ingredient used by an ocr product is in the dictionary view.
insert into ingredients (inci_name, source, verified) values ('ci-test-ingredient', 'mfds', true);
insert into product_ingredients (product_id, position, inci_name) values ('ok-1', 0, 'ci-test-ingredient');
do $$
begin
  assert exists (select 1 from catalogue_ingredients where inci_name = 'ci-test-ingredient'),
    'an ingredient used by an ocr product is missing from the dictionary view';
end $$;

rollback;

\echo 'catalogue_tidy: all assertions passed'
