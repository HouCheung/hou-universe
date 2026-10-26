// ============================================================
// Scheduler Tests — Phase 42 LR Scheduler
// ============================================================
// Tests:
//   1. LinearWarmupScheduler: warmup curve correct
//   2. CosineScheduler: warmup + cosine decay curve
//   3. CosineScheduler: monotonic decrease after warmup
//   4. CosineScheduler: reaches minLR at totalSteps
//   5. State save/restore consistency
//   6. Scheduler updates optimizer LR
//
// Run with: npx tsx src/lib/minimind/core/__tests__/run.ts
// ============================================================

import { Tensor } from "../Tensor";
import { Parameter } from "../Parameter";
import { AdamWOptimizer } from "../optim/AdamW";
import { SGDOptimizer } from "../optim/SGD";
import { CosineScheduler } from "../scheduler/CosineScheduler";
import { LinearWarmupScheduler } from "../scheduler/LinearWarmupScheduler";

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

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`);
  }
}

// ============================================================
// Test Helpers
// ============================================================

function createTestOptimizer(lr: number = 0.001): AdamWOptimizer {
  const p = new Parameter(Tensor.ones([10]), "test.w");
  p.grad = new Float64Array(10);
  return new AdamWOptimizer([p], { lr, weightDecay: 0.0 });
}

// ============================================================
// SECTION 1: LinearWarmupScheduler
// ============================================================

function runLinearWarmupTests(): void {
  console.log("\n--- LinearWarmupScheduler ---");

  // Test 1a: Constructor sets initial LR to warmup start
  console.log("LinearWarmup — initial LR at step 0:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new LinearWarmupScheduler(opt, {
      baseLR: 0.01,
      warmupSteps: 100,
    });
    assertClose(sched.getLR(), 0, 1e-14, "initial LR is 0 (first step of warmup)");
  }

  // Test 1b: LR grows linearly during warmup
  console.log("LinearWarmup — linear growth:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new LinearWarmupScheduler(opt, {
      baseLR: 0.01,
      warmupSteps: 100,
    });

    // Step through warmup
    const lrs: number[] = [];
    for (let i = 0; i < 100; i++) {
      sched.step();
      lrs.push(sched.getLR());
    }

    // Check linear growth
    assertClose(lrs[0], 0.01 * (1 / 100), 1e-12, "step 1: LR = baseLR * 1/warmup");
    assertClose(lrs[24], 0.01 * (25 / 100), 1e-12, "step 25: LR = baseLR * 25/warmup");
    assertClose(lrs[49], 0.01 * (50 / 100), 1e-12, "step 50: LR = baseLR * 50/warmup");
    assertClose(lrs[74], 0.01 * (75 / 100), 1e-12, "step 75: LR = baseLR * 75/warmup");
    assertClose(lrs[99], 0.01 * (100 / 100), 1e-12, "step 100: LR = baseLR");

    // Verify monotonic increase
    for (let i = 1; i < lrs.length; i++) {
      assert(lrs[i] > lrs[i - 1], `LR increases at step ${i + 1}: ${lrs[i]} > ${lrs[i - 1]}`);
    }
  }

  // Test 1c: LR stays constant after warmup
  console.log("LinearWarmup — constant after warmup:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new LinearWarmupScheduler(opt, {
      baseLR: 0.01,
      warmupSteps: 10,
    });

    // Complete warmup
    for (let i = 0; i < 10; i++) {
      sched.step();
    }
    assertClose(sched.getLR(), 0.01, 1e-14, "after warmup: LR = baseLR");

    // Additional steps should keep LR constant
    for (let i = 0; i < 10; i++) {
      sched.step();
      assertClose(sched.getLR(), 0.01, 1e-14, `step ${i + 11}: LR stays at baseLR`);
    }
  }

  // Test 1d: Updates optimizer LR
  console.log("LinearWarmup — updates optimizer LR:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new LinearWarmupScheduler(opt, {
      baseLR: 0.01,
      warmupSteps: 5,
    });

    sched.step(); // step 1
    assertClose(opt.lr, 0.01 * (1 / 5), 1e-14, "optimizer LR reflects scheduler");

    for (let i = 0; i < 4; i++) sched.step(); // steps 2-5
    assertClose(opt.lr, 0.01, 1e-14, "optimizer LR = baseLR after warmup");
  }
}

// ============================================================
// SECTION 2: CosineScheduler
// ============================================================

function runCosineSchedulerTests(): void {
  console.log("\n--- CosineScheduler ---");

  // Test 2a: Constructor sets initial LR
  console.log("Cosine — initial LR at step 0:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      warmupSteps: 100,
      totalSteps: 1000,
    });
    assertClose(sched.getLR(), 0, 1e-14, "initial LR is 0");
  }

  // Test 2b: Linear warmup phase
  console.log("Cosine — warmup phase:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      minLR: 1e-6,
      warmupSteps: 50,
      totalSteps: 500,
    });

    // Check warmup
    for (let i = 0; i < 50; i++) {
      sched.step();
    }
    assertClose(sched.getLR(), 0.01, 1e-10, "end of warmup: LR ≈ baseLR");

    // Step 25 (halfway through warmup)
    // Actually we already stepped 50 times, so let's create a fresh scheduler
  }

  // Test 2c: Cosine decay shape after warmup
  console.log("Cosine — decay phase shape:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      minLR: 0.0,
      warmupSteps: 10,
      totalSteps: 110,
    });

    // Complete warmup
    for (let i = 0; i < 10; i++) sched.step();

    // At start of decay: LR ≈ baseLR
    assertClose(sched.getLR(), 0.01, 1e-10, "start of decay: LR = baseLR");

    // Go to 25% through decay (step 35 total = 25/100 decay progress)
    for (let i = 0; i < 25; i++) sched.step();
    // progress = 25/100 = 0.25
    // LR = 0 + 0.01 * 0.5 * (1 + cos(π * 0.25)) = 0.01 * 0.5 * (1 + 0.7071) = 0.01 * 0.8536 = 0.008536
    const expected25 = 0.01 * 0.5 * (1 + Math.cos(Math.PI * 0.25));
    assertClose(sched.getLR(), expected25, 1e-6, "25% decay: LR matches cosine formula");

    // 50% through decay (step 60)
    for (let i = 0; i < 25; i++) sched.step();
    // progress = 50/100 = 0.5
    // LR = 0.01 * 0.5 * (1 + cos(π * 0.5)) = 0.01 * 0.5 * (1 + 0) = 0.005
    const expected50 = 0.01 * 0.5 * (1 + Math.cos(Math.PI * 0.5));
    assertClose(sched.getLR(), expected50, 1e-6, "50% decay: LR matches cosine formula");

    // 100% through (step 110)
    for (let i = 0; i < 50; i++) sched.step();
    // progress = 100/100 = 1.0
    // LR = 0.01 * 0.5 * (1 + cos(π)) = 0.01 * 0.5 * 0 = 0
    assertClose(sched.getLR(), 0, 1e-12, "100% decay: LR = 0 (minLR)");
  }

  // Test 2d: Cosine monotonically decreases after warmup
  console.log("Cosine — monotonic decrease after warmup:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      minLR: 0.0,
      warmupSteps: 5,
      totalSteps: 105,
    });

    // Complete warmup
    for (let i = 0; i < 5; i++) sched.step();

    let prevLR = sched.getLR();
    let isMonotonic = true;
    for (let i = 0; i < 100; i++) {
      sched.step();
      const lr = sched.getLR();
      if (lr > prevLR + 1e-15) {
        isMonotonic = false;
        console.error(`    Non-monotonic at step ${i + 5}: ${lr} > ${prevLR}`);
      }
      prevLR = lr;
    }
    assert(isMonotonic, "cosine decay is monotonically decreasing after warmup");
  }

  // Test 2e: With non-zero minLR
  console.log("Cosine — non-zero minLR:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      minLR: 1e-6,
      warmupSteps: 10,
      totalSteps: 110,
    });

    // Complete warmup + all decay
    for (let i = 0; i < 110; i++) sched.step();

    assertClose(sched.getLR(), 1e-6, 1e-12, "final LR = minLR");
    assert(sched.getLR() > 0, "final LR > 0 (non-zero minLR)");
  }

  // Test 2f: Clamps at minLR after totalSteps
  console.log("Cosine — clamps at minLR after totalSteps:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      minLR: 0.0,
      warmupSteps: 0,
      totalSteps: 50,
    });

    for (let i = 0; i < 100; i++) sched.step(); // way past totalSteps

    assertClose(sched.getLR(), 0, 1e-14, "LR stays at minLR after totalSteps");
  }

  // Test 2g: Without warmup
  console.log("Cosine — no warmup:");
  {
    const opt = createTestOptimizer(0.01);
    const sched = new CosineScheduler(opt, {
      baseLR: 0.01,
      minLR: 0.0,
      warmupSteps: 0,
      totalSteps: 100,
    });

    // Initial LR should be baseLR
    assertClose(sched.getLR(), 0.01, 1e-10, "without warmup: initial LR = baseLR");

    // After first step: LR should start decreasing
    sched.step();
    assert(sched.getLR() < 0.01, "LR decreases from step 1 without warmup");
  }
}

// ============================================================
// SECTION 3: State Save/Restore
// ============================================================

function runStateSaveRestoreTests(): void {
  console.log("\n--- State Save/Restore ---");

  // Test 3a: CosineScheduler state save/restore
  console.log("Cosine — stateDict/loadStateDict:");
  {
    const opt1 = createTestOptimizer(0.001);
    const sched1 = new CosineScheduler(opt1, {
      baseLR: 0.001,
      minLR: 1e-6,
      warmupSteps: 50,
      totalSteps: 500,
    });

    // Train for 200 steps
    for (let i = 0; i < 200; i++) {
      sched1.step();
    }

    const lrAt200 = sched1.getLR();
    const state = sched1.stateDict();

    // Create new scheduler and restore
    const opt2 = createTestOptimizer(0.001);
    const sched2 = new CosineScheduler(opt2, {
      baseLR: 0.001,
      minLR: 1e-6,
      warmupSteps: 50,
      totalSteps: 500,
    });

    sched2.loadStateDict(state);

    // LR should match
    assertClose(sched2.getLR(), lrAt200, 1e-14, "restored LR matches original");
    assert(sched2.getStepCount() === 200, "restored step count = 200");

    // Continue stepping — should produce same next LR
    sched1.step();
    sched2.step();
    assertClose(sched2.getLR(), sched1.getLR(), 1e-14, "after restore + 1 step: LRs match");
  }

  // Test 3b: LinearWarmup state save/restore
  console.log("LinearWarmup — stateDict/loadStateDict:");
  {
    const opt1 = createTestOptimizer(0.01);
    const sched1 = new LinearWarmupScheduler(opt1, {
      baseLR: 0.01,
      warmupSteps: 100,
    });

    // Train for 50 steps
    for (let i = 0; i < 50; i++) {
      sched1.step();
    }

    const lrAt50 = sched1.getLR();
    const state = sched1.stateDict();

    // Restore
    const opt2 = createTestOptimizer(0.01);
    const sched2 = new LinearWarmupScheduler(opt2, {
      baseLR: 0.01,
      warmupSteps: 100,
    });

    sched2.loadStateDict(state);

    assertClose(sched2.getLR(), lrAt50, 1e-14, "restored LR matches");
    assert(sched2.getStepCount() === 50, "restored step count = 50");

    // Continue stepping
    sched1.step();
    sched2.step();
    assertClose(sched2.getLR(), sched1.getLR(), 1e-14, "LRs match after restore + 1 step");
  }
}

// ============================================================
// SECTION 4: SGD Compatibility
// ============================================================

function runSGDCompatibilityTests(): void {
  console.log("\n--- SGD Compatibility ---");

  // Test 4a: Scheduler works with SGD
  console.log("CosineScheduler with SGD:");
  {
    const p = new Parameter(Tensor.ones([5]), "test.w");
    p.grad = new Float64Array(5);
    const sgd = new SGDOptimizer([p], 0.1);

    const sched = new CosineScheduler(sgd, {
      baseLR: 0.1,
      minLR: 0.001,
      warmupSteps: 5,
      totalSteps: 50,
    });

    sched.step();
    // SGD.learningRate should have been updated
    assert(sgd.learningRate !== 0.1, "SGD learningRate changed by scheduler");
    assert(sgd.learningRate > 0, "SGD learningRate is positive");
  }
}

// ============================================================
// SECTION 5: Edge Cases
// ============================================================

function runEdgeCaseTests(): void {
  console.log("\n--- Edge Cases ---");

  // Test 5a: Base validation
  console.log("Validation:");
  {
    const opt = createTestOptimizer(0.001);

    // negative baseLR
    try {
      new CosineScheduler(opt, { baseLR: -0.01, totalSteps: 100 });
      assert(false, "should throw on negative baseLR");
    } catch {
      assert(true, "throws on negative baseLR");
    }

    // minLR > baseLR
    try {
      new CosineScheduler(opt, { baseLR: 0.01, minLR: 0.1, totalSteps: 100 });
      assert(false, "should throw on minLR > baseLR");
    } catch {
      assert(true, "throws on minLR > baseLR");
    }

    // warmupSteps >= totalSteps
    try {
      new CosineScheduler(opt, { baseLR: 0.01, warmupSteps: 100, totalSteps: 100 });
      assert(false, "should throw on warmup >= total");
    } catch {
      assert(true, "throws on warmupSteps >= totalSteps");
    }

    // totalSteps <= 0
    try {
      new CosineScheduler(opt, { baseLR: 0.01, totalSteps: 0 });
      assert(false, "should throw on totalSteps <= 0");
    } catch {
      assert(true, "throws on totalSteps <= 0");
    }
  }
}

// ============================================================
// Master Test Runner
// ============================================================

export function runSchedulerTests(): { passed: number; failed: number } {
  passed = 0;
  failed = 0;

  console.log("\n=== MiniMind Scheduler Tests (Phase 42) ===\n");

  runLinearWarmupTests();
  runCosineSchedulerTests();
  runStateSaveRestoreTests();
  runSGDCompatibilityTests();
  runEdgeCaseTests();

  console.log(`\n=== Scheduler tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
