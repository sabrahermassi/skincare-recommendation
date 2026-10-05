-- Migration 0031 (#377): the save path's read-token pieces are gone, and the
-- things that must stay are still there.

\set ON_ERROR_STOP on

begin;

do $$
begin
  assert to_regclass('public.used_read_tokens') is null,
    'used_read_tokens should have been dropped';
  assert to_regprocedure('public.consume_read_token(text, timestamptz)') is null,
    'consume_read_token should have been dropped';
  assert to_regprocedure('public.release_read_token(text)') is null,
    'release_read_token should have been dropped';

  -- Kept: the import and reconcile scripts still write through it, and the
  -- account export and deletion still read the authors table.
  assert exists (select 1 from pg_proc where proname = 'replace_product_with_ingredients'),
    'replace_product_with_ingredients must stay';
  assert to_regclass('public.product_authors') is not null,
    'product_authors must stay';
end $$;

rollback;
