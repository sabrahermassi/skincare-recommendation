/**
 * The EU Annex III entries that make an ingredient matter to sensitive skin
 * (#407). "Restricted" (Annex III) only means allowed with conditions - a
 * maximum amount, a product type, a label warning - and the regulation has no
 * skin-type rule, so being on the list never charges anyone by itself. What
 * the EU does protect sensitive and allergic people with is the label, and
 * two kinds of entry say so:
 *
 * - `fragrance`: the substance must be named in the ingredient list above
 *   0.001% in leave-on and 0.01% in rinse-off products (entries 45, 46, 67-92
 *   and a dozen more, plus the 45 entries Regulation (EU) 2023/1545 added).
 * - `allergy-warning`: the entry's required label text mentions an allergic
 *   reaction or sensitisation (almost all hair dye).
 *
 * Every name below was read off the EU Publications Office's copy of the
 * consolidated Regulation (EC) No 1223/2009 (version 18.05.2026), Annex III,
 * by script, and the 2023/1545 names were checked against that regulation's
 * Official Journal text. **Never add a name from memory**, and never infer one
 * from a dictionary note: the notes miss entries (hexyl cinnamal is `safe` in
 * the dictionary) and cite entries that no longer exist (#419).
 *
 * Keyed by INCI name as printed, read the way the dictionary names its rows
 * (lower case, brackets as spaces). Where the regulation
 * prints two names in one cell ("HC Red No 10 + HC Red No 11"), or breaks one
 * across a line ("p- Phenylenediamine"), they are written as the names they are. A name in the
 * regulation that the dictionary does not hold simply never matches; none was
 * added to make a gap look smaller.
 *
 * The regulation does not always print CosIng's INCI name, and the dictionary is
 * keyed on CosIng's ("p-Phenylenediamine Sulfate", where Annex III prints
 * "Sulphate"). `COSING_SPELLINGS` below lists those, each read off CosIng's own
 * record for the substance (#439).
 */

export type EuAllergenKind = "fragrance" | "allergy-warning";

export type EuAllergenEntry = {
  /** The Annex III reference number as printed: "88", "8a". */
  entry: string;
  kind: EuAllergenKind;
  /** The INCI names printed for the entry. */
  names: readonly string[];
  /** The regulation that put the entry on the list. */
  regulation: string;
  /** Why a name on the list is never charged, when it is not (the owner's decision, #407). */
  exempt?: string;
};

/** Where every name was read from, and when. */
export const EU_ALLERGEN_SOURCE = {
  label: "EU Cosmetics Regulation, Annex III",
  url: "https://eur-lex.europa.eu/eli/reg/2009/1223/oj",
  text: "Consolidated Regulation (EC) No 1223/2009, version 18.05.2026 (Publications Office, CELEX 02009R1223-20260518)",
  verified: "2026-10-07",
  verifiedBy: "taken from the regulation text by Claude, approved by owner 6 Oct 2026 (#407); not checked name by name by the owner",
} as const;

type RawEntry = { entry: string; names: readonly string[] };

