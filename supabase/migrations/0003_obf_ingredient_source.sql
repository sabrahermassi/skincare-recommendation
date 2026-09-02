-- The ingredient dictionary now comes from the Open Beauty Facts ingredient
-- taxonomy rather than a hand-downloaded CosIng CSV.
--
-- Not a compromise: that taxonomy *embeds* CosIng. Of its 22,270 entries, 99%
-- carry a CosIng reference number, 98% list INCI functions, 50% have a CAS
-- number, and 1,219 carry the regulatory annex restriction — which is where
-- real safety ratings come from, replacing values we would otherwise have had
-- to invent. It is ODbL, one URL, and needs no account.

alter type ingredient_source add value if not exists 'obf';
