-- Petrolatum is `safe`, not `caution` (#361).
--
-- 0028 moved it from `avoid` to `caution`, but the app reads every `caution`
-- as an EU-restricted irritant: sensitive skin got "Common irritant for
-- sensitive skin" and an irritation charge on every product containing it,
-- and everyone saw it counted as "to watch" and "restricted". Petrolatum is
-- one of the least irritating skincare ingredients and is not on the EU
-- restricted list (Annex III); its Annex II entry bans only petrolatum whose
-- refining history isn't known. The import now writes `safe` itself
-- (`safetyFor` in scripts/import-inci-dictionary.mjs); this fixes the row
-- already written.
--
-- The note stays as 0028 wrote it, so the ingredient page still says why.
-- Only a row still carrying that note is changed: a row someone has already
-- relabelled by hand, a row 0028 never reached, or a database without the row
-- is left alone. Run after 0028, on staging and on production alike.
--
-- `ingredients_bump_updated_at` (0011) moves the row's `updated_at`, so phones
-- that cached the dictionary fetch the new label.
update ingredients
set safety = 'safe'
where inci_name = 'petrolatum'
  and safety = 'caution'
  and note like 'Allowed when fully refined. The EU bans it only when its refining history isn''t known (EU Annex %';
