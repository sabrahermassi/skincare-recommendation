import { paginateOrdered } from "./paginate.mjs";

/**
 * Other names for ingredients the dictionary already holds — the French half of
 * a bilingual label ("glycérine"), a trivial name ("mineral oil") — as a map
 * from the printed name to the dictionary's own. The importers, the reconcile
 * job and the stub cleanup all read the same table, so it is read the same way.
 */
export async function fetchAliases(db) {
  const rows = await paginateOrdered(db, "ingredient_synonyms", {
    select: "synonym, inci_name",
    cursorColumn: "synonym",
  });
  return new Map(rows.map((r) => [r.synonym.toLowerCase(), r.inci_name.toLowerCase()]));
}
