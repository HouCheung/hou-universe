// ============================================================
// TensorEmbedding — Unit & Gradient Validation Tests
// ============================================================
// Phase 33: Verifies the differentiable embedding lookup layer.
//
// Tests:
//   1. Construction & parameter registration
//   2. Forward shape validation
//   3. Forward value correctness (manual check)
//   4. Forward with larger dimensions
//   5. Input validation (1D input, OOB token IDs)
//   6. Gradient: weight.grad is non-null after backward
//   7. Repeated token accumulation (sparse gradient)
//   8. ZeroGrad propagation
//   9. Finite difference gradient check
//  10. Named parameters format
// ============================================================

import { Tensor } from "../Tensor";
import { Parameter } from "../Parameter";
import { TensorEmbedding } from "../../embedding/TensorEmbedding";
import { sum } from "../ops/sum";
import { gradientCheck } from "./gradientCheck";

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

function runGradientTest(
  name: string,
  computeLoss: (params: Tensor[]) => Tensor,
  params: Tensor[],
  tolerance: number = 1e-4
): void {
  console.log(`\n${name}:`);
  const result = gradientCheck(computeLoss, params, 1e-4, tolerance);

  if (result.passed) {
    console.log(`  PASS (maxDiff=${result.maxDiff.toExponential(4)})`);
    passed++;
  } else {
    console.error(`  FAIL (maxDiff=${result.maxDiff.toExponential(4)})`);
    for (const detail of result.details) {
      console.error(detail);
    }
    failed++;
  }
}

