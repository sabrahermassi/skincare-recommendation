-- Three boron rows 0032 left alone (issue 419, PR 434, 7 October 2026). Data only: no schema change.
--
-- Checked against the consolidated Regulation (EC) No 1223/2009 (version 18.05.2026, Publications
-- Office copy), Regulations (EU) 2019/831, 2019/1966 and 2026/78, and CosIng; the research is on
-- PR 434 and the owner approved it the same day:
--
--   * Sodium perborate: Annex II/1397, no exception. 2019/831 moved the perborates out of Annex III
--     (it deleted entries 1a and 1b) and 2026/78 merged 1398 and 1399 into 1397 from 1 May 2026.
--     Annex III/12 (hydrogen peroxide) excludes 1397 by name, so the old "III/1a III/12" citation
--     names two entries that no longer cover it. CosIng: II/1397.
--   * Magnesium ascorbylborate: Annex II/1396, by the entry's class wording ("boric acid salts and
--     esters, including:"), the same as potassium ascorbylborate. CosIng: II/1396. The taxonomy gives
--     it no citation, so its note is only its description.
--   * Phenyl mercuric borate: Annex V/17 ("Phenylmercuric salts (including borate)"), a preservative
--     allowed in eye products only. CosIng lists it as V/17, and the owner chose to follow CosIng. It
--     gets the same note as its three phenylmercuric siblings and keeps its rating: an Annex V
--     citation alone is "safe" everywhere in this dictionary (safetyFrom).
--
-- The import makes the first two corrections itself (staleCitationFix in
-- scripts/import-inci-dictionary.mjs); import:cosing never writes a note on an existing row, so
-- the third needs nothing there. Every statement changes only a row still carrying the old rating
-- (and the old note, where it had a citation), so running it twice changes nothing and a row
-- relabelled by hand is left alone: safe on staging and on production alike.

-- 1. Sodium perborate, and any perborate carrying the same old citation: Annex II/1397. The name
--    pattern is the importer's PERBORATE, with no backslash-b (Postgres reads that as a backspace).
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1397)'
where safety = 'caution'
  and inci_name ~ '(^|[^a-z])perborate([^a-z]|$)'
  and note = 'Restricted use (EU Annex III/1a III/12)';

-- 2. Magnesium ascorbylborate: Annex II/1396. Guarded on source, not on its note: the note is only
--    the taxonomy's description, and its wording is not a citation to match.
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1396)'
where safety = 'safe'
  and inci_name = 'magnesium ascorbylborate'
  and source = 'obf';

-- 3. Phenyl mercuric borate: Annex V/17, rating unchanged.
update ingredients
set note = 'EU Annex V/17'
where safety = 'safe'
  and inci_name = 'phenyl mercuric borate'
  and (note is null or note = '');
