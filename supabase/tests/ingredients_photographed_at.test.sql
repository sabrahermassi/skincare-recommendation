-- Migration 0033 (#446): the date an ingredient list was photographed goes
-- through replace_product_with_ingredients, and a writer that did not look at
-- the photos cannot wipe it.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_product jsonb := jsonb_build_object(
    'id', 'obf-4460000000001', 'barcode', '4460000000001', 'brand', 'B', 'name', 'Old list',
    'type', 'serum', 'area', 'face', 'in_stock', true, 'suitable_for', '[]'::jsonb, 'targets', '[]'::jsonb, 'source', 'obf');
  v_ingredients jsonb := '[{"inci_name": "ci-446-aqua", "position": 0}]';
  v_stored timestamptz;
begin
  -- A new product stores the date it is given.
  perform replace_product_with_ingredients(
    v_product || jsonb_build_object('ingredients_photographed_at', '2018-04-08T17:29:34Z'), v_ingredients, 'stub');
  select ingredients_photographed_at into v_stored from products where id = 'obf-4460000000001';
  assert v_stored = '2018-04-08T17:29:34Z'::timestamptz, 'the date was not stored on insert';

  -- A writer that sends no key keeps it.
  perform replace_product_with_ingredients(v_product, v_ingredients, 'stub');
  select ingredients_photographed_at into v_stored from products where id = 'obf-4460000000001';
  assert v_stored = '2018-04-08T17:29:34Z'::timestamptz, 'a write without the key wiped the date';

  -- A newer photo replaces it.
  perform replace_product_with_ingredients(
    v_product || jsonb_build_object('ingredients_photographed_at', '2025-01-02T00:00:00Z'), v_ingredients, 'stub');
  select ingredients_photographed_at into v_stored from products where id = 'obf-4460000000001';
  assert v_stored = '2025-01-02T00:00:00Z'::timestamptz, 'a newer date did not replace the old one';

  -- An explicit null is what the source says now: there is no ingredient photo.
  perform replace_product_with_ingredients(
    v_product || jsonb_build_object('ingredients_photographed_at', null), v_ingredients, 'stub');
  select ingredients_photographed_at into v_stored from products where id = 'obf-4460000000001';
  assert v_stored is null, 'an explicit null did not clear the date';

  -- A product written without the key starts with no date.
  perform replace_product_with_ingredients(
    v_product || jsonb_build_object('id', 'obf-4460000000002', 'barcode', '4460000000002'), v_ingredients, 'stub');
  select ingredients_photographed_at into v_stored from products where id = 'obf-4460000000002';
  assert v_stored is null, 'a product written without the key has a date';

  -- 0022's grants survive the replace: the service role only.
  assert not has_function_privilege('anon', 'replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean, boolean)', 'execute'), 'anon can write products';
  assert not has_function_privilege('authenticated', 'replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean, boolean)', 'execute'), 'authenticated can write products';
  assert has_function_privilege('service_role', 'replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean, boolean)', 'execute'), 'service_role cannot write products';
end $$;

rollback;

\echo 'ingredients_photographed_at: all assertions passed'
