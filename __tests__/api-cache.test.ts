/**
 * The cached side of `data/api.ts` — the Supabase branch.
 *
 * `api.test.ts` covers the sample-data path, where the cache is deliberately
 * inert, so none of the wiring added with the catalogue cache was exercised by
 * anything: cache-hit routing, the once-per-launch freshness check, the 24h
 * ceiling, and the order the cold path issues its two requests in. A real bug
 * lived in exactly that gap — the cold path used to race the watermark against the rows
 * and could persist stale rows under a current watermark, which every later
 * freshness check would then agree was up to date.
 *
 * So these tests assert on *which requests are made, and in what order*, not
 * just on returned values.
 */

const mockCalls: string[] = [];
let mockProductRows: Record<string, unknown>[] = [];
let mockRowCount = 0;
let mockNewestFetchedAt: string | null = null;
let mockDictionaryRows: Record<string, unknown>[] = [];
let mockDictionaryCount = 0;
let mockNewestUpdatedAt: string | null = null;

/**
 * A Supabase stand-in thin enough to read.
 *
 * `from("products").select(...)` is used two ways in the file under test: a
 * full-catalogue read, and the watermark read, which is the one that chains
 * `.order().limit()`. The builder records which of those happened and resolves
 * to the matching shape — the distinction being what most of these tests turn
 * on.
 */
function mockMakeQuery(table: string, selectArg: string) {
  const select = selectArg.trim();
  const dictionary = table === "catalogue_ingredients";
  const isWatermark = select === "fetched_at" || select === "updated_at";
  const label = dictionary
    ? isWatermark
      ? "dict-watermark"
      : "dict"
    : isWatermark
      ? "watermark"
      : "rows";
  const source = dictionary ? mockDictionaryRows : mockProductRows;
  // Single-row reads and the Edge Functions still ask for the formula inlined;
  // only the catalogue read takes the lean join. The stand-in answers in
  // whichever shape it was asked for, so a test cannot pass against a shape
  // the server would never send.
  // Matching on the nested select, not on "ingredients (" — the lean join is
  // spelled `product_ingredients ( position, inci_name )`, which contains that
  // substring too and would send every catalogue read the fat shape.
  const inlined = select.includes("ingredients ( inci_name");
  const expand = (r: Record<string, unknown>) => ({
    ...r,
    product_ingredients: (r.product_ingredients as { position: number; inci_name: string }[]).map(
      (join) => ({
        position: join.position,
        ingredients: mockDictionaryRows.find((d) => d.inci_name === join.inci_name) ?? null,
      }),
    ),
  });
  const shape = (rows: Record<string, unknown>[]) => (inlined ? rows.map(expand) : rows);
  const builder: Record<string, unknown> = {};
  // Recorded so `maybeSingle` can honour the id it was asked for. Without it
  // the by-id test passes even when the wrong product comes back.
  let wantedId: string | undefined;
  const chain =
    (name: string) =>
    (...args: unknown[]) => {
      if (name === "eq" && args[0] === "id") wantedId = args[1] as string;
      return builder;
    };
  // The range the caller asked for, so the stand-in can actually paginate
  // rather than handing back the whole set for every page — the difference
  // between a pagination test that means something and one that cannot fail.
  let range: [number, number] | null = null;
  for (const m of ["eq", "in", "or", "order", "limit", "abortSignal"]) {
    builder[m] = chain(m);
  }
  builder.range = (from: number, to: number) => {
    range = [from, to];
    return builder;
  };
  // `fetchProduct` ends its chain here rather than awaiting the builder.
  builder.maybeSingle = () => {
    mockCalls.push(label);
    const match = mockProductRows.find((r) => r.id === wantedId) ?? null;
    return Promise.resolve({ data: match ? shape([match])[0] : null, error: null });
  };
  builder.then = (resolve: (v: unknown) => void) => {
    mockCalls.push(label);
    const paged = shape(range ? source.slice(range[0], range[1] + 1) : source);
    const watermark = dictionary
      ? { data: [{ updated_at: mockNewestUpdatedAt }], error: null, count: mockDictionaryCount }
      : { data: [{ fetched_at: mockNewestFetchedAt }], error: null, count: mockRowCount };
    return Promise.resolve(
      isWatermark ? watermark : { data: paged, error: null, count: null },
    ).then(resolve);
  };
  return builder;
}

