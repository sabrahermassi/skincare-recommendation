-- Petrolatum is `caution`, not `avoid` (#354).
--
-- The dictionary import read every EU Annex II citation as a flat ban, but
-- petrolatum's entry prohibits it only when its full refining history isn't
-- known. As `avoid` it led 38 staging products with "1 to avoid". The import now
-- makes this exception itself (`REFINED_GRADE_EXEMPT` in
-- scripts/import-inci-dictionary.mjs); this fixes the row already written,
-- with the same note wording, so the next import leaves it as it is.
--
-- Only a row still carrying the import's own "Prohibited in cosmetics" note
-- is changed, keeping its annex citation. A row someone has already relabelled
-- by hand, or a database without the row, is left alone: that makes this safe
-- to run on staging and on production alike.
update ingredients
set
  safety = 'caution',
  note = regexp_replace(
    note,
    '^Prohibited in cosmetics ',
    'Allowed when fully refined. The EU bans it only when its refining history isn''t known '
  )
where inci_name = 'petrolatum'
  and safety = 'avoid'
  and note like 'Prohibited in cosmetics (EU Annex %';
