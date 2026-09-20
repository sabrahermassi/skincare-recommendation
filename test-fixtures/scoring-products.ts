import type { ProductType } from "@/data/types";

/**
 * Versioned catalogue snapshots used by the scoring validation suite.
 *
 * The source URL identifies the public record, while `snapshotDate` and the
 * ordered INCI list pin the exact version tested. The companion dictionary
 * snapshot pins safety, verification and function metadata by INCI name,
 * matching how data/api.ts resolves real catalogue products. These are not
 * claims that a product is clinically effective or universally suitable.
 */
export const SCORING_FIXTURE_SCHEMA_VERSION = 1;

export type ScoringProductFixture = {
  id: string;
  name: string;
  type: ProductType;
  sourceUrl: string;
  snapshotDate: `${number}-${number}-${number}`;
  inci: readonly string[];
  caution: readonly string[];
  avoid: readonly string[];
};

const inci = (orderedNames: string): string[] =>
  orderedNames.split(";").map((name) => name.trim());

export const SCORING_PRODUCTS = [
  {
    id: "dailymed-0b92a940-0dd4-4266-bd47-88c27def62c0",
    name: "SkinCeuticals Future Mineral UV Defense SPF 50",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0b92a940-0dd4-4266-bd47-88c27def62c0",
    snapshotDate: "2026-09-18",
    inci: inci("titanium dioxide; zinc oxide; water; c15-19 alkane; glycerin; dicaprylyl carbonate; niacinamide; propanediol; cetearyl isononanoate; polyhydroxystearic acid; dimethicone; ethylhexyl methoxycrylene; cellulose; triethylhexanoin; isohexadecane; triethoxycaprylylsilane; steareth-20; silica; glyceryl stearate; polysorbate 20; steareth-2; cetearyl alcohol; panthenol; hydroxyacetophenone; aluminum stearate; diethylhexyl syringylidenemalonate; caprylyl glycol; acrylates/c10-30 alkyl acrylate crosspolymer; alumina; chlorphenesin; xanthan gum; tocopherol; sodium carboxymethyl beta-glucan; caprylic/capric triglyceride; citric acid"),
    caution: [],
    avoid: ["c15-19 alkane"],
  },
  {
    id: "dailymed-0e9cd3e5-cff8-7594-e063-6394a90aad90",
    name: "Innisfree Daily UV Defense Mineral Sunscreen",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0e9cd3e5-cff8-7594-e063-6394a90aad90",
    snapshotDate: "2026-09-18",
    inci: inci("zinc oxide; water / aqua / eau; propylheptyl caprylate; butyloctyl salicylate; propanediol; caprylyl methicone; disiloxane; polyglyceryl-3 polydimethylsiloxyethyl dimethicone; polymethylsilsesquioxane; polyglyceryl-2 dipolyhydroxystearate; disteardimonium hectorite; magnesium sulfate; triethoxycaprylylsilane; 1,2-hexanediol; silica; lauryl polyglyceryl-3 polydimethylsiloxyethyl dimethicone; synthetic fluorphlogopite; dicaprylyl carbonate; caprylyl glycol; glyceryl caprylate; chromium oxide greens; mica; ethylhexylglycerin; sodium hyaluronate; tocopherol; squalane; ceramide np; niacinamide; hydrolyzed sodium hyaluronate; panthenol; butylene glycol; centella asiatica extract; centella asiatica leaf extract; saccharomyces ferment; centella asiatica root extract; hydroxypropyltrimonium hyaluronate; asiaticoside; madecassoside; hydrolyzed hyaluronic acid; sodium acetylated hyaluronate; hyaluronic acid; sodium hyaluronate crosspolymer; potassium hyaluronate; asiatic acid; madecassic acid"),
    caution: [],
    avoid: [],
  },
  {
    id: "dailymed-129ae274-0094-be5e-e063-6394a90a9801",
    name: "Neutrogena Moistureshine Lip Soother SPF 20",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=129ae274-0094-be5e-e063-6394a90a9801",
    snapshotDate: "2026-09-18",
    inci: inci("butyl methoxydibenzoylmethane; homosalate; octocrylene; polybutene; bis-diglyceryl polyacyladipate-2; glycerin; octyldodecanol; synthetic beeswax; diisocetyl dodecanedioate; ricinus communis seed oil; behenyl alcohol; polyglyceryl-3 stearate; carthamus tinctorius seed oil; silica silylate; fragrance; menthol; laminaria saccharina extract; spirulina maxima extract; pentaerythrityl tetra-di-t-butyl hydroxyhydrocinnamate; saccharin; aloe barbadensis leaf extract; chamomilla recutita flower extract; cucumis sativus fruit extract; tin oxide; ascorbyl palmitate; tocopherol; glycine soja oil; mica; titanium dioxide; iron oxides; red 7 lake; blue 1 lake"),
    caution: [],
    avoid: [],
  },
  {
    id: "dailymed-140268a9-adb9-4574-ad82-4a2e924dc808",
    name: "Hero Force Shield Superlight Sunscreen SPF 30",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=140268a9-adb9-4574-ad82-4a2e924dc808",
    snapshotDate: "2026-09-18",
    inci: inci("zinc oxide; water; caprylic/capric triglyceride; c13-15 alkane; propanediol; c15-19 alkane; bis-diglyceryl polyacyladipate-2; butyloctyl salicylate; ectoin; alteromonas ferment extract; harungana madagascariensis extract; ipomoea batatas root extract; rubus idaeus seed oil; camellia sinensis leaf extract; corallina officinalis extract; curcuma longa leaf extract; melia azadirachta flower extract; melia azadirachta leaf extract; mori nga oleifera seed oil; ocimum sanctum leaf extract; orvza sativa hull extract; solanum melongena fruit extract; cocci nia indica fruit extract; tocopherol; bisabolol; amber powder; coco-glucoside; glucose; glycerin; xanthan gum; 1,2-hexanediol; caprylhydroxamic acid; arachidyl alcohol; arachidyl glucoside; hydroxyacetophenone; polyacrylate crosspolymer-6; behenyl alcohol; cetearyl alcohol; isostearic acid; lecithin; polyglycerin-3; polyglyceryl-3 lactate/laurate; polyglyceryl-3 polyricinoleate; polyhydroxystearic acid; silica; sodium benzoate; sodium citrate; sodium dilauramidoglutamide lysine; sodium phytate; citric acid; inositol; lactobacillus ferment lysate; saccharomyces lysate; butylene glycol; caprylyl glycol"),
    caution: [],
    avoid: ["c15-19 alkane"],
  },
  {
    id: "dailymed-14a9b605-f1f0-00e5-e063-6394a90a5a51",
    name: "Badger SPF 30 Face Mineral Sunscreen",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=14a9b605-f1f0-00e5-e063-6394a90a5a51",
    snapshotDate: "2026-09-18",
    inci: inci("zinc oxide; caprylic/capric triglyceride; helianthus annuus seed wax; amylopectin; helianthus annuus seed oil; hydrogenated castor oil; tocopherol; cocos nucifera fruit extract; laminaria digitata extract =certified organic"),
    caution: [],
    avoid: [],
  },
  {
    id: "dailymed-1c31f466-6a0d-46ce-9346-d2a0eb46c8d0",
    name: "365 Clear Coconut Vanilla Sunscreen SPF 30",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1c31f466-6a0d-46ce-9346-d2a0eb46c8d0",
    snapshotDate: "2026-09-18",
    inci: inci("bisabolol; butyloctyl salicylate; butyrospermum parkii butter; c12-15 alkyl benzoate; calendula ofﬁcinalis flower extract; camellia sinensis leaf extract; capryloyl glycerin/sebacic acid copolymer; cocos nucifera oil; cucumis sativus fruit extract; ethylhexyl palmitate; glycerin; hydrogenated methyl abietate; natural fragrance complies with iso 9235; rosa canina fruit oil; sorbitan sesquioleate; tocopherol; tridecyl salicylate"),
    caution: [],
    avoid: [],
  },
  {
    id: "dailymed-228dcd68-aaba-0451-e063-6394a90a8ad0",
    name: "Round Lab Birch Juice Moisturizing UVLock SPF 50",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=228dcd68-aaba-0451-e063-6394a90a8ad0",
    snapshotDate: "2026-09-18",
    inci: inci("butyl methoxydibenzoylmethane; homosalate; ethylhexyl salicylate; water; butyloctyl salicylate; propanediol; acrylates copolymer; butylene glycol; caprylyl methicone; polyglyceryl-3 distearate; benzotriazolyl dodecyl p-cresol; niacinamide; diethylhexyl 2,6-naphthalate; polymethylsisesquioxane; glycerin; calcium aluminum borosilicate; 1,2-hexanediol; poly c10-30 alkyl acrylate; pentylene glycol; cetearyl aloohol; tromethamine; methy propanediol; glyceryl stearate citrate; betula platyphylla japonica juice; acrylates/c10-30 alkyl acrylate crosspolymer; carbomer; ethylhexylglycerin; artemisia annua extract; anthemis nobilis flower oil; sodium stearoyl glutamate; glyceryl polymethacrylate; triethoxycaprylylsilane; pinus sylvestris leaf oil; sparassis crispa extract; polyether-1; allantoin; di-propylene glycol; glyceryl glucoside; biosaccharide gum-1; tocopherol; portulaca oleracea extract; sodium hyaluronate; hyaluronic acid; ascorbic acid"),
    caution: ["tromethamine", "pinus sylvestris leaf oil"],
    avoid: [],
  },
  {
    id: "dailymed-37fee381-ce6b-4949-9a4a-778aa839fb84",
    name: "EltaMD UV Restore",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=37fee381-ce6b-4949-9a4a-778aa839fb84",
    snapshotDate: "2026-09-18",
    inci: inci("titanium dioxide; zinc oxide; water; coco-caprylate/caprate; butyloctyl salicylate; octyldodecyl neopentanoate; caprylic/capric triglyceride; methyl glucose sesquistearate; silica; glyceryl stearate; peg-100 stearate; peg-20 methyl glycose sesquisterate; phenoxyethanol; triethoxycaprylylsilane; polyhydroxystearic acid; glycerin; saccharide isomerate; glyceryl behenate; xanthan gum; zingiber officiale root extract; hydroxyethyl acrylate/sodium acryloyldimethyl taurate copolymer; squalene; ethylhexylglycerin; tocopheryl acetate; sclerotium gum; lecithin; pulluan; dimethicone; polysorbate 60; ethylene/methacrylate copolymer; mica"),
    caution: [],
    avoid: [],
  },
  {
    id: "dailymed-4ce63abb-e716-40de-e063-6394a90a6e76",
    name: "Neutrogena Clear Face Serum Sunscreen SPF 60",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4ce63abb-e716-40de-e063-6394a90a6e76",
    snapshotDate: "2026-09-18",
    inci: inci("butyl methoxydibenzoylmethane; homosalate; ethylhexyl salicylate; octocrylene; water; butyloctyl salicylate; glycerin; silica; triacontanyl pvp; trilaureth-4 phosphate; aluminum starch octenylsuccinate; phenoxyethanol; dimethicone; hydroxyacetophenone; sodium acryloyldimethyltaurate/vp crosspolymer; bisabolol; glyceryl stearate; chlorphenesin; disodium edta; tocopheryl acetate; camellia sinensis leaf extract; butylene glycol; sodium hydroxide"),
    caution: ["sodium hydroxide"],
    avoid: [],
  },
  {
    id: "dailymed-51d59378-df72-e438-e063-6294a90a97f1",
    name: "Aveeno Daily Moisturizing Face Sunscreen SPF 30",
    type: "sunscreen",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=51d59378-df72-e438-e063-6294a90a97f1",
    snapshotDate: "2026-09-18",
    inci: inci("butyl methoxydibenzoylmethane; homosalate; ethylhexyl salicylate; octocrylene; water; silica; caprylyl methicone; diisopropyl adipate; dimethicone; potassium cetyl phosphate; avena sativa kernel flour; hydrolyzed jojoba esters; jojoba esters; tocopheryl acetate; benzyl alcohol; synthetic beeswax; glyceryl stearate; peg-100 stearate; cetyl dimethicone; caprylyl glycol; ethylhexylglycerin; behenyl alcohol; sodium polyacrylate; acrylates/dimethicone copolymer; xanthan gum; chlorphenesin; dimethicone/peg-10/15 crosspolymer; ethylhexyl stearate; disodium edta; bht; trideceth-6"),
    caution: ["benzyl alcohol"],
    avoid: [],
  },
  {
    id: "obf-0769915190373",
    name: "The Ordinary Lactic Acid 10% + HA",
    type: "serum",
    sourceUrl: "https://world.openbeautyfacts.org/product/0769915190373",
    snapshotDate: "2026-09-18",
    inci: inci("aqua; lactic acid; glycerin; pentylene glycol; propanediol; sodium hydroxide; sodium hyaluronate crosspolymer; tasmannia lanceolata fruit/leaf extract; acacia senegal gum; xanthan gum; isoceteth-20; trisodium ethylenediamine disuccinate; ethylhexylglycerin; 1,2-hexanediol; caprylyl glycol"),
    caution: ["sodium hydroxide"],
    avoid: [],
  },
  {
    id: "obf-0769915233506",
    name: "The Ordinary Hyaluronic Acid 2% + B5",
    type: "unknown",
    sourceUrl: "https://world.openbeautyfacts.org/product/0769915233506",
    snapshotDate: "2026-09-18",
    inci: inci("aqua/water/eau; sodium hyaluronate; propandiol; pentylene glycol; hydrolyzed hyaluronic acid; sodium hyaluronate crosspolymer; phospholipids; sphingolipids; panthenol; anthemis nobilis flower extract; glycerin; polysorbate 20; citric acid; sodium citrate; panisic acid; tocopherol; trisodium ethylenediamine disuccinate; caprylyl glycol; ethoxydiglycol; ethylhexylglycerin; hexylene glycol; phenoxyethanol; chlorphenesin"),
    caution: ["ethoxydiglycol"],
    avoid: [],
  },
  {
    id: "obf-0769915233179",
    name: "The Ordinary Multi-Peptide + Copper Peptides 1% Serum",
    type: "serum",
    sourceUrl: "https://world.openbeautyfacts.org/product/0769915233179",
    snapshotDate: "2026-09-18",
    inci: inci("aqua; glycerin; lactococcus ferment lysate; copper tripeptide-1; acetyl hexapeptide-8; pentapeptide-18; palmitoyl tripeptide-1; palmitoyl tetrapeptide-7; palmitoyl tripeptide-38; dipeptide diaminobutyroyl benzylamide diacetate; acetylarginyltryptophyl diphenylglycine; sodium hyaluronate crosspolymer; sodium hyaluronate; allantoin; glycine; alanine; serine; valine; isoleucine; proline; threonine; histidine; phenylalanine; arginine; aspartic acid; trehalose; fructose; glucose; maltose; urea; sodium pca; pca; sodium lactate; citric acid; hydroxypropyl cyclodextrin; sodium chloride; sodium hydroxide; butylene glycol; pentylene glycol; acacia senegal gum; xanthan gum; carbomer; polysorbate 20; dimethyl isosorbide; sodium benzoate; caprylyl glycol; ethylhexylglycerin; phenoxyethanol; chlorphenesin"),
    caution: ["sodium hydroxide"],
    avoid: [],
  },
  {
    id: "obf-8699956514185",
    name: "Bioderma Atoderm Cream Ultra",
    type: "moisturizer",
    sourceUrl: "https://world.openbeautyfacts.org/product/8699956514185",
    snapshotDate: "2026-09-18",
    inci: inci("aqua/water/eau; paraffinum liquidum/mineral oil/huile minerale; glycerin; brassica campestris seed oil; sodium polyacrylate; pentylene glycol; cetearyl alcohol; 1,2-hexanediol; caprylyl glycol; acrylates/c10-30 alkyl acrylate crosspolymer; sodium citrate; xylitol; cetearyl glucoside; mannitol; tocopherol; rhamnose; xylitylglucoside; helianthus annuus seed oil; anhydroxylitol; niacinamide; glucose; fructooligosaccharides; caprylic/capric triglyceride; laminaria ochroleuca extract"),
    caution: [],
    avoid: [],
  },
  {
    id: "obf-0717334243408",
    name: "Origins GinZing Ultra-Hydrating Energy-Boosting Cream",
    type: "moisturizer",
    sourceUrl: "https://world.openbeautyfacts.org/product/0717334243408",
    snapshotDate: "2026-09-18",
    inci: inci("water\\aqua\\eau; glycerin; caprylic/capric triglyceride; c12-20 acid peg-8 ester; simmondsia chinensis seed oil; caprylic/capric/myristic/stearic triglyceride; hydroxyethyl urea; cetyl alcohol; niacinamide; dimethicone; butylene glycol; sodium polyaspartate; ammonium acryloyldimethyltaurate/vp copolymer; citrus limon peel oil; citrus grandis peel oil; mentha viridis leaf oil; citrus aurantium dulcis peel oil; limonene; linalool; citral; panax ginseng root extract; hordeum vulgare extract; salicylic acid; algae extract; linoleic acid; caffeine; sucrose; cucumis sativus fruit extract; trehalose; ophiopogon japonicus root extract; sorbitol; phospholipids; tocopheryl acetate; tocopherol; coffea arabica seed oil; arginine; sodium hyaluronate; butyrospermum parkii; helianthus annuus seedcake; squalane; ethylhexylglycerin; caprylyl glycol; peg-100 stearate; glyceryl stearate; potassium cetyl phosphate; acrylates/c10-30 alkyl acrylate crosspolymer; behenyl alcohol; xanthan gum; carbomer; sodium hydroxide; disodium edta; chlorphenesin; potassium sorbate; phenoxyethanol"),
    caution: ["limonene", "linalool", "citral", "salicylic acid", "sodium hydroxide"],
    avoid: [],
  },
  {
    id: "obf-4005900773845",
    name: "Nivea Rose Care",
    type: "moisturizer",
    sourceUrl: "https://world.openbeautyfacts.org/product/4005900773845",
    snapshotDate: "2026-09-16",
    inci: inci("aqua; alcohol denat; isopropyl palmitate; glycerin; dimethicone; glyceryl stearate se; cetearyl alcohol; xanthan gum; sodium cetearyl sulfate; tocopheryl acetate; citric acid; panthenol; rosa damascena flower water; potassium sorbate; sodium benzoate; sorbic acid; linalool; citronellol; limonene; geraniol; methyl benzoate; bht; parfum"),
    caution: ["linalool", "citronellol", "limonene", "geraniol"],
    avoid: [],
  },
  {
    id: "obf-42420125",
    name: "Nivea Active Energy Hydro Gesichtsgel",
    type: "moisturizer",
    sourceUrl: "https://world.openbeautyfacts.org/product/42420125",
    snapshotDate: "2026-09-16",
    inci: inci("aqua; alcohol denat; glycerin; peg-8; menthol; mentha aquatica extract; distarch phosphate; carbomer; peg-40 hydrogenated castor oil; acrylates/c10-30 alkyl acrylate crosspolymer; sodium hydroxide; sodium sulfate; phenoxyethanol; linalool; limonene; citronellol; alpha-isomethyl ionone; parfum; ci 42090"),
    caution: ["sodium hydroxide", "linalool", "limonene", "citronellol", "alpha-isomethyl ionone"],
    avoid: [],
  },
  {
    id: "obf-8809416471655",
    name: "COSRX Two in One Poreless Power Liquid",
    type: "toner",
    sourceUrl: "https://world.openbeautyfacts.org/product/8809416471655",
    snapshotDate: "2026-09-18",
    inci: inci("salix alba bark water; butylene glycol; hydroxypropyl cyclodextrin; aqua; pentylene glycol; 1,2-hexanediol; betaine salicylate; arginine; betaine; peg-60 hydrogenated castor oil; allantoin; panthenol; ethylhexylglycerin; sodium hyaluronate; carbomer; cassia obtusifolia seed extract; menthyl lactate; mentha haplocalix extract"),
    caution: [],
    avoid: [],
  },
  {
    id: "obf-8809657116544",
    name: "Round Lab Birch Juice Cleanser",
    type: "cleanser",
    sourceUrl: "https://world.openbeautyfacts.org/product/8809657116544",
    snapshotDate: "2026-09-18",
    inci: inci("aqua; glycerin; sodium cocoyl alaninate; lauryl hydroxysultaine; disodium cocoamphodiacetate; sodium methyl cocoyl taurate; acrylates/c10-30 alkyl acrylate crosspolymer; butylene glycol; 1,2 - hexanediol; sodium chloride; caprylyl glycol; coco - glucoside; artemisia annua extract; citric acid; sodium cocoyl isethionate; betula platyphylla japonica juice; disodium edta; anthemis nobilis flower oil; pinus sylvestris leaf oil; hexylene glycol; quillaja saponaria bark extract; glyceryl caprylate; glyceryl glucoside; sodium hyaluronate; hyaluronic acid; ascorbic acid"),
    caution: ["pinus sylvestris leaf oil"],
    avoid: [],
  },
  {
    id: "obf-8809843673431",
    name: "Innisfree Green Tea Balancing Skin Toner",
    type: "toner",
    sourceUrl: "https://world.openbeautyfacts.org/product/8809843673431",
    snapshotDate: "2026-09-18",
    inci: inci("water; propanediol; butylene glycol; glycerin; camellia sinensis leaf water; 1,2-hexanediol; betaine; peg-60 hydrogenated castor oil; ethylhexylglycerin; disodium edta; sodium hyaluronate; citric acid; sodium citrate; fragrance"),
    caution: [],
    avoid: [],
  },
  {
    id: "dailymed-950edb4e-fbba-41e3-9ec5-973806e555e7",
    name: "Walmart Acne Treatment 10% Benzoyl Peroxide Gel",
    type: "unknown",
    sourceUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=950edb4e-fbba-41e3-9ec5-973806e555e7",
    snapshotDate: "2026-09-19",
    // The active is listed first as the importer does; the label prints its
    // inactives alphabetically, so those positions carry no concentration.
    inci: inci("benzoyl peroxide; carbomer; disodium edta; hydroxypropyl methylcellulose; laureth-4; sodium hydroxide; water"),
    caution: ["benzoyl peroxide", "sodium hydroxide"],
    avoid: [],
  },
] satisfies readonly ScoringProductFixture[];
