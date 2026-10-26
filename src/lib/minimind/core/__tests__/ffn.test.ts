// ============================================================
// TensorFeedForward & SiLU — Unit & Gradient Validation Tests
// ============================================================
// Phase 33: Verifies the differentiable SwiGLU FFN and SiLU op.
//
// Tests:
//   1. SiLU forward value correctness
//   2. SiLU gradient check (finite difference)
//   3. TensorFeedForward construction & sub-module registration
//   4. TensorFeedForward forward shape
//   5. TensorFeedForward forward value sanity
//   6. TensorFeedForward input validation
//   7. TensorFeedForward — all parameters receive gradient
//   8. TensorFeedForward — namedParameters format
//   9. TensorFeedForward — zeroGrad propagation
//  10. TensorFeedForward — parameter count
//  11. TensorFeedForward — finite difference gradient check
// ============================================================

import { Tensor } from "../Tensor";
import { TensorFeedForward } from "../../ffn/TensorFeedForward";
import { silu } from "../ops/silu";
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

export function runFFNTests(): { passed: number; failed: number } {
  console.log("\n=== SiLU & TensorFeedForward Tests ===\n");

  // ══════════════════════════════════════════
  // SiLU Operator Tests
  // ══════════════════════════════════════════

  // ──────────────────────────────────────────
  // Test 1: SiLU forward value correctness
  // ──────────────────────────────────────────
  console.log("SiLU — forward value correctness:");
  {
    // silu(0) = 0 * σ(0) = 0 * 0.5 = 0
    const x = Tensor.fromArray([0]);
    const y = silu(x);
    assertClose(y.data[0], 0, 1e-10, "silu(0) = 0");

    // silu(2) ≈ 2 * σ(2) ≈ 2 * 0.8808 ≈ 1.7616
    const x2 = Tensor.fromArray([2]);
    const y2 = silu(x2);
    const expected2 = 2 * (1 / (1 + Math.exp(-2)));
    assertClose(y2.data[0], expected2, 1e-8, `silu(2) ≈ ${expected2.toFixed(6)}`);

    // silu(-2) ≈ -2 * σ(-2) ≈ -2 * 0.1192 ≈ -0.2384
    const x3 = Tensor.fromArray([-2]);
    const y3 = silu(x3);
    const expected3 = -2 * (1 / (1 + Math.exp(2)));
    assertClose(y3.data[0], expected3, 1e-8, `silu(-2) ≈ ${expected3.toFixed(6)}`);

    // Element-wise on multi-element tensor
    const x4 = Tensor.fromArray([[0, 1, -1]]);
    const y4 = silu(x4);
    assert(y4.shape[0] === 1 && y4.shape[1] === 3,
      `silu shape [1,3] preserved (got [${y4.shape}])`);
  }

  // ──────────────────────────────────────────
  // Test 2: SiLU gradient check
  // ──────────────────────────────────────────
  runGradientTest(
    "SiLU — finite diff (scalar)",
    (params) => {
      const [x] = params;
      const y = silu(x);
      return sum(y);
    },
    [Tensor.fromArray([1.5], undefined, true)]
  );

  runGradientTest(
    "SiLU — finite diff (multi-element)",
    (params) => {
      const [x] = params;
      const y = silu(x);
      return sum(y);
    },
    [Tensor.fromArray([0.5, -0.3, 2.0, -1.5], [4], true)]
  );

  // ──────────────────────────────────────────
  // Test 3: SiLU gradient — backward propagation
  // ──────────────────────────────────────────
  console.log("SiLU — backward propagation:");
  {
    const x = Tensor.fromArray([1.0, 2.0, -1.0], [3], true);
    const y = silu(x);
    const loss = sum(y);
    loss.backward();

    assert(x.grad !== null, "x.grad allocated after backward");
    assert(
      x.grad!.some((v) => v !== 0),
      "x.grad has non-zero values"
    );
    assert(x.grad!.length === 3, `x.grad length is 3, got ${x.grad!.length}`);

    // For x=1.0: silu'(1.0) = σ(1)*(1 + 1*(1-σ(1))) ≈ 0.7311 * (1 + 1*0.2689) ≈ 0.9277
    const s1 = 1 / (1 + Math.exp(-1));
    const expected1 = s1 * (1 + 1 * (1 - s1));
    assertClose(x.grad![0], expected1, 1e-6,
      `silu'(1.0) ≈ ${expected1.toFixed(6)}`);
  }

  // ══════════════════════════════════════════
  // TensorFeedForward Tests
  // ══════════════════════════════════════════

  // ──────────────────────────────────────────
  // Test 4: Construction & sub-module registration
  // ──────────────────────────────────────────
  console.log("\nTensorFeedForward — construction & sub-modules:");
  {
    const ffn = new TensorFeedForward(16, 64);
    assert(ffn.dModel === 16, "dModel is 16");
    assert(ffn.dFF === 64, "dFF is 64");

    // Module accessors
    assert(ffn.gate !== undefined, "gate accessor works");
    assert(ffn.up !== undefined, "up accessor works");
    assert(ffn.down !== undefined, "down accessor works");

    assert(ffn.gate.inFeatures === 16 && ffn.gate.outFeatures === 64,
      "gate: 16 → 64");
    assert(ffn.up.inFeatures === 16 && ffn.up.outFeatures === 64,
      "up: 16 → 64");
    assert(ffn.down.inFeatures === 64 && ffn.down.outFeatures === 16,
      "down: 64 → 16");

    // Parameters should be 3 weight matrices (no bias)
    const params = ffn.parameters();
    assert(params.length === 3, `parameters() returns 3 (got ${params.length})`);

    // All params are weights (no bias since bias=false)
    for (const p of params) {
      assert(p.name === "weight", `param name is "weight" (got "${p.name}")`);
    }
  }

  // ──────────────────────────────────────────
  // Test 5: Forward shape validation
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — forward shape:");
  {
    const ffn = new TensorFeedForward(16, 64);
    const x = Tensor.randn([2, 4, 16]); // [batch, seq, dModel]
    const y = ffn.forward(x);

    assert(
      y.shape[0] === 2 && y.shape[1] === 4 && y.shape[2] === 16,
      `forward: [2, 4, 16] → [2, 4, 16] (got [${y.shape}])`
    );
    assert(y.requiresGrad === true, "output requiresGrad=true");
  }

  {
    const ffn = new TensorFeedForward(8, 32);
    const x = Tensor.randn([1, 1, 8]);
    const y = ffn.forward(x);

    assert(
      y.shape[0] === 1 && y.shape[1] === 1 && y.shape[2] === 8,
      `forward: [1, 1, 8] → [1, 1, 8] (got [${y.shape}])`
    );
  }

  {
    const ffn = new TensorFeedForward(32, 128);
    const x = Tensor.randn([8, 16, 32]);
    const y = ffn.forward(x);

    assert(
      y.shape[0] === 8 && y.shape[1] === 16 && y.shape[2] === 32,
      `forward: [8, 16, 32] → [8, 16, 32] (got [${y.shape}])`
    );
  }

  // ──────────────────────────────────────────
  // Test 6: Forward value sanity (non-NaN, finite)
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — forward value sanity:");
  {
    const ffn = new TensorFeedForward(8, 32);
    const x = Tensor.randn([2, 3, 8]);
    const y = ffn.forward(x);

    // All values should be finite numbers
    for (let i = 0; i < y.data.length; i++) {
      assert(
        Number.isFinite(y.data[i]),
        `output[${i}] is finite (got ${y.data[i]})`
      );
    }

    // Output should not be identical to input (weights are random, non-identity)
    const allSame = y.data.every((v, i) => Math.abs(v - x.data[i]) < 1e-10);
    assert(!allSame, "output differs from input (FFN transforms data)");
  }

  // ──────────────────────────────────────────
  // Test 7: Input validation
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — input validation:");
  {
    const ffn = new TensorFeedForward(16, 64);

    let threw = false;
    try {
      const x = Tensor.randn([2, 4]); // 2D, not 3D
      ffn.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on 2D input");

    threw = false;
    try {
      const x = Tensor.randn([2, 4, 8]); // dim=8 ≠ dModel=16
      ffn.forward(x);
    } catch {
      threw = true;
    }
    assert(threw, "throws on wrong dModel dimension");
  }

  // ──────────────────────────────────────────
  // Test 8: All parameters receive gradient
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — all parameters receive gradient:");
  {
    const ffn = new TensorFeedForward(8, 32);
    const x = Tensor.randn([2, 4, 8]);

    ffn.zeroGrad();
    const y = ffn.forward(x);
    const loss = sum(y);
    loss.backward();

    const params = ffn.parameters();
    for (const p of params) {
      assert(p.grad !== null, `${p.name} grad is allocated`);
      assert(
        p.grad!.some((v) => v !== 0),
        `${p.name} grad has non-zero values`
      );
      assert(
        p.grad!.every((v) => Number.isFinite(v)),
        `${p.name} grad values are all finite`
      );
    }
  }

  // ──────────────────────────────────────────
  // Test 9: Named parameters format
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — namedParameters():");
  {
    const ffn = new TensorFeedForward(8, 32);
    const named = ffn.namedParameters();

    assert(named.length === 3, "namedParameters returns 3 entries");

    const names = named.map((n) => n.name).sort();
    assert(names[0] === "down.weight", `named[0] = "down.weight" (got "${names[0]}")`);
    assert(names[1] === "gate.weight", `named[1] = "gate.weight" (got "${names[1]}")`);
    assert(names[2] === "up.weight", `named[2] = "up.weight" (got "${names[2]}")`);
  }

  // ──────────────────────────────────────────
  // Test 10: ZeroGrad propagation
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — zeroGrad():");
  {
    const ffn = new TensorFeedForward(8, 32);
    const x = Tensor.randn([2, 4, 8]);

    const y = ffn.forward(x);
    const loss = sum(y);
    loss.backward();

    // Verify gradients are non-zero
    for (const p of ffn.parameters()) {
      assert(
        p.grad!.some((v) => v !== 0),
        `${p.name} grad non-zero after backward`
      );
    }

    ffn.zeroGrad();

    // Verify all gradients are zeroed
    for (const p of ffn.parameters()) {
      assert(
        p.grad!.every((v) => v === 0),
        `${p.name} grad all zeros after zeroGrad()`
      );
    }
  }

  // ──────────────────────────────────────────
  // Test 11: Parameter count
  // ──────────────────────────────────────────
  console.log("TensorFeedForward — parameter count:");
  {
    const dModel = 64;
    const dFF = 256;
    const ffn = new TensorFeedForward(dModel, dFF);

    const params = ffn.parameters();
    const totalElements = params.reduce((s, p) => s + p.size, 0);

    // gate: dModel * dFF, up: dModel * dFF, down: dFF * dModel
    // = dModel*dFF + dModel*dFF + dFF*dModel = 3 * dModel * dFF
    const expected = 3 * dModel * dFF;
    assert(
      totalElements === expected,
      `total elements = 3*${dModel}*${dFF} = ${expected} (got ${totalElements})`
    );
  }

  // ──────────────────────────────────────────
  // Test 12: Finite difference gradient check
  // Because TensorFeedForward composes Linear, silu, multiply, and reshape,
  // each of which is independently unit-tested, we verify that the full
  // composed graph produces correct gradients via finite differences.
  //
  // Strategy: use gradientCheck on each sub-module's weight parameter
  // while calling ffn.forward. The gradientCheck modifies the weight
  // data in-place, and ffn.forward reads from the same param reference,
  // so numerical gradients correctly verify the composed backward graph.
  // ──────────────────────────────────────────
  {
    const ffn = new TensorFeedForward(4, 8);
    const x = Tensor.randn([2, 3, 4]);

    runGradientTest(
      "TensorFeedForward — finite diff (gate.weight)",
      (_params) => {
        const y = ffn.forward(x);
        return sum(y);
      },
      [ffn.gate.weight],
      2e-4
    );

    runGradientTest(
      "TensorFeedForward — finite diff (up.weight)",
      (_params) => {
        const y = ffn.forward(x);
        return sum(y);
      },
      [ffn.up.weight],
      2e-4
    );

    runGradientTest(
      "TensorFeedForward — finite diff (down.weight)",
      (_params) => {
        const y = ffn.forward(x);
        return sum(y);
      },
      [ffn.down.weight],
      2e-4
    );
  }

  console.log(`\nSiLU & TensorFeedForward tests: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}
