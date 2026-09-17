-- A rate-limit counter that survives a cold start and is shared across isolates.
--
-- The limiter in `_shared/http.ts` keeps its counts in an in-memory `Map`.
-- Edge Functions run as isolates: each one has its own copy of that map, and a
-- cold start empties it. So the configured "10 requests per 5 minutes" is
-- really "10 per 5 minutes per isolate", and concurrent callers simply land on
-- different isolates and each collect a fresh allowance.
--
-- That trade was deliberate and is documented where it lives — it costs
-- nothing and it does stop the case that actually happens, one client looping.
-- What it cannot do is bound the total, and behind these endpoints are Google
-- Cloud Vision and the INCI API, both metered, neither ours. A shared counter
-- is the difference between a limit and a suggestion.
--
-- Fixed window rather than sliding. A sliding window means storing one row per
-- request and counting them, which is both more rows and a second statement; a
-- fixed window is one upsert that returns the new count, which is atomic
-- without a transaction block. The cost is the usual one: a caller can spend
-- its whole allowance at the end of one window and again at the start of the
-- next, so the true worst case is 2x the configured limit across a window
-- boundary. At limits sized to protect a billing account rather than to be
-- precise, that is not worth a second table.

create table rate_limits (
  -- The operation, not the function: `label-ocr` and `product-lookup` cost
  -- very different amounts per call, so they must not share a budget. See the
  -- data-strategy plan's step 11 — "limit per operation, not per function".
  bucket        text        not null,
  -- Whatever `callerKey()` decided, which is an address rather than a person.
  -- Deliberately not a device id: a client-supplied bucket is a bucket the
  -- client can rotate, and that is the whole attack.
  caller        text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (bucket, caller, window_start)
);

-- Purging walks by age across every bucket and caller, which the primary key
-- above cannot serve — its leading columns are the wrong ones.
create index rate_limits_window_start_idx on rate_limits (window_start);

/**
 * Count one request and say whether it is allowed.
 *
 * The insert and the read are one statement on purpose. Checking the count and
 * then incrementing it is two round trips with a gap in the middle, and the gap
 * is exactly where a burst of concurrent requests all read the same
 * under-the-limit value and all proceed. `on conflict do update ... returning`
 * makes the increment and the answer the same operation, so N concurrent
 * callers get N distinct counts.
 *
 * A refused request still increments. That is intentional: someone hammering
 * the endpoint should not get a fresh look the moment they cross the line, and
 * the count is what the eventual refusal log is counting.
 */
create function consume_rate_limit(
  p_bucket         text,
  p_caller         text,
  p_window_seconds integer,
  p_max_requests   integer
)
returns boolean
language plpgsql
-- SECURITY INVOKER (the default), stated rather than implied, matching
-- `replace_product_with_ingredients` in 0008. The only caller holds the
-- service-role key and bypasses RLS already, so DEFINER would buy nothing
-- and would turn a future loosening of the grants below into privilege
-- escalation rather than a mistake.
security invoker
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception 'window_seconds must be positive, got %', p_window_seconds;
  end if;

  -- Floor `now()` to the window. Every caller in the same window shares a
  -- boundary, so the row key is stable without anyone having to agree on a
  -- start time.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (bucket, caller, window_start, count)
  values (p_bucket, p_caller, v_window_start, 1)
  on conflict (bucket, caller, window_start)
    do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max_requests;
end;
$$;

/**
 * Drop windows nobody can still be inside.
 *
 * Without this the table grows by one row per caller per window forever, and
 * the rows are worthless the moment their window closes. A day of slack rather
 * than the exact window length: the longest window in use is five minutes, the
 * margin costs almost nothing, and it leaves the recent past readable if
 * anyone ever wants to ask what was being refused.
 */
create function purge_rate_limits()
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from rate_limits where window_start < now() - interval '1 day';
$$;

-- Same hour-offset reasoning as `evict-expired-products` in 0002: off the hour,
-- because every scheduler in the world fires at :00. A different minute from
-- that job so the two do not contend.
select cron.schedule(
  'purge-rate-limits',
  '41 * * * *',
  $$ select purge_rate_limits(); $$
);

-- Service-role only, matching `sync_bookmarks` (0012) and `scan_tokens` (0015).
-- This is enforcement state, not catalogue data. A publicly readable counter
-- would tell an attacker exactly how much allowance is left, and a publicly
-- writable one would let them reset it.
alter table rate_limits enable row level security;

revoke all on rate_limits from public, anon, authenticated;
grant all on rate_limits to service_role;

revoke all on function consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function consume_rate_limit(text, text, integer, integer)
  to service_role;

revoke all on function purge_rate_limits() from public, anon, authenticated;
grant execute on function purge_rate_limits() to service_role;
