-- A distinct source for ingredient rows nothing has verified.
--
-- Both Edge Functions insert a stub row whenever a scan encounters a name the
-- dictionary doesn't recognise — "code", "fll", an OCR fragment, an untamed
-- third-party ingredient string — so `product_ingredients` always has a
-- foreign key to point at. Every write site labelled these `source =
-- 'curated'`, which everywhere else in this table means a human-reviewed
-- entry. That made `select … where source = 'curated'` lie: most rows
-- carrying it are unread noise, not curation.
--
-- `verified` already keeps these out of every read path — this migration
-- changes nothing any user sees — it only makes the source column tell the
-- truth for anyone querying the table directly.

alter type ingredient_source add value if not exists 'unmatched';
