// ============================================================
// Random engine unit tests — Phase 47
// ============================================================
// Tests:
//   1. SeededRandom produces values in [0, 1)
//   2. Same seed → identical sequence
//   3. Different seed → different sequence
//   4. State save/restore cycle
//   5. Clone produces identical subsequent sequence
//   6. randn() statistical properties (mean≈0, std≈1)
//   7. Random.setSeed reproducibility
//   8. Random.shuffle reproducibility
//   9. Random.seededShuffle doesn't affect global state
//   10. Random.saveState/restoreState cycle
// ============================================================

import { SeededRandom } from "../SeededRandom";
import { Random } from "../Random";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg}`);
  }
}

export function runRandomTests(): { passed: number; failed: number } {
  console.log("\n=== Random Engine Tests (Phase 47) ===\n");

  // ── Test 1: SeededRandom basic properties ──
  console.log("SeededRandom basics:");
  {
    const rng = new SeededRandom(42);
    const vals: number[] = [];
    for (let i = 0; i < 100; i++) vals.push(rng.next());

    assert(
      vals.every((v) => v >= 0 && v < 1),
      "all values in [0, 1)"
    );
    assert(
      new Set(vals.slice(0, 20)).size > 1,
      "produces varied values (not all identical)"
    );
  }

  // ── Test 2: Same seed → identical sequence ──
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
      if (seq1[i] !== seq2[i]) {
        match = false;
        break;
      }
    }
    assert(match, "same seed produces identical 100-value sequence");
  }

  // ── Test 3: Different seed → different sequence ──
  console.log("Different seed divergence:");
  {
    const rng1 = new SeededRandom(12345);
    const seq1: number[] = [];
    for (let i = 0; i < 10; i++) seq1.push(rng1.next());

    const rng3 = new SeededRandom(99999);
    const seq3: number[] = [];
    for (let i = 0; i < 10; i++) seq3.push(rng3.next());

    let diff = false;
    for (let i = 0; i < 10; i++) {
      if (seq1[i] !== seq3[i]) {
        diff = true;
        break;
      }
    }
    assert(diff, "different seed produces different sequence");
  }

  // ── Test 4: State save/restore cycle ──
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
      if (expected[i] !== restored[i]) {
        match = false;
        break;
      }
    }
    assert(match, "state save/restore produces identical subsequent sequence");
  }

  // ── Test 5: Clone independence ──
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
      if (origVals[i] !== cloneVals[i]) {
        match = false;
        break;
      }
    }
    assert(match, "clone produces identical sequence from snapshot point");
  }

  // ── Test 6: randn() statistical properties ──
  console.log("SeededRandom randn() distribution:");
  {
    const rng = new SeededRandom(7);
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) samples.push(rng.randn());

    // Mean ≈ 0
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    assert(Math.abs(mean) < 0.15, `randn mean near 0: mean=${mean.toFixed(4)}`);

    // Std ≈ 1
    const variance =
      samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);
    assert(
      Math.abs(std - 1) < 0.15,
      `randn std near 1: std=${std.toFixed(4)}`
    );
  }

  // ── Test 7: Random.setSeed reproducibility ──
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
      if (seq1[i] !== seq2[i]) {
        match = false;
        break;
      }
    }
    assert(match, "Random.setSeed produces reproducible sequence");
  }

  // ── Test 8: Random.shuffle reproducibility ──
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
      if (arr1[i] !== arr2[i]) {
        match = false;
        break;
      }
    }
    assert(match, "same seed produces identical shuffle order");

    // Shuffle doesn't lose elements
    const sorted1 = [...arr1].sort((a, b) => a - b);
    let allPresent = true;
    for (let i = 0; i < 10; i++) {
      if (sorted1[i] !== i) {
        allPresent = false;
        break;
      }
    }
    assert(allPresent, "shuffle preserves all elements");

    // Different seed → different order (high probability)
    Random.setSeed(999);
    const arr3 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    Random.shuffle(arr3);
    let differs = false;
    for (let i = 0; i < 10; i++) {
      if (arr1[i] !== arr3[i]) {
        differs = true;
        break;
      }
    }
    assert(differs, "different seed produces different shuffle order");
  }

  // ── Test 9: seededShuffle doesn't affect global state ──
  console.log("Random.seededShuffle isolation:");
  {
    Random.setSeed(888);
    const before = Random.random();
    Random.setSeed(888);
    const arr = [0, 1, 2, 3, 4];
    Random.seededShuffle(arr, 777); // isolated shuffle
    const after = Random.random();
    assert(
      before === after,
      "seededShuffle does not affect global RNG state"
    );
  }

  // ── Test 10: Random.saveState/restoreState cycle ──
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
      if (expected[i] !== restored[i]) {
        match = false;
        break;
      }
    }
    assert(match, "Random saveState/restoreState cycle works");
  }

  console.log(`\n  Random tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
