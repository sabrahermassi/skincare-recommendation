-- Four Annex II rows the dictionary import read as flat bans, corrected (issue 1 of the
-- regulatory-safety work, 5 October 2026). Data only: no schema change.
--
-- 83 of 2,846 staging products carried a "flagged as best avoided" hazard that capped them
-- at 45; 65 of them only because of the rows below. Each correction was checked against
-- the text of the regulation (Annex II entries 358, 764, 875 and 306, and the amending
-- acts for 1339, 1375 and 1380). The import makes the same exemptions itself
-- (`safetyFor` in scripts/import-inci-dictionary.mjs): keep the notes' wording the same in
-- both, `__tests__/annex-ii-corrections.test.ts` checks it.
--
-- Every statement changes only a row still carrying the import's own "Prohibited in
-- cosmetics" note, so a row someone has relabelled by hand, or a database without the
-- row, is left alone: safe to run on staging and on production alike.
-- `ingredients_bump_updated_at` (0011) moves each changed row's `updated_at`, so phones that
-- cached the dictionary fetch the new label.

-- 1. Natural essences cited under Annex II/358 (citrus, rue). Entry 358 limits furocoumarins
--    "except for normal content in natural essences used"; it does not ban the essence. The
--    same entry prohibits the furocoumarins themselves (methoxsalen, trioxsalen), so a row
--    must also be named for one of the reviewed plants, as in the importer's
--    `NATURAL_ESSENCE_SOURCE`.
update ingredients
set
  safety = 'safe',
  note = 'Natural essence. EU Annex II/358 limits furocoumarins in the finished product (under 1 mg/kg in sun protection and bronzing products), not the ingredient itself'
where safety = 'avoid'
  and inci_name ~ '(^|[^a-z])(citrus|ruta|cuminum)([^a-z]|$)'
  and note ~ '^Prohibited in cosmetics \(EU Annex II/358( R1?)?\)$';

-- 1b. The same entry beside an Annex III restriction (cumin): rated on the restriction alone.
update ingredients
set
  safety = 'caution',
  note = 'Restricted use (EU Annex III/156)'
where safety = 'avoid'
  and inci_name ~ '(^|[^a-z])(citrus|ruta|cuminum)([^a-z]|$)'
  and note = 'Prohibited in cosmetics (EU Annex II/358 R1 III/156)';

-- 2. Alkanes under Annex II/764: banned only "if they contain > 3 % w/w DMSO extract",
--    which a refined cosmetic grade does not. The note names that condition, not petrolatum's
--    refining history (0028, 0029).
update ingredients
set
  safety = 'safe',
  note = regexp_replace(
    note,
    '^Prohibited in cosmetics ',
    'Allowed when fully refined. The EU bans it only when it contains more than 3 % DMSO extract '
  )
where inci_name in ('c14 19 alkane', 'c14-19 alkane', 'c15 19 alkane', 'c15-19 alkane', 'c18 21 alkane', 'c18-21 alkane')
  and safety = 'avoid'
  and note like 'Prohibited in cosmetics (EU Annex II/764%';

-- 3. Cannabidiol is outside Annex II/306 as such; CBD made from cannabis extract, tincture
--    or resin is inside it. Neither banned nor cleared: `safe` charges nothing, and the note
--    says the rules depend on how it is made (owner decision).
update ingredients
set
  safety = 'safe',
  note = 'EU rules depend on how it''s made.'
where inci_name = 'cannabidiol'
  and safety = 'avoid'
  and note like 'Prohibited in cosmetics (EU Annex II/306%';

-- 4. HICC (II/1380) stays prohibited. Its note carried the regulation's dates as running
--    text; it now says them plainly, because old stock may still be around.
update ingredients
set note = 'Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)'
where safety = 'avoid'
  and note like 'Prohibited in cosmetics (EU Annex II/1380%'
  and note not like '%older stock%';