const FRAGRANCE_ENTRIES: readonly RawEntry[] = [
  { entry: "45", names: ["Benzyl Alcohol"] },
  { entry: "46", names: ["6-Methyl Coumarin"] },
  { entry: "67", names: ["Amyl cinnamal"] },
  { entry: "69", names: ["Cinnamyl alcohol"] },
  { entry: "70", names: ["Citral", "Geranial", "Neral"] },
  { entry: "71", names: ["Eugenol"] },
  { entry: "72", names: ["Hydroxycitronellal"] },
  { entry: "73", names: ["Isoeugenol"] },
  { entry: "74", names: ["Amylcinnamyl alcohol"] },
  { entry: "75", names: ["Benzyl Salicylate"] },
  { entry: "76", names: ["Cinnamal"] },
  { entry: "77", names: ["Coumarin"] },
  { entry: "78", names: ["Geraniol"] },
  { entry: "80", names: ["Anise alcohol"] },
  { entry: "81", names: ["Benzyl cinnamate"] },
  { entry: "82", names: ["Farnesol"] },
  { entry: "84", names: ["Linalool"] },
  { entry: "85", names: ["Benzyl benzoate"] },
  { entry: "86", names: ["Citronellol"] },
  { entry: "87", names: ["Hexyl cinnamal"] },
  { entry: "88", names: ["Limonene"] },
  { entry: "89", names: ["Methyl 2-Octynoate"] },
  { entry: "90", names: ["alpha-Isomethyl ionone"] },
  { entry: "91", names: ["Evernia prunastri extract"] },
  { entry: "92", names: ["Evernia furfuracea extract"] },
  { entry: "109", names: ["Pinus Mugo Leaf Oil", "Pinus Mugo Twig Leaf Extract", "Pinus Mugo Twig Oil"] },
  { entry: "114", names: ["Pinus Pumila Needle Extract", "Pinus Pumila Twig Leaf Extract", "Pinus Pumila Twig Leaf Oil"] },
  { entry: "122", names: ["Cedrus Atlantica Bark Extract", "Cedrus Atlantica Bark Oil", "Cedrus Atlantica Bark Water", "Cedrus Atlantica Leaf Extract", "Cedrus Atlantica Wood Extract", "Cedrus Atlantica Wood Oil"] },
  { entry: "124", names: ["Turpentine"] },
  { entry: "131", names: ["Alpha-Terpinene"] },
  { entry: "133", names: ["Terpinolene"] },
  { entry: "154", names: ["Myroxylon Balsamum Pereirae Balsam Extract", "Myroxylon Balsamum Pereirae Balsam Oil", "Myroxylon Pereirae Oil", "Myroxylon Pereirae Resin Extract", "Myroxylon Pereirae Resin"] },
  { entry: "157", names: ["Alpha-Damascone", "cis-Rose ketone 1", "trans-Rose ketone 1", "Rose ketone 4 (Damascenone)", "Rose ketone 3 (delta-Damascone)", "trans-Rose ketone 3", "cis-Rose ketone 2 (cis-beta-Damascone)", "trans-Rose ketone 2 (trans-beta-Damascone)"] },
  { entry: "175", names: ["3-Propylidenephthalide"] },
  { entry: "196", names: ["Lippia citriodora absolute"] },
  { entry: "324", names: ["Methyl Salicylate"] },
];

