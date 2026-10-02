import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { dumpReason, readDump } from "../scripts/import-obf.mjs";
import { FACE_TYPES, notFaceSkincareReason } from "../scripts/lib/face-skincare.mjs";

/**
 * The relevance gate for the whole-database import (`import-obf.mjs --dump`).
 * Every "dropped" case below is a real product from the 2 October 2026 dump
 * that the type guess had filed under a face-care type.
 */

const keep = (type: string, name: string, brand = "Brand", categories: string[] = []) => notFaceSkincareReason({ type, name, brand, categories });

describe("what the whole-database import keeps", () => {
  it.each([
    ["serum", "Madeca Azelaic Acid Serum", "COSMAX Inc."],
    ["serum", "C-Firma™ Vitamin C Day Serum", "Drunk Elephant"],
    ["cleanser", "The INKEY List Salicylic Acid Cleanser", "The INKEY"],
    ["cleanser", "Clean It Zero Foam Cleanser", "Banila Co"],
    ["moisturizer", "Nachtcreme Anti-Falten Q10", "Balea"],
    ["moisturizer", "Gesichtscreme Gel Aqua", "Balea"],
    ["sunscreen", "Aqua Rich Mild Watery Essence SPF50+ PA++++", "Bioré"],
    ["toner", "Two in One Poreless Power Liquid", "COSRX"],
    ["essence", "Snail Bee High Content Essence", "Benton"],
    ["eye-cream", "AYZ ooglid crème", "AYZ"],
  ])("keeps a %s: %s", (type: string, name: string, brand: string) => {
    expect(keep(type, name, brand)).toBeNull();
  });

  it("keeps only the types a face routine uses", () => {
    for (const type of ["shampoo", "body-wash", "deodorant", "hand-cream", "lip-balm", "perfume", "unknown"]) {
      expect(FACE_TYPES.has(type)).toBe(false);
      expect(keep(type, "Anything")).toBe("not a face-care type");
    }
  });
});

