// ============================================================
// TensorRMSNorm — Unit & Gradient Validation Tests
// ============================================================
// Phase 34: Verifies the differentiable RMS Normalization layer.
//
// Tests:
//   1. Construction & parameter registration
//   2. Forward shape validation
//   3. Normalization correctness (RMS ≈ 1 after normalization)
//   4. Forward with various batch/seq dimensions
//   5. Input validation (2D input, wrong dModel)
//   6. Gamma gradient is non-null after backward
//   7. Full backward propagation through all ops
//   8. ZeroGrad propagation
//   9. Named parameters format
//  10. Parameter count
//  11. Finite difference gradient check on gamma
//  12. Output values are all finite
//  13. Gamma starts as all ones
// ============================================================

import { Tensor } from "../Tensor";
import { Parameter } from "../Parameter";
import { TensorRMSNorm } from "../../transformer/TensorRMSNorm";
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

export function runRMSNormTests(): { passed: number; failed: number } {
  console.log("\n=== TensorRMSNorm Tests ===\n");

  // ══════════════════════════════════════════
  // Test 1: Construction & parameter registration
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — construction & parameter registration:");
  {
    const norm = new TensorRMSNorm(16, 1e-6);
    assert(norm.dModel === 16, "dModel is 16");
    assert(norm.eps === 1e-6, "eps is 1e-6");

    const params = norm.parameters();
    assert(params.length === 1, `parameters() returns 1 (got ${params.length})`);
    assert(params[0].name === "gamma", `param name is "gamma" (got "${params[0].name}")`);
    assert(
      params[0].shape.length === 1 && params[0].shape[0] === 16,
      `gamma shape is [16] (got [${params[0].shape}])`
    );
    assert(params[0].requiresGrad === true, "gamma requiresGrad=true");
  }

  // ══════════════════════════════════════════
  // Test 2: Gamma initialized to all ones
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — gamma initialized to ones:");
  {
    const norm = new TensorRMSNorm(8);
    const gamma = norm.gamma;
    for (let i = 0; i < gamma.size; i++) {
      assertClose(gamma.data[i], 1.0, 1e-10, `gamma[${i}] = 1.0`);
    }
  }

  // ══════════════════════════════════════════
  // Test 3: Forward shape validation
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — forward shape:");
  {
    const norm = new TensorRMSNorm(16);
    const x = Tensor.randn([2, 4, 16]); // [batch, seq, dModel]
    const y = norm.forward(x);

    assert(
      y.shape[0] === 2 && y.shape[1] === 4 && y.shape[2] === 16,
      `forward: [2, 4, 16] → [2, 4, 16] (got [${y.shape}])`
    );
    assert(y.requiresGrad === true, "output requiresGrad=true");
  }

  {
    const norm = new TensorRMSNorm(32);
    const x = Tensor.randn([1, 1, 32]);
    const y = norm.forward(x);

    assert(
      y.shape[0] === 1 && y.shape[1] === 1 && y.shape[2] === 32,
      `forward: [1, 1, 32] → [1, 1, 32] (got [${y.shape}])`
    );
  }

  {
    const norm = new TensorRMSNorm(64);
    const x = Tensor.randn([8, 16, 64]);
    const y = norm.forward(x);

    assert(
      y.shape[0] === 8 && y.shape[1] === 16 && y.shape[2] === 64,
      `forward: [8, 16, 64] → [8, 16, 64] (got [${y.shape}])`
    );
  }

  // ══════════════════════════════════════════
  // Test 4: Normalization correctness (RMS ≈ 1)
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — normalization correctness (RMS ≈ 1):");
  {
    const norm = new TensorRMSNorm(64, 1e-8);
    const x = Tensor.randn([2, 4, 64]);

    // Scale input to have varying magnitudes
    for (let i = 0; i < x.data.length; i++) {
      x.data[i] *= 5.0; // amplify
    }

    const y = norm.forward(x);

    // For each position, compute RMS of output (before gamma scaling)
    // Since gamma=1, output RMS should be ≈ 1
    for (let b = 0; b < 2; b++) {
      for (let t = 0; t < 4; t++) {
        let sumSq = 0;
        const offset = (b * 4 + t) * 64;
        for (let d = 0; d < 64; d++) {
          sumSq += y.data[offset + d] * y.data[offset + d];
        }
        const rms = Math.sqrt(sumSq / 64);
        assertClose(rms, 1.0, 0.01,
          `RMS at position [${b},${t}] ≈ 1.0 (got ${rms.toFixed(6)})`
        );
      }
    }
  }

  // ══════════════════════════════════════════
  // Test 5: Normalization handles near-zero input
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — handles near-zero input (eps prevents div/0):");
  {
    const norm = new TensorRMSNorm(4, 1e-5);
    const x = Tensor.zeros([1, 1, 4]);
    const y = norm.forward(x);

    // All outputs should be finite (eps saves from division by zero)
    for (let i = 0; i < y.data.length; i++) {
      assert(
        Number.isFinite(y.data[i]),
        `output[${i}] is finite for zero input (got ${y.data[i]})`
      );
    }
  }

  // ══════════════════════════════════════════
  // Test 6: Forward value sanity (non-NaN, finite)
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — forward value sanity:");
  {
    const norm = new TensorRMSNorm(8);
    const x = Tensor.randn([2, 3, 8]);
    const y = norm.forward(x);

    for (let i = 0; i < y.data.length; i++) {
      assert(
        Number.isFinite(y.data[i]),
        `output[${i}] is finite (got ${y.data[i]})`
      );
    }

    // Output should differ from input (normalization changes values)
    const allSame = y.data.every((v, i) => Math.abs(v - x.data[i]) < 1e-10);
    assert(!allSame, "output differs from input (normalization transforms data)");
  }

  // ══════════════════════════════════════════
  // Test 7: Input validation
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — input validation:");
  {
    const norm = new TensorRMSNorm(16);

    let threw = false;
    try {
      const x = Tensor.randn([2, 4]); // 2D, not 3D
      norm.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on 2D input");

    threw = false;
    try {
      const x = Tensor.randn([2, 4, 8]); // dim=8 ≠ dModel=16
      norm.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on wrong dModel dimension");
  }

  // ══════════════════════════════════════════
  // Test 8: Gamma gradient is non-null after backward
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — gamma gradient after backward:");
  {
    const norm = new TensorRMSNorm(8);
    const x = Tensor.randn([2, 4, 8]);

    norm.zeroGrad();
    const y = norm.forward(x);
    const loss = sum(y);
    loss.backward();

    const gamma = norm.gamma;
    assert(gamma.grad !== null, "gamma.grad is allocated after backward");
    assert(
      gamma.grad!.some((v) => v !== 0),
      "gamma.grad has non-zero values"
    );
    assert(
      gamma.grad!.every((v) => Number.isFinite(v)),
      "gamma.grad values are all finite"
    );
    assert(gamma.grad!.length === 8, `gamma.grad length is 8 (got ${gamma.grad!.length})`);
  }

  // ══════════════════════════════════════════
  // Test 9: Full backward propagation through input
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — backward propagates to input:");
  {
    const norm = new TensorRMSNorm(8);
    const x = Tensor.randn([1, 2, 8], true); // requiresGrad=true on input

    norm.zeroGrad();
    const y = norm.forward(x);
    const loss = sum(y);
    loss.backward();

    // Input should receive gradient
    assert(x.grad !== null, "input.grad is allocated after backward");
    assert(
      x.grad!.some((v) => v !== 0),
      "input.grad has non-zero values"
    );
    assert(
      x.grad!.every((v) => Number.isFinite(v)),
      "input.grad values are all finite"
    );
  }

  // ══════════════════════════════════════════
  // Test 10: ZeroGrad propagation
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — zeroGrad():");
  {
    const norm = new TensorRMSNorm(8);
    const x = Tensor.randn([2, 4, 8]);

    const y = norm.forward(x);
    const loss = sum(y);
    loss.backward();

    // Verify gradients are non-zero
    for (const p of norm.parameters()) {
      assert(
        p.grad!.some((v) => v !== 0),
        `${p.name} grad non-zero after backward`
      );
    }

    norm.zeroGrad();

    // Verify all gradients are zeroed
    for (const p of norm.parameters()) {
      assert(
        p.grad!.every((v) => v === 0),
        `${p.name} grad all zeros after zeroGrad()`
      );
    }
  }

  // ══════════════════════════════════════════
  // Test 11: Named parameters format
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — namedParameters():");
  {
    const norm = new TensorRMSNorm(8);
    const named = norm.namedParameters();

    assert(named.length === 1, "namedParameters returns 1 entry");
    assert(
      named[0].name === "gamma",
      `named[0].name = "gamma" (got "${named[0].name}")`
    );
    assert(
      named[0].parameter.shape.length === 1 && named[0].parameter.shape[0] === 8,
      `gamma shape is [8] (got [${named[0].parameter.shape}])`
    );
  }

  // ══════════════════════════════════════════
  // Test 12: Parameter count
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — parameter count:");
  {
    const dModel = 64;
    const norm = new TensorRMSNorm(dModel);

    const params = norm.parameters();
    const totalElements = params.reduce((s, p) => s + p.size, 0);

    // Only gamma: [dModel]
    assert(
      totalElements === dModel,
      `total elements = dModel = ${dModel} (got ${totalElements})`
    );
  }

  // ══════════════════════════════════════════
  // Test 13: Finite difference gradient check on gamma
  // ══════════════════════════════════════════
  {
    const norm = new TensorRMSNorm(4, 1e-6);
    const x = Tensor.randn([2, 3, 4]);

    runGradientTest(
      "TensorRMSNorm — finite diff (gamma)",
      (_params) => {
        const y = norm.forward(x);
        return sum(y);
      },
      [norm.gamma],
      2e-4 // slightly relaxed tolerance for composed ops
    );
  }

  // ══════════════════════════════════════════
  // Test 14: Finite difference gradient check on input
  // ══════════════════════════════════════════
  {
    const norm = new TensorRMSNorm(4, 1e-6);
    const x = Tensor.randn([1, 2, 4], true);

    runGradientTest(
      "TensorRMSNorm — finite diff (input)",
      (params) => {
        const [input] = params;
        const y = norm.forward(input);
        return sum(y);
      },
      [x],
      2e-4
    );
  }

  // ══════════════════════════════════════════
  // Test 15: Gamma scaling effect
  // ══════════════════════════════════════════
  console.log("TensorRMSNorm — gamma scaling effect:");
  {
    const norm = new TensorRMSNorm(4);
    const x = Tensor.ones([1, 1, 4]);

    // Modify gamma to known values
    norm.gamma.data[0] = 2.0;
    norm.gamma.data[1] = 0.5;
    norm.gamma.data[2] = 3.0;
    norm.gamma.data[3] = 1.0;

    const y = norm.forward(x);

    // With x=1 and normalized input, output should be proportional to gamma
    // (since RMS of all-ones vector = 1/sqrt(1+eps) ≈ 1 for small eps)
    // Actually: x=1 for all elements, RMS = sqrt(mean(1) + eps) ≈ 1
    // So output[d] ≈ 1 * gamma[d] / 1 ≈ gamma[d]
    for (let d = 0; d < 4; d++) {
      const expectedGamma = norm.gamma.data[d];
      const ratio = y.data[d] / expectedGamma;
      // All dimensions of a uniform input should have the same RMS
      assertClose(
        y.data[0] / norm.gamma.data[0],
        y.data[d] / norm.gamma.data[d],
        1e-6,
        `gamma scaling consistent across dims (ratio[0]=${(y.data[0] / norm.gamma.data[0]).toFixed(6)}, ratio[${d}]=${ratio.toFixed(6)})`
      );
    }
  }

  console.log(`\nTensorRMSNorm tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