const ADDED_BY_2023_1545: readonly RawEntry[] = [
  { entry: "327", names: ["Acetyl Cedrene"] },
  { entry: "328", names: ["Amyl Salicylate"] },
  { entry: "329", names: ["Anethole"] },
  { entry: "330", names: ["Benzaldehyde"] },
  { entry: "331", names: ["Camphor"] },
  { entry: "332", names: ["Beta-Caryophyllene"] },
  { entry: "333", names: ["Carvone"] },
  { entry: "334", names: ["Dimethyl Phenethyl Acetate"] },
  { entry: "335", names: ["Hexadecanolactone"] },
  { entry: "336", names: ["Hexamethylindanopyran"] },
  { entry: "337", names: ["Linalyl Acetate"] },
  { entry: "338", names: ["Menthol"] },
  { entry: "339", names: ["Trimethylcyclopentenyl Methylisopentenol"] },
  { entry: "340", names: ["Salicylaldehyde"] },
  { entry: "341", names: ["Santalol"] },
  { entry: "342", names: ["Sclareol"] },
  { entry: "343", names: ["Terpineol"] },
  { entry: "344", names: ["Tetramethyl acetyloctahydronaphthalenes"] },
  { entry: "345", names: ["Trimethylbenzenepropanol"] },
  { entry: "346", names: ["Vanillin"] },
  { entry: "347", names: ["Cananga Odorata Flower Extract", "Cananga Odorata Flower Oil"] },
  { entry: "348", names: ["Cinnamomum Cassia Leaf Oil"] },
  { entry: "349", names: ["Cinnamomum Zeylanicum Bark Oil"] },
  { entry: "350", names: ["Citrus Aurantium Amara Flower Oil", "Citrus Aurantium Dulcis Flower Oil"] },
  { entry: "351", names: ["Citrus Aurantium Amara Peel Oil", "Citrus Aurantium Dulcis Peel Oil", "Citrus Sinensis Peel Oil"] },
  { entry: "352", names: ["Citrus Aurantium Bergamia Peel Oil"] },
  { entry: "353", names: ["Citrus Limon Peel Oil"] },
  { entry: "354", names: ["Cymbopogon Schoenanthus Oil", "Cymbopogon Flexuosus Oil", "Cymbopogon Citratus Leaf Oil"] },
  { entry: "355", names: ["Eucalyptus Globulus Leaf Oil", "Eucalyptus Globulus Leaf/Twig Oil"] },
  { entry: "356", names: ["Eugenia Caryophyllus Leaf Oil", "Eugenia Caryophyllus Flower Oil", "Eugenia Caryophyllus Stem oil", "Eugenia Caryophyllus Bud oil"] },
  { entry: "357", names: ["Jasminum Grandiflorum Flower Extract", "Jasminum Officinale Oil", "Jasminum Officinale Flower Extract"] },
  { entry: "358", names: ["Juniperus Virginiana Oil", "Juniperus Virginiana Wood Oil"] },
  { entry: "359", names: ["Laurus Nobilis Leaf Oil"] },
  { entry: "360", names: ["Lavandula Hybrida Oil", "Lavandula Hybrida Extract", "Lavandula Hybrida Flower Extract", "Lavandula Intermedia Flower/Leaf/Stem Extract", "Lavandula Intermedia Flower/Leaf/Stem Oil", "Lavandula Intermedia Oil", "Lavandula Angustifolia Oil", "Lavandula Angustifolia Flower/Leaf/Stem Extract"] },
  { entry: "361", names: ["Mentha Piperita Oil"] },
  { entry: "362", names: ["Mentha Viridis Leaf Oil"] },
  { entry: "363", names: ["Narcissus Poeticus Extract", "Narcissus Pseudonarcissus Flower Extract", "Narcissus Jonquilla Extract", "Narcissus Tazetta Extract"] },
  { entry: "364", names: ["Pelargonium Graveolens Oil", "Pelargonium Graveolens Flower Oil", "Pelargonium Graveolens Leaf Oil"] },
  { entry: "365", names: ["Pogostemon Cablin Oil", "Pogostemon Cablin Leaf Oil"] },
  { entry: "366", names: ["Rosa Damascena Flower Oil", "Rosa Damascena Flower Extract", "Rosa Alba Flower Oil", "Rosa Alba Flower Extract", "Rosa Canina Flower Oil", "Rosa Centifolia Flower Oil", "Rosa Centifolia Flower Extract", "Rosa Gallica Flower Oil", "Rosa Moschata Flower Oil", "Rosa Rugosa Flower Oil"] },
  { entry: "367", names: ["Santalum Album Oil"] },
  { entry: "368", names: ["Eugenyl Acetate"] },
  { entry: "369", names: ["Geranyl Acetate"] },
  { entry: "370", names: ["Isoeugenyl Acetate"] },
  { entry: "371", names: ["Pinene"] },
];

