-- Stale Annex citations in the dictionary (issue 419, 7 October 2026). Data only: no schema change.
--
-- The OBF taxonomy still cites Annex III entries the regulation has since deleted or moved, so
-- the import wrote some EU bans as "Restricted use (EU Annex III/N)" and cited entries that no
-- longer exist. Checked against the consolidated Regulation (EC) No 1223/2009 (version
-- 18.05.2026, Publications Office copy) and CosIng, and approved by the owner on #419:
--
--   * Annex II/1666, "2-(4-tert-butylbenzyl) propionaldehyde" (butylphenyl methylpropional,
--     Lilial): Regulation (EU) 2021/1902, applies from 1 March 2022. It was cited as III/83.
--   * Annex II/1395 boric acid and 1394 diboron trioxide, and II/1396, "borates, tetraborates,
--     octaborates and boric acid salts and esters": Regulations (EU) 2019/831 and 2019/1966,
--     which deleted Annex III entries 1a and 1b. Matched by INCI name and class, never by CAS
--     (potassium borate's CAS differs between CosIng and the regulation). Perborates (1397),
--     phenyl mercuric borate (III/17) and a borate that cites anything else are left alone.
--   * Annex II/1389, dichloromethane: moved out of Annex III/7 by Regulation (EU) 2019/831.
--   * Entries Regulation (EU) 2023/1545 deleted and merged (125, 126 into 124 turpentine; 158,
--     160-163, 165 into 157 rose ketones; 167, 168 into 88 limonene), 19 (now 227), and the old
--     Part I numbering ("Annex III/I/256 - Directive 2012/21/EU", and 6-hydroxyindole's, which
--     lost its number upstream), renumbered to the current entry by ingredient name. Their status does not change.
--
-- The import makes the same corrections itself (staleCitationFix in
-- scripts/import-inci-dictionary.mjs): keep the notes' wording the same in both,
-- __tests__/annex-stale-citations.test.ts checks it.
--
-- Every statement changes only a row still carrying the import's own old note, exactly, and the
-- renumbering table never maps to a note it also reads, so running it twice changes nothing and a
-- row someone has relabelled by hand, or a database without the row, is left alone: safe to run on
-- staging and on production alike. ingredients_bump_updated_at (0011) moves each changed row's
-- updated_at, so phones that cached the dictionary fetch the new label.

-- 1. Butylphenyl methylpropional: Annex II/1666 (it cited the deleted III/83).
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1666, since 1 March 2022)'
where safety = 'caution'
  and note = 'Restricted use (EU Annex III/83)';

-- 2. Dichloromethane: Annex II/1389 (it cited the deleted III/7).
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1389)'
where safety = 'caution'
  and note = 'Restricted use (EU Annex III/7)';

-- 3. Boric acid (1395), diboron trioxide (1394) and the borate salts and esters (1396). The note
--    guard is the old Annex III citations a boric-acid-class row carried (1a, 1b, and the zinc and
--    amine entries 24 and 61), at least one of them 1a or 1b: it leaves sodium perborate
--    ("III/1a III/12") and any borate with another citation alone. The name pattern is the importer's
--    BORATE_SALT, with no backslash-b (Postgres reads that as a backspace): "perborate" and
--    "tetrafluoroborate" do not match, a letter comes before the stem.
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1395)'
where safety = 'caution'
  and inci_name = 'boric acid'
  and note ~ '^Restricted use \(EU Annex (III/(1[ab]|24|61) ?)+\)$'
  and note ~ 'III/1[ab]';

update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1394)'
where safety = 'caution'
  and inci_name in ('diboron trioxide', 'boric oxide')
  and note ~ '^Restricted use \(EU Annex (III/(1[ab]|24|61) ?)+\)$'
  and note ~ 'III/1[ab]';

update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1396)'
where safety = 'caution'
  and inci_name ~ '(^|[^a-z])(borate|tetraborate|octaborate|fructoborate|ascorbylborate|borax)([^a-z]|$)'
  and inci_name !~ 'mercur'
  and note ~ '^Restricted use \(EU Annex (III/(1[ab]|24|61) ?)+\)$'
  and note ~ 'III/1[ab]';

-- 4. Deleted, merged and renumbered Annex III citations: the note names the current entry.
--    Still restricted: only the entry number changes.
update ingredients i
set note = m.new_note
from (values
  ('Restricted use (EU Annex Annex III/I/255 - Directive 2012/21EU)',
   'Restricted use (EU Annex III/200)'),
  ('Restricted use (EU Annex Annex III/I/256 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/206)'),
  ('Restricted use (EU Annex Annex III/I/257 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/207)'),
  ('Restricted use (EU Annex Annex III/I/258 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/208)'),
  ('Restricted use (EU Annex Annex III/I/260 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/210)'),
  ('Restricted use (EU Annex Annex III/I/262 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/212)'),
  ('Restricted use (EU Annex Annex III/I/263 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/213)'),
  ('Restricted use (EU Annex Annex III/I/265 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/240)'),
  ('Restricted use (EU Annex Annex III/I/266 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/251)'),
  ('Restricted use (EU Annex Annex III/I/268 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/255)'),
  ('Restricted use (EU Annex Annex III/I/269 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/256)'),
  ('Restricted use (EU Annex Annex III/I/270 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/258)'),
  ('Restricted use (EU Annex Annex III/I/272 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/260)'),
  ('Restricted use (EU Annex Annex III/I/273 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/261)'),
  ('Restricted use (EU Annex Annex III/I/274 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/262)'),
  ('Restricted use (EU Annex Annex III/I/275 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/263)'),
  ('Restricted use (EU Annex Annex III/I/276 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/264)'),
  ('Restricted use (EU Annex III/124 III/125 III/126)',
   'Restricted use (EU Annex III/124)'),
  ('Restricted use (EU Annex III/125)',
   'Restricted use (EU Annex III/124)'),
  ('Restricted use (EU Annex III/126)',
   'Restricted use (EU Annex III/124)'),
  ('Restricted use (EU Annex III/158)',
   'Restricted use (EU Annex III/157)'),
  ('Restricted use (EU Annex III/160)',
   'Restricted use (EU Annex III/157)'),
  ('Restricted use (EU Annex III/161)',
   'Restricted use (EU Annex III/157)'),
  ('Restricted use (EU Annex III/162)',
   'Restricted use (EU Annex III/157)'),
  ('Restricted use (EU Annex III/163)',
   'Restricted use (EU Annex III/157)'),
  ('Restricted use (EU Annex III/165)',
   'Restricted use (EU Annex III/157)'),
  ('Restricted use (EU Annex III/167)',
   'Restricted use (EU Annex III/88)'),
  ('Restricted use (EU Annex III/168)',
   'Restricted use (EU Annex III/88)'),
  ('Restricted use (EU Annex III/19)',
   'Restricted use (EU Annex III/227)'),
  ('Restricted use (EU Annex III/88 III/167 III/168)',
   'Restricted use (EU Annex III/88)'),
  ('Restricted use (EU Annex annex III/I/271 - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/259)'),
  ('Restricted use (EU Annex Annex III/I/EU - Directive 2012/21/EU)',
   'Restricted use (EU Annex III/209)')
) as m (old_note, new_note)
where i.safety = 'caution'
  and i.note = m.old_note;
