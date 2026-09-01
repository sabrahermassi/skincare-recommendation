-- Scheduled eviction of cached rows.
--
-- `evict_expired_products()` only ever deletes rows carrying a deadline, so
-- this cannot touch anything we hold under ODbL, CC BY or our own curation.
-- Running it on a schedule is what turns the INCI API "cache responsibly"
-- clause from an intention into a property of the system.
--
-- Hourly rather than daily: the TTL comes from each response's Cache-Control,
-- so it can be much shorter than a day, and a daily sweep would hold rows well
-- past their permitted lifetime.

create extension if not exists pg_cron;

select cron.schedule(
  'evict-expired-products',
  '17 * * * *',  -- off the hour; every scheduler in the world fires at :00
  $$ select evict_expired_products(); $$
);
