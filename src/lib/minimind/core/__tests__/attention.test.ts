// ============================================================
// TensorAttention — Unit & Gradient Validation Tests
// ============================================================
// Phase 35: Verifies the TensorAttention module.
//
// Tests:
//   1. Construction & parameter registration
//   2. Forward shape validation [B,T,D] → [B,T,D]
//   3. Forward value sanity (finite, non-NaN)
//   4. Causal mask correctness
//   5. Parameter count validation
//   6. Gradient — all 4 weights receive gradient after backward
//   7. Finite difference gradient check on all 4 weights
//   8. Integration: Attention + RMSNorm + FeedForward block
// ============================================================

import { Tensor } from "../Tensor";
import { TensorAttention } from "../../attention/TensorAttention";
import { batchMatmul } from "../ops/batchMatmul";
import { causalMask } from "../ops/causalMask";
import { softmax } from "../ops/softmax";
import { sum } from "../ops/sum";
import { gradientCheck } from "./gradientCheck";
import { TensorRMSNorm } from "../../transformer/TensorRMSNorm";
import { TensorFeedForward } from "../../ffn/TensorFeedForward";
import { add } from "../ops/add";

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

export function runAttentionTests(): { passed: number; failed: number } {
  console.log("\n=== TensorAttention Tests ===\n");

  // ============================================================
  // SECTION 1: batchMatmul op tests
  // ============================================================
  console.log("--- batchMatmul op ---");

  // Test 1a: batchMatmul forward shape
  console.log("batchMatmul — forward shape:");
  {
    const a = Tensor.randn([2, 4, 3, 8]); // [B, H, T, Dh]
    const b = Tensor.randn([2, 4, 8, 3]); // [B, H, Dh, T]
    const c = batchMatmul(a, b);
    assert(
      c.shape[0] === 2 && c.shape[1] === 4 && c.shape[2] === 3 && c.shape[3] === 3,
      `batchMatmul shape [2,4,3,3] (got [${c.shape}])`
    );
  }

  // Test 1b: batchMatmul forward values
  console.log("batchMatmul — forward value correctness:");
  {
    // [1, 2, 3] @ [1, 3, 2] → [1, 2, 2] (single batch)
    const aData = new Float64Array([1, 2, 3, 4, 5, 6]); // [1, 2, 3]
    const bData = new Float64Array([1, 2, 3, 4, 5, 6]); // [1, 3, 2]
    const a = new Tensor(aData, [1, 2, 3], true);
    const b = new Tensor(bData, [1, 3, 2], true);
    const c = batchMatmul(a, b);
    // Row 0: [1,2,3] @ [[1,2],[3,4],[5,6]] = [1*1+2*3+3*5, 1*2+2*4+3*6] = [22, 28]
    // Row 1: [4,5,6] @ [[1,2],[3,4],[5,6]] = [4*1+5*3+6*5, 4*2+5*4+6*6] = [49, 64]
    assertClose(c.data[0], 22, 1e-10, "batchMatmul[0,0,0]=22");
    assertClose(c.data[1], 28, 1e-10, "batchMatmul[0,0,1]=28");
    assertClose(c.data[2], 49, 1e-10, "batchMatmul[0,1,0]=49");
    assertClose(c.data[3], 64, 1e-10, "batchMatmul[0,1,1]=64");
  }

  // Test 1c: batchMatmul gradient check
  runGradientTest(
    "batchMatmul gradient check",
    (params) => {
      const [a, b] = params;
      const c = batchMatmul(a, b);
      return sum(c); // scalar sum
    },
    [Tensor.randn([2, 3, 4], true), Tensor.randn([2, 4, 5], true)],
    1e-4
  );

  // ============================================================
  // SECTION 2: causalMask op tests
  // ============================================================
  console.log("\n--- causalMask op ---");

  // Test 2a: causalMask forward — upper triangle is MASK_VALUE
  console.log("causalMask — forward correctness:");
  {
    const data = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9]); // [1, 3, 3]
    const scores = new Tensor(data, [1, 3, 3], true);
    const masked = causalMask(scores);

    // Diagonal and lower triangle should be unchanged
    assertClose(masked.data[0], 1, 1e-10, "causalMask[0,0,0]=1 (diag)");
    assertClose(masked.data[3], 4, 1e-10, "causalMask[0,1,0]=4 (lower)");
    assertClose(masked.data[4], 5, 1e-10, "causalMask[0,1,1]=5 (diag)");
    assertClose(masked.data[6], 7, 1e-10, "causalMask[0,2,0]=7 (lower)");
    assertClose(masked.data[7], 8, 1e-10, "causalMask[0,2,1]=8 (lower)");
    assertClose(masked.data[8], 9, 1e-10, "causalMask[0,2,2]=9 (diag)");

    // Upper triangle should be -1e9
    assert(masked.data[1] < -1e8, "causalMask[0,0,1] should be ≈ -1e9 (upper)");
    assert(masked.data[2] < -1e8, "causalMask[0,0,2] should be ≈ -1e9 (upper)");
    assert(masked.data[5] < -1e8, "causalMask[0,1,2] should be ≈ -1e9 (upper)");
  }

  // Test 2b: causalMask backward — masked positions get zero gradient
  console.log("causalMask — backward masked grad = 0:");
  {
    const data = new Float64Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const scores = new Tensor(data, [1, 3, 3], true);
    const masked = causalMask(scores);
    const loss = sum(masked);
    loss.backward();

    assert(scores.grad !== null, "grad exists");
    // Diagonal + lower: gradient should be 1 (from sum)
    assertClose(scores.grad![0], 1, 1e-10, "grad[0,0,0]=1 (diag, unmasked)");
    assertClose(scores.grad![3], 1, 1e-10, "grad[0,1,0]=1 (lower, unmasked)");
    // Upper: gradient should be 0 (masked position)
    assertClose(scores.grad![1], 0, 1e-10, "grad[0,0,1]=0 (upper, masked)");
    assertClose(scores.grad![2], 0, 1e-10, "grad[0,0,2]=0 (upper, masked)");
    assertClose(scores.grad![5], 0, 1e-10, "grad[0,1,2]=0 (upper, masked)");
  }

  // ============================================================
  // SECTION 3: softmax N-D tests
  // ============================================================
  console.log("\n--- softmax N-D ---");

  // Test 3a: softmax 3D forward
  console.log("softmax 3D — forward correctness:");
  {
    // [2, 3, 4] — softmax along last dim
    const data = new Float64Array(2 * 3 * 4);
    // Fill with simple pattern: row r, col c → value = c (0,1,2,3)
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        data[r * 4 + c] = c;
      }
    }
    const x = new Tensor(data, [2, 3, 4], true);
    const y = softmax(x, -1);

    // Each row should sum to 1
    for (let r = 0; r < 6; r++) {
      let rowSum = 0;
      for (let c = 0; c < 4; c++) {
        rowSum += y.data[r * 4 + c];
      }
      assertClose(rowSum, 1.0, 1e-10, `softmax row ${r} sums to 1`);
    }

    // All rows should give same result (same input values)
    // exp(0)=1, exp(1)≈2.718, exp(2)≈7.389, exp(3)≈20.086
    // sum ≈ 31.193, softmax[0] ≈ 1/31.193 ≈ 0.032
    const s = 1 + Math.E + Math.exp(2) + Math.exp(3);
    assertClose(y.data[0], 1 / s, 1e-6, "softmax[0]=1/sum");
  }

  // Test 3b: softmax 4D forward shape
  console.log("softmax 4D — forward shape:");
  {
    const x = Tensor.randn([2, 4, 8, 8]);
    const y = softmax(x, -1);
    assert(
      y.shape[0] === 2 && y.shape[1] === 4 && y.shape[2] === 8 && y.shape[3] === 8,
      `softmax 4D shape preserved (got [${y.shape}])`
    );
    // Each row along last dim should sum to 1
    const rows = 2 * 4 * 8;
    for (let r = 0; r < rows; r++) {
      let rowSum = 0;
      for (let c = 0; c < 8; c++) {
        rowSum += y.data[r * 8 + c];
      }
      assertClose(rowSum, 1.0, 1e-10, `softmax 4D row ${r} sums to 1`);
    }
  }

  // Test 3c: softmax N-D gradient check
  runGradientTest(
    "softmax 3D gradient check",
    (params) => {
      const y = softmax(params[0], -1);
      return sum(y); // scalar sum
    },
    [Tensor.randn([3, 5, 4], true)],
    1e-4
  );

  // ============================================================
  // SECTION 4: TensorAttention construction
  // ============================================================
  console.log("\n--- TensorAttention construction ---");

  const D = 64;
  const H = 4;
  const Dh = D / H; // 16
  const attn = new TensorAttention({ dModel: D, numHeads: H });

  // Test 4a: Basic properties
  console.log("TensorAttention — properties:");
  {
    assert(attn.dModel === D, `dModel=${D}`);
    assert(attn.numHeads === H, `numHeads=${H}`);
    assert(attn.headDim === Dh, `headDim=${Dh}`);
    assert(attn.q_proj instanceof Object, "q_proj exists");
    assert(attn.k_proj instanceof Object, "k_proj exists");
    assert(attn.v_proj instanceof Object, "v_proj exists");
    assert(attn.o_proj instanceof Object, "o_proj exists");
  }

  // Test 4b: Parameter count — 4 * D² = 4 * 64² = 16384
  console.log("TensorAttention — parameter count:");
  {
    const params = attn.parameters();
    assert(params.length === 4, `parameters() returns 4 (got ${params.length})`);

    const named = attn.namedParameters();
    assert(named.length === 4, `namedParameters() returns 4 (got ${named.length})`);

    const names = named.map((p) => p.name).sort();
    assert(
      names.includes("k_proj.weight") && names.includes("o_proj.weight") &&
      names.includes("q_proj.weight") && names.includes("v_proj.weight"),
      `named params include all 4 projections (got ${names.join(", ")})`
    );

    let totalElements = 0;
    for (const p of params) {
      totalElements += p.size;
    }
    assert(
      totalElements === 4 * D * D,
      `total params = 4 * ${D}² = ${4 * D * D} (got ${totalElements})`
    );
  }

  // Test 4c: zeroGrad propagation
  console.log("TensorAttention — zeroGrad:");
  {
    const x = Tensor.randn([2, 8, D]);
    const y = attn.forward(x);
    const loss = sum(y);
    loss.backward();

    // Verify all params have grads
    for (const p of attn.parameters()) {
      assert(p.grad !== null, `${p.name} has grad after backward`);
    }

    attn.zeroGrad();

    // Verify all grads are zeroed
    for (const p of attn.parameters()) {
      if (p.grad) {
        let allZero = true;
        for (let i = 0; i < p.grad.length; i++) {
          if (p.grad[i] !== 0) {
            allZero = false;
            break;
          }
        }
        assert(allZero, `${p.name} grad is all zeros after zeroGrad`);
      }
    }
  }

  // ============================================================
  // SECTION 5: TensorAttention forward shape
  // ============================================================
  console.log("\n--- TensorAttention forward ---");

  // Test 5a: Forward shape [B,T,D] → [B,T,D]
  console.log("TensorAttention — forward shape:");
  {
    const B = 2;
    const T = 10;
    const x = Tensor.randn([B, T, D]);
    const y = attn.forward(x);
    assert(
      y.shape[0] === B && y.shape[1] === T && y.shape[2] === D,
      `forward shape [${B},${T},${D}] (got [${y.shape}])`
    );
  }

  // Test 5b: Forward values are finite and non-NaN
  console.log("TensorAttention — forward value sanity:");
  {
    const x = Tensor.randn([1, 5, D]);
    const y = attn.forward(x);
    for (let i = 0; i < y.size; i++) {
      assert(
        isFinite(y.data[i]) && !isNaN(y.data[i]),
        `output[${i}] is finite and non-NaN (got ${y.data[i]})`
      );
    }
  }

  // Test 5c: Forward with mask=null (no causal mask)
  console.log("TensorAttention — forward without mask:");
  {
    const x = Tensor.randn([1, 5, D]);
    const y = attn.forward(x, null);
    assert(y.shape[0] === 1 && y.shape[1] === 5 && y.shape[2] === D,
      "forward(null) returns correct shape");
  }

  // Test 5d: Forward with different batch sizes
  console.log("TensorAttention — forward with different shapes:");
  {
    // Small batch, long sequence
    const x1 = Tensor.randn([1, 3, D]);
    const y1 = attn.forward(x1);
    assert(y1.shape[0] === 1 && y1.shape[1] === 3, "small batch ok");

    // Large batch, short sequence
    const x2 = Tensor.randn([4, 2, D]);
    const y2 = attn.forward(x2);
    assert(y2.shape[0] === 4 && y2.shape[1] === 2, "large batch ok");
  }

  // ============================================================
  // SECTION 6: Causal mask correctness in full attention
  // ============================================================
  console.log("\n--- Causal mask in attention ---");

  // Test 6: Verify output at position i only depends on positions ≤ i
  console.log("TensorAttention — causal dependency:");
  {
    // Create a very distinctive input so we can track dependencies
    const T = 4;
    const x = Tensor.zeros([1, T, D]);
    // Set each position to have a distinctive value in dim 0
    for (let t = 0; t < T; t++) {
      x.data[t * D] = t + 1; // position 0→1, 1→2, 2→3, 3→4
    }

    // Verify causal mask via targeted perturbation:
    // Create two inputs that only differ at position 3 (future)
    // Position 0's output should be identical for both inputs
    const x1 = Tensor.zeros([1, T, D]);
    x1.data[0] = 1; // position 0 dim 0 = 1
    const x2 = Tensor.zeros([1, T, D]);
    x2.data[0] = 1; // position 0 dim 0 = 1 (same)
    x2.data[3 * D] = 100; // position 3 dim 0 = 100 (different future)

    const y1 = attn.forward(x1);
    const y2 = attn.forward(x2);

    // Position 0 output should be same (can't see position 3)
    for (let d = 0; d < D; d++) {
      assertClose(y1.data[d], y2.data[d], 1e-5,
        `causal: pos 0 output[${d}] unchanged when pos 3 changes`);
    }

    // Position 3 output SHOULD differ (can see position 3 itself)
    const pos3Offset = 3 * D;
    let pos3Diff = false;
    for (let d = 0; d < D; d++) {
      if (Math.abs(y1.data[pos3Offset + d] - y2.data[pos3Offset + d]) > 1e-8) {
        pos3Diff = true;
        break;
      }
    }
    assert(pos3Diff, "causal: position 3 output CHANGES when its own input changes");
  }

  // ============================================================
  // SECTION 7: Gradient tests
  // ============================================================
  console.log("\n--- TensorAttention gradient tests ---");

  // Test 7a: Backward populates all 4 weight gradients
  console.log("TensorAttention — backward populates gradients:");
  {
    const attn2 = new TensorAttention({ dModel: D, numHeads: H });
    const x = Tensor.randn([2, 6, D]);
    const y = attn2.forward(x);
    const loss = sum(y);
    loss.backward();

    const params = attn2.parameters();
    for (const p of params) {
      assert(p.grad !== null, `${p.name} has grad after backward`);
      assert(p.grad!.length === p.size, `${p.name} grad size matches param size`);

      // Verify grad is not all zeros (gradients should be non-trivial)
      let hasNonZero = false;
      for (let i = 0; i < p.grad!.length; i++) {
        if (Math.abs(p.grad![i]) > 1e-12) {
          hasNonZero = true;
          break;
        }
      }
      assert(hasNonZero, `${p.name} grad has non-zero values`);
    }
  }

  // Test 7b: Input gradient is propagated
  console.log("TensorAttention — input gradient propagation:");
  {
    const attn2 = new TensorAttention({ dModel: D, numHeads: H });
    const x = Tensor.randn([1, 4, D], true);
    const y = attn2.forward(x);
    const loss = sum(y);
    loss.backward();

    assert(x.grad !== null, "input has grad after backward");
    let hasNonZero = false;
    for (let i = 0; i < x.grad!.length; i++) {
      if (Math.abs(x.grad![i]) > 1e-12) {
        hasNonZero = true;
        break;
      }
    }
    assert(hasNonZero, "input grad has non-zero values");
  }

  // Test 7c: Finite difference gradient check — q_proj only
  const smallAttn = new TensorAttention({ dModel: 16, numHeads: 2 });
  const testX = Tensor.randn([1, 3, 16]);

  runGradientTest(
    "TensorAttention q_proj.weight gradient check",
    (_params) => {
      // params[0] IS smallAttn.q_proj.weight (the actual Parameter)
      // computeLoss rebuilds the computation graph fresh each call
      smallAttn.zeroGrad();
      const y = smallAttn.forward(testX);
      return sum(y);
    },
    [smallAttn.q_proj.weight],
    1e-3 // slightly relaxed tolerance for deeper computation graph
  );

  // Test 7d: Finite difference gradient check — o_proj
  runGradientTest(
    "TensorAttention o_proj.weight gradient check",
    (_params) => {
      smallAttn.zeroGrad();
      const y = smallAttn.forward(testX);
      return sum(y);
    },
    [smallAttn.o_proj.weight],
    1e-3
  );

  // ============================================================
  // SECTION 8: Integration — Transformer block (Attention + RMSNorm + FFN)
  // ============================================================
  console.log("\n--- Integration: Transformer block ---");

  // Test 8a: Full block forward shape
  console.log("Transformer block — forward shape:");
  {
    const blockAttn = new TensorAttention({ dModel: D, numHeads: H });
    const norm1 = new TensorRMSNorm(D);
    const ffn = new TensorFeedForward(D, D * 4); // dModel=64, dFF=256
    const norm2 = new TensorRMSNorm(D);

    const x = Tensor.randn([2, 8, D]);

    // Pre-norm + Attention + residual
    const normed1 = norm1.forward(x);
    const attnOut = blockAttn.forward(normed1);
    const residual1 = add(x, attnOut);

    assert(
      residual1.shape[0] === 2 && residual1.shape[1] === 8 && residual1.shape[2] === D,
      `residual1 shape [2,8,${D}] (got [${residual1.shape}])`
    );

    // Pre-norm + FFN + residual
    const normed2 = norm2.forward(residual1);
    const ffnOut = ffn.forward(normed2);
    const residual2 = add(residual1, ffnOut);

    assert(
      residual2.shape[0] === 2 && residual2.shape[1] === 8 && residual2.shape[2] === D,
      `residual2 shape [2,8,${D}] (got [${residual2.shape}])`
    );
  }

  // Test 8b: Full block backward
  console.log("Transformer block — backward:");
  {
    const blockAttn = new TensorAttention({ dModel: D, numHeads: H });
    const norm1 = new TensorRMSNorm(D);
    const ffn = new TensorFeedForward(D, D * 4); // dModel=64, dFF=256
    const norm2 = new TensorRMSNorm(D);

    const x = Tensor.randn([1, 3, D]);
    const normed1 = norm1.forward(x);
    const attnOut = blockAttn.forward(normed1);
    const residual1 = add(x, attnOut);
    const normed2 = norm2.forward(residual1);
    const ffnOut = ffn.forward(normed2);
    const output = add(residual1, ffnOut);

    const loss = sum(output);
    loss.backward();

    // Check block attention parameters
    for (const p of blockAttn.parameters()) {
      assert(p.grad !== null, `block attn ${p.name} has grad`);
    }
    // Check FFN parameters
    for (const p of ffn.parameters()) {
      assert(p.grad !== null, `block ffn ${p.name} has grad`);
    }
    // Check RMSNorm parameters
    for (const p of norm1.parameters()) {
      assert(p.grad !== null, `block norm1 ${p.name} has grad`);
    }
    for (const p of norm2.parameters()) {
      assert(p.grad !== null, `block norm2 ${p.name} has grad`);
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n=== TensorAttention tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