const ALLERGY_WARNING_ENTRIES: readonly RawEntry[] = [
  { entry: "8a", names: ["p-Phenylenediamine", "p-Phenylenediamine HCl", "p-Phenylenediamine Sulphate"] },
  { entry: "8b", names: ["p-Phenylenediamine", "p-Phenylenediamine HCl", "p-Phenylenediamine Sulphate"] },
  { entry: "8c", names: ["N,N′-Bis(2-Hydroxyethyl)-2-Nitro-p-Phenylenediamine"] },
  { entry: "9a", names: ["Toluene-2,5-Diamine", "Toluene-2,5-Diamine Sulfate"] },
  { entry: "9b", names: ["2,6-Dihydroxyethylaminotoluene"] },
  { entry: "16", names: ["1-Naphthol"] },
  { entry: "22", names: ["Resorcinol"] },
  { entry: "193", names: ["Acid Red 52"] },
  { entry: "198", names: ["N,N-bis(2-Hydroxyethyl)-p-Phenylenediamine Sulfate"] },
  { entry: "199", names: ["4-Chlororesorcinol"] },
  { entry: "200", names: ["Tetraaminopyrimidine Sulfate"] },
  { entry: "201", names: ["2-Chloro-6-ethylamino-4-nitrophenol"] },
  { entry: "203", names: ["6-Methoxy-2-Methylamino-3-Aminopyridine HCl"] },
  { entry: "204", names: ["Dihydroxy indoline", "Dihydroxy indoline HBr"] },
  { entry: "206", names: ["Hydroxyethyl-p-Phenylenediamine Sulfate"] },
  { entry: "207", names: ["Dihydroxyindole"] },
  { entry: "208", names: ["5-Amino-4-Chloro-o-Cresol HCl"] },
  { entry: "209", names: ["6-Hydroxyindole"] },
  { entry: "210", names: ["Isatin"] },
  { entry: "211", names: ["2-Amino-3-Hydroxypyridine"] },
  { entry: "212", names: ["1-Acetoxy-2-Methylnaphthalene"] },
  { entry: "213", names: ["2-Methyl-1-Naphthol"] },
  { entry: "214", names: ["Acid Yellow 1"] },
  { entry: "215", names: ["4-Amino-3-nitrophenol"] },
  { entry: "216", names: ["2,7-Naphthalenediol"] },
  { entry: "217", names: ["m-Aminophenol", "m-Aminophenol HCl", "m-Aminophenol sulfate"] },
  { entry: "218", names: ["2,6-Dihydroxy-3,4-dimethylpyridine"] },
  { entry: "219", names: ["4-Hydroxypropylamino-3-nitrophenol"] },
  { entry: "221", names: ["Hydroxyethyl-2-Nitro-p-Toluidine"] },
  { entry: "222", names: ["2-Hydroxyethylpicramic acid"] },
  { entry: "223", names: ["p-Methylaminophenol", "p-Methylaminophenol sulphate"] },
  { entry: "224", names: ["HC Violet No 2"] },
  { entry: "225", names: ["HC Blue No 12"] },
  { entry: "226", names: ["1,3-bis-(2,4-Diaminophenoxy)propane", "1,3-bis-(2,4-Diaminophenoxy)propane HCl"] },
  { entry: "227", names: ["3-Amino-2,4-dichlorophenol", "3-Amino-2,4-dichlorophenol HCl"] },
  { entry: "228", names: ["Phenyl methyl pyrazoloné"] },
  { entry: "229", names: ["2-Methyl-5-Hydroxyethyl Aminophenol"] },
  { entry: "230", names: ["Hydroxybenzomorpholine"] },
  { entry: "232", names: ["2,6-Dimethoxy-3,5-pyridinediamine", "2,6-Dimethoxy-3,5-pyridinediamine HCl"] },
  { entry: "233", names: ["HC Orange No 2"] },
  { entry: "234", names: ["HC Violet No 1"] },
  { entry: "237", names: ["HC Red No 13"] },
  { entry: "238", names: ["1,5-Naphthalenediol"] },
  { entry: "239", names: ["Hydroxypropyl bis(N-hydroxyethyl-p-phenylenediamine) HCl"] },
  { entry: "240", names: ["4-Nitro-o-Phenylenediamine"] },
  { entry: "241", names: ["4-Amino-2-Hydroxytoluene"] },
  { entry: "242", names: ["2,4-Diaminophenoxyethanol HCl", "2,4-Diaminophenoxyethanol sulfate"] },
  { entry: "243", names: ["2-Methylresorcinol"] },
  { entry: "244", names: ["4-Amino-m-Cresol"] },
  { entry: "245", names: ["2-Amino-4-Hydroxyethylaminoanisole", "2-Amino-4-Hydroxyethylaminoanisole sulfate"] },
  { entry: "246", names: ["Hydroxyethyl-3,4-methylenedioxyaniline HCl"] },
  { entry: "247", names: ["HC Blue No 2"] },
  { entry: "248", names: ["3-Nitro-p-hydroxyethylaminophenol"] },
  { entry: "249", names: ["4-Nitrophenyl aminoethylurea"] },
  { entry: "250", names: ["HC Red No 10", "HC Red No 11"] },
  { entry: "251", names: ["HC Red No 7"] },
  { entry: "252", names: ["2-Amino-6-chloro-4-nitrophenol"] },
  { entry: "255", names: ["HC Yellow No 2"] },
  { entry: "258", names: ["HC Red No 1"] },
  { entry: "261", names: ["HC Yellow No 13"] },
  { entry: "266", names: ["HC Red No 3"] },
  { entry: "268", names: ["Basic Red 51"] },
  { entry: "269", names: ["2-Amino-5-Ethylphenol HCl"] },
  { entry: "270", names: ["Acid Red 92"] },
  { entry: "272", names: ["p-Aminophenol"] },
  { entry: "273", names: ["1-Hydroxyethyl-4,5-Diamino Pyrazole Sulfate"] },
  { entry: "274", names: ["4-Formyl-1-Methylquinolinium-p-Toluenesulfonate"] },
  { entry: "275", names: ["Basic Yellow 87"] },
  { entry: "276", names: ["Basic Orange 31"] },
  { entry: "277", names: ["2,6-Diamino-3-((Pyridine-3-yl)azo)Pyridine"] },
  { entry: "278", names: ["Basic Violet 2"] },
  { entry: "279", names: ["2,3-Diaminodihydropyrazolopyrazolone Dimethosulfonate"] },
  { entry: "280", names: ["Picramic Acid", "Sodium Picramate"] },
  { entry: "281", names: ["2-Nitro-5-Glyceryl Methylaniline"] },
  { entry: "283", names: ["5-Amino-6-Chloro-o-Cresol", "5-Amino-6-Chloro-o-Cresol HCl"] },
  { entry: "284", names: ["2,2'-Methylenebis-4-aminophenol HCl"] },
  { entry: "285", names: ["2,6-Diaminopyridine"] },
  { entry: "288", names: ["HC Blue No 17"] },
  { entry: "289", names: ["HC Blue No 15"] },
  { entry: "292", names: ["2-Methoxymethyl-p-Phenylenediamine", "2-Methoxymethyl-p-Phenylenediamine Sulfate"] },
  { entry: "293", names: ["Hydroxyanthraquinone-aminopropyl Methyl Morpholinium Methosulfate"] },
  { entry: "294", names: ["Disperse Red 17"] },
  { entry: "299", names: ["HC Yellow No 17"] },
  { entry: "300", names: ["1-Hexyl 4,5-Diamino Pyrazole Sulfate"] },
  { entry: "301", names: ["2,5,6-Triamino-4-Pyrimidinol Sulfate"] },
  { entry: "302", names: ["Hydroxyethoxy Aminopyrazolopyridine HCl"] },
  { entry: "303", names: ["3-Amino-2,6-Dimethylphenol"] },
  { entry: "305", names: ["Basic Blue 124"] },
  { entry: "313", names: ["HEMA"] },
  { entry: "314", names: ["DI-HEMA TRIMETHYLHEXYL DICARBAMATE"] },
  { entry: "315", names: ["Dimethylpiperazinium Aminopyrazolopyridine HCl"] },
  { entry: "316", names: ["Methylimidazoliumpropyl p-phenylenediamine HCl"] },
  { entry: "319", names: ["Tetrabromophenol Blue"] },
  { entry: "383", names: ["HC Blue No 18"] },
  { entry: "384", names: ["Hydroxypropyl-p-phenylenediamine", "Hydroxypropyl-p-phenylenediamine 2HCl"] },
  { entry: "385", names: ["HC Yellow No 16"] },
  { entry: "386", names: ["HC Red No 18"] },
];


