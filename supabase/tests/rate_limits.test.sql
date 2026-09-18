-- Integration tests for migration 0016's rate limiter.
--
-- These exist because CI could not see migrations at all. `npm test` covers
-- TypeScript; nothing applied a `.sql` file anywhere, so a syntax error or a
-- broken grant in a migration surfaced for the first time at
-- `supabase db push` against production. That is the worst place to find one:
-- a migration is far harder to take back than a commit.
--
-- The counting itself was never covered either, and it is the part that
-- matters. `consume_rate_limit` is where the limit actually lives — the
-- TypeScript around it only compares a number it is handed — so a JavaScript
-- test of that comparison proves very little about whether anyone is really
-- being limited.
--
-- Plain SQL run through `psql` rather than pgTAP or a Node client: no new
-- dependency, no test framework to keep current, and the assertions read as
-- the thing being claimed. `assert` raises and psql with ON_ERROR_STOP exits
-- non-zero, which is all a CI step needs.
--
-- The concurrency property is deliberately NOT here — a single psql session
-- cannot race itself. It is asserted from the workflow with parallel clients,
-- which is the only way to observe it.

\set ON_ERROR_STOP on

begin;

-- ── The limit holds ─────────────────────────────────────────────────────────

do $$
declare
  v_count integer;
begin
  -- Three allowed, the fourth refused, at a limit of three.
  for i in 1..3 loop
    v_count := consume_rate_limit('t-basic', 'caller-a', 60, 3);
    assert v_count = i, format('request %s returned count %s', i, v_count);
    assert v_count <= 3, 'a request inside the limit was counted past it';
  end loop;

  v_count := consume_rate_limit('t-basic', 'caller-a', 60, 3);
  assert v_count = 4, format('the fourth request returned %s, expected 4', v_count);
  assert v_count > 3, 'the fourth request was not over the limit';
end $$;

-- ── The boundary, which is the one the TypeScript comparison keys on ────────

do $$
declare
  v_last_allowed integer;
  v_first_refused integer;
begin
  -- `consumeRateLimit` decides with `count > maxRequests`, so these two values
  -- are what separates "allowed" from "refused". A mutation test found `>`
  -- could become `>=` unnoticed, which would silently cost every caller the
  -- last request of every window.
  for i in 1..4 loop
    v_last_allowed := consume_rate_limit('t-boundary', 'caller-b', 60, 5);
  end loop;
  v_last_allowed := consume_rate_limit('t-boundary', 'caller-b', 60, 5);
  assert v_last_allowed = 5, format('expected the 5th to count 5, got %s', v_last_allowed);

  v_first_refused := consume_rate_limit('t-boundary', 'caller-b', 60, 5);
  assert v_first_refused = 6, format('expected the 6th to count 6, got %s', v_first_refused);
end $$;

-- ── Callers and operations are counted apart ───────────────────────────────

do $$
declare
  v_count integer;
begin
  for i in 1..3 loop
    perform consume_rate_limit('t-isolation', 'caller-c', 60, 3);
  end loop;

  -- A different caller, same operation: untouched.
  v_count := consume_rate_limit('t-isolation', 'caller-d', 60, 3);
  assert v_count = 1, format('a second caller inherited a count of %s', v_count);

  -- The same caller, a different operation: also untouched. A Vision call and
  -- a barcode lookup cost different amounts and must not share a budget.
  v_count := consume_rate_limit('t-isolation-other', 'caller-c', 60, 3);
  assert v_count = 1, format('a second operation inherited a count of %s', v_count);
end $$;

-- ── A refused request still increments ─────────────────────────────────────

do $$
declare
  v_count integer;
begin
  for i in 1..6 loop
    v_count := consume_rate_limit('t-keeps-counting', 'caller-e', 60, 2);
  end loop;
  -- Someone hammering the endpoint should not get a fresh look the moment
  -- they cross the line.
  assert v_count = 6, format('expected the count to keep climbing to 6, got %s', v_count);
end $$;

-- ── Windows are fixed, and shared by every caller in them ──────────────────

do $$
declare
  v_window timestamptz;
  v_expected timestamptz;
