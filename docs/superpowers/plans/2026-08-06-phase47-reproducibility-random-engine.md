# Phase 47 — Reproducibility & Random Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a unified deterministic random system for MiniMind that ensures seed reproducibility across parameter initialization, sampling, and data shuffling.

**Architecture:** Create a `core/random/` module with a global `Random` singleton wrapping a `SeededRandom` PRNG (xoshiro128++ for quality). All existing random sources (`Math.random()` in Tensor, Initialization, BatchSampler, TensorGenerator) route through this single engine, ensuring `setSeed(n)` makes the entire system deterministic.

**Tech Stack:** TypeScript (strict), pure math (no external deps), xoshiro128++ algorithm

## Global Constraints

- No external dependencies — pure TypeScript/math only
- Preserve existing public APIs — backward compatible
- No UI changes
- No changes to old `MiniMindModel` (non-Tensor model)
- All files must be within `src/lib/minimind/`
- `npm run build` must pass with zero errors/warnings
- Test runner: `npx tsx src/lib/minimind/core/__tests__/run.ts`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/minimind/core/random/SeededRandom.ts` | **Create** | xoshiro128++ PRNG engine with state save/restore |
| `src/lib/minimind/core/random/Random.ts` | **Create** | Global singleton: setSeed, random, randn, uniform, shuffle |
| `src/lib/minimind/core/random/index.ts` | **Create** | Barrel export |
| `src/lib/minimind/core/random/__tests__/random.test.ts` | **Create** | Unit tests |
| `src/lib/minimind/core/Tensor.ts` | **Modify** | randn() and uniform() delegate to Random |
| `src/lib/minimind/core/Initialization.ts` | **Modify** | All init methods delegate to Random |
| `src/lib/minimind/data/BatchSampler.ts` | **Modify** | Replace inline mulberry32 with Random.shuffle |
| `src/lib/minimind/inference/TensorGenerator.ts` | **Modify** | Replace inline createSeededRNG with Random |
| `src/lib/minimind/core/index.ts` | **Modify** | Export random module |
| `src/lib/minimind/index.ts` | **Modify** | Export random module |
| `src/lib/minimind/core/__tests__/run.ts` | **Modify** | Import and run random tests |

---

### Task 1: Create SeededRandom (PRNG Engine)

**Files:**
- Create: `src/lib/minimind/core/random/SeededRandom.ts`

**Interfaces:**
- Produces: `SeededRandom` class with `next(): number`, `saveState(): number[]`, `restoreState(state: number[]): void`, `clone(): SeededRandom`

```typescript
// ============================================================
// SeededRandom — xoshiro128++ PRNG engine
// ============================================================
// High-quality 32-bit PRNG with 128-bit state.
// Passes PractRand, fast, minimal. Used as the sole RNG
// source for all MiniMind randomness.
//
// Algorithm: xoshiro128++ 1.0 by David Blackman and Sebastiano Vigna
// Paper: https://prng.di.unimi.it/
// ============================================================

/**
 * xoshiro128++ PRNG.
 *
 * Properties:
 *   - 128-bit state (4 × 32-bit)
 *   - Period: 2^128 - 1
 *   - Returns values in [0, 1)
 *   - State is fully serializable for checkpoint reproducibility
 */
export class SeededRandom {
  private s: Uint32Array;

  /**
   * Initialize PRNG from a numeric seed.
   * Uses splitmix32 to expand the seed into full 128-bit state.
   */
  constructor(seed: number) {
    this.s = new Uint32Array(4);
    // SplitMix32 expansion: seed → 4 state words
    let z = (seed | 0) >>> 0;
    this.s[0] = splitmix32_next(z);
    this.s[1] = splitmix32_next(this.s[0]);
    this.s[2] = splitmix32_next(this.s[1]);
    this.s[3] = splitmix32_next(this.s[2]);
  }

  /**
   * Generate next random number in [0, 1).
   */
  next(): number {
    const result = rotl(this.s[0] + this.s[3], 7) + this.s[0];
    const t = this.s[1] << 9;

    this.s[2] ^= this.s[0];
    this.s[3] ^= this.s[1];
    this.s[1] ^= this.s[2];
    this.s[0] ^= this.s[3];

    this.s[2] ^= t;
    this.s[3] = rotl(this.s[3], 11);

    // Convert to [0, 1) — use upper 24 bits for mantissa quality
    return (result >>> 8) / 16777216;
  }