const ORIGINAL = "Regulation (EC) No 1223/2009, Annex III";
const ADDED_BY = "Regulation (EU) 2023/1545";

/**
 * Benzyl alcohol (45): the entry applies only "for purposes other than
 * inhibiting the development of microorganisms in the product". A label cannot
 * tell which purpose it is there for, and nearly all of the 437 staging
 * products use it as a preservative, so it is never charged as an allergen.
 * It stays here so the decision can be seen (owner, #407, 6 October 2026).
 */
const EXEMPT: Readonly<Record<string, string>> = {
  "45": "The entry covers benzyl alcohol only when it is not there as a preservative, which a label cannot show.",
};

const tag = (entries: readonly RawEntry[], kind: EuAllergenKind, regulation: string): EuAllergenEntry[] =>
  entries.map(({ entry, names }) => ({ entry, kind, names, regulation, ...(EXEMPT[entry] ? { exempt: EXEMPT[entry] } : {}) }));

export const EU_ALLERGEN_ENTRIES: readonly EuAllergenEntry[] = [
  ...tag(FRAGRANCE_ENTRIES, "fragrance", ORIGINAL),
  ...tag(ADDED_BY_2023_1545, "fragrance", ADDED_BY),
  ...tag(ALLERGY_WARNING_ENTRIES, "allergy-warning", ORIGINAL),
];

