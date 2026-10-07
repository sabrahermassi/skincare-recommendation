-- Migration 0035 (#458): how each ingredient name was matched goes through
-- replace_product_with_ingredients. A caller that omits it keeps working, a
-- value outside the four is refused, and the dictionary is left alone.

\set ON_ERROR_STOP on

begin;

do $$
declare
  v_product jsonb := jsonb_build_object(
    'id', 'obf-4580000000001', 'barcode', '4580000000001', 'brand', 'B', 'name', 'Confidence',
    'type', 'serum', 'area', 'face', 'in_stock', true, 'suitable_for', '[]'::jsonb, 'targets', '[]'::jsonb, 'source', 'obf');
  v_stored text[];
  v_row_before tid;
  v_row_after tid;
  v_refused boolean := false;
begin
  -- All four values are stored, in order, beside the name they belong to.
  perform replace_product_with_ingredients(v_product, jsonb_build_array(
    jsonb_build_object('inci_name', 'ci-458-a', 'position', 0, 'match', 'exact'),
    jsonb_build_object('inci_name', 'ci-458-b', 'position', 1, 'match', 'alias'),
    jsonb_build_object('inci_name', 'ci-458-c', 'position', 2, 'match', 'corrected'),
    jsonb_build_object('inci_name', 'ci-458-d', 'position', 3, 'match', 'rebuilt')), 'stub');
  select array_agg(match_confidence order by position) into v_stored from product_ingredients where product_id = 'obf-4580000000001';
  assert v_stored = array['exact', 'alias', 'corrected', 'rebuilt'], 'the four values were not stored in order: ' || v_stored::text;

  -- A caller that sends no key still works, and stores "not known".
  perform replace_product_with_ingredients(v_product, '[{"inci_name": "ci-458-a", "position": 0}]', 'stub');
  select array_agg(match_confidence order by position) into v_stored from product_ingredients where product_id = 'obf-4580000000001';
  assert array_length(v_stored, 1) = 1 and v_stored[1] is null, 'a write without the key did not store null';

  -- An explicit null is "not known" as well.
  perform replace_product_with_ingredients(v_product, '[{"inci_name": "ci-458-a", "position": 0, "match": null}]', 'stub');
  select array_agg(match_confidence order by position) into v_stored from product_ingredients where product_id = 'obf-4580000000001';
  assert v_stored[1] is null, 'an explicit null was not stored as null';

  -- Anything else is refused by the column's check, and the old list stays.
  perform replace_product_with_ingredients(v_product, '[{"inci_name": "ci-458-a", "position": 0, "match": "exact"}]', 'stub');
  begin
    perform replace_product_with_ingredients(v_product, '[{"inci_name": "ci-458-a", "position": 0, "match": "guessed"}]', 'stub');
  exception when check_violation then
    v_refused := true;
  end;
  assert v_refused, 'a value outside the four was accepted';
  select array_agg(match_confidence order by position) into v_stored from product_ingredients where product_id = 'obf-4580000000001';
  assert v_stored = array['exact'], 'a refused write changed the stored list';

  -- The dictionary is not touched. Inside one transaction `now()` does not move, so updated_at
  -- cannot show it; an update would give the row a new physical address, and that can.
  select ctid into v_row_before from ingredients where inci_name = 'ci-458-a';
  perform replace_product_with_ingredients(v_product, '[{"inci_name": "ci-458-a", "position": 0, "match": "alias"}]', 'stub');
  select ctid into v_row_after from ingredients where inci_name = 'ci-458-a';
  assert v_row_before = v_row_after, 'a write updated an ingredients row';

  -- 0022's grants survive the replace: the service role only.
  assert not has_function_privilege('anon', 'replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean, boolean)', 'execute'), 'anon can write products';
  assert not has_function_privilege('authenticated', 'replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean, boolean)', 'execute'), 'authenticated can write products';
  assert has_function_privilege('service_role', 'replace_product_with_ingredients(jsonb, jsonb, text, timestamptz, boolean, boolean)', 'execute'), 'service_role cannot write products';
end $$;

rollback;

\echo 'ingredient_match_confidence: all assertions passed'
