-- Let a barcode-less OCR row carry a grace-period expiry.
--
-- Step 5b's row-accrual question, answered: a label photographed without a
-- barcode gets shown its verdict like any other scan, then offered a choice
-- afterward — scan the barcode too and the row becomes permanent and
-- findable, or decline and it's discarded. The "declined" case also has to
-- cover walking away without answering at all (closing the screen, killing
-- the app, losing signal) — a client-side "call discard on unmount" handler
-- cannot cover that, since none of those paths reliably run one.
--
-- So this reuses infrastructure the app already trusts instead: a barcode-
-- less row gets written with a 24h `expires_at`, the same grace window as
-- the disk cache TTL elsewhere in this app, and the hourly
-- `evict-expired-products` job (0002_eviction_schedule.sql) — which already
-- runs, unconditionally, against anything carrying a deadline — quietly
-- cleans it up if nobody ever answers. Accepting the barcode clears the
-- deadline back to null in the same update that sets it (see
-- supabase/functions/resolve-scan). `evict_expired_products()` itself needs
-- no change: it was already source-agnostic, deleting only what opted in by
-- carrying a deadline in the first place.
--
-- The constraint below is the only thing standing in the way today: it
-- required exactly `inci_api` to carry an expiry and forbade every other
-- source from carrying one at all, so an `ocr` row with a deadline was
-- rejected by the database outright. Widened to a three-way rule instead of
-- dropped outright, because the guarantee that mattered — obf/curated/
-- barcode_db rows we hold outright can never silently expire — still holds
-- unchanged. `ocr` is the one source where "carries a deadline" now depends
-- on which row: a barcode-having scan (today's normal case) stays
-- permanent, a barcode-less one carries the new grace period.

alter table products drop constraint cached_sources_must_expire;

alter table products add constraint cached_sources_must_expire check (
  (source = 'inci_api' and expires_at is not null) or
  (source = 'ocr') or
  (source not in ('inci_api', 'ocr') and expires_at is null)
);