  /**
   * Generate standard normal random number using Box-Muller.
   * Consumes 2 uniform values, returns 1 or 2 normals.
   * Internal cache for the second value of each pair.
   */
  private _hasSpare: boolean = false;
  private _spare: number = 0;

  randn(): number {
    if (this._hasSpare) {
      this._hasSpare = false;
      return this._spare;
    }
    const u1 = this.next();
    const u2 = this.next();
    const r = Math.sqrt(-2 * Math.log(u1 || 1e-15));
    const theta = 2 * Math.PI * u2;
    this._spare = r * Math.sin(theta);
    this._hasSpare = true;
    return r * Math.cos(theta);
  }

  /**
   * Save RNG state for checkpointing.
   * Returns a copy of the 4 state words + spare flag.
   */
  saveState(): number[] {
    return [this.s[0], this.s[1], this.s[2], this.s[3], this._hasSpare ? 1 : 0, this._spare];
  }

  /**
   * Restore RNG state from a previously saved snapshot.
   */
  restoreState(state: number[]): void {
    this.s[0] = state[0];
    this.s[1] = state[1];
    this.s[2] = state[2];
    this.s[3] = state[3];
    this._hasSpare = state[4] === 1;
    this._spare = state[5];
  }

  /**
   * Create an independent clone with the same state.
   */
  clone(): SeededRandom {
    const c = new SeededRandom(0);
    c.s[0] = this.s[0];
    c.s[1] = this.s[1];
    c.s[2] = this.s[2];
    c.s[3] = this.s[3];
    c._hasSpare = this._hasSpare;
    c._spare = this._spare;
    return c;
  }
}

// ── Internal helpers ──

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

