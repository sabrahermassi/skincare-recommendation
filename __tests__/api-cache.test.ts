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
  // Two tables answer for the dictionary: the view serves the definitions,
  // and `ingredients` serves the watermark directly — the view's per-row
  // `exists` is the wrong price on a check that runs every foreground.
  const dictionary = table === "catalogue_ingredients" || table === "ingredients";
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
  CATALOGUE_PAGE_SIZE,
  fetchProduct,
  fetchProductByBarcode,
  fetchProducts,
  fetchProductsByIds,
  FOREGROUND_RECHECK_MS,
  NETWORK_TIMEOUT_MS,
  OCR_TIMEOUT_MS,
  prefetchCatalogue,
  readLabel,
  revalidateOnForeground,
  saveScannedProduct,
  searchProducts,
  warmCatalogue,
  type Fetched,
} from "@/data/api";
import {
  DISK_TTL_MS,
  peekCatalogue,
  putScanned,
  readScanned,
  resetCatalogueCache,
} from "@/data/catalogue-cache";
import { supabase } from "@/lib/supabase";

/**
 * Asserts a read succeeded and hands back its value.
 *
 * The three fetchers that can answer "not in the catalogue" return a
 * `Fetched`, so a test that wants the value has to say which case it expects.
 * Throwing on a failure rather than returning null keeps that explicit: a test
 * whose request unexpectedly fails reports the failure kind instead of quietly
 * asserting against `undefined`.
 */
function unwrap<T>(result: Fetched<T>): T {
  if (!result.ok) throw new Error(`expected a successful read, got "${result.failure.kind}"`);
  return result.value;
}

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
   * An import whose source had no title stored the barcode as the name. Search
   * would show a product called "3606000537750", which nobody can recognise.
   */
  it("keeps a product named only by its barcode out of lists", async () => {
    mockProductRows = [row("a"), { ...row("digits"), name: "3606000537750" }];
    mockRowCount = 2;

    expect((await fetchProducts()).map((p) => p.id)).toEqual(["a"]);
    // The stand-in does no text matching — it returns whatever rows are set —
    // so what this pins is the filter, not the search.
    expect((await searchProducts("3606")).map((p) => p.id)).toEqual(["a"]);
  });

  /** A product genuinely called by a short number is a real name — keep it. */
  it("keeps a short number as a name", async () => {
    mockProductRows = [row("a"), { ...row("serum-24"), name: "24" }];
    mockRowCount = 2;

    expect((await fetchProducts()).map((p) => p.id).sort()).toEqual(["a", "serum-24"]);
  });

  /**
   * The filter is for lists only. The scanner navigates straight to the result
   * it just found, and a saved or logged product must still open.
   */
  it("still resolves one by id, so a scanned result opens", async () => {
    mockProductRows = [{ ...row("digits"), name: "3606000537750" }];
    mockRowCount = 1;

    expect(unwrap(await fetchProduct("digits"))?.id).toBe("digits");
    expect(unwrap(await fetchProductsByIds(["digits"])).map((p) => p.id)).toEqual(["digits"]);
    // And the stand-in really is keyed on the id, so the assertion above means
    // what it says. `unwrap` matters here: a null *value* is the catalogue
    // answering, which is what this asserts — a failed read would throw.
    expect(unwrap(await fetchProduct("no-such-product"))).toBeNull();
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

  /**
   * Nothing cached means no watermark to compare — and, since Search stopped
   * listing the catalogue (#317), nothing else that would fetch one. A first
   * launch with no signal gets its catalogue on the next return instead.
   */
  it("downloads the catalogue when none is held", async () => {
    revalidateOnForeground();
    await settle();

    expect(mockCalls).toEqual(["watermark", "dict-watermark", "rows", "dict"]);
    expect(peekCatalogue()!.products).toHaveLength(2);
  });
});

