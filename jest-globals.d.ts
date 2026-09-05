// TypeScript 6's stricter `moduleDetection: "force"` no longer surfaces
// @types/jest's top-level `declare var describe`/`it`/`expect` as real
// globals — under "force", a file with no import/export is still treated
// as a script for detection purposes in older compilers, but 6.x closed
// that gap, so those declarations now live inside an unreachable module
// scope instead. See https://github.com/jestjs/jest/issues/12853.
//
// Bridge the real runtime exports from `@jest/globals` (the same functions
// jest injects into every test file) into true global scope instead of
// relying on @types/jest's now-inert ambient declarations.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
  test,
} from "@jest/globals";

declare global {
  const afterAll: typeof afterAll;
  const afterEach: typeof afterEach;
  const beforeAll: typeof beforeAll;
  const beforeEach: typeof beforeEach;
  const describe: typeof describe;
  const expect: typeof expect;
  const it: typeof it;
  const jest: typeof jest;
  const test: typeof test;
}

export {};
