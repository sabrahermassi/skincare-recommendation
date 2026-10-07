-- Two bans the dictionary showed as allowed, and a ban that is only a limit (issue 468, from the
-- audit of 7 October 2026). Data only: no schema change.
--
-- Each row was read off the consolidated Regulation (EC) No 1223/2009 (version 18.05.2026,
-- Publications Office copy) and is listed the same way in CosIng (checked 7 October 2026):
--
--   * 4-Methylbenzylidene camphor: Annex II/1730, added by Regulation (EU) 2024/996. The entry's
--     footnote: not to be placed on the market from 1 May 2025, not to be made available from
--     1 May 2026. The dictionary still cited its old UV-filter entry, Annex VI/18, which no longer
--     exists. CosIng: II/1730.
--   * Cyclotetrasiloxane (octamethylcyclotetrasiloxane, D4, CAS 556-67-2): Annex II/1388, added by
--     Regulation (EU) 2019/831. The dictionary had no citation for it. CosIng: II/1388.
--     Cyclomethicone, a mixture that may hold D4, is not touched.
--   * Annex II/360 is safrole, "except for normal content in the natural essences used and
--     provided the concentration does not exceed 100 ppm in the finished product, 50 ppm in
--     products for dental and oral hygiene, and provided that Safrole is not present in toothpastes
--     intended specifically for children". The dictionary read the citation ("II/360 R3") on
--     camphor-tree and sassafras essences as a flat ban. They become `safe` with a note that
--     says what the entry limits, the way 0030 treated the furocoumarin entry (358). Safrole
--     itself is not matched by the name pattern and keeps its ban.
--
-- The import makes the same corrections (staleCitationFix and safetyFor in
-- scripts/import-inci-dictionary.mjs); __tests__/annex-ii-bans-and-safrole.test.ts holds the two
-- to the same notes. Every statement changes only a row still carrying the old rating and the old
-- note (or, for the uncited row, the old source), so running it twice changes nothing and a row
-- relabelled by hand is left alone: safe on staging and on production alike.
--
-- Not changed here, still to verify: benzophenone (II/1703) and pentasodium pentetate (II/1721),
-- whose application dates were not read, and styrene (II/1575), whose one product was not checked.

-- 1. 4-Methylbenzylidene camphor, under both spellings the dictionary holds.
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1730: not to be placed on the EU market since 1 May 2025 and not to be sold there since 1 May 2026; older stock may still be around)'
where safety = 'safe'
  and inci_name in ('4-methylbenzylidene camphor', '4 methylbenzylidene camphor')
  and note = 'EU Annex VI/18';

-- 2. Cyclotetrasiloxane. Guarded on source, not on its note: the note is only the taxonomy's
--    description, and its wording is not a citation to match.
update ingredients
set
  safety = 'avoid',
  note = 'Prohibited in cosmetics (EU Annex II/1388)'
where safety = 'safe'
  and inci_name = 'cyclotetrasiloxane'
  and source = 'obf';

-- 3. Natural essences cited under the safrole entry. The name pattern is the importer's
--    SAFROLE_ESSENCE_SOURCE, with no backslash-b (Postgres reads that as a backspace).
update ingredients
set
  safety = 'safe',
  note = 'Natural essence. EU Annex II/360 limits safrole in the finished product (100 ppm; 50 ppm in dental and oral hygiene products; none in toothpaste made for children), not the ingredient itself'
where safety = 'avoid'
  and inci_name ~ '(^|[^a-z])(cinnamomum camphora|sassafras)([^a-z]|$)'
  and note = 'Prohibited in cosmetics (EU Annex II/360 R3)';