/** Enough turns of the event loop for a whole cold download to land. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await flush();
}

describe("the launch download (#317)", () => {
  /**
   * What a fresh install does: the splash finds nothing on disk, then the
   * download runs with no screen asking. Search no longer lists the catalogue,
   * so without this the cache stays empty and every instant answer built on it
   * — an offline barcode (#196), search as you type, a product page with no
   * spinner — goes to the network instead.
   */
  it("fills the catalogue cache on a cold start", async () => {
    await warmCatalogue();
    expect(peekCatalogue()).toBeNull();

    prefetchCatalogue();
    await settle();

    expect(peekCatalogue()!.products.map((p) => p.id)).toEqual(["a", "b"]);
    expect(await AsyncStorage.getAllKeys()).not.toHaveLength(0);
  });

  it("downloads once however many times it is asked", async () => {
    prefetchCatalogue();
    prefetchCatalogue();
    await settle();

    expect(mockCalls.filter((c) => c === "rows")).toHaveLength(1);
  });

  it("costs nothing when the catalogue is already held", async () => {
    await fetchProducts();
    mockCalls.length = 0;

    prefetchCatalogue();
    await settle();

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

describe("a barcode lookup", () => {
  /**
   * Step 6a bounded this call so the scanner cannot sit in "looking"
   * forever. The behaviour was verified by hand against the real
   * `functions.invoke` implementation during self-review — this pins the one
   * thing a review can't: that a later refactor can't silently drop the
   * option while every other test here stays green.
   */
  it("bounds the lookup with the network timeout", async () => {
    invokeMock().mockResolvedValue({ data: inlinedRow("scanned"), error: null });

    await fetchProductByBarcode("barcode-scanned");

    expect(lastInvokeOptions()).toMatchObject({ timeout: NETWORK_TIMEOUT_MS });
  });

  it("resolves a known barcode to a product", async () => {
    invokeMock().mockResolvedValue({ data: inlinedRow("scanned"), error: null });

    const found = await fetchProductByBarcode("barcode-scanned");

    expect(unwrap(found)?.id).toBe("scanned");
  });

  /** A 404 from the cascade means "not in any source", a miss — not a failure. */
  it("caches a miss rather than failing, on a 404", async () => {
    invokeMock().mockResolvedValue({ data: null, error: { context: { status: 404 } } });

    const found = await fetchProductByBarcode("barcode-missing");

    // A successful read whose value is null: the catalogue answered.
    expect(found).toEqual({ ok: true, value: null });
    expect(readScanned("barcode-missing")).toBeNull();
  });

  /**
   * The distinction issue #93 turns on. A 500 is *not* a miss, and must not
   * reach the scanner as one — it reports a failure the screen can retry, and
   * nothing is written to the scanned cache, so a later attempt re-asks.
   */
  it("reports a non-404 failure rather than a silent miss", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { message: "upstream exploded", context: { status: 500 } },
    });

    const result = await fetchProductByBarcode("barcode-broken");

    expect(result).toEqual({
      ok: false,
      failure: { kind: "server", message: "server responded 500" },
    });
    expect(readScanned("barcode-broken")).toBeUndefined();
  });

  /**
   * Both of the next two cases arrive the way the real library delivers them,
   * which is the point of writing them this way.
   *
   * `functions.invoke` never rejects: it catches everything and *returns*
   * `{ data: null, error }`. It also implements its own `timeout` option by
   * aborting the fetch, then wrapping whatever the fetch rejected with in a
   * `FunctionsFetchError`. So a timeout and a dead connection reach us in the
   * identical wrapper, separated only by the original error on `context`.
   *
   * An earlier version of this test used `mockRejectedValue`, which exercised
   * a branch the library cannot reach — it passed while proving nothing.
   */
  it("reports a dead connection as offline, not as a miss", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function", context: new TypeError("Network request failed") },
    });

    const result = await fetchProductByBarcode("barcode-offline");

    expect(result).toEqual({ ok: false, failure: { kind: "offline" } });
    expect(readScanned("barcode-offline")).toBeUndefined();
  });

  it("reports the lookup's own deadline as a timeout, not as offline", async () => {
    // What `invoke` produces when its `timeout` fires: it aborts the fetch,
    // and the AbortError is what ends up on `context`.
    const aborted = new Error("The operation was aborted");
    aborted.name = "AbortError";
    invokeMock().mockResolvedValue({
      data: null,
      error: { name: "FunctionsFetchError", message: "Failed to send a request to the Edge Function", context: aborted },
    });

    const result = await fetchProductByBarcode("barcode-slow");

    expect(result).toEqual({ ok: false, failure: { kind: "timeout" } });
    expect(readScanned("barcode-slow")).toBeUndefined();
  });

  it("reports a rate limit as its own state", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { message: "too many requests", context: { status: 429 } },
    });

    const result = await fetchProductByBarcode("barcode-throttled");

    expect(result).toEqual({ ok: false, failure: { kind: "rate-limited" } });
  });
});