jest.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: true,
  LOOKUP_FUNCTION: "product-lookup",
  OCR_FUNCTION: "label-ocr",
  supabase: {
    from: (table: string) => ({ select: (arg: string) => mockMakeQuery(table, arg) }),
    functions: { invoke: jest.fn() },
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  analyseLabel,
  CATALOGUE_PAGE_SIZE,
  fetchProduct,
  fetchProducts,
  fetchProductsByIds,
  fetchProductTypes,
  FOREGROUND_RECHECK_MS,
  revalidateOnForeground,
  searchProducts,
  warmCatalogue,
} from "@/data/api";
import {
  DISK_TTL_MS,
  peekCatalogue,
  putScanned,
  readScanned,
  resetCatalogueCache,
} from "@/data/catalogue-cache";
import { supabase } from "@/lib/supabase";

function row(id: string, type = "serum") {
  return {
    id,
    barcode: `barcode-${id}`,
    brand: "Test Brand",
    name: `Product ${id}`,
    type,
    description: "A product.",
    image_url: null,
    volume: "50ml",
    price_krw: 20000,
    in_stock: true,
    suitable_for: [],
    targets: [],
    source: "obf",
    attribution: "Open Beauty Facts, ODbL",
    fetched_at: "2026-09-08T11:26:56Z",
    // The lean join the catalogue read asks for: a name and a position, with
    // the definition arriving once in the dictionary read beside it.
    product_ingredients: [{ position: 1, inci_name: "aqua" }],
  };
}

/**
 * The same product as the Edge Functions return it: formula inlined. They do
 * not use the lean catalogue select, so a test that fed them `row()` would be
 * asserting against a shape the server never sends.
 */
function inlinedRow(id: string) {
  const base = row(id);
  return {
    ...base,
    product_ingredients: base.product_ingredients.map((join) => ({
      position: join.position,
      ingredients: dictionaryRow(join.inci_name),
    })),
  };
}

function dictionaryRow(inciName: string) {
  return {
    inci_name: inciName,
    comedogenic: null,
    safety: "safe",
    note: null,
    verified: true,
    functions: ["solvent"],
    updated_at: "2026-09-08T11:26:56Z",
  };
}

beforeEach(async () => {
  await resetCatalogueCache();
  await AsyncStorage.clear();
  mockCalls.length = 0;
  mockProductRows = [row("a"), row("b", "cleanser")];
  mockRowCount = 2;
  mockNewestFetchedAt = "2026-09-08T11:26:56Z";
  mockDictionaryRows = [dictionaryRow("aqua")];
  mockDictionaryCount = 1;
  mockNewestUpdatedAt = "2026-09-08T11:26:56Z";
});

describe("the cold path", () => {
  /**
   * The regression this file exists for. Fetching the watermark and the rows
   * concurrently can pair rows read *before* an import commits with a
   * watermark read *after* it — stale rows stored under a current watermark,
   * which no later freshness check will ever question. Reading the watermark
   * first fails the safe way round instead.
   */
  it("reads the watermark before the rows", async () => {
    await fetchProducts();

    expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
  });

  it("populates the cache and returns the products", async () => {
    const products = await fetchProducts();

    expect(products).toHaveLength(2);
    expect(peekCatalogue()).not.toBeNull();
  });
});

describe("cache hits", () => {
  it("issues no further requests once warm", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    await fetchProducts();
    await fetchProducts();

    expect(mockCalls).toEqual([]);
  });

  /**
   * Type filtering moved onto the device, so the chips must not each cost a
   * round trip — that was the point of caching the unfiltered list.
   */
  it("filters by type locally rather than refetching", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    const serums = await fetchProducts({ type: "serum" });
    const cleansers = await fetchProducts({ type: "cleanser" });

    expect(mockCalls).toEqual([]);
    expect(serums.map((p) => p.id)).toEqual(["a"]);
    expect(cleansers.map((p) => p.id)).toEqual(["b"]);
  });

  it("hands back the same array instance for a repeated filter", async () => {
    await fetchProducts();

    expect(await fetchProducts({ type: "serum" })).toBe(
      await fetchProducts({ type: "serum" }),
    );
  });

  it("serves the filter bar's types from the cache instead of querying", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    expect((await fetchProductTypes()).sort()).toEqual(["cleanser", "serum"]);
    expect(mockCalls).toEqual([]);
  });
});

