-- Access rules for migration 0025's saved shelf (#219).
--
-- A policy that is present but wrong looks exactly like one that is right,
-- until someone reads another person's shelf — RLS fails silently, by
-- returning rows, not by erroring. So each table is checked for all four
-- commands from the wrong side: user A cannot read, insert as, update or
-- delete user B's rows.
--
-- Every negative check is paired with a positive one (A can do each thing to
-- A's own row), because a test that passes on an empty result proves nothing:
-- with the policies dropped and RLS still on, the positive checks fail; with
-- RLS turned off, the negative ones do.
--
-- CI's throwaway Postgres has no Supabase `auth` schema; the workflow stubs
-- `auth.users` and `auth.uid()` the way Supabase defines them. The same
-- checks run against the real staging project, with two real accounts, via
-- `npm run check:shelf-rls`.

\set ON_ERROR_STOP on

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

-- B's rows, written as the table owner so they exist before A arrives.
insert into saved_products (user_id, product_id, note, routine_step)
  values ('00000000-0000-0000-0000-00000000000b', 'b-product', 'B wrote this', 2);
insert into saved_ingredients (user_id, inci_name)
  values ('00000000-0000-0000-0000-00000000000b', 'niacinamide');

-- ── Structure: RLS on, one policy per command, nothing for anon ─────────────

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'saved_products'::regclass),
    'RLS is off on saved_products';
  assert (select relrowsecurity from pg_class where oid = 'saved_ingredients'::regclass),
    'RLS is off on saved_ingredients';
  assert (select count(*) from pg_policies where tablename = 'saved_products'
          and roles = '{authenticated}') = 4,
    'saved_products should have exactly four policies, all to authenticated';
  assert (select count(*) from pg_policies where tablename = 'saved_ingredients'
          and roles = '{authenticated}') = 4,
    'saved_ingredients should have exactly four policies, all to authenticated';
  assert not exists (select 1 from pg_policies
                     where tablename in ('saved_products', 'saved_ingredients')
                     and roles <> '{authenticated}'),
    'a policy names a role other than authenticated';
end $$;

-- ── Signed in as A ──────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
  n integer;
begin
  -- Positive: A saves without naming a user, and the default fills in A.
  insert into saved_products (product_id, note) values ('a-product', 'mine');
  insert into saved_ingredients (inci_name) values ('glycerin');
  assert (select count(*) from saved_products) = 1, 'A should see exactly A''s one saved product';
  assert (select count(*) from saved_ingredients) = 1, 'A should see exactly A''s one saved ingredient';
  assert (select user_id from saved_products) = '00000000-0000-0000-0000-00000000000a',
    'user_id did not default to the signed-in user';

  -- SELECT: B's rows are invisible, even asked for by id.
  assert (select count(*) from saved_products where user_id = b) = 0, 'A can read B''s saved products';
  assert (select count(*) from saved_ingredients where user_id = b) = 0, 'A can read B''s saved ingredients';

  -- INSERT on B's behalf is refused.
  begin
    insert into saved_products (user_id, product_id) values (b, 'planted');
    assert false, 'A inserted a saved product as B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into saved_ingredients (user_id, inci_name) values (b, 'planted');
    assert false, 'A inserted a saved ingredient as B';
  exception when insufficient_privilege then null;
  end;

  -- UPDATE of B's rows touches nothing.
  update saved_products set note = 'overwritten' where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'A updated B''s saved product';
  update saved_ingredients set saved_at = now() where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'A updated B''s saved ingredient';

  -- ...and A cannot hand A's own row to B by rewriting user_id.
  begin
    update saved_products set user_id = b where product_id = 'a-product';
    assert false, 'A moved a saved product onto B''s shelf';
  exception when insufficient_privilege then null;
  end;
  begin
    update saved_ingredients set user_id = b where inci_name = 'glycerin';
    assert false, 'A moved a saved ingredient onto B''s shelf';
  exception when insufficient_privilege then null;
  end;

  -- Positive: A can update A's own rows — on both tables, so an UPDATE
  -- policy that refuses everything cannot pass on empty results alone.
  update saved_products set note = 'edited', routine_step = 1 where product_id = 'a-product';
  get diagnostics n = row_count;
  assert n = 1, 'A could not update A''s own saved product';
  update saved_ingredients set saved_at = now() where inci_name = 'glycerin';
  get diagnostics n = row_count;
  assert n = 1, 'A could not update A''s own saved ingredient';

  -- DELETE of B's rows touches nothing.
  delete from saved_products where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'A deleted B''s saved product';
  delete from saved_ingredients where user_id = b;
  get diagnostics n = row_count;
  assert n = 0, 'A deleted B''s saved ingredient';

  -- Positive: A can delete A's own rows — on both tables, so a DELETE policy
  -- that refuses everything cannot pass on empty results alone.
  delete from saved_ingredients where inci_name = 'glycerin';
  get diagnostics n = row_count;
  assert n = 1, 'A could not delete A''s own saved ingredient';
  delete from saved_products where product_id = 'a-product';
  get diagnostics n = row_count;
  assert n = 1, 'A could not delete A''s own saved product';
end $$;

-- ── The schema's own limits hold for a signed-in user too ───────────────────

do $$
begin
  begin
    insert into saved_products (product_id, note) values ('long-note', repeat('x', 501));
    assert false, 'a note over 500 characters was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into saved_products (product_id, routine_step) values ('bad-step', 4);
    assert false, 'routine_step 4 was accepted';
  exception when check_violation then null;
  end;
end $$;

-- ── A guest has no access at all ────────────────────────────────────────────

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  begin
    perform 1 from saved_products;
    assert false, 'anon can read saved_products';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from saved_ingredients;
    assert false, 'anon can read saved_ingredients';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── B's rows came through untouched ─────────────────────────────────────────

reset role;

do $$
begin
  assert (select note from saved_products
          where user_id = '00000000-0000-0000-0000-00000000000b') = 'B wrote this',
    'B''s saved product changed';
  assert (select count(*) from saved_ingredients
          where user_id = '00000000-0000-0000-0000-00000000000b') = 1,
    'B''s saved ingredient changed';
end $$;

-- ── Deleting an account deletes its shelf ───────────────────────────────────

delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';

do $$
begin
  assert not exists (select 1 from saved_products
                     where user_id = '00000000-0000-0000-0000-00000000000b'),
    'a deleted account left saved products behind';
  assert not exists (select 1 from saved_ingredients
                     where user_id = '00000000-0000-0000-0000-00000000000b'),
    'a deleted account left saved ingredients behind';
end $$;

rollback;

\echo 'saved_shelf: all assertions passed'
