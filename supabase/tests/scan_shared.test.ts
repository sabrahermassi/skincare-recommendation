// Shared pieces of the two scan functions (#198): the dictionary kept between
// requests, and the daily Vision ceiling's setting.
import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { cachedRead, DICTIONARY_TTL_MS } from "../functions/_shared/dictionary.ts";
import { DEFAULT_VISION_DAILY_CEILING, visionDailyCeiling } from "../functions/_shared/vision-ceiling.ts";

Deno.test("a cached read is reused until it ages out, then read again", async () => {
  const db = {};
  let loads = 0;
  const load = () => Promise.resolve(++loads);
  assertEquals(await cachedRead(db, "k", load, 0), 1);
  assertEquals(await cachedRead(db, "k", load, DICTIONARY_TTL_MS - 1), 1);
  assertEquals(await cachedRead(db, "k", load, DICTIONARY_TTL_MS), 2);
});

Deno.test("requests during a read share it", async () => {
  const db = {};
  let loads = 0;
  const load = () => new Promise<number>((resolve) => queueMicrotask(() => resolve(++loads)));
  const [a, b] = await Promise.all([cachedRead(db, "k", load, 0), cachedRead(db, "k", load, 1)]);
  assertEquals([a, b, loads], [1, 1, 1]);
});

Deno.test("a failed read isn't kept", async () => {
  const db = {};
  await assertRejects(() => cachedRead(db, "k", () => Promise.reject(new Error("down")), 0));
  assertEquals(await cachedRead(db, "k", () => Promise.resolve("up"), 1), "up");
});

Deno.test("each client and each key has its own copy", async () => {
  const one = {};
  const two = {};
  await cachedRead(one, "k", () => Promise.resolve("one"), 0);
  assertEquals(await cachedRead(two, "k", () => Promise.resolve("two"), 0), "two");
  assertEquals(await cachedRead(one, "other", () => Promise.resolve("other"), 0), "other");
});

Deno.test("the daily ceiling reads a positive whole number, and defaults otherwise", () => {
  assertEquals(visionDailyCeiling("250"), 250);
  for (const raw of [undefined, "", "0", "-5", "1.5", "lots"]) {
    assertEquals(visionDailyCeiling(raw), DEFAULT_VISION_DAILY_CEILING, String(raw));
  }
});
