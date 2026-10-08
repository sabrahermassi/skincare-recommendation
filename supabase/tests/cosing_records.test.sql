-- Migration 0039 (#457): the CosIng copy. One row per record, the kind is checked, it is not readable
-- by the app's roles, and nothing written to it moves ingredients.updated_at.

\set ON_ERROR_STOP on

begin;

insert into ingredients (inci_name, source, safety, verified, note)
values ('ci-457-hydroquinone', 'unmatched', 'safe', false, 'test');

do $$
declare
  v_updated_before timestamptz;
  v_updated_after timestamptz;
  v_stamp timestamptz;
  v_failed boolean;
begin
  select updated_at into v_updated_before from ingredients where inci_name = 'ci-457-hydroquinone';

  insert into cosing_records (cosing_ref, kind, inci_name, cas_numbers, ec_numbers, annex_refs, status, source_url, source_hash, fetched_on, updated_at)
  values ('100001', 'ingredient', 'ci-457-hydroquinone', array['123-31-9'], array['204-617-8'], array['II/1339'], 'Active', 'https://example.test', 'abc', '2026-10-08', '2000-01-01');

  v_failed := false;
  begin
    insert into cosing_records (cosing_ref, kind, source_url, source_hash, fetched_on) values ('100001', 'ingredient', 'u', 'h', '2026-10-08');
  exception when unique_violation then v_failed := true; end;
  assert v_failed, 'a second row for the same CosIng record was accepted';

  v_failed := false;
  begin
    insert into cosing_records (cosing_ref, kind, source_url, source_hash, fetched_on) values ('100002', 'fragrance', 'u', 'h', '2026-10-08');
  exception when check_violation then v_failed := true; end;
  assert v_failed, 'a kind other than ingredient and substance was accepted';

  -- An update that changes nothing leaves updated_at alone; one that changes something moves it.
  update cosing_records set status = 'Active' where cosing_ref = '100001';
  select updated_at into v_stamp from cosing_records where cosing_ref = '100001';
  assert v_stamp = '2000-01-01', 'an update that changed nothing moved updated_at';
  update cosing_records set status = 'Inactive' where cosing_ref = '100001';
  select updated_at into v_stamp from cosing_records where cosing_ref = '100001';
  assert v_stamp > '2000-01-01', 'an update that changed a value did not move updated_at';

  -- The dictionary's watermark is untouched by any of it.
  select updated_at into v_updated_after from ingredients where inci_name = 'ci-457-hydroquinone';
  assert v_updated_after = v_updated_before, 'writing a CosIng record moved ingredients.updated_at';
end $$;

-- Not readable, and not writable, by the app's roles.
do $$
declare
  v_failed boolean := false;
begin
  set local role anon;
  begin
    perform 1 from cosing_records limit 1;
  exception when insufficient_privilege then v_failed := true; end;
  reset role;
  assert v_failed, 'anon could read cosing_records';

  v_failed := false;
  set local role authenticated;
  begin
    perform 1 from cosing_records limit 1;
  exception when insufficient_privilege then v_failed := true; end;
  reset role;
  assert v_failed, 'a signed-in user could read cosing_records';
end $$;

rollback;