describe("what it drops, though the type guess called it face care", () => {
  it.each([
    ["moisturizer", "Isana Cremeseife Milch & Honig", "Rossmann"],
    ["moisturizer", "Care Cream hand soap", ""],
    ["serum", "Palmolive Hygiene-Plus Kitchen Antibacteriële Handzeep", "Palmolive"],
    ["moisturizer", "crema corporal dove", "Unknown"],
    ["moisturizer", "Nivea crema para manos antiarrugas Q10", "Nivea"],
    ["moisturizer", "Dermasel Fusscreme Happy Moments", "Dermasel"],
    ["moisturizer", "Atrix Handcrème", "Atrix"],
    ["cleanser", "Gillette Gevoelige huid scheergel", "Gillette"],
    ["cleanser", "Mousse à raser Casino", "Casino"],
    ["cleanser", "Curl Talk Volume Foam", "Not Your Mother's"],
    ["serum", "Maybelline Serum Lipstick Maybe It's Soft each", "L'Oréal"],
    ["serum", "Silk soft baby wipes", "Baby Wipes"],
    ["serum", "Leave-In Serum Plex Care", "Balea PROFESSIONAL"],
    ["serum", "TRESemme Keratin Smooth Serum 100mL", "TRESemme"],
    ["essence", "Essence Lash Princess False Lash Effect Black Mascara", "Essence"],
    ["essence", "herbal essences champu", ""],
    ["essence", "Eau de cologne naturelle* aux essences naturelles", "Auchan"],
    ["toner", "Bright White Crème Toner Icy White", "ion"],
    ["face-mask", "superhairfood", "NOVEX"],
    ["moisturizer", "Zahnpasta 7 Actions Komplettschutz", "Unilever"],
  ])("drops a so-called %s: %s", (type: string, name: string, brand: string) => {
    expect(keep(type, name, brand)).not.toBeNull();
  });

  // What the first run over the whole export let into staging (2 October
  // 2026): the kind of product written as the end of one long word, where a
  // whole-word match never looked, and lip products other than a "lip balm".
  it.each([
    ["moisturizer", "Cremedusche Mandelblüte & Magnolie, Reisegröße", "Balea"],
    ["moisturizer", "Enthaarungscreme", "Balea"],
    ["moisturizer", "Eurodont Spezialzahncreme", "Eurodont"],
    ["moisturizer", "Föhnlotion Volume Effect", "Balea"],
    ["moisturizer", "Deocreme Sensitive", "Balea"],
    ["sunscreen", "Deospray Sweet Sunshine", "Balea"],
    ["moisturizer", "Bodycreme Sheabutter & Arganöl", "Balea"],
    ["moisturizer", "Ritual of Mehr Bodycream", "Rituals"],
    ["moisturizer", "Handlotion Creme-Öl", "Balea"],
    ["serum", "Handserum Hyaluron", "Balea"],
    ["moisturizer", "SEBAMED FUẞCREME", "SEBAMED"],
    ["moisturizer", "Creme-Öl Bad Soft LOTUS DREAM", "Balea"],
    ["exfoliator", "Perfect Lip Scrub", "LimeLife by Alcone"],
    ["moisturizer", "Nivea lip cream", "Unknown"],
  ])("drops a so-called %s whose name is one long word: %s", (type: string, name: string, brand: string) => {
    expect(keep(type, name, brand)).toBe("named as another kind of product");
  });

  it("keeps a face product that only names another part of the body in passing", () => {
    expect(keep("micellar-water", "Micellar water eyes face & lips", "Delhaize")).toBeNull();
    expect(keep("moisturizer", "Handmade Rose Face Cream", "Atelier")).toBeNull();
    expect(keep("essence", "Snail Bee High Content Essence", "Benton")).toBeNull();
  });

  it("drops a product OBF itself tags as hair, body, shaving or make-up", () => {
    for (const tag of ["en:hair", "en:shampoos", "en:body-creams", "en:shaving-foam", "en:makeup", "en:baby-wipes", "en:hand-creams", "en:perfumes"]) {
      expect({ tag, reason: keep("moisturizer", "Plain cream", "Brand", [tag]) }).toEqual({ tag, reason: "tagged as another kind of product" });
    }
  });
});

describe("a product read from the whole database", () => {
  const row = (name: string, brand = "Brand") => ({ product: { name, brand } });

  it("is kept on OBF's own word when it is in a category the API sweep pages", () => {
    // Just as that sweep keeps it: a hand cream filed under en:creams stays.
    expect(dumpReason({ categories_tags: ["en:creams"] }, row("Atrix Handcrème"))).toBeNull();
  });

  it("has to show it is face care otherwise, by its name and tags and not by its ingredients", () => {
    expect(dumpReason({ categories_tags: [] }, row("Vitamin C Glowing Serum"))).toBeNull();
    expect(dumpReason({ categories_tags: [] }, row("Atrix Handcrème"))).not.toBeNull();
    // Nothing in the name says what it is: the ingredient guess is not trusted here.
    expect(dumpReason({ categories_tags: [] }, row("Revitalift"))).toBe("not a face-care type");
    expect(dumpReason({}, row("Studio Line Go Create Ultra-Precis Spray"))).toBe("not a face-care type");
  });
});

describe("reading OBF's export file", () => {
  const dir = mkdtempSync(join(tmpdir(), "obf-dump-"));
  const lines = [JSON.stringify({ code: "1", product_name: "A" }), "", "{ not json", JSON.stringify({ code: "2", product_name: "B" })].join("\n");

  it("yields every product, gzipped or plain, and skips a line it cannot read", async () => {
    const plain = join(dir, "products.jsonl");
    const zipped = join(dir, "products.jsonl.gz");
    writeFileSync(plain, lines);
    writeFileSync(zipped, gzipSync(lines));
    for (const path of [plain, zipped]) {
      const codes: string[] = [];
      for await (const product of readDump(path)) codes.push(product.code);
      expect(codes).toEqual(["1", "2"]);
    }
  });
});
