-- Drop what only the save path used (#377).
--
-- `label-ocr` stopped saving products in #374 (a save answers 410
-- `saving_disabled`), and no longer signs a read token. `consume_read_token`
-- and `release_read_token` were called only from that save, and
-- `used_read_tokens` held only what they wrote (0023). Nothing in
-- `supabase/`, `scripts/`, `app/`, `lib/` or `data/` references any of the
-- three any more.
--
-- Left alone on purpose:
--   * `replace_product_with_ingredients` (0022): the OBF import,
--     `reconcile-obf` and `product-lookup` still call it.
--   * `product_authors` (0026): no new rows since #374; kept for existing
--     authors' export and deletion.

drop function if exists consume_read_token(text, timestamptz);
drop function if exists release_read_token(text);
drop table if exists used_read_tokens;