describe("a label read", () => {
  /**
   * OCR gets its own, longer clock — see `OCR_TIMEOUT_MS` — precisely
   * because an upload to Google Vision legitimately takes longer than a
   * catalogue read. This is the other half of the barcode-lookup test above:
   * that the two calls are bounded by different figures, not the same one.
   */
  it("bounds the read with the OCR timeout, not the network one", async () => {
    invokeMock().mockResolvedValue({
      data: { ingredients: [{ inci_name: "aqua", position: 0 }], recognised: 12, total: 14, readToken: "token-1" },
      error: null,
    });

    await readLabel("base64");

    expect(lastInvokeOptions()).toMatchObject({ timeout: OCR_TIMEOUT_MS });
  });

  /** Reading stores nothing, so it hands back the names and no product. */
  it("returns the names read, in order", async () => {
    invokeMock().mockResolvedValue({
      data: {
        ingredients: [
          { inci_name: "aqua", position: 0 },
          { inci_name: "glycerin", position: 1 },
        ],
        recognised: 2,
        total: 2,
        readToken: "token-1",
      },
      error: null,
    });

    expect(await readLabel("base64")).toEqual({
      ok: true,
      ingredients: ["aqua", "glycerin"],
      recognised: 2,
      total: 2,
      readToken: "token-1",
    });
  });

  /** A failed read must say why, and not be remembered as an answer of any kind. */
  it("reports a photo with too little text", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { context: { status: 422 } },
    });

    expect(await readLabel("base64")).toEqual({ ok: false, reason: "too_little_text" });
  });

  // #185: a 422 with no readable body (a test double, or a shape with no
  // `.json`) must still fall back to `too_little_text` rather than throwing
  // — the case above already pins that. This pins the other half: a 422
  // whose body says `low_confidence` (names were read but too few resolved)
  // must NOT collapse into the same `too_little_text` copy ("get closer"),
  // since the photo was already good enough to read.
  it("distinguishes an unrecognised-names 422 from a too-little-text one", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 422,
          json: () => Promise.resolve({ error: "low_confidence", found: 6, recognised: 1 }),
        },
      },
    });

    expect(await readLabel("base64")).toEqual({ ok: false, reason: "unrecognised_names" });
  });

  it("still reports too_little_text when the 422 body says not_enough_text", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: {
        context: {
          status: 422,
          json: () => Promise.resolve({ error: "not_enough_text", found: 1 }),
        },
      },
    });

    expect(await readLabel("base64")).toEqual({ ok: false, reason: "too_little_text" });
  });
});

describe("saving a product", () => {
  const input = {
    barcode: "barcode-scanned",
    name: "Scanned product",
    ingredients: ["aqua", "glycerin", "niacinamide", "panthenol"],
    readToken: "token-1",
  };

  /**
   * The barcode cascade caches its misses for an hour, and adding a product is
   * what the user does *because* of one — so the miss is always already there
   * when the save lands. Leaving it means scanning the bottle they just added
   * returns the remembered `null` and offers to add it again.
   */
  it("overwrites the cached miss for the barcode that sent the user there", async () => {
    invokeMock().mockResolvedValue({
      data: { product: inlinedRow("scanned"), recognised: 12, total: 14 },
      error: null,
    });
    putScanned("barcode-scanned", null);
    expect(readScanned("barcode-scanned")).toBeNull();

    const result = await saveScannedProduct(input);

    expect(result.ok).toBe(true);
    expect(readScanned("barcode-scanned")?.id).toBe("scanned");
  });

  it("sends the barcode, the name and the list together", async () => {
    invokeMock().mockResolvedValue({
      data: { product: inlinedRow("scanned"), recognised: 4, total: 4 },
      error: null,
    });

    await saveScannedProduct(input);

    expect(lastInvokeOptions()).toMatchObject({ body: input });
  });

  it("says so when the read has gone stale", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { context: { status: 403 } },
    });

    expect(await saveScannedProduct({ ...input, barcode: "barcode-stale" })).toEqual({ ok: false, reason: "expired" });
  });

  it("leaves the cache alone when the save fails", async () => {
    invokeMock().mockResolvedValue({
      data: null,
      error: { context: { status: 422 } },
    });

    const result = await saveScannedProduct({ ...input, barcode: "barcode-refused" });

    expect(result).toEqual({ ok: false, reason: "unreadable_list" });
    expect(readScanned("barcode-refused")).toBeUndefined();
  });
});

/**
 * The `functions.invoke` stand-in from the module mock, narrowed to the two
 * things these tests drive it through. `jest.Mock` itself is a namespace type
 * this project's tsconfig does not pull in.
 *
 * `mock.calls` accumulates for the life of the file — nothing here calls
 * `mockClear`, and it shouldn't need to just to make one assertion safe.
 * Always read the *last* call, never `[0]`: an earlier test's invocation is
 * still sitting in this same array.
 */
function invokeMock(): {
  mockResolvedValue: (value: unknown) => void;
  mock: { calls: unknown[][] };
} {
  return supabase!.functions.invoke as unknown as {
    mockResolvedValue: (value: unknown) => void;
    mock: { calls: unknown[][] };
  };
}

/** The options object passed to the most recent `functions.invoke` call. */
function lastInvokeOptions(): unknown {
  const { calls } = invokeMock().mock;
  return calls[calls.length - 1]?.[1];
}
