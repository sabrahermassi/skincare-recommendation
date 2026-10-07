-- Migration 0034's rules (#419, PR 434). Each row it must change is paired with a row it must leave
-- alone, and the file is run twice to prove the second run changes nothing.

\set ON_ERROR_STOP on

begin;

insert into ingredients (inci_name, source, verified, safety, note) values
  -- Changed.
  ('sodium perborate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/12)'),
  ('magnesium ascorbylborate', 'obf', true, 'safe', 'Magnesium Ascorbylborate is the magnesium salt of the reaction product of Boric Acid and Ascorbic Acid'),
  ('phenyl mercuric borate', 'cosing', true, 'safe', null),
  ('sodium perborate monohydrate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/12)'),
  -- Left alone.
  ('potassium perborate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/12 III/99)'),
  ('phenyl mercuric acetate', 'obf', true, 'safe', 'EU Annex V/17'),
  ('hydrogen peroxide', 'obf', true, 'caution', 'Restricted use (EU Annex III/12)');

\ir ../migrations/0034_annex_boron_followup.sql
\ir ../migrations/0034_annex_boron_followup.sql

do $$
declare
  r record;
begin
  for r in select * from (values
    ('sodium perborate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1397)'),
    ('magnesium ascorbylborate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1396)'),
    ('phenyl mercuric borate', 'safe', 'EU Annex V/17'),
    ('sodium perborate monohydrate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1397)'),
    ('potassium perborate', 'caution', 'Restricted use (EU Annex III/1a III/12 III/99)'),
    ('phenyl mercuric acetate', 'safe', 'EU Annex V/17'),
    ('hydrogen peroxide', 'caution', 'Restricted use (EU Annex III/12)')
  ) as t (name, safety, note)
  loop
    assert exists (select 1 from ingredients where inci_name = r.name and safety::text = r.safety and note = r.note),
      format('%s is not %s / %s after the migration', r.name, r.safety, r.note);
  end loop;
end $$;

rollback;

\echo 'annex_boron_followup: all assertions passed'
