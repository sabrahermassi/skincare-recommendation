-- Integration tests for migration 0024's raw scan log. Same reasoning and
-- format as rate_limits.test.sql: plain SQL through psql, because a broken
-- grant or a wrong check constraint is exactly the kind of thing that would
-- otherwise surface for the first time in production.

\set ON_ERROR_STOP on

begin;

-- ── Column shape is exactly what's documented ──────────────────────────────
--
-- Asserted explicitly, not just implied by the inserts below: this table's
-- whole justification is "outcomes only, never content", and a column added
-- later without updating this list is the one review would most easily miss.

do $$
declare
  v_columns text;
begin
  select string_agg(column_name, ',' order by column_name) into v_columns
    from information_schema.columns
    where table_name = 'scan_log' and table_schema = 'public';

  assert v_columns = 'caller,created_at,id,image_bytes,names_parsed,names_resolved,outcome,path',
    format('scan_log columns changed: %s', v_columns);
end $$;

-- ── Content columns reject what they must ──────────────────────────────────

do $$
begin
  begin
    insert into scan_log (path, outcome) values ('carrier-pigeon', 'resolved');
    assert false, 'an unlisted path value was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into scan_log (path, outcome) values ('barcode', 'made-up-outcome');
    assert false, 'an unlisted outcome value was accepted';
  exception when check_violation then null;
  end;

  begin
    insert into scan_log (path, outcome, names_parsed, names_resolved)
      values ('label', 'read_ok', 5, 6);
    assert false, 'names_resolved was allowed to exceed names_parsed';
  exception when check_violation then null;
  end;

  begin
    insert into scan_log (path, outcome, names_parsed) values ('barcode', 'resolved', 5);
    assert false, 'a barcode-path row was allowed to carry a label-only column';
  exception when check_violation then null;
  end;
end $$;

-- ── A row for every outcome the schema claims to record ────────────────────

do $$
begin
  insert into scan_log (path, outcome) values ('barcode', 'resolved');
  insert into scan_log (path, outcome) values ('barcode', 'not_found');
  insert into scan_log (path, outcome, names_parsed, names_resolved, image_bytes)
    values ('label', 'read_ok', 27, 25, 1_200_000);
  insert into scan_log (path, outcome, names_parsed, names_resolved, image_bytes)
    values ('label', 'quality_gate', 12, 3, 900_000);
  insert into scan_log (path, outcome, image_bytes) values ('label', 'not_enough_text', 400_000);
  insert into scan_log (path, outcome) values ('label', 'image_too_large');
  insert into scan_log (path, outcome) values ('label', 'unsupported_image');
  insert into scan_log (path, outcome) values ('barcode', 'upstream_failure');
  insert into scan_log (path, outcome) values ('label', 'internal_error');
end $$;

-- ── The purge: fingerprint first, row second ────────────────────────────────

do $$
declare
  v_recent_caller text;
  v_old_caller text;
  v_ancient_count integer;
begin
  insert into scan_log (created_at, caller, path, outcome)
    values (now() - interval '2 hours', 'fp-recent', 'barcode', 'resolved');
  insert into scan_log (created_at, caller, path, outcome)
    values (now() - interval '2 days', 'fp-old', 'barcode', 'resolved');
  insert into scan_log (created_at, caller, path, outcome)
    values (now() - interval '40 days', 'fp-ancient', 'barcode', 'resolved');

  perform purge_scan_log();

  -- `caller` alone, not a broader time-window predicate: several other
  -- fixture rows in this file are also recent and also `path = 'barcode'`,
  -- and a `SELECT INTO` with no `ORDER BY` is free to return any one of them.
  -- Found in review on #246.
  select caller into v_recent_caller from scan_log where caller = 'fp-recent';
  select caller into v_old_caller from scan_log
    where created_at < now() - interval '1 day' and created_at > now() - interval '3 days';
  select count(*) into v_ancient_count from scan_log where created_at < now() - interval '35 days';

  assert v_recent_caller = 'fp-recent', 'a fingerprint under a day old was cleared early';
  assert v_old_caller is null, 'a fingerprint over a day old survived the purge';
  assert v_ancient_count = 0, 'a row over 30 days old survived the purge';
end $$;

-- ── The table is service-role only ─────────────────────────────────────────

do $$
begin
  assert (select relrowsecurity from pg_class where relname = 'scan_log'),
    'row level security is not enabled on scan_log';

  assert not has_table_privilege('anon', 'scan_log', 'SELECT'),
    'anon can read scan_log';
  assert not has_table_privilege('anon', 'scan_log', 'INSERT'),
    'anon can write scan_log';
  assert not has_table_privilege('authenticated', 'scan_log', 'SELECT'),
    'authenticated can read scan_log';

  assert has_table_privilege('service_role', 'scan_log', 'SELECT'),
    'service_role cannot read scan_log';
  assert has_table_privilege('service_role', 'scan_log', 'INSERT'),
    'service_role cannot write scan_log';

  assert not has_function_privilege('anon', 'purge_scan_log()', 'EXECUTE'),
    'anon can execute purge_scan_log';
  assert has_function_privilege('service_role', 'purge_scan_log()', 'EXECUTE'),
    'service_role cannot execute purge_scan_log';
end $$;

-- ── And it actually works as that role, not just as a superuser ────────────
-- Same reasoning as rate_limits.test.sql's own version of this section:
-- everything above runs with superuser privileges, which bypasses the grants
-- it is asserting.

set local role service_role;

do $$
declare
  v_id bigint;
begin
  insert into scan_log (caller, path, outcome) values ('fp-service-role', 'barcode', 'resolved')
    returning id into v_id;
  assert v_id is not null, 'insert as service_role did not return an id';

  perform purge_scan_log();
end $$;

reset role;

rollback;
