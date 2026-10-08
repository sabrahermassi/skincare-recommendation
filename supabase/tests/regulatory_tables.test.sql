-- Migration 0038 (#456): the regulatory tables. Public read, no write for anon or signed-in users,
-- one row per entry and per ingredient and entry, their own updated_at, and nothing written to
-- either table moves ingredients.updated_at.

\set ON_ERROR_STOP on

begin;

insert into ingredients (inci_name, source, safety, verified, note)
values ('ci-456-hydroquinone', 'unmatched', 'safe', false, 'test');

insert into regulatory_entries (annex, entry, wording, cas_numbers, status, source_version, source_hash, last_verified, updated_at)
values ('III', '14', 'Hydroquinone', array['123-31-9'], 'active', '02009R1223-20260518', 'abc', '2026-05-18', '2000-01-01');

do $$
declare
  v_updated_before timestamptz;
  v_updated_after timestamptz;
  v_row_before tid;
  v_row_after tid;
  v_stamp timestamptz;
  v_failed boolean;
begin
  select updated_at, ctid into v_updated_before, v_row_before from ingredients where inci_name = 'ci-456-hydroquinone';

  -- One row per ingredient and entry; the match must be one of the five kinds.
  insert into ingredient_regulatory (inci_name, annex, entry, matched_by) values ('ci-456-hydroquinone', 'III', '14', 'cas');
  v_failed := false;
  begin
    insert into ingredient_regulatory (inci_name, annex, entry, matched_by) values ('ci-456-hydroquinone', 'III', '14', 'ec');
  exception when unique_violation then v_failed := true; end;
  assert v_failed, 'a second row for the same ingredient and entry was accepted';
  v_failed := false;
  begin
    update ingredient_regulatory set matched_by = 'guess' where inci_name = 'ci-456-hydroquinone';
  exception when check_violation then v_failed := true; end;
  assert v_failed, 'a matched_by outside the five was accepted';

  -- One row per annex and entry; annex and status are checked; the entry must exist for the join.
  v_failed := false;
  begin
    insert into regulatory_entries (annex, entry, wording, status, source_version, source_hash, last_verified)
    values ('III', '14', 'Duplicate', 'active', 'v', 'h', '2026-05-18');
  exception when unique_violation then v_failed := true; end;
  assert v_failed, 'a second row for the same annex and entry was accepted';
  v_failed := false;
  begin
    insert into regulatory_entries (annex, entry, wording, status, source_version, source_hash, last_verified)
    values ('IV', '1', 'x', 'active', 'v', 'h', '2026-05-18');
  exception when check_violation then v_failed := true; end;
  assert v_failed, 'an annex other than II and III was accepted';
  v_failed := false;
  begin
    insert into regulatory_entries (annex, entry, wording, status, source_version, source_hash, last_verified)
    values ('II', '1', 'x', 'removed', 'v', 'h', '2026-05-18');
  exception when check_violation then v_failed := true; end;
  assert v_failed, 'a status other than active and deleted was accepted';
  v_failed := false;
  begin
    insert into ingredient_regulatory (inci_name, annex, entry, matched_by) values ('ci-456-hydroquinone', 'II', '999999', 'manual');
  exception when foreign_key_violation then v_failed := true; end;
  assert v_failed, 'a join row to an entry that does not exist was accepted';

  -- updated_at moves only when something changed.
  update regulatory_entries set wording = wording where annex = 'III' and entry = '14';
  select updated_at into v_stamp from regulatory_entries where annex = 'III' and entry = '14';
  assert v_stamp = '2000-01-01'::timestamptz, 'an update that changed nothing moved updated_at';
  update regulatory_entries set status = 'deleted' where annex = 'III' and entry = '14';
  select updated_at into v_stamp from regulatory_entries where annex = 'III' and entry = '14';
  assert v_stamp > '2000-01-01'::timestamptz, 'a real change did not move updated_at';

  -- Nothing written to either table touched the dictionary row, or its watermark.
  select updated_at, ctid into v_updated_after, v_row_after from ingredients where inci_name = 'ci-456-hydroquinone';
  assert v_updated_before = v_updated_after and v_row_before = v_row_after, 'a write to a regulatory table changed ingredients';
end $$;

-- Public read; no write for anyone but the service role.
set local role anon;
do $$
declare
  v_failed boolean := false;
begin
  assert (select count(*) from regulatory_entries) >= 1, 'anon cannot read regulatory_entries';
  assert (select count(*) from ingredient_regulatory) >= 1, 'anon cannot read ingredient_regulatory';
  begin
    insert into regulatory_entries (annex, entry, wording, status, source_version, source_hash, last_verified)
    values ('II', '1', 'x', 'active', 'v', 'h', '2026-05-18');
  exception when insufficient_privilege then v_failed := true; end;
  assert v_failed, 'anon wrote regulatory_entries';
  v_failed := false;
  begin
    update ingredient_regulatory set reviewed_by = 'anon';
  exception when insufficient_privilege then v_failed := true; end;
  assert v_failed, 'anon wrote ingredient_regulatory';
end $$;
reset role;

set local role authenticated;
do $$
declare
  v_failed boolean := false;
begin
  assert (select count(*) from regulatory_entries) >= 1, 'a signed-in user cannot read regulatory_entries';
  begin
    delete from regulatory_entries;
  exception when insufficient_privilege then v_failed := true; end;
  assert v_failed, 'a signed-in user deleted regulatory_entries';
end $$;
reset role;

rollback;

\echo 'regulatory_tables: all assertions passed'