function splitmix32_next(state: number): number {
  let z = (state + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}
```

---

### Task 2: Create Random (Global Singleton)

**Files:**
- Create: `src/lib/minimind/core/random/Random.ts`

**Interfaces:**
- Consumes: `SeededRandom` from Task 1
- Produces: `Random` namespace with `setSeed(seed: number): void`, `random(): number`, `randn(): number`, `uniform(low: number, high: number): number`, `shuffle<T>(arr: T[]): void`, `saveState(): number[]`, `restoreState(state: number[]): void`, `getState(): SeededRandom` (for cloning)

```typescript
// ============================================================
// Random — Global deterministic random singleton
// ============================================================
// Single entry point for all randomness in MiniMind.
// Call Random.setSeed(n) once at program start to make
// everything reproducible.
//
// Default behavior (before setSeed is called):
//   Uses a randomly-initialized SeededRandom, producing
//   non-deterministic output — backward compatible with
//   existing code that doesn't set seeds.
// ============================================================

import { SeededRandom } from "./SeededRandom";

let _instance: SeededRandom = new SeededRandom(Date.now() & 0xffffffff);

export const Random = {
  /**
   * Set global seed for deterministic randomness.
   * Resets the RNG state completely.
   */
  setSeed(seed: number): void {
    _instance = new SeededRandom(seed);
  },

  /**
   * Get [0, 1) uniform random number.
   * Drop-in replacement for Math.random().
   */
  random(): number {
    return _instance.next();
  },

  /**
   * Standard normal random number N(0, 1).
   * Box-Muller transform consuming 2 uniform values.
   */
  randn(): number {
    return _instance.randn();
  },

  /**
   * Uniform random number in [low, high).
   */
  uniform(low: number, high: number): number {
    return low + _instance.next() * (high - low);
  },

  /**
   * Fisher-Yates shuffle in-place using the global RNG.
   */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(_instance.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  },

  /**
   * Save full RNG state for checkpointing.
   */
  saveState(): number[] {
    return _instance.saveState();
  },

  /**
   * Restore full RNG state from checkpoint.
   */
  restoreState(state: number[]): void {
    _instance.restoreState(state);
  },

  /**
   * Get raw PRNG for use cases needing direct control
   * (e.g. creating independent RNG instances).
   */
  getInstance(): SeededRandom {
    return _instance;
  },
};
```

---

### Task 3: Create barrel export and test file

**Files:**
- Create: `src/lib/minimind/core/random/index.ts`
- Create: `src/lib/minimind/core/random/__tests__/random.test.ts`

**Interfaces:**
- Consumes: `SeededRandom` from Task 1, `Random` from Task 2
- Produces: `random/index.ts` barrel export; `random.test.ts` test runner

- [ ] **Step 1: Write barrel export**

```typescript
// ============================================================
// MiniMind Core — random/index.ts
// ============================================================

export { SeededRandom } from "./SeededRandom";
export { Random } from "./Random";
```

- [ ] **Step 2: Write random.test.ts**

```typescript
// ============================================================
// Random engine unit tests
// ============================================================

import { SeededRandom } from "../SeededRandom";
import { Random } from "../Random";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertClose(actual: number, expected: number, tol: number, msg: string): void {
  if (Math.abs(actual - expected) <= tol) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${Math.abs(actual-expected)})`); }
}

export function runRandomTests(): { passed: number; failed: number } {
  console.log("\n=== Random Engine Tests ===\n");

  // ── SeededRandom: basic properties ──
  console.log("SeededRandom basics:");
  {
    const rng = new SeededRandom(42);
    const vals: number[] = [];
    for (let i = 0; i < 100; i++) vals.push(rng.next());
    // All values in [0, 1)
    assert(vals.every(v => v >= 0 && v < 1), "all values in [0, 1)");
    // Not all identical (basic randomness check)
    assert(new Set(vals.slice(0, 20)).size > 1, "produces varied values");
  }

  // ── SeededRandom: reproducibility ──
  console.log("SeededRandom reproducibility:");
  {
    const rng1 = new SeededRandom(12345);
    const seq1: number[] = [];
    for (let i = 0; i < 100; i++) seq1.push(rng1.next());

    const rng2 = new SeededRandom(12345);
    const seq2: number[] = [];
    for (let i = 0; i < 100; i++) seq2.push(rng2.next());

    let match = true;
    for (let i = 0; i < 100; i++) {
      if (seq1[i] !== seq2[i]) { match = false; break; }
    }
    assert(match, "same seed produces identical 100-value sequence");

    // Different seed produces different sequence
    const rng3 = new SeededRandom(99999);
    const seq3: number[] = [];
    for (let i = 0; i < 10; i++) seq3.push(rng3.next());

    let diff = false;
    for (let i = 0; i < 10; i++) {
      if (seq1[i] !== seq3[i]) { diff = true; break; }
    }
    assert(diff, "different seed produces different sequence");
  }

  // ── SeededRandom: state save/restore ──
  console.log("SeededRandom state save/restore:");
  {
    const rng = new SeededRandom(42);
    for (let i = 0; i < 50; i++) rng.next(); // advance
    const state = rng.saveState();

    // Generate 50 more values
    const expected: number[] = [];
    for (let i = 0; i < 50; i++) expected.push(rng.next());

    // Restore and regenerate — should match
    rng.restoreState(state);
    const restored: number[] = [];
    for (let i = 0; i < 50; i++) restored.push(rng.next());

    let match = true;
    for (let i = 0; i < 50; i++) {
      if (expected[i] !== restored[i]) { match = false; break; }
    }
    assert(match, "state save/restore produces identical subsequent sequence");
  }

  // ── SeededRandom: clone independence ──
  console.log("SeededRandom clone:");
  {
    const rng = new SeededRandom(99);
    for (let i = 0; i < 10; i++) rng.next();
    const clone = rng.clone();

    const origVals: number[] = [];
    const cloneVals: number[] = [];
    for (let i = 0; i < 20; i++) {
      origVals.push(rng.next());
      cloneVals.push(clone.next());
    }

    let match = true;
    for (let i = 0; i < 20; i++) {
      if (origVals[i] !== cloneVals[i]) { match = false; break; }
    }
    assert(match, "clone produces identical sequence from snapshot point");
  }

  // ── SeededRandom: randn() distribution ──
  console.log("SeededRandom randn():");
  {
    const rng = new SeededRandom(7);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) samples.push(rng.randn());

    // Mean ≈ 0
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    assert(Math.abs(mean) < 0.15, `randn mean near 0: mean=${mean.toFixed(4)}`);

    // Std ≈ 1
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);
    assert(Math.abs(std - 1) < 0.15, `randn std near 1: std=${std.toFixed(4)}`);
  }

  // ── Random singleton: setSeed reproducibility ──
  console.log("Random.setSeed reproducibility:");
  {
    Random.setSeed(42);
    const seq1: number[] = [];
    for (let i = 0; i < 50; i++) seq1.push(Random.random());

    Random.setSeed(42);
    const seq2: number[] = [];
    for (let i = 0; i < 50; i++) seq2.push(Random.random());

    let match = true;
    for (let i = 0; i < 50; i++) {
      if (seq1[i] !== seq2[i]) { match = false; break; }
    }
    assert(match, "Random.setSeed produces reproducible sequence");
  }

  // ── Random.shuffle reproducibility ──
  console.log("Random.shuffle:");
  {
    Random.setSeed(123);
    const arr1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    Random.shuffle(arr1);

    Random.setSeed(123);
    const arr2 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    Random.shuffle(arr2);

    let match = true;
    for (let i = 0; i < 10; i++) {
      if (arr1[i] !== arr2[i]) { match = false; break; }
    }
    assert(match, "same seed produces identical shuffle");

    // Shuffle doesn't lose elements
    const sorted1 = [...arr1].sort((a, b) => a - b);
    let allPresent = true;
    for (let i = 0; i < 10; i++) {
      if (sorted1[i] !== i) { allPresent = false; break; }
    }
    assert(allPresent, "shuffle preserves all elements");

    // Different seed → different order (with high probability)
    Random.setSeed(999);
    const arr3 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    Random.shuffle(arr3);
    let differs = false;
    for (let i = 0; i < 10; i++) {
      if (arr1[i] !== arr3[i]) { differs = true; break; }
    }
    assert(differs, "different seed produces different shuffle order");
  }

  // ── Random.saveState / restoreState ──
  console.log("Random saveState/restoreState:");
  {
    Random.setSeed(55);
    for (let i = 0; i < 25; i++) Random.random();
    const state = Random.saveState();

    const expected: number[] = [];
    for (let i = 0; i < 25; i++) expected.push(Random.random());

    Random.restoreState(state);
    const restored: number[] = [];
    for (let i = 0; i < 25; i++) restored.push(Random.random());

    let match = true;
    for (let i = 0; i < 25; i++) {
      if (expected[i] !== restored[i]) { match = false; break; }
    }
    assert(match, "Random saveState/restoreState cycle works");
  }

  console.log(`\n  Random tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
```

---

### Task 4: Integrate Random into Tensor.randn() and Tensor.uniform()

**Files:**
- Modify: `src/lib/minimind/core/Tensor.ts:172-206`

**Interfaces:**
- Consumes: `Random` from `./random/Random`
- Produces: Modified `Tensor.randn()` and `Tensor.uniform()` that delegate to Random

- [ ] **Step 1: Add import**

At the top of [Tensor.ts](src/lib/minimind/core/Tensor.ts), add after line 8:
```typescript
import { Random } from "./random/Random";
```

- [ ] **Step 2: Replace randn() implementation (lines 172-188)**

Replace the Box-Muller loop:
```typescript
  static randn(shape: number[], requiresGrad: boolean = false): Tensor {
    const size = shapeSize(shape);
    const data = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = Random.randn();
    }
    return new Tensor(data, shape, requiresGrad);
  }
