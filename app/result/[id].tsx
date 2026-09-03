/**
 * The post-scan route. It renders the product screen — there is one product
 * rendering in the app, and arriving from a barcode should not produce a
 * different-looking answer from arriving through the browse list.
 *
 * The route is kept rather than folded away because the scanner pushes to it,
 * and because "the result of a scan" is a meaningful thing to link to.
 */
export { default } from "@/app/product/[id]";
