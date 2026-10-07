-- Migration 0032's rules (#419). Each row it must change is paired with a row it must leave
-- alone, and the whole file is run twice to prove the second run changes nothing.

\set ON_ERROR_STOP on

begin;

insert into ingredients (inci_name, source, verified, safety, note) values
  -- Changed to a ban.
  ('butylphenyl methylpropional', 'obf', true, 'caution', 'Restricted use (EU Annex III/83)'),
  ('dichloromethane', 'obf', true, 'caution', 'Restricted use (EU Annex III/7)'),
  ('boric acid', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a)'),
  ('diboron trioxide', 'obf', true, 'caution', 'Restricted use (EU Annex III/1b)'),
  ('sodium borate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/1b)'),
  ('mea-borate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/61)'),
  ('zinc borate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/24)'),
  ('calcium fructoborate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a)'),
  ('potassium ascorbylborate', 'curated', true, 'caution', 'Restricted use (EU Annex III/1a)'),
  -- Left alone.
  ('sodium perborate', 'obf', true, 'caution', 'Restricted use (EU Annex III/1a III/12)'),
  ('phenyl mercuric borate', 'obf', true, 'caution', 'Restricted use (EU Annex III/17)'),
  ('potassium tetrafluoroborate', 'obf', true, 'caution', 'Restricted use (EU Annex III/14)'),
  ('magnesium ascorbylborate', 'obf', true, 'safe', 'Magnesium Ascorbylborate is the magnesium salt of the reaction product of Boric Acid'),
  ('some borate', 'obf', true, 'caution', 'Restricted use (EU Annex V/16)'),
  ('boric acid stub', 'obf', true, 'avoid', 'Prohibited in cosmetics (EU Annex II/1395)'),
  -- Renumbered, still restricted.
  ('turpentine', 'obf', true, 'caution', 'Restricted use (EU Annex III/124 III/125 III/126)'),
  ('limonene', 'obf', true, 'caution', 'Restricted use (EU Annex III/88 III/167 III/168)'),
  ('trans-rose ketone-2', 'obf', true, 'caution', 'Restricted use (EU Annex III/158)'),
  ('3-amino-2-4-dichlorophenol', 'obf', true, 'caution', 'Restricted use (EU Annex III/19)'),
  ('dihydroxyindole', 'obf', true, 'caution', 'Restricted use (EU Annex Annex III/I/257 - Directive 2012/21/EU)'),
  ('hc-yellow-no-2', 'obf', true, 'caution', 'Restricted use (EU Annex Annex III/I/268 - Directive 2012/21/EU)'),
  ('6-hydroxyindole', 'obf', true, 'caution', 'Restricted use (EU Annex Annex III/I/EU - Directive 2012/21/EU)'),
  ('rose ketone-5', 'obf', true, 'caution', 'Restricted use (EU Annex III/164)'),
  ('salicylic acid', 'obf', true, 'caution', 'Restricted use (EU Annex III/98)');

\ir ../migrations/0032_annex_stale_citations.sql
\ir ../migrations/0032_annex_stale_citations.sql

do $$
declare
  r record;
begin
  for r in select * from (values
    ('butylphenyl methylpropional', 'avoid', 'Prohibited in cosmetics (EU Annex II/1666, since 1 March 2022)'),
    ('dichloromethane', 'avoid', 'Prohibited in cosmetics (EU Annex II/1389)'),
    ('boric acid', 'avoid', 'Prohibited in cosmetics (EU Annex II/1395)'),
    ('diboron trioxide', 'avoid', 'Prohibited in cosmetics (EU Annex II/1394)'),
    ('sodium borate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1396)'),
    ('mea-borate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1396)'),
    ('zinc borate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1396)'),
    ('calcium fructoborate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1396)'),
    ('potassium ascorbylborate', 'avoid', 'Prohibited in cosmetics (EU Annex II/1396)'),
    ('sodium perborate', 'caution', 'Restricted use (EU Annex III/1a III/12)'),
    ('phenyl mercuric borate', 'caution', 'Restricted use (EU Annex III/17)'),
    ('potassium tetrafluoroborate', 'caution', 'Restricted use (EU Annex III/14)'),
    ('magnesium ascorbylborate', 'safe', 'Magnesium Ascorbylborate is the magnesium salt of the reaction product of Boric Acid'),
    ('some borate', 'caution', 'Restricted use (EU Annex V/16)'),
    ('boric acid stub', 'avoid', 'Prohibited in cosmetics (EU Annex II/1395)'),
    ('turpentine', 'caution', 'Restricted use (EU Annex III/124)'),
    ('limonene', 'caution', 'Restricted use (EU Annex III/88)'),
    ('trans-rose ketone-2', 'caution', 'Restricted use (EU Annex III/157)'),
    ('3-amino-2-4-dichlorophenol', 'caution', 'Restricted use (EU Annex III/227)'),
    ('dihydroxyindole', 'caution', 'Restricted use (EU Annex III/207)'),
    ('hc-yellow-no-2', 'caution', 'Restricted use (EU Annex III/255)'),
    ('6-hydroxyindole', 'caution', 'Restricted use (EU Annex III/209)'),
    ('rose ketone-5', 'caution', 'Restricted use (EU Annex III/164)'),
    ('salicylic acid', 'caution', 'Restricted use (EU Annex III/98)')
  ) as t (name, safety, note)
  loop
    assert exists (select 1 from ingredients where inci_name = r.name and safety::text = r.safety and note = r.note),
      format('%s is not %s / %s after the migration', r.name, r.safety, r.note);
  end loop;
end $$;

rollback;

\echo 'annex_stale_citations: all assertions passed'