begin
  perform consume_rate_limit('t-window', 'caller-f', 60, 3);
  select window_start into v_window
    from rate_limits where bucket = 't-window' and caller = 'caller-f';

  -- `floor(epoch / window) * window`, the same arithmetic `windowStart()` uses
  -- in TypeScript. The two layers disagreeing is a real bug this pins.
  v_expected := to_timestamp(floor(extract(epoch from now()) / 60) * 60);
  assert v_window = v_expected,
    format('window_start was %s, expected %s', v_window, v_expected);

  -- A different window length lands on a different boundary.
  perform consume_rate_limit('t-window-300', 'caller-f', 300, 3);
  select window_start into v_window
    from rate_limits where bucket = 't-window-300' and caller = 'caller-f';
  assert v_window = to_timestamp(floor(extract(epoch from now()) / 300) * 300),
    'a 300-second window did not floor to a 300-second boundary';
end $$;

-- ── A nonsense window is refused rather than swallowed ─────────────────────

do $$
declare
  v_raised boolean := false;
begin
  begin
    perform consume_rate_limit('t-guard', 'caller-g', 0, 3);
  exception when others then
    v_raised := true;
  end;
  assert v_raised, 'a zero-second window was accepted';

  v_raised := false;
  begin
    perform consume_rate_limit('t-guard', 'caller-g', -60, 3);
  exception when others then
    v_raised := true;
  end;
  assert v_raised, 'a negative window was accepted';
end $$;

-- ── Purging drops closed windows and keeps live ones ───────────────────────

do $$
declare
  v_old integer;
  v_new integer;
begin
  insert into rate_limits (bucket, caller, window_start, count)
  values ('t-purge', 'ancient', now() - interval '2 days', 1);

  perform consume_rate_limit('t-purge', 'current', 60, 3);
  perform purge_rate_limits();

  select count(*) into v_old
    from rate_limits where bucket = 't-purge' and caller = 'ancient';
  select count(*) into v_new
    from rate_limits where bucket = 't-purge' and caller = 'current';

  assert v_old = 0, 'a window closed two days ago survived the purge';
  assert v_new = 1, 'the purge took a live window with it';
end $$;

-- ── The table is service-role only ─────────────────────────────────────────

do $$
begin
  -- `rate_limits` is enforcement state, not catalogue data. A publicly
  -- readable counter tells an attacker how much allowance is left; a publicly
  -- writable one lets them reset it.
  assert (select relrowsecurity from pg_class where relname = 'rate_limits'),
    'row level security is not enabled on rate_limits';

  assert not has_table_privilege('anon', 'rate_limits', 'SELECT'),
    'anon can read rate_limits';
  assert not has_table_privilege('anon', 'rate_limits', 'INSERT'),
    'anon can write rate_limits';
  assert not has_table_privilege('authenticated', 'rate_limits', 'SELECT'),
    'authenticated can read rate_limits';

  assert has_table_privilege('service_role', 'rate_limits', 'SELECT'),
    'service_role cannot read rate_limits';

  assert not has_function_privilege('anon',
    'consume_rate_limit(text, text, integer, integer)', 'EXECUTE'),
    'anon can execute consume_rate_limit';
  assert has_function_privilege('service_role',
    'consume_rate_limit(text, text, integer, integer)', 'EXECUTE'),
    'service_role cannot execute consume_rate_limit';
end $$;

-- ── And it actually works as that role, not just as a superuser ────────────
--
-- Everything above runs with superuser privileges, which bypasses the grants
-- it is asserting. `has_function_privilege` covers EXECUTE on the function and
-- SELECT on the table; it says nothing about the INSERT, the UPDATE, or the
-- SELECT that `returning` needs. `consume_rate_limit` is SECURITY INVOKER, so
-- those are checked against the *caller* — and the only real caller is
-- `service_role`. A migration that revoked INSERT would pass every assertion
-- above and fail on the first request in production. Raised by review on
-- PR #120.

set local role service_role;

do $$
declare
  v_count integer;
begin
  v_count := consume_rate_limit('t-as-service-role', 'caller-h', 60, 3);
  assert v_count = 1, format('first call as service_role returned %s', v_count);

  -- The second call takes the `on conflict do update` path, which needs UPDATE
  -- rather than INSERT — a different privilege, and the one a `grant insert`
  -- typo would leave behind.
  v_count := consume_rate_limit('t-as-service-role', 'caller-h', 60, 3);
  assert v_count = 2, format('second call as service_role returned %s', v_count);
end $$;

reset role;

rollback;

\echo 'rate_limits: all assertions passed'