```

- [ ] **Step 3: Replace uniform() implementation (lines 193-206)**

Replace the Math.random() loop:
```typescript
  static uniform(
    shape: number[],
    low: number = 0,
    high: number = 1,
    requiresGrad: boolean = false
  ): Tensor {
    const size = shapeSize(shape);
    const data = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      data[i] = Random.uniform(low, high);
    }
    return new Tensor(data, shape, requiresGrad);
  }
```

---

### Task 5: Integrate Random into Initialization.ts

**Files:**
- Modify: `src/lib/minimind/core/Initialization.ts`

**Interfaces:**
- Consumes: `Random` from `../core/random/Random`
- Produces: All initializer methods use Random instead of Math.random()

- [ ] **Step 1: Add import** at the top of the file (after the doc comment block, before `export type Initializer`):
```typescript
import { Random } from "./random/Random";
```

- [ ] **Step 2: Replace all `Math.random()` calls** with `Random.random()` or `Random.randn()`:

In `xavierUniform` (line 52): Replace `Math.random()` with `Random.random()`
```typescript
      data[i] = (Random.random() * 2 - 1) * limit;
```

In `xavierNormal` (lines 71-72): Replace Box-Muller with `Random.randn()`
```typescript
    for (let i = 0; i < n; i++) {
      data[i] = Random.randn() * std;
    }
