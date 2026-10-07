/**
 * How many saved products Saved draws before "Show more". The list is one
 * ScrollView, not a recycling list, and a shelf has no cap: a few hundred rows
 * at once is a slow scroll and a lot of memory. Twenty is about three screens.
 */
export const SAVED_PAGE = 20;