/**
 * CosIng's INCI name for a substance Annex III prints under another spelling
 * (#439). The dictionary holds the substance under CosIng's name, so without
 * these a product listing "Acetylcedrene" was never matched to entry 327,
 * "Acetyl Cedrene".
 *
 * Each row was read off CosIng on 7 October 2026: `cosing` is the record's
 * number (`EU_ALLERGEN_COSING_SOURCE.url` + `/details/<number>`), and `cas` is
 * the CAS number on that record, which is the one the regulation prints for the
 * entry. Hydroxypropyl-p-Phenylenediamine HCl has no CAS number on its record;
 * CosIng's own Annex III/384 record (106936) names it. **Add a row only from a
 * CosIng record whose CAS number the entry prints**, never from a look-alike name.
 *
 * Not here on purpose: "Damascenone" (CosIng 104508), because that record also
 * covers CAS 23726-93-4, which entry 157 does not print, and a product carries
 * no CAS number to tell the two apart (Codex review). And, because CosIng has
 * no record under an INCI name: "trans-Rose ketone
 * 1" and "cis-Rose ketone 1" (157; CosIng files both CAS numbers under
 * Alpha-Damascone, which is on the list), "2,6-Dimethoxy-3,5-pyridinediamine"
 * (232, the base; only the HCl has a record) and "5-Amino-6-Chloro-o-Cresol
 * HCl" (283; only the base has one).
 */
export type CosingSpelling = { entry: string; name: string; cosing: number; cas: string | null };

export const COSING_SPELLINGS: readonly CosingSpelling[] = [
  { entry: "157", name: "Rose Ketone-4", cosing: 41492, cas: "23696-85-7" },
  { entry: "157", name: "Rose Ketone-3", cosing: 41491, cas: "57378-68-4" },
  { entry: "157", name: "Delta-Damascone", cosing: 87298, cas: "57378-68-4" },
  { entry: "157", name: "trans-Rose Ketone-3", cosing: 41519, cas: "71048-82-3" },
  { entry: "157", name: "cis-Rose Ketone-2", cosing: 41385, cas: "23726-92-3" },
  { entry: "157", name: "trans-Rose Ketone-2", cosing: 41518, cas: "23726-91-2" },
  { entry: "327", name: "Acetylcedrene", cosing: 39011, cas: "32388-55-9" },
  { entry: "8a", name: "p-Phenylenediamine Sulfate", cosing: 37251, cas: "16245-77-5" },
  { entry: "8c", name: "N,N'-Bis(2-Hydroxyethyl)-2-Nitro-p-Phenylenediamine", cosing: 35473, cas: "84041-77-0" },
  { entry: "204", name: "Dihydroxyindoline", cosing: 55796, cas: "29539-03-5" },
  { entry: "204", name: "Dihydroxyindoline HBr", cosing: 55797, cas: "138937-28-7" },
  { entry: "222", name: "2-Hydroxyethyl Picramic Acid", cosing: 31498, cas: "99610-72-7" },
  { entry: "223", name: "p-Methylaminophenol Sulfate", cosing: 36626, cas: "150-75-4" },
  { entry: "228", name: "Phenyl Methyl Pyrazolone", cosing: 36531, cas: "89-25-8" },
  { entry: "229", name: "2-Methyl-5-Hydroxyethylaminophenol", cosing: 31502, cas: "55302-96-0" },
  { entry: "273", name: "1-Hydroxyethyl 4,5-Diamino Pyrazole Sulfate", cosing: 54177, cas: "155601-30-2" },
  { entry: "277", name: "2,6-Diamino-3-((Pyridin-3-yl)azo)pyridine", cosing: 31478, cas: "28365-08-4" },
  { entry: "279", name: "2,3-Diaminodihydropyrazolo Pyrazolone Dimethosulfonate", cosing: 83274, cas: "857035-95-1" },
  { entry: "384", name: "Hydroxypropyl-p-Phenylenediamine HCl", cosing: 94208, cas: null },
];