```

In `kaimingUniform` (line 98): Replace `Math.random()` with `Random.random()`
```typescript
      data[i] = (Random.random() * 2 - 1) * limit;
```

In `kaimingNormal` (lines 114-115): Replace Box-Muller with `Random.randn()`
```typescript
    for (let i = 0; i < n; i++) {
      data[i] = Random.randn() * std;
    }
```

In `normal` (lines 135-136): Replace Box-Muller with `Random.randn()`
```typescript
    for (let i = 0; i < n; i++) {
      data[i] = Random.randn() * std;
    }
```

In `uniform` (line 157): Replace `Math.random()` with `Random.random()`
```typescript
      data[i] = (Random.random() * 2 - 1) * limit;
```

---

### Task 6: Integrate Random into BatchSampler.ts

**Files:**
- Modify: `src/lib/minimind/data/BatchSampler.ts`

**Interfaces:**
- Consumes: `Random` from `../core/random/Random`
- Produces: BatchSampler uses Random.shuffle() instead of inline mulberry32

- [ ] **Step 1: Add import** (after line 27, the doc comment):
```typescript
import { Random } from "../core/random/Random";
```

- [ ] **Step 2: Remove inline mulberry32 and shuffleInPlace functions** (lines 45-78 — the functions `mulberry32` and `shuffleInPlace`)

- [ ] **Step 3: Modify BatchIterator constructor** (lines 185-198):

Replace the shuffle block:
```typescript
    // 可选 shuffle
    if (options.shuffle) {
      const prevSeed = Random.saveState();
      Random.setSeed(options.seed);
      Random.shuffle(this.indices);
      Random.restoreState(prevSeed);
    }
```

Wait — using setSeed with save/restore is problematic because it changes global state. Better approach: since BatchSampler already uses its own seed, the cleanest option is to use a local SeededRandom instance for isolation. Let me reconsider...

Actually, the requirement says "same seed produces same shuffle order". The BatchSampler currently does this with its own mulberry32. The cleanest integration is: use `Random.shuffle` but with save/restore pattern, OR create a method that takes an explicit seed for one-shot shuffle.

Better approach — add `Random.seededShuffle(arr, seed)` to Random.ts:

In Random.ts, add:
```typescript
  /**
   * Shuffle using an isolated RNG with its own seed.
   * Doesn't affect the global RNG state.
   */
  seededShuffle<T>(arr: T[], seed: number): void {
    const rng = new SeededRandom(seed);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  },
```

Then in BatchSampler, replace the inline functions and modify the constructor:
```typescript
    // 可选 shuffle
    if (options.shuffle) {
      Random.seededShuffle(this.indices, options.seed);
    }
```

This is cleaner — no global state manipulation needed.

---

### Task 7: Integrate Random into TensorGenerator.ts

**Files:**
- Modify: `src/lib/minimind/inference/TensorGenerator.ts`

**Interfaces:**
- Consumes: `Random` from `../core/random/Random`
- Produces: `createSeededRNG` deleted, sampling uses Random

- [ ] **Step 1: Add import** (after line 25):
```typescript
import { Random } from "../core/random/Random";
import { SeededRandom } from "../core/random/SeededRandom";
```

- [ ] **Step 2: Replace `generate()` method** — the `createSeededRNG` call and usage:

In the `generate` method (lines 93-94), replace:
```typescript
    const random = seed !== undefined ? this.createSeededRNG(seed) : Math.random;
