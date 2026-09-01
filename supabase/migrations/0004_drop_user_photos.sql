-- Remove Open Beauty Facts photography already stored by an earlier import.
--
-- Not a licensing problem — CC-BY-SA permits reuse. It is a quality one: every
-- OBF image is a user upload, and the API exposes only uploader, timestamp and
-- pixel dimensions, with nothing that separates a clean pack shot from a photo
-- of someone holding the bottle. Many are review snapshots. A catalogue of
-- inconsistent user photography reads worse than none, and the app already
-- renders a deliberate illustration per product family when image_url is null.
--
-- Both write paths (scripts/import-obf.mjs and the product-lookup Edge
-- Function) now store null, so this will not come back.

update products
   set image_url = null,
       attribution = 'Product data from Open Beauty Facts, used under ODbL.'
 where source = 'obf';
