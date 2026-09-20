-- A photo read can be saved once.
--
-- `label-ocr` answers a photo read with the parsed list and a signed read token,
-- and a save must present that token with the same list (see
-- supabase/functions/_shared/read-token.ts). The signature alone is stateless, so
-- the same token kept working for its whole 30 minutes: one real read could be
-- replayed with many barcodes and names, each creating a permanent catalogue
-- entry. Review on PR #156.
--
-- This table records the tokens already spent. `consume_read_token` inserts the
-- token and reports whether it was the first to; a second save with the same
-- token finds the row and is refused. It is atomic, so two saves racing with the
-- same token cannot both win. A save that then fails to write gives the token
-- back with `release_read_token`, so the person can retry.
--
-- Rows only matter until the token would have expired anyway, so each consume
-- also deletes the ones already past their deadline; nothing needs a separate
-- cleanup job.
--
-- Service-role only, like `rate_limits` (0016): this is a capability record, not
-- catalogue data.

create table used_read_tokens (
  token       text primary key,
  expires_at  timestamptz not null
);

alter table used_read_tokens enable row level security;

revoke all on used_read_tokens from public, anon, authenticated;
grant all on used_read_tokens to service_role;

create function consume_read_token(p_token text, p_expires_at timestamptz)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  delete from used_read_tokens where expires_at < now();

  insert into used_read_tokens (token, expires_at)
  values (p_token, p_expires_at)
  on conflict (token) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;

create function release_read_token(p_token text)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  delete from used_read_tokens where token = p_token;
$$;

revoke all on function consume_read_token(text, timestamptz) from public, anon, authenticated;
grant execute on function consume_read_token(text, timestamptz) to service_role;
revoke all on function release_read_token(text) from public, anon, authenticated;
grant execute on function release_read_token(text) to service_role;
