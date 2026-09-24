/**
 * For the opt-in tests that reach the real staging project
 * (`__tests__/shelf-staging.test.ts`, `__tests__/score-baseline.test.ts`):
 * its credentials, and a fetch that works under Jest.
 */
import { existsSync, readFileSync } from "fs";
import { request } from "https";
import { join } from "path";

/** `.env.staging` from the repo root (never printed), or null when this machine has none. */
export function stagingEnv(): Record<string, string> | null {
  const file = join(__dirname, "..", ".env.staging");
  if (!existsSync(file)) return null;
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    env[t.slice(0, t.indexOf("=")).trim()] = t.slice(t.indexOf("=") + 1).trim();
  }
  return env;
}

/**
 * Under Jest, Expo's runtime replaces `fetch` with its native one, which has
 * no native side here. This is a plain HTTPS fetch for the real network,
 * handed to every client these tests build.
 */
export function nodeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, name) => (headers[name] = value));
    const req = request(url, { method: init.method ?? "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const out = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          if (value !== undefined) out.set(name, Array.isArray(value) ? value.join(", ") : String(value));
        }
        const status = res.statusCode ?? 0;
        const body = [204, 205, 304].includes(status) ? null : new Uint8Array(Buffer.concat(chunks));
        resolve(new Response(body, { status, statusText: res.statusMessage, headers: out }));
      });
    });
    req.on("error", reject);
    init.signal?.addEventListener("abort", () => req.destroy(new Error("aborted")));
    if (init.body) req.write(init.body as string);
    req.end();
  });
}
