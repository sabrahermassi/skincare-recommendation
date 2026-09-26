// Fakes for the Edge Function handler tests (#203): a stand-in for the
// service-role supabase-js client and for `fetch`. Each records what it was
// asked, and answers through a function the test supplies — anything the test
// doesn't answer gets the empty, successful reply a real project would give
// for a row that isn't there.

export type Filter = { op: string; column: string; value: unknown };

export type DbCall =
  | { kind: "select"; table: string; columns: string; filters: Filter[]; single: boolean }
  | { kind: "insert"; table: string; row: Record<string, unknown> }
  | { kind: "upsert"; table: string; row: Record<string, unknown>; options: unknown }
  | { kind: "rpc"; fn: string; args: Record<string, unknown> };

export type DbResult = { data: unknown; error: unknown };

/** Returns the reply for `call`, or undefined for the default one. */
export type DbAnswer = (call: DbCall) => DbResult | undefined;

export class FakeDb {
  readonly calls: DbCall[] = [];

  constructor(private readonly answer: DbAnswer = () => undefined) {}

  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }

  rpc(fn: string, args: Record<string, unknown>): Promise<DbResult> {
    return this.run({ kind: "rpc", fn, args });
  }

  run(call: DbCall): Promise<DbResult> {
    this.calls.push(call);
    return Promise.resolve(this.answer(call) ?? defaultReply(call));
  }

  rpcCalls(fn: string): Record<string, unknown>[] {
    return this.calls.flatMap((c) => (c.kind === "rpc" && c.fn === fn ? [c.args] : []));
  }

  selects(table: string): Extract<DbCall, { kind: "select" }>[] {
    return this.calls.flatMap((c) => (c.kind === "select" && c.table === table ? [c] : []));
  }

  inserts(table: string): Record<string, unknown>[] {
    return this.calls.flatMap((c) => ((c.kind === "insert" || c.kind === "upsert") && c.table === table ? [c.row] : []));
  }
}

function defaultReply(call: DbCall): DbResult {
  // The limiter's counter: first request in the window, allowed.
  if (call.kind === "rpc" && call.fn === "consume_rate_limit") return { data: 1, error: null };
  if (call.kind === "select") return { data: call.single ? null : [], error: null };
  return { data: null, error: null };
}

/** The query-builder chain the handlers use, recorded rather than run. */
class FakeQuery implements PromiseLike<DbResult> {
  private call: Exclude<DbCall, { kind: "rpc" }>;

  constructor(private readonly db: FakeDb, private readonly table: string) {
    this.call = { kind: "select", table, columns: "", filters: [], single: false };
  }

  select(columns: string): this {
    if (this.call.kind === "select") this.call.columns = columns;
    return this;
  }

  insert(row: Record<string, unknown>): this {
    this.call = { kind: "insert", table: this.table, row };
    return this;
  }

  upsert(row: Record<string, unknown>, options?: unknown): this {
    this.call = { kind: "upsert", table: this.table, row, options };
    return this;
  }

  private filter(op: string, column: string, value: unknown): this {
    if (this.call.kind === "select") this.call.filters.push({ op, column, value });
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.filter("eq", column, value);
  }

  in(column: string, values: unknown[]): this {
    return this.filter("in", column, values);
  }

  gt(column: string, value: unknown): this {
    return this.filter("gt", column, value);
  }

  ilike(column: string, pattern: string): this {
    return this.filter("ilike", column, pattern);
  }

  or(expression: string): this {
    return this.filter("or", "", expression);
  }

  order(column: string, options?: unknown): this {
    return this.filter("order", column, options);
  }

  limit(count: number): this {
    return this.filter("limit", "", count);
  }

  abortSignal(_signal: AbortSignal): this {
    return this;
  }

  maybeSingle(): Promise<DbResult> {
    if (this.call.kind === "select") this.call.single = true;
    return this.db.run(this.call);
  }

  then<A = DbResult, B = never>(
    onFulfilled?: ((value: DbResult) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.db.run(this.call).then(onFulfilled, onRejected);
  }
}

/** The value of the `op` filter on `column`, if the query has one. */
export function filterValue(call: { filters: Filter[] }, op: string, column: string): unknown {
  return call.filters.find((f) => f.op === op && f.column === column)?.value;
}

export type FetchCall = { url: string; init?: RequestInit };

/** A `fetch` answered by `route`; a throw from `route` is a network failure. */
export function fakeFetch(route: (url: string, init?: RequestInit) => Response) {
  const calls: FetchCall[] = [];
  const fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    try {
      return Promise.resolve(route(url, init));
    } catch (err) {
      return Promise.reject(err);
    }
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

/** Every name asked about is a verified dictionary entry. */
export function allKnown(call: DbCall): DbResult | undefined {
  if (call.kind === "select" && call.table === "ingredients" && filterValue(call, "eq", "verified") === true) {
    const names = (filterValue(call, "in", "inci_name") as string[] | undefined) ?? [];
    return { data: names.map((inci_name) => ({ inci_name })), error: null };
  }
  return undefined;
}
