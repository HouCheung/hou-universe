// ============================================================
// Optimizer — Unit Tests
// ============================================================
// Phase 38: Verifies Optimizer base class and SGDOptimizer.
// Phase 39: Verifies AdamWOptimizer.
//
// Tests:
//   1. Optimizer stores parameters correctly
//   2. zeroGrad clears all parameter gradients
//   3. SGD step updates parameters by -lr * grad
//   4. SGD step skips null-grad parameters
//   5. SGD preserves requiresGrad on parameters
//   6. Multiple SGD steps accumulate correctly
//   7-16. AdamW optimizer tests (see Phase 39 section)
// ============================================================

import { Tensor } from "../Tensor";
import { Parameter } from "../Parameter";
import { Optimizer } from "../optim/Optimizer";
import { SGDOptimizer } from "../optim/SGD";
import { AdamWOptimizer } from "../optim/AdamW";

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

function assertClose(
  actual: number,
  expected: number,
  tolerance: number,
  msg: string
): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) {
    passed++;
  } else {
    failed++;
    console.error(
      `  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`
    );
  }
}

export function runOptimTests(): { passed: number; failed: number } {
  console.log("\n=== Optimizer Tests ===\n");

  // ============================================================
  // SECTION 1: Optimizer base class
  // ============================================================
  console.log("--- Optimizer base class ---");

  // Test 1a: Constructor stores parameters
  console.log("Optimizer — parameter storage:");
  {
    const p1 = new Parameter(Tensor.ones([3]), "test.p1");
    const p2 = new Parameter(Tensor.zeros([5]), "test.p2");

    // Create concrete subclass for testing
    class TestOptimizer extends Optimizer {
      step(): void {
        // no-op for testing
      }
    }

    const opt = new TestOptimizer([p1, p2]);
    assert(opt.parameters.length === 2, "stores 2 parameters");
    assert(opt.parameters[0] === p1, "first parameter is p1");
    assert(opt.parameters[1] === p2, "second parameter is p2");
  }

  // Test 1b: zeroGrad clears all parameter gradients
  console.log("Optimizer — zeroGrad:");
  {
    const p1 = new Parameter(Tensor.ones([3]), "test.a");
    const p2 = new Parameter(Tensor.ones([4]), "test.b");

    // Set non-zero gradients
    p1.grad = new Float64Array([1.0, 2.0, 3.0]);
    p2.grad = new Float64Array([0.5, 0.5, 0.5, 0.5]);

    class TestOptimizer extends Optimizer {
      step(): void {}
    }

    const opt = new TestOptimizer([p1, p2]);
    opt.zeroGrad();

    for (let i = 0; i < 3; i++) {
      assert(p1.grad![i] === 0, `p1.grad[${i}] is zero after zeroGrad`);
    }
    for (let i = 0; i < 4; i++) {
      assert(p2.grad![i] === 0, `p2.grad[${i}] is zero after zeroGrad`);
    }
  }

  // ============================================================
  // SECTION 2: SGDOptimizer — parameter update
  // ============================================================
  console.log("\n--- SGDOptimizer ---");

  // Test 2a: Single parameter, exact update
  console.log("SGDOptimizer — single param update:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    // data = [1, 1, 1]
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new SGDOptimizer([p], 0.1);
    optim.step();

    // W -= lr * grad: 1 - 0.1*0.1 = 0.99, 1 - 0.1*0.2 = 0.98, 1 - 0.1*0.3 = 0.97
    assertClose(p.data[0], 0.99, 1e-14, "param[0] = 0.99");
    assertClose(p.data[1], 0.98, 1e-14, "param[1] = 0.98");
    assertClose(p.data[2], 0.97, 1e-14, "param[2] = 0.97");
  }

  // Test 2b: Different learning rates
  console.log("SGDOptimizer — learning rate effect:");
  {
    const p1 = new Parameter(Tensor.ones([1]), "test.a");
    const p2 = new Parameter(Tensor.ones([1]), "test.b");
    p1.grad = new Float64Array([1.0]);
    p2.grad = new Float64Array([1.0]);

    const opt1 = new SGDOptimizer([p1], 0.5);
    const opt2 = new SGDOptimizer([p2], 0.01);
    opt1.step();
    opt2.step();

    // p1: 1 - 0.5*1 = 0.5, p2: 1 - 0.01*1 = 0.99
    assertClose(p1.data[0], 0.5, 1e-14, "lr=0.5 → param=0.5");
    assertClose(p2.data[0], 0.99, 1e-14, "lr=0.01 → param=0.99");
    assert(p1.data[0] !== p2.data[0], "different LRs produce different updates");
  }

  // Test 2c: Multiple parameters updated independently
  console.log("SGDOptimizer — multiple params:");
  {
    const p1 = new Parameter(Tensor.ones([2]), "test.w1");
    const p2 = new Parameter(Tensor.ones([2]), "test.w2");
    p1.grad = new Float64Array([0.5, -0.3]);
    p2.grad = new Float64Array([-0.2, 0.4]);

    const optim = new SGDOptimizer([p1, p2], 0.1);
    optim.step();

    // p1: 1 - 0.1*0.5 = 0.95, 1 - 0.1*(-0.3) = 1.03
    assertClose(p1.data[0], 0.95, 1e-14, "p1[0] = 0.95");
    assertClose(p1.data[1], 1.03, 1e-14, "p1[1] = 1.03");
    // p2: 1 - 0.1*(-0.2) = 1.02, 1 - 0.1*0.4 = 0.96
    assertClose(p2.data[0], 1.02, 1e-14, "p2[0] = 1.02");
    assertClose(p2.data[1], 0.96, 1e-14, "p2[1] = 0.96");
  }

  // Test 2d: SGD step skips null-grad parameters
  console.log("SGDOptimizer — skips null grad:");
  {
    const p1 = new Parameter(Tensor.ones([2]), "test.a");
    const p2 = new Parameter(Tensor.ones([2]), "test.b");
    p1.grad = new Float64Array([0.5, 0.5]);
    // p2.grad stays null (from Parameter.of, grad starts as zeros, not null)
    p2.grad = null;

    const optim = new SGDOptimizer([p1, p2], 0.1);
    optim.step();

    // p1 should be updated
    assertClose(p1.data[0], 0.95, 1e-14, "p1 updated (grad exists)");
    // p2 should be unchanged (grad was null, skipped)
    assertClose(p2.data[0], 1.0, 1e-14, "p2 unchanged (grad null)");
  }

  // Test 2e: Multiple steps accumulate
  console.log("SGDOptimizer — multiple steps:");
  {
    const p = new Parameter(Tensor.ones([1]), "test.w");
    const optim = new SGDOptimizer([p], 0.1);

    for (let step = 0; step < 5; step++) {
      p.grad = new Float64Array([1.0]); // constant grad
      optim.step();
    }

    // After 5 steps: 1 - 5*0.1*1 = 0.5
    assertClose(p.data[0], 0.5, 1e-14, "after 5 SGD steps, param = 0.5");
  }

  // Test 2f: requiresGrad preserved after step
  console.log("SGDOptimizer — preserves requiresGrad:");
  {
    const p = new Parameter(Tensor.randn([3]), "test.w");
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new SGDOptimizer([p], 0.01);
    optim.step();

    assert(p.requiresGrad === true, "requiresGrad stays true after step");
    assert(p.grad !== null, "grad still exists after step");
  }

  // Test 2g: Step modifies data in-place (same reference)
  console.log("SGDOptimizer — in-place update:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    const originalData = p.data;
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new SGDOptimizer([p], 0.01);
    optim.step();

    assert(p.data === originalData, "data reference unchanged (in-place update)");
  }

  // ============================================================
  // SECTION 3: zeroGrad after step
  // ============================================================
  console.log("\n--- Optimizer workflow ---");

  // Test 3a: Full workflow — step then zeroGrad
  console.log("SGDOptimizer — step then zeroGrad:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new SGDOptimizer([p], 0.1);
    optim.step();
    optim.zeroGrad();

    // Data should be updated
    assertClose(p.data[0], 0.99, 1e-14, "data updated after step");
    // Grad should be zeroed
    for (let i = 0; i < 3; i++) {
      assert(p.grad![i] === 0, `grad[${i}] zero after zeroGrad`);
    }
  }

  // ============================================================
  // SECTION 4: AdamWOptimizer — parameter update
  // ============================================================
  console.log("\n--- AdamWOptimizer ---");

  // Test 4a: Constructor stores config correctly
  console.log("AdamW — config storage:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    const optim = new AdamWOptimizer([p], {
      lr: 0.001,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.01,
    });

    assert(optim.lr === 0.001, "lr stored correctly");
    assert(optim.betas[0] === 0.9 && optim.betas[1] === 0.999, "betas stored correctly");
    assert(optim.eps === 1e-8, "eps stored correctly");
    assert(optim.weightDecay === 0.01, "weightDecay stored correctly");
    assert(optim.getStepCount() === 0, "step count starts at 0");
  }

  // Test 4b: Default config values
  console.log("AdamW — default config:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    const optim = new AdamWOptimizer([p]);
    assert(optim.lr === 0.001, "default lr = 0.001");
    assert(optim.betas[0] === 0.9 && optim.betas[1] === 0.999, "default betas = [0.9, 0.999]");
    assert(optim.eps === 1e-8, "default eps = 1e-8");
    assert(optim.weightDecay === 0.01, "default weightDecay = 0.01");
  }

  // Test 4c: Lazy state initialization
  console.log("AdamW — state initialization:");
  {
    const p = new Parameter(Tensor.ones([4]), "test.w");
    const optim = new AdamWOptimizer([p]);

    // State should be initialized in constructor
    const s = optim.getState(p);
    assert(s !== undefined, "state exists after construction");
    assert(s!.m !== null, "m buffer exists");
    assert(s!.v !== null, "v buffer exists");
    assert(s!.m.length === 4, "m buffer has correct length (4)");
    assert(s!.v.length === 4, "v buffer has correct length (4)");

    // m and v should be initialized to zeros
    for (let i = 0; i < 4; i++) {
      assert(s!.m[i] === 0, `m[${i}] initialized to 0`);
      assert(s!.v[i] === 0, `v[${i}] initialized to 0`);
    }
  }

  // Test 4d: Single step parameter update (no weight decay for simplicity)
  console.log("AdamW — single step update (no weight decay):");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new AdamWOptimizer([p], {
      lr: 0.01,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.0,
    });
    optim.step();

    assert(optim.getStepCount() === 1, "step count = 1 after first step");

    // Verify parameter actually changed
    assert(p.data[0] !== 1.0, "param[0] changed from initial 1.0");
    assert(p.data[1] !== 1.0, "param[1] changed from initial 1.0");
    assert(p.data[2] !== 1.0, "param[2] changed from initial 1.0");

    // Verify m and v are non-zero after update
    const s = optim.getState(p)!;
    assert(s.m[0] !== 0, "m[0] non-zero after step");
    assert(s.v[0] !== 0, "v[0] non-zero after step");
  }

  // Test 4e: Bias correction validation (early steps)
  console.log("AdamW — bias correction:");
  {
    // Use a simple setup: single parameter, constant gradient
    // With bias correction, early steps should have larger effective LR
    const p = new Parameter(Tensor.zeros([1]), "test.w");
    p.grad = new Float64Array([1.0]);

    const optim = new AdamWOptimizer([p], {
      lr: 0.1,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.0,
    });

    // Step 1: biasCorrection1 = 1/(1-0.9) = 10, biasCorrection2 = 1/(1-0.999) = 1000
    // m = 0.1 * 1 = 0.1, mHat = 0.1 * 10 = 1.0
    // v = 0.001 * 1 = 0.001, vHat = 0.001 * 1000 = 1.0
    // update = 0.1 * (1.0 / (1.0 + 1e-8)) ≈ 0.1
    optim.step();
    const afterStep1 = p.data[0];

    // Step 2: biasCorrection1 = 1/(1-0.9^2) = 1/0.19 ≈ 5.26, biasCorrection2 = 1/(1-0.999^2) ≈ 500.25
    p.grad = new Float64Array([1.0]); // reset grad (normally zeroGrad would do this)
    optim.step();
    const afterStep2 = p.data[0];

    // Both steps should have moved the parameter (and in different amounts due to changing bias correction)
    assert(afterStep1 !== 0, "parameter moved after step 1");
    assert(afterStep2 !== afterStep1, "parameter moved differently in step 2 (bias correction effect)");
    assert(optim.getStepCount() === 2, "step count = 2");
  }

  // Test 4f: Weight decay validation
  console.log("AdamW — weight decay:");
  {
    // Two identical parameters, one with weight decay, one without
    const pNoWd = new Parameter(Tensor.ones([3]), "test.no_wd");
    const pWd = new Parameter(Tensor.ones([3]), "test.wd");

    pNoWd.grad = new Float64Array([0.0, 0.0, 0.0]);
    pWd.grad = new Float64Array([0.0, 0.0, 0.0]); // zero gradient to isolate weight decay effect

    const optimNoWd = new AdamWOptimizer([pNoWd], { lr: 0.1, weightDecay: 0.0 });
    const optimWd = new AdamWOptimizer([pWd], { lr: 0.1, weightDecay: 0.5 });

    optimNoWd.step();
    optimWd.step();

    // With zero gradient, no weight decay: params unchanged
    assertClose(pNoWd.data[0], 1.0, 1e-14, "no weight decay: param unchanged (grad=0)");

    // With zero gradient and weight decay: params should shrink due to decoupled weight decay
    // θ -= lr * wd * θ = 1.0 - 0.1 * 0.5 * 1.0 = 0.95
    assertClose(pWd.data[0], 0.95, 1e-14, "weight decay: param shrinks even with grad=0");
  }

  // Test 4g: Weight decay with non-zero gradient
  console.log("AdamW — weight decay + gradient:");
  {
    const p = new Parameter(Tensor.ones([1]), "test.w");
    p.grad = new Float64Array([0.5]);

    const optim = new AdamWOptimizer([p], {
      lr: 0.1,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.1,
    });
    optim.step();

    // Parameter should have changed due to both gradient and weight decay
    assert(p.data[0] < 1.0, "param decreased (gradient pushes up, wd pushes down)");
    assert(p.data[0] !== 1.0, "param changed from initial 1.0");
  }

  // Test 4h: Multiple optimization steps (trend check)
  console.log("AdamW — multiple steps:");
  {
    // Starting from 1.0, constant gradient of 1.0, AdamW should drive param down
    const p = new Parameter(Tensor.ones([1]), "test.w");
    const optim = new AdamWOptimizer([p], {
      lr: 0.1,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.0,
    });

    const values: number[] = [p.data[0]];
    for (let step = 0; step < 10; step++) {
      p.grad = new Float64Array([1.0]);
      optim.step();
      values.push(p.data[0]);
    }

    assert(optim.getStepCount() === 10, "step count = 10 after 10 steps");

    // Each step should change the parameter
    for (let i = 1; i < values.length; i++) {
      assert(values[i] !== values[i - 1], `step ${i}: param changed from previous step`);
    }

    // Parameter should move substantially over 10 steps
    assert(values[10] < values[0], "param decreased over 10 steps with positive grad");
  }

  // Test 4i: zeroGrad compatibility
  console.log("AdamW — zeroGrad:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new AdamWOptimizer([p], { lr: 0.01, weightDecay: 0.0 });

    // Before zeroGrad: grad exists
    assert(p.grad[0] === 0.1, "grad[0] = 0.1 before zeroGrad");

    optim.zeroGrad();

    // After zeroGrad: all grads should be zero
    for (let i = 0; i < 3; i++) {
      assert(p.grad![i] === 0, `grad[${i}] = 0 after zeroGrad`);
    }

    // But m and v state should NOT be cleared by zeroGrad
    const s = optim.getState(p)!;
    assert(s !== undefined, "optimizer state still exists after zeroGrad");
  }

  // Test 4j: Skip parameters with null grad
  console.log("AdamW — skips null grad:");
  {
    const p1 = new Parameter(Tensor.ones([2]), "test.a");
    const p2 = new Parameter(Tensor.ones([2]), "test.b");
    p1.grad = new Float64Array([0.5, 0.5]);
    p2.grad = null; // explicitly null

    const optim = new AdamWOptimizer([p1, p2], { lr: 0.1, weightDecay: 0.0 });
    optim.step();

    // p1 should be updated
    assert(p1.data[0] !== 1.0, "p1 updated (grad exists)");
    // p2 should be unchanged
    assertClose(p2.data[0], 1.0, 1e-14, "p2 unchanged (grad null)");
  }

  // Test 4k: In-place update (same reference)
  console.log("AdamW — in-place update:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    const originalData = p.data;
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new AdamWOptimizer([p], { lr: 0.01, weightDecay: 0.0 });
    optim.step();

    assert(p.data === originalData, "data reference unchanged (in-place update)");
  }

  // Test 4l: Preserves requiresGrad
  console.log("AdamW — preserves requiresGrad:");
  {
    const p = new Parameter(Tensor.randn([3]), "test.w");
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new AdamWOptimizer([p], { lr: 0.01, weightDecay: 0.0 });
    optim.step();

    assert(p.requiresGrad === true, "requiresGrad stays true after step");
  }

  // Test 4m: Parameter identity tracking via WeakMap
  console.log("AdamW — parameter identity tracking:");
  {
    const p1 = new Parameter(Tensor.ones([2]), "test.a");
    const p2 = new Parameter(Tensor.ones([2]), "test.b");

    const optim = new AdamWOptimizer([p1, p2], { lr: 0.01, weightDecay: 0.0 });

    const s1 = optim.getState(p1);
    const s2 = optim.getState(p2);

    assert(s1 !== undefined, "state exists for p1");
    assert(s2 !== undefined, "state exists for p2");
    assert(s1 !== s2, "different parameters have different state objects");
    assert(s1!.m !== s2!.m, "m buffers are separate per parameter");
  }

  // Test 4n: Full workflow — step then zeroGrad
  console.log("AdamW — step then zeroGrad:");
  {
    const p = new Parameter(Tensor.ones([3]), "test.w");
    p.grad = new Float64Array([0.1, 0.2, 0.3]);

    const optim = new AdamWOptimizer([p], {
      lr: 0.01,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.0,
    });
    optim.step();
    optim.zeroGrad();

    // Grad should be zeroed
    for (let i = 0; i < 3; i++) {
      assert(p.grad![i] === 0, `grad[${i}] zero after zeroGrad`);
    }

    // State should still exist
    const s = optim.getState(p);
    assert(s !== undefined, "state exists after full workflow step");
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n=== Optimizer tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
