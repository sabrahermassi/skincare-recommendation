import { fingerprintCaller } from "@/lib/rate-limit";
import { logScan, logScanBounded, type ScanLogDb } from "@/lib/scan-log";

/**
 * `lib/scan-log.ts` re-exports `supabase/functions/_shared/scan-log.ts`
 * verbatim, so everything below exercises the exact module the Edge
 * Functions run.
 */

const SALT = "test-salt";

type Insertable = PromiseLike<{ error: unknown }> & {
  abortSignal(signal: AbortSignal): PromiseLike<{ error: unknown }>;
};

/**
 * A database whose insert either settles immediately with `answer`, or
 * never settles on its own -- only in response to the signal passed to
 * `.abortSignal()`, the same as a real in-flight PostgREST request being
 * cancelled. Records every row inserted and whether an abort ever fired.
 */
function makeDb(
  mode: "immediate" | "hang",
  answer: { error: unknown } = { error: null },
): { db: ScanLogDb; inserted: Record<string, unknown>[]; aborted: () => boolean } {
  const inserted: Record<string, unknown>[] = [];
  let aborted = false;

  const db: ScanLogDb = {
    from() {
      return {
        insert(row: Record<string, unknown>) {
          inserted.push(row);

          if (mode === "immediate") {
            const settled = Promise.resolve(answer) as unknown as Insertable;
            settled.abortSignal = () => Promise.resolve(answer);
            return settled;
          }

          // Never resolves on its own -- only `.abortSignal()`'s listener can.
          let resolvePending: (v: { error: unknown }) => void;
          const pending = new Promise<{ error: unknown }>((resolve) => {
            resolvePending = resolve;
          });
          const withAbort = pending as unknown as Insertable;
          withAbort.abortSignal = (signal: AbortSignal) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              resolvePending({ error: { message: "aborted" } });
            });
            return pending;
          };
          return withAbort;
        },
      };
    },
  };

  return { db, inserted, aborted: () => aborted };
}

function req(ip = "81.229.14.22") {
  return new Request("https://x/", { headers: { "cf-connecting-ip": ip } });
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("logScan", () => {
  it("inserts the outcome with the caller fingerprint, never the raw address", async () => {
    const { db, inserted } = makeDb("immediate");
    await logScan(req(), db, SALT, { path: "barcode", outcome: "resolved" });

    expect(inserted).toEqual([
      {
        caller: await fingerprintCaller("81.229.14.22", SALT),
        path: "barcode",
        outcome: "resolved",
        names_parsed: null,
        names_resolved: null,
        image_bytes: null,
      },
    ]);
  });

  it("carries the label-path extras through when given", async () => {
    const { db, inserted } = makeDb("immediate");
    await logScan(req(), db, SALT, {
      path: "label",
      outcome: "read_ok",
      namesParsed: 12,
      namesResolved: 9,
      imageBytes: 40_000,
    });

    expect(inserted[0]).toMatchObject({
      names_parsed: 12,
      names_resolved: 9,
      image_bytes: 40_000,
    });
  });

  it("never throws when the insert errors -- a broken log must not become a failed scan", async () => {
    const { db } = makeDb("immediate", { error: { message: "boom" } });
    await expect(
      logScan(req(), db, SALT, { path: "barcode", outcome: "resolved" }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[scan-log] insert failed:", { message: "boom" });
  });

  it("never throws when the insert rejects outright", async () => {
    const db: ScanLogDb = {
      from: () => ({
        insert: () => Promise.reject(new Error("connection reset")) as unknown as Insertable,
      }),
    };
    await expect(
      logScan(req(), db, SALT, { path: "barcode", outcome: "resolved" }),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[scan-log] logScan threw:", expect.any(Error));
  });
});

describe("logScanBounded", () => {
  it("resolves once the insert settles, without needing the timeout", async () => {
    const { db, inserted } = makeDb("immediate");
    await logScanBounded(req(), db, SALT, { path: "barcode", outcome: "resolved" });
    expect(inserted).toHaveLength(1);
  });

  /**
   * The regression this exists to catch: before this, the timeout only gave
   * up on *awaiting* a slow insert -- the underlying PostgREST request kept
   * running regardless, so a database outage could accumulate an unbounded
   * number of in-flight requests. Now the timeout actually cancels it.
   */
  // Real timers, deliberately: `fingerprintCaller` calls the real WebCrypto
  // API, whose timing does not run on Jest's fake-timer queue -- advancing
  // fake time here could fire the abort before the signal listener was even
  // attached, testing the race in this mock rather than the real timeout.
  it(
    "aborts the underlying insert, rather than merely giving up on awaiting it, once the timeout wins",
    async () => {
      const { db, aborted } = makeDb("hang");
      await logScanBounded(req(), db, SALT, { path: "barcode", outcome: "resolved" });
      expect(aborted()).toBe(true);
    },
    3000,
  );

  it(
    "still resolves, not hangs, when the insert never settles on its own",
    async () => {
      const { db } = makeDb("hang");
      await expect(
        logScanBounded(req(), db, SALT, { path: "barcode", outcome: "resolved" }),
      ).resolves.toBeUndefined();
    },
    3000,
  );
});
