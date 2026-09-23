-- A raw outcome log for the scan path, so the label-photo/barcode decision in
-- #214 has a measurement to flip against instead of an assertion.
--
-- Migration 0022 makes the products table clean by construction: a row needs
-- a name, a barcode and an ingredient list or it is refused. That is the
-- right guarantee for the catalogue, and it means a scan that never clears
-- that bar leaves no trace anywhere else either — nothing today records how
-- often a read fails, why, how many names it produces, or how many of those
-- resolve against the dictionary.
--
-- This is a privacy decision before it is a schema one, and it follows
-- `rate_limits` (0016) on every point that matters:
--
--  - Outcomes only, never content. No ingredient names, no product names, no
--    barcodes, no images. A count of misses is useful; which barcodes missed
--    is not, for this table.
--  - Identity is the existing `fingerprintCaller` output — the same
--    truncated HMAC `rate_limits.caller` already stores — never a second
--    identifier and never a raw address. `docs/threat-model.md` classifies
--    the caller IP as personal data this app does not persist as an address.
--  - Retention is part of this migration, not a follow-up. A log with no
--    purge job is exactly the thing #24 (retention SLA) and #14 (GDPR
--    determination) would later have to unpick.

create table scan_log (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  -- Nullable, not because an unfingerprintable caller is expected, but
  -- because the two-stage purge below nulls this column after a day (see
  -- below) while keeping the outcome row for the weekly aggregate. A NOT
  -- NULL column would make that purge a delete, and the whole point of
  -- staging it is that the outcome counts should outlive the fingerprint.
  caller       text,
  path         text not null check (path in ('barcode', 'label')),
  outcome      text not null check (outcome in (
    -- barcode path
    'resolved', 'not_found',
    -- label path
    'read_ok', 'quality_gate', 'not_enough_text', 'image_too_large', 'unsupported_image',
    -- both paths
    'upstream_failure', 'internal_error'
  )),
  -- Label path only: how many names the parser produced, and how many of
  -- those verified against the ingredient dictionary. The ratio is the OCR
  -- accuracy metric #214 needs; neither half identifies anything on its own.
  names_parsed   integer check (names_parsed >= 0),
  names_resolved integer check (names_resolved >= 0 and names_resolved <= names_parsed),
  -- Label path only, and only when an image was actually read (so not on
  -- `image_too_large` from the pre-body-read Content-Length check, where only
  -- the declared length is known and that is not what this column means).
  image_bytes    integer check (image_bytes >= 0),
  -- A barcode scan carries no image and produces no names; a label scan can
  -- fail before any bytes are read. Both directions are worth catching here
  -- rather than trusting every future call site to get it right.
  check (path <> 'barcode' or (names_parsed is null and names_resolved is null and image_bytes is null))
);

-- Purging and the weekly aggregate both walk by age.
create index scan_log_created_at_idx on scan_log (created_at);

/**
 * Age out the caller fingerprint first, then the row itself.
 *
 * Two stages rather than one flat delete, so the fingerprint's lifetime here
 * matches what `docs/threat-model.md`'s Caller IP row already promises for
 * `rate_limits` (purged hourly, ~25h max) — a single retention window for
 * this whole table would either weaken that promise (if it matched the
 * outcome counts' longer window) or throw away the accuracy numbers before
 * anyone could aggregate them week over week (if it matched the fingerprint's
 * short one). Splitting the two lets each be kept exactly as long as it is
 * useful and no longer: the fingerprint is single-purpose (catch a caller
 * hammering the scan path) and stale within a day, the outcome is what #214
 * and #236's own weekly query need for weeks.
 */
create function purge_scan_log()
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update scan_log set caller = null
    where created_at < now() - interval '1 day' and caller is not null;
  delete from scan_log where created_at < now() - interval '30 days';
$$;

-- Off the hour and on a different minute from the other two purge jobs
-- (0002's `evict-expired-products` at :17, 0016's `purge-rate-limits` at :41)
-- so the three do not contend.
select cron.schedule(
  'purge-scan-log',
  '53 * * * *',
  $$ select purge_scan_log(); $$
);

-- Service-role only, matching `rate_limits` (0016) and `scan_tokens` (0015).
-- This is measurement infrastructure, not catalogue data or anything a
-- client should ever read or write directly.
alter table scan_log enable row level security;

revoke all on scan_log from public, anon, authenticated;
grant all on scan_log to service_role;

revoke all on function purge_scan_log() from public, anon, authenticated;
grant execute on function purge_scan_log() to service_role;