describe("freshness checking", () => {
  /**
   * Reads never check. An earlier version checked on every cache hit behind a
   * five-minute throttle, which meant a request per type-filter tap until the
   * throttle caught it — and no interval was defensible, because sessions are
   * shorter than any sensible one.
   */
  it("never happens on a read, however many filters are tapped", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    for (const type of ["serum", "cleanser", "all", "serum"] as const) {
      await fetchProducts({ type });
    }

    expect(mockCalls).toEqual([]);
  });

  /** Once per launch, where it can still change what the first screen renders. */
  it("happens once at launch, and not again", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    await warmCatalogue();
    await flush();
    expect(mockCalls).toEqual(["watermark", "dict-watermark"]);

    mockCalls.length = 0;
    await warmCatalogue();
    await flush();
    expect(mockCalls).toEqual([]);
  });

  it("refetches at launch when the watermark moved, and not when it didn't", async () => {
    await fetchProducts();
    mockCalls.length = 0;
    mockRowCount = 3;
    mockProductRows = [row("a"), row("b", "cleanser"), row("c")];

    await warmCatalogue();
    await flush();

    expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
    expect(await fetchProducts()).toHaveLength(3);
  });
});

describe("the 24h ceiling", () => {
  /**
   * The backstop that makes one check per launch safe: a copy past its TTL is
   * refetched outright rather than checked, which also covers a memory layer
   * kept alive for days by an OS that never killed the app.
   */
  it("refetches a copy older than the disk TTL instead of serving it", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    const realNow = Date.now;
    Date.now = () => realNow() + DISK_TTL_MS + 1;
    try {
      await fetchProducts();
      expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
    } finally {
      Date.now = realNow;
    }
  });

  /**
   * The ceiling used to be enforced at one call site — `fetchProducts` — so
   * the other three fetchers served a memory entry of any age. A phone does
   * not close an app, so "no expiry while open" and "at most a day old" were
   * two promises the code could not keep at once. It now lives in
   * `readCatalogue`, where no caller can forget it.
   */
  it.each([
    [
      "a product by id",
      async () => {
        await fetchProduct("a");
      },
    ],
    [
      "the saved shelf",
      async () => {
        await fetchProductsByIds(["a"]);
      },
    ],
    [
      "the type list",
      async () => {
        await fetchProductTypes();
      },
    ],
  ] as const)(
    "does not serve %s from a copy past the window",
    async (_label: string, read: () => Promise<void>) => {
      await fetchProducts();
      mockCalls.length = 0;

      const realNow = Date.now;
      Date.now = () => realNow() + DISK_TTL_MS + 1;
      try {
        await read();
        expect(mockCalls).not.toEqual([]);
      } finally {
        Date.now = realNow;
      }
    },
  );

  /**
   * `peekCatalogue` is the deliberate exception, and the splash depends on it:
   * a day-old list for the frame before the real read lands beats a skeleton.
   */
  it("still lets the first frame paint from an expired copy", async () => {
    await fetchProducts();

    const realNow = Date.now;
    Date.now = () => realNow() + DISK_TTL_MS + 1;
    try {
      expect(peekCatalogue()).not.toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe("rows nobody can identify", () => {
  /**
   * A label photographed without a barcode is still written to the catalogue,
   * with a random id and the placeholders "Unknown" / "Scanned product". It
   * answers the person who scanned it, and it is unreachable for everyone
   * else — so it must not accumulate in a browsable list.
   */
  it("keeps barcode-less OCR rows out of Browse and search", async () => {
    mockProductRows = [
      row("a"),
      {
        ...row("ghost"),
        source: "ocr",
        barcode: null,
        brand: "Unknown",
        name: "Scanned product",
      },
    ];
    mockRowCount = 2;

    expect((await fetchProducts()).map((p) => p.id)).toEqual(["a"]);
    // The stand-in does no text matching — it returns whatever rows are set —
    // so what this pins is the filter, not the search: the ghost row is gone
    // and the identifiable one survives.
    expect((await searchProducts("Scanned")).map((p) => p.id)).toEqual(["a"]);
  });

  /** An OCR row that *does* carry a barcode is a real contribution — keep it. */
  it("keeps OCR rows that carry a barcode", async () => {
    mockProductRows = [row("a"), { ...row("real"), source: "ocr" }];
    mockRowCount = 2;

    expect((await fetchProducts()).map((p) => p.id).sort()).toEqual([
      "a",
      "real",
    ]);
  });

  /**
   * The filter is for lists only. The scanner navigates straight to the result
   * it just created, and a saved or logged product must still open.
   */
  it("still resolves one by id, so a just-scanned result opens", async () => {
    mockProductRows = [
      {
        ...row("ghost"),
        source: "ocr",
        barcode: null,
        brand: "Unknown",
        name: "Scanned product",
      },
    ];
    mockRowCount = 1;

    expect((await fetchProduct("ghost"))?.id).toBe("ghost");
    expect((await fetchProductsByIds(["ghost"])).map((p) => p.id)).toEqual([
      "ghost",
    ]);
    // And the stand-in really is keyed on the id, so the assertion above means
    // what it says.
    expect(await fetchProduct("no-such-product")).toBeNull();
  });
});

describe("an empty result", () => {
  /**
   * An empty products table is far more likely to be a request that failed
   * without throwing than a real state. Caching it would blank Browse for 24
   * hours and suppress the refetch that would fix it.
   */
  it("is returned but never cached", async () => {
    mockProductRows = [];
    mockRowCount = 0;

    expect(await fetchProducts()).toEqual([]);
    expect(peekCatalogue()).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toHaveLength(0);
  });

  it("is retried rather than served from cache", async () => {
    mockProductRows = [];
    mockRowCount = 0;
    await fetchProducts();
    mockCalls.length = 0;

    await fetchProducts();

    expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
  });
});

/** Lets the fire-and-forget revalidation and disk write settle. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("returning to the app", () => {
  /**
   * A phone backgrounds an app rather than closing it, so "once per launch"
   * can mean once a week — and the memory layer has no expiry while the app is
   * open, so nothing else would ever catch it. Coming back is the moment
   * someone looks at the list again.
   */
  it("checks again once enough time has passed", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    const realNow = Date.now;
    Date.now = () => realNow() + FOREGROUND_RECHECK_MS + 1;
    try {
      revalidateOnForeground();
      await flush();
    } finally {
      Date.now = realNow;
    }

    expect(mockCalls).toEqual(["watermark", "dict-watermark"]);
  });

  /**
   * Flicking to another app and straight back must cost nothing. `warmCatalogue`
   * is what stamps the launch check, so it stands in for the splash here — a
   * cold `fetchProducts` alone leaves the app never having checked, which is
   * the case the test above covers.
   */
  it("does nothing when the last check was recent", async () => {
    await fetchProducts();
    await warmCatalogue();
    await flush();
    mockCalls.length = 0;

    revalidateOnForeground();
    await flush();

    expect(mockCalls).toEqual([]);
  });

  /** Refetches in full when the check says the catalogue moved. */
  it("refetches when the watermark has changed since", async () => {
    await fetchProducts();
    mockCalls.length = 0;
    mockProductRows = [row("a"), row("b", "cleanser"), row("c")];
    mockRowCount = 3;

    const realNow = Date.now;
    Date.now = () => realNow() + FOREGROUND_RECHECK_MS + 1;
    try {
      revalidateOnForeground();
      await flush();
    } finally {
      Date.now = realNow;
    }

    expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
    expect(peekCatalogue()!.products).toHaveLength(3);
  });

  /** Nothing cached means no watermark to compare and nothing on screen to fix. */
  it("does nothing with no catalogue held", async () => {
    revalidateOnForeground();
    await flush();

    expect(mockCalls).toEqual([]);
  });
});

describe("a catalogue larger than one page", () => {
  /**
   * PostgREST caps a response server-side, so an unpaginated select comes back
   * truncated rather than refused — and `fetchWatermark` asks for an *exact*
   * count over the same filter. A truncated fetch would therefore be stored
   * under a watermark describing the full table, which every later freshness
   * check would compare against itself and agree was current. The catalogue
   * would settle at one page and never heal.
   */
  it("walks every page rather than storing the first one", async () => {
    const total = CATALOGUE_PAGE_SIZE + 25;
    mockProductRows = Array.from({ length: total }, (_, i) =>
      row(`p${String(i).padStart(5, "0")}`),
    );
    mockRowCount = total;

    const products = await fetchProducts();

    expect(products).toHaveLength(total);
    expect(mockCalls.filter((c) => c === "rows")).toHaveLength(2);
  });

  /** One page that is exactly full still has to ask whether there is another. */
  it("asks for a second page when the first comes back exactly full", async () => {
    mockProductRows = Array.from({ length: CATALOGUE_PAGE_SIZE }, (_, i) =>
      row(`p${String(i).padStart(5, "0")}`),
    );
    mockRowCount = CATALOGUE_PAGE_SIZE;

    const products = await fetchProducts();

    expect(products).toHaveLength(CATALOGUE_PAGE_SIZE);
    expect(mockCalls.filter((c) => c === "rows")).toHaveLength(2);
  });

  /** The common case must not have paid for pagination with a second request. */
  it("issues one request for a catalogue that fits in a page", async () => {
    await fetchProducts();

    expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
  });
});

describe("the ingredient dictionary", () => {
  /**
   * The point of the whole change. Every product containing `aqua` must hold
   * the *same* object, not a copy — the wire saving is undone on arrival if
   * each product rebuilds its own, which is what `rowToProduct` did: 3,819
   * ingredient objects resident for 1,049 distinct ingredients.
   */
  it("gives every product the same object for the same ingredient", async () => {
    const products = await fetchProducts();

    expect(products).toHaveLength(2);
    expect(products[0].ingredients[0]).toBe(products[1].ingredients[0]);
    expect(products[0].ingredients[0].functions).toEqual(["solvent"]);
  });

  /**
   * A name the dictionary snapshot predates — a product written between the
   * two reads. Shown as unverified rather than dropped, because a silently
   * shortened formula is a quieter lie than an unrecognised name.
   */
  it("keeps a name the dictionary did not carry, as unverified", async () => {
    mockProductRows = [
      { ...row("a"), product_ingredients: [{ position: 1, inci_name: "mystery" }] },
    ];
    mockRowCount = 1;

    const [product] = await fetchProducts();

    expect(product.ingredients.map((i) => i.name)).toEqual(["mystery"]);
    expect(product.ingredients[0].verified).toBe(false);
  });

  /**
   * The trap this step had to close. Once definitions cache separately from
   * products, a dictionary rewrite that adds no products moves neither the
   * product count nor the newest `fetched_at` — so without its own terms in
   * the key, every device would agree it was current and serve stale
   * definitions indefinitely. Same failure `products.fetched_at` had, one
   * table across.
   */
  it("refetches when only an ingredient definition changed", async () => {
    await fetchProducts();
    await warmCatalogue();
    await flush();
    mockCalls.length = 0;

    // No product moved: same count, same newest fetched_at.
    mockNewestUpdatedAt = "2026-09-20T00:00:00Z";

    const realNow = Date.now;
    Date.now = () => realNow() + FOREGROUND_RECHECK_MS + 1;
    try {
      revalidateOnForeground();
      await flush();
    } finally {
      Date.now = realNow;
    }

    expect(mockCalls).toContain("rows");
  });
});

describe("a label read", () => {
  /**
   * The barcode cascade caches its misses for an hour, and a label read is
   * what the user does *because* of one — so the miss is always already there
   * when the OCR result lands. Leaving it means re-scanning the bottle they
   * just photographed returns the remembered `null` and offers the label flow
   * again, for a product that now exists.
   */
  it("overwrites the cached miss for the barcode that sent the user there", async () => {
    invokeMock().mockResolvedValue({
      data: { product: inlinedRow("scanned"), recognised: 12, total: 14 },
      error: null,
    });
    putScanned("barcode-scanned", null);
    expect(readScanned("barcode-scanned")).toBeNull();

    const result = await analyseLabel("base64", { barcode: "barcode-scanned" });

    expect(result.ok).toBe(true);
    expect(readScanned("barcode-scanned")?.id).toBe("scanned");
  });

  /**
   * The OCR function resolves the barcode itself when the caller had none —
   * the paste/photo-first entry points. The row it returns is then the only
   * place that barcode appears, so it is what the next scan will be keyed on.
   */
  it("records the barcode the row came back with when the caller passed none", async () => {
    invokeMock().mockResolvedValue({
      data: { product: inlinedRow("scanned"), recognised: 12, total: 14 },
      error: null,
    });

    await analyseLabel("base64");

    expect(readScanned("barcode-scanned")?.id).toBe("scanned");
  });

  /** A failed read must not be remembered as an answer of any kind. */
  it("leaves the cache alone when the read fails", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { context: { status: 422 } },
    });

    const result = await analyseLabel("base64", { barcode: "barcode-scanned" });

    expect(result).toEqual({ ok: false, reason: "too_little_text" });
    expect(readScanned("barcode-scanned")).toBeUndefined();
  });
});

/**
 * The `functions.invoke` stand-in from the module mock, narrowed to the one
 * method these tests drive it through. `jest.Mock` itself is a namespace type
 * this project's tsconfig does not pull in.
 */
function invokeMock(): { mockResolvedValue: (value: unknown) => void } {
  return supabase!.functions.invoke as unknown as {
    mockResolvedValue: (value: unknown) => void;
  };
}