export function runEmbeddingTests(): { passed: number; failed: number } {
  console.log("\n=== TensorEmbedding Tests ===\n");

  // ──────────────────────────────────────────
  // Test 1: Construction & parameter registration
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — construction & parameter registration:");
  {
    const emb = new TensorEmbedding(100, 64);
    assert(emb.vocabSize === 100, "vocabSize is 100");
    assert(emb.embeddingDim === 64, "embeddingDim is 64");

    const params = emb.parameters();
    assert(params.length === 1, "parameters() returns 1 (weight)");
    assert(params[0].name === "weight", "param name is weight");

    const wShape = params[0].shape;
    assert(
      wShape[0] === 100 && wShape[1] === 64,
      `weight shape is [100, 64] (got [${wShape}])`
    );
    assert(params[0].requiresGrad === true, "weight requiresGrad=true");

    assert(emb.weight.name === "weight", "emb.weight accessor works");
  }

  // ──────────────────────────────────────────
  // Test 2: Forward shape validation
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — forward shape:");
  {
    const emb = new TensorEmbedding(50, 32);
    const ids = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]); // [2, 3]
    const out = emb.forward(ids);
    assert(
      out.shape[0] === 2 && out.shape[1] === 3 && out.shape[2] === 32,
      `forward: [2, 3] → [2, 3, 32] (got [${out.shape}])`
    );
    assert(out.requiresGrad === true, "output requiresGrad=true");
  }

  {
    const emb = new TensorEmbedding(10, 8);
    const ids = Tensor.fromArray([[0]]); // [1, 1]
    const out = emb.forward(ids);
    assert(
      out.shape[0] === 1 && out.shape[1] === 1 && out.shape[2] === 8,
      `forward: [1, 1] → [1, 1, 8] (got [${out.shape}])`
    );
  }

  {
    const emb = new TensorEmbedding(200, 16);
    const ids = Tensor.fromArray([[0, 1, 2, 3, 4]]); // [1, 5]
    const out = emb.forward(ids);
    assert(
      out.shape[0] === 1 && out.shape[1] === 5 && out.shape[2] === 16,
      `forward: [1, 5] → [1, 5, 16] (got [${out.shape}])`
    );
  }

  // ──────────────────────────────────────────
  // Test 3: Forward value correctness (manual check)
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — forward value correctness:");
  {
    const emb = new TensorEmbedding(5, 3);
    const w = emb.weight;

    // Manually set embedding values for easy verification
    // Row 0: [1, 2, 3]
    w.data[0] = 1; w.data[1] = 2; w.data[2] = 3;
    // Row 1: [4, 5, 6]
    w.data[3] = 4; w.data[4] = 5; w.data[5] = 6;
    // Row 2: [7, 8, 9]
    w.data[6] = 7; w.data[7] = 8; w.data[8] = 9;

    const ids = Tensor.fromArray([[1, 0, 2]]); // [1, 3]
    const out = emb.forward(ids); // [1, 3, 3]

    // Token 1 → row 1: [4, 5, 6]
    assertClose(out.data[0], 4, 1e-10, "token 1, dim 0 = 4");
    assertClose(out.data[1], 5, 1e-10, "token 1, dim 1 = 5");
    assertClose(out.data[2], 6, 1e-10, "token 1, dim 2 = 6");

    // Token 0 → row 0: [1, 2, 3]
    assertClose(out.data[3], 1, 1e-10, "token 0, dim 0 = 1");
    assertClose(out.data[4], 2, 1e-10, "token 0, dim 1 = 2");
    assertClose(out.data[5], 3, 1e-10, "token 0, dim 2 = 3");

    // Token 2 → row 2: [7, 8, 9]
    assertClose(out.data[6], 7, 1e-10, "token 2, dim 0 = 7");
    assertClose(out.data[7], 8, 1e-10, "token 2, dim 1 = 8");
    assertClose(out.data[8], 9, 1e-10, "token 2, dim 2 = 9");
  }

  // ──────────────────────────────────────────
  // Test 4: Forward with batch dimension
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — forward with batch:");
  {
    const emb = new TensorEmbedding(5, 2);
    const w = emb.weight;

    // Row 0: [10, 20]
    w.data[0] = 10; w.data[1] = 20;
    // Row 1: [30, 40]
    w.data[2] = 30; w.data[3] = 40;
    // Row 2: [50, 60]
    w.data[4] = 50; w.data[5] = 60;

    const ids = Tensor.fromArray([[0, 1], [2, 0]]); // [2, 2]
    const out = emb.forward(ids); // [2, 2, 2]

    // Batch 0, pos 0: token 0 → [10, 20]
    assertClose(out.data[0], 10, 1e-10, "batch0 pos0 dim0 = 10");
    assertClose(out.data[1], 20, 1e-10, "batch0 pos0 dim1 = 20");

    // Batch 0, pos 1: token 1 → [30, 40]
    assertClose(out.data[2], 30, 1e-10, "batch0 pos1 dim0 = 30");
    assertClose(out.data[3], 40, 1e-10, "batch0 pos1 dim1 = 40");

    // Batch 1, pos 0: token 2 → [50, 60]
    assertClose(out.data[4], 50, 1e-10, "batch1 pos0 dim0 = 50");
    assertClose(out.data[5], 60, 1e-10, "batch1 pos0 dim1 = 60");

    // Batch 1, pos 1: token 0 → [10, 20]
    assertClose(out.data[6], 10, 1e-10, "batch1 pos1 dim0 = 10");
    assertClose(out.data[7], 20, 1e-10, "batch1 pos1 dim1 = 20");
  }

  // ──────────────────────────────────────────
  // Test 5: Input validation
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — input validation:");
  {
    const emb = new TensorEmbedding(10, 8);

    let threw = false;
    try {
      const x = Tensor.randn([5]); // 1D
      emb.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on 1D input");

    threw = false;
    try {
      const x = Tensor.randn([2, 3, 4]); // 3D
      emb.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on 3D input");

    threw = false;
    try {
      // tokenId 99 is >= vocabSize (10)
      const ids = Tensor.fromArray([[99]]);
      emb.forward(ids);
    } catch {
      threw = true;
    }
    assert(threw, "throws on out-of-bounds token ID");
  }

  // ──────────────────────────────────────────
  // Test 6: Gradient — weight.grad after backward
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — gradient: weight.grad after backward:");
  {
    const emb = new TensorEmbedding(10, 4);
    const ids = Tensor.fromArray([[1, 2, 3], [4, 5, 6]]);

    emb.zeroGrad();
    const out = emb.forward(ids);
    const loss = sum(out);
    loss.backward();

    const wGrad = emb.weight.grad;
    assert(wGrad !== null, "weight.grad is allocated after backward");
    assert(
      wGrad!.some((v) => v !== 0),
      "weight.grad has non-zero values"
    );
    assert(
      wGrad!.length === 40,
      `weight.grad length is 40 (10*4), got ${wGrad!.length}`
    );

    // Only accessed rows should have gradient (rows 1,2,3,4,5,6)
    // Row 0 should be all zeros (never accessed)
    for (let d = 0; d < 4; d++) {
      assertClose(wGrad![d], 0, 1e-10, `weight.grad[0][${d}] = 0 (unaccessed row)`);
    }

    // Each accessed row should have non-zero gradient
    // (the sum backward gives gradOutput = 1 everywhere, so each accessed
    //  embedding element gets gradient = number of times accessed)
    // Row 1 accessed once: grad = 1.0 for each dim
    for (let d = 0; d < 4; d++) {
      assertClose(wGrad![1 * 4 + d], 1.0, 1e-10,
        `weight.grad[1][${d}] = 1.0 (accessed once)`);
    }
  }

  // ──────────────────────────────────────────
  // Test 7: Repeated token accumulation
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — repeated token accumulation:");
  {
    const emb = new TensorEmbedding(5, 3);
    // Token 1 appears 3 times
    const ids = Tensor.fromArray([[1, 1, 1]]);

    emb.zeroGrad();
    const out = emb.forward(ids);
    const loss = sum(out);
    loss.backward();

    const wGrad = emb.weight.grad!;

    // Row 1 should have gradient = 3.0 for each dim (3 accesses × gradOutput=1)
    for (let d = 0; d < 3; d++) {
      assertClose(wGrad[1 * 3 + d], 3.0, 1e-10,
        `weight.grad[1][${d}] = 3.0 (accessed 3 times)`);
    }

    // Row 0 should be all zeros
    for (let d = 0; d < 3; d++) {
      assertClose(wGrad[0 * 3 + d], 0, 1e-10,
        `weight.grad[0][${d}] = 0 (not accessed)`);
    }
  }

  // Test: token accessed from multiple positions in batch
  console.log("TensorEmbedding — repeated token across batch:");
  {
    const emb = new TensorEmbedding(5, 2);
    // Token 2 appears at 4 positions total
    const ids = Tensor.fromArray([[2, 2], [2, 2]]);

    emb.zeroGrad();
    const out = emb.forward(ids);
    const loss = sum(out);
    loss.backward();

    const wGrad = emb.weight.grad!;

    // Row 2 should have gradient = 4.0 for each dim
    for (let d = 0; d < 2; d++) {
      assertClose(wGrad[2 * 2 + d], 4.0, 1e-10,
        `weight.grad[2][${d}] = 4.0 (accessed 4 times)`);
    }
  }

  // ──────────────────────────────────────────
  // Test 8: ZeroGrad propagation
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — zeroGrad():");
  {
    const emb = new TensorEmbedding(5, 3);
    const ids = Tensor.fromArray([[1, 2]]);

    const out = emb.forward(ids);
    const loss = sum(out);
    loss.backward();

    assert(
      emb.weight.grad!.some((v) => v !== 0),
      "weight.grad non-zero after backward"
    );

    emb.zeroGrad();
    assert(
      emb.weight.grad!.every((v) => v === 0),
      "weight.grad all zeros after zeroGrad()"
    );
  }

  // ──────────────────────────────────────────
  // Test 9: Named parameters
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — namedParameters():");
  {
    const emb = new TensorEmbedding(10, 8);
    const named = emb.namedParameters();
    assert(named.length === 1, "namedParameters returns 1 entry");
    assert(named[0].name === "weight", "named[0] is weight");
    assert(
      named[0].parameter.shape[0] === 10 && named[0].parameter.shape[1] === 8,
      "weight shape correct in namedParameters"
    );
  }

  // ──────────────────────────────────────────
  // Test 10: Parameter count
  // ──────────────────────────────────────────
  console.log("TensorEmbedding — parameter count:");
  {
    const emb = new TensorEmbedding(1000, 512);
    const params = emb.parameters();
    const totalElements = params.reduce((s, p) => s + p.size, 0);
    assert(
      totalElements === 1000 * 512,
      `total elements = 1000*512 = 512000 (got ${totalElements})`
    );
  }

  // ──────────────────────────────────────────
  // Test 11: Finite difference gradient check
  // Use the TensorEmbedding module itself.
  // gradientCheck modifies param data in-place; emb.forward reads from the
  // same param reference, so the numerical gradient correctly tests the
  // module's analytic backward implementation.
  // ──────────────────────────────────────────
  {
    const emb = new TensorEmbedding(5, 3);
    const ids = Tensor.fromArray([[0, 1], [2, 0]]);

    runGradientTest(
      "TensorEmbedding — finite diff (module)",
      (_params) => {
        const out = emb.forward(ids);
        return sum(out);
      },
      [emb.weight],
      5e-4
    );
  }

  console.log(`\nTensorEmbedding tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