/** Where the spellings above were read, and when. */
export const EU_ALLERGEN_COSING_SOURCE = {
  label: "EU CosIng ingredient database",
  url: "https://ec.europa.eu/growth/tools-databases/cosing",
  verified: "2026-10-07",
  verifiedBy: "read off CosIng's records by Claude (#439); not checked name by name by the owner",
} as const;

/**
 * The same lookup key everywhere, and the dictionary's own naming rule
 * (`normaliseDictionaryName` in scripts/import-inci-dictionary.mjs): lower
 * case, brackets read as spaces. Without the brackets rule a printed name such
 * as "Hydroxypropyl bis(N-hydroxyethyl-p-phenylenediamine) HCl" could never
 * equal the row the dictionary holds for it.
 */
const key = (name: string) => name.replace(/[()]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

const BY_NAME: ReadonlyMap<string, EuAllergenEntry> = (() => {
  const map = new Map<string, EuAllergenEntry>();
  for (const entry of EU_ALLERGEN_ENTRIES) {
    // First entry wins: p-phenylenediamine is printed under both 8a and 8b, which say the same thing.
    for (const name of entry.names) if (!map.has(key(name))) map.set(key(name), entry);
  }
  for (const spelling of COSING_SPELLINGS) {
    const entry = EU_ALLERGEN_ENTRIES.find((e) => e.entry === spelling.entry);
    if (entry && !map.has(key(spelling.name))) map.set(key(spelling.name), entry);
  }
  return map;
})();

/** The Annex III allergen or allergy-warning entry that names this ingredient, under the regulation's spelling or CosIng's, or undefined. Exact name only, never a pattern. */
export function euAllergenEntry(name: string): EuAllergenEntry | undefined {
  return BY_NAME.get(key(name));
}

/**
 * What the entry requires, in words, for the ingredient sheet. Only the label
 * duty is stated: the regulation's other limits on these substances (a
 * product type, a peroxide value) are not stored.
 */
export const EU_ALLERGEN_CONDITION: Record<EuAllergenKind, string> = {
  fragrance: "Must be named on the label above 0.001% in leave-on products or 0.01% in rinse-off products.",
  "allergy-warning": "Needs a warning about allergic reactions on the label.",
};

/** The words this feature adds to the app, all audited by `__tests__/claims-policy.test.ts`. */
export const EU_ALLERGEN_COPY = {
  /** The warning for a known fragrance allergen; `name` is how the ingredient reads on screen. */
  fragranceReason: (name: string) => `${name} is a known fragrance allergen. The EU requires it on labels so sensitive people can avoid it.`,
  /** The warning for an entry whose label text mentions an allergic reaction. */
  warningReason: (name: string) => `${name} can cause allergic reactions; the EU requires a warning on the label.`,
  /** What the sheet says for an exempt entry, whose label duty depends on why the substance is there. */
  exemptCondition: "The label duty applies only when it is not there as a preservative.",
  /** The line under the name in the product's ingredient list, where a rule gives none. */
  subtitle: {
    fragrance: "A fragrance allergen the EU requires on labels",
    "allergy-warning": "The EU requires an allergy warning on the label",
  } satisfies Record<EuAllergenKind, string>,
  /** Added when sensitivity isn't set (#183): says what the app did, never what the person said. */
  unsetNote: " Judged at the middle setting because your sensitivity isn't set.",
  /** The ingredient sheet's EU status, where "Restricted" and "No restriction" used to be. */
  limits: "Allowed with limits",
  /** Not "safe": the dictionary finding no entry is not a finding that the substance is safe (#469). */
  noneListed: "No EU listing found",
  /** The Safety tab's irritation card, where "restricted" used to be counted. */
  noneFlagged: "Nothing flagged",
  entries: (count: number) => `${count} EU-flagged ${count === 1 ? "entry" : "entries"}`,
} as const;
