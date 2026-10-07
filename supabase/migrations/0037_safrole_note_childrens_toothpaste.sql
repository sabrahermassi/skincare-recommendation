-- The safrole note left out one condition of Annex II/360 (issue 468, review of PR 481). The entry
-- reads: "Safrole except for normal content in the natural essences used and provided the
-- concentration does not exceed: 100 ppm in the finished product, 50 ppm in products for dental
-- and oral hygiene, and provided that Safrole is not present in toothpastes intended specifically
-- for children" (consolidated Regulation (EC) No 1223/2009, version 18.05.2026). The note 0035
-- first wrote gave the two limits and not the third condition, and the ingredient page shows the
-- note word for word.
--
-- 0035 now writes the full note, so a database that has not run it yet gets it right the first
-- time and this statement finds nothing there. It only catches up a database (staging) that ran
-- 0035 with the shorter note. Data only: no schema change, and running it twice changes nothing.
update ingredients
set
  note = 'Natural essence. EU Annex II/360 limits safrole in the finished product (100 ppm; 50 ppm in dental and oral hygiene products; none in toothpaste made for children), not the ingredient itself'
where safety = 'safe'
  and note = 'Natural essence. EU Annex II/360 limits safrole in the finished product (100 ppm; 50 ppm in dental and oral hygiene products), not the ingredient itself';
