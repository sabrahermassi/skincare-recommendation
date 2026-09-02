-- Two new ways a product can enter the catalogue, both added by the pivot to
-- a scan-first app.
--
-- 'barcode_db'  A generic barcode database knew the product's identity but not
--               its formula. Tested against a real Korean barcode: UPCitemdb
--               returned the COSRX product name, brand and nine retailer
--               images, and zero ingredients. Worth storing — it turns a blank
--               failure into "this is COSRX Low pH Cleanser, we don't have its
--               formula yet" — but it can never produce a verdict on its own.
--
-- 'ocr'         Read off the label by the user. This is the tier that closes
--               the coverage hole: Open Beauty Facts holds 37 products tagged
--               South Korea against a market of 10,000+ SKUs, so barcode
--               lookup alone misses almost everything. A photographed
--               ingredient list always works, and writing it back against the
--               barcode means the next person to scan that product gets an
--               instant hit. The catalogue grows from use.
--
-- Both are ours to keep, so neither carries an expiry — only INCI API rows do.

alter type product_source add value if not exists 'barcode_db';
alter type product_source add value if not exists 'ocr';