```
With:
```typescript
    // Use seeded RNG if seed provided, otherwise use global Random
    let seededRng: SeededRandom | null = null;
    const random = seed !== undefined
      ? (seededRng = new SeededRandom(seed), () => seededRng!.next())
      : () => Random.random();
```

Remove the `createSeededRNG` method entirely (lines 257-265).

Remove the `Math.random()` call at line 144 (the "Reset random seed after use" comment and the following lines 143-145):
```typescript
    // Reset seed if modified
    if (seed !== undefined) {
      Math.random(); // consume one to desync
    }
```

---

### Task 8: Update exports and test runner

**Files:**
- Modify: `src/lib/minimind/core/index.ts`
- Modify: `src/lib/minimind/index.ts`
- Modify: `src/lib/minimind/core/__tests__/run.ts`

- [ ] **Step 1: Add random exports in core/index.ts**

After line 40 (the Loss section comment block), add:
```typescript
// ── Random Engine (Phase 47) ──
export { SeededRandom, Random } from "./random";
```

- [ ] **Step 2: Add random exports in minimind/index.ts**

After line 26 (Core section), add `Random` and `SeededRandom` to the core re-exports:
```typescript
export {
  Tensor,
  add,
  multiply,
  matmul,
  sum,
  reshape,
  relu,
  executeBackward,
  buildTopologicalOrder,
  indexFor,
  shapeSize,
  Random,
  SeededRandom,
} from "./core";
```

- [ ] **Step 3: Import and run random tests in core/__tests__/run.ts**

Add import after line 7:
```typescript
import { runRandomTests } from "../random/__tests__/random.test";
```

Add execution after the Tensor tests block (after line 40, right after `runTensorTests()`):
```typescript
// Random engine tests
const randomResult = runRandomTests();
totalPassed += randomResult.passed;
totalFailed += randomResult.failed;
```

---

### Task 9: Run tests and build verification

- [ ] **Step 1: Run the test suite**

```bash
npx tsx src/lib/minimind/core/__tests__/run.ts
```

Expected: All existing tests pass + new random tests pass. Zero failures.

- [ ] **Step 2: Run npm build**

```bash
npm run build
```

Expected: Zero errors, zero warnings.

- [ ] **Step 3: Reproducibility proof**

Run the following manual verification (can be done via Node):

```typescript
// Proof script: verify same seed → same model init + same training loss
import { Random, Tensor, Initialization } from "./src/lib/minimind/core";

// Test 1: Tensor.randn reproducibility
Random.setSeed(42);
const t1 = Tensor.randn([3, 4]);
Random.setSeed(42);
const t2 = Tensor.randn([3, 4]);
const t1match = t1.data.every((v, i) => v === t2.data[i]);
console.log(`Tensor.randn reproducibility: ${t1match ? "PASS" : "FAIL"}`);

// Test 2: Initialization reproducibility
Random.setSeed(123);
const w1 = Initialization.xavierUniform([64, 128]);
Random.setSeed(123);
const w2 = Initialization.xavierUniform([64, 128]);
const wMatch = w1.every((v, i) => v === w2[i]);
console.log(`Initialization reproducibility: ${wMatch ? "PASS" : "FAIL"}`);

// Test 3: Different seed → different init
Random.setSeed(1);
const a = Initialization.kaimingNormal([32, 64]);
Random.setSeed(2);
const b = Initialization.kaimingNormal([32, 64]);
const aDiffB = !a.every((v, i) => v === b[i]);
console.log(`Different seed → different init: ${aDiffB ? "PASS" : "FAIL"}`);
```

---

## Self-Review Checklist

Before finalizing plan:
1. **Spec coverage:** Each requirement maps to a task
2. **No placeholders:** All code blocks are complete
3. **Type consistency:** `SeededRandom` API is consistent across all tasks
4. **Backward compatibility:** Existing APIs unchanged, `Math.random()` default behavior preserved when no seed set
