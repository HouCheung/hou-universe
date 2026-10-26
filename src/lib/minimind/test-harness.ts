// ============================================================
// test-harness — minimal describe/it/expect test runner
// ============================================================
// Provides the small subset of `bun:test` used by the MiniMind
// test suites (describe / it / beforeEach / afterAll plus expect
// matchers) so those suites run under `npx tsx` + node:assert —
// the repository's real test runner — instead of requiring `bun`.
//
// This is NOT a new runtime/store. It is a thin shim over
// node:assert that preserves the exact assertions of the migrated
// bun:test suites (same matchers, same semantics).
// ============================================================

import { strict as assert } from "node:assert";

// ============================================================
// Types
// ============================================================

type TestFn = () => void | Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
}

interface Suite {
  name: string;
  beforeEaches: TestFn[];
  afterAlls: TestFn[];
  tests: TestCase[];
  suites: Suite[];
}

export interface RunResult {
  passed: number;
  failed: number;
}

// ============================================================
// Registration state (root suite populated at module load)
// ============================================================

const rootSuite: Suite = {
  name: "",
  beforeEaches: [],
  afterAlls: [],
  tests: [],
  suites: [],
};

let currentSuite: Suite = rootSuite;

// ============================================================
// describe / it / hooks
// ============================================================

export function describe(name: string, fn: () => void): void {
  const parent = currentSuite;
  const suite: Suite = {
    name,
    beforeEaches: [],
    afterAlls: [],
    tests: [],
    suites: [],
  };
  parent.suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = parent;
}

export function it(name: string, fn: TestFn): void {
  currentSuite.tests.push({ name, fn });
}

// `test` is bun:test's alias for `it`. Some migrated suites use `test(...)`.
export const test = it;

export function beforeEach(fn: TestFn): void {
  currentSuite.beforeEaches.push(fn);
}

export function afterAll(fn: TestFn): void {
  currentSuite.afterAlls.push(fn);
}

// ============================================================
// expect matchers
// ============================================================

class Expectation<T> {
  constructor(private readonly actual: T) {}

  toBe(expected: T): void {
    assert.strictEqual(this.actual, expected);
  }

  toEqual(expected: unknown): void {
    assert.deepStrictEqual(this.actual, expected);
  }

  toBeNull(): void {
    assert.strictEqual(this.actual, null);
  }

  toBeUndefined(): void {
    assert.strictEqual(this.actual, undefined);
  }

  toBeTruthy(): void {
    assert.ok(this.actual, "expected value to be truthy");
  }

  toBeFalsy(): void {
    assert.ok(!this.actual, "expected value to be falsy");
  }

  toBeGreaterThan(n: number): void {
    assert.ok(
      (this.actual as unknown as number) > n,
      `expected ${String(this.actual)} to be greater than ${n}`
    );
  }

  toBeGreaterThanOrEqual(n: number): void {
    assert.ok(
      (this.actual as unknown as number) >= n,
      `expected ${String(this.actual)} to be >= ${n}`
    );
  }

  toBeLessThan(n: number): void {
    assert.ok(
      (this.actual as unknown as number) < n,
      `expected ${String(this.actual)} to be less than ${n}`
    );
  }

  toBeLessThanOrEqual(n: number): void {
    assert.ok(
      (this.actual as unknown as number) <= n,
      `expected ${String(this.actual)} to be <= ${n}`
    );
  }

  toMatch(regex: RegExp): void {
    assert.ok(
      regex.test(String(this.actual)),
      `expected ${String(this.actual)} to match ${String(regex)}`
    );
  }

  toContain(substring: string): void {
    assert.ok(
      String(this.actual).includes(substring),
      `expected ${String(this.actual)} to contain ${String(substring)}`
    );
  }

  toHaveLength(expected: number): void {
    assert.strictEqual(
      (this.actual as unknown as { length: number }).length,
      expected
    );
  }

  toBeCloseTo(expected: number, digits = 2): void {
    const actualNum = this.actual as unknown as number;
    const tolerance = 10 ** -digits / 2;
    assert.ok(
      Math.abs(actualNum - expected) < tolerance,
      `expected ${actualNum} to be close to ${expected} within ${digits} digits`
    );
  }

  toThrow(): void {
    assert.throws(this.actual as unknown as () => unknown);
  }

  get not(): NotExpectation<T> {
    return new NotExpectation(this.actual);
  }

  get rejects(): RejectsExpectation {
    return new RejectsExpectation(this.actual);
  }
}

class NotExpectation<T> {
  constructor(private readonly actual: T) {}

  toBe(expected: T): void {
    assert.notStrictEqual(this.actual, expected);
  }

  toEqual(expected: unknown): void {
    assert.notDeepStrictEqual(this.actual, expected);
  }

  toThrow(): void {
    assert.doesNotThrow(this.actual as unknown as () => unknown);
  }

  toContain(substring: string): void {
    assert.ok(
      !String(this.actual).includes(substring),
      `expected ${String(this.actual)} NOT to contain ${String(substring)}`
    );
  }
}

class RejectsExpectation {
  constructor(private readonly actual: unknown) {}

  async toThrow(errorClass: ErrorConstructor): Promise<void> {
    await assert.rejects(this.actual as unknown as Promise<unknown>, errorClass);
  }
}

export function expect<T>(actual: T): Expectation<T> {
  return new Expectation(actual);
}

// ============================================================
// Runner
// ============================================================

export async function run(): Promise<RunResult> {
  let passed = 0;
  let failed = 0;

  async function runSuite(suite: Suite): Promise<void> {
    for (const test of suite.tests) {
      try {
        for (const hook of suite.beforeEaches) await hook();
        await test.fn();
        passed += 1;
      } catch (err) {
        failed += 1;
        const label = suite.name ? `${suite.name} › ` : "";
        console.error(`  ✗ ${label}${test.name}`);
        console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const child of suite.suites) {
      await runSuite(child);
    }

    for (const hook of suite.afterAlls) await hook();
  }

  await runSuite(rootSuite);
  return { passed, failed };
}
