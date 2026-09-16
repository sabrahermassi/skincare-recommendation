-- Proof of ownership for resolve-scan.
--
-- Review on PR #109 found a real gap: `resolve-scan`'s only check was
-- `source = 'ocr' and barcode is null`, which scopes WHAT KIND of row can
-- be touched but says nothing about WHO is allowed to touch it. `products`
-- is publicly readable (0001_catalogue.sql), so anyone could list every
-- barcode-less scan currently on its grace timer and call `resolve-scan`
-- against it — discard someone else's in-progress decision, or worse,
-- attach an arbitrary unused barcode to someone else's OCR'd formula and
-- clear its expiry, permanently associating the wrong ingredient list with
-- that barcode for every future scan of it (`label-ocr`'s own
-- `productForBarcode` short-circuit would then trust that poisoned row
-- forever).
--
-- The fix is a capability, not an account — this app has no accounts.
-- `label-ocr` mints an unguessable token alongside a brand-new barcode-less
-- row and hands it to the client that took the photo; `resolve-scan`
-- requires that exact token before it will touch the row. Service-role
-- only, same as `sync_bookmarks` (0012) — the token would be worthless if
-- it sat in a publicly-readable table beside everything else.
--
-- `on delete cascade`: a row's token becomes meaningless the moment the row
-- itself is gone, whether that's `resolve-scan` cleaning up after a
-- successful action or the grace-period eviction job getting there first.
-- Nothing needs to remember to clean this table up separately.

create table scan_tokens (
  product_id  text primary key references products (id) on delete cascade,
  token       text not null,
  created_at  timestamptz not null default now()
);

-- Service-role only, matching `sync_bookmarks`' own pattern (0012) exactly —
-- this is a capability secret, not catalogue data, and has no reason to be
-- reachable by anon or authenticated at all.
alter table scan_tokens enable row level security;

revoke all on scan_tokens from public, anon, authenticated;
grant all on scan_tokens to service_role;
