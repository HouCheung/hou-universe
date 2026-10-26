// ============================================================
// TensorTransformerBlock — Unit & Gradient Validation Tests
// ============================================================
// Phase 36: Verifies the TensorTransformerBlock module.
//
// Tests:
//   1. Construction & module tree
//   2. parameters() returns all weights with correct names
//   3. Forward shape validation [B,T,D] → [B,T,D]
//   4. Forward value sanity (finite, non-NaN)
//   5. Gradient — all sub-module weights receive gradient
//   6. Finite difference gradient check on key params
//   7. Integration: multiple blocks chained
// ============================================================

import { Tensor } from "../Tensor";
import { TensorTransformerBlock } from "../../transformer/TensorTransformerBlock";
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

export function runTransformerTests(): { passed: number; failed: number } {
  console.log("\n=== TensorTransformerBlock Tests ===\n");

  // ============================================================
  // Test configuration
  // ============================================================
  const D = 64;       // dModel
  const H = 4;        // numHeads
  const dFF = 256;    // expansion 4x
  const maxSeqLen = 128;

  // ============================================================
  // SECTION 1: Construction
  // ============================================================
  console.log("--- TensorTransformerBlock construction ---");

  // Test 1a: Basic properties after construction
  console.log("TensorTransformerBlock — properties:");
  const block = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
  {
    assert(block.dModel === D, `dModel=${D}`);
    assert(block.numHeads === H, `numHeads=${H}`);
    assert(block.dFF === dFF, `dFF=${dFF}`);
    assert(block.maxSeqLen === maxSeqLen, `maxSeqLen=${maxSeqLen}`);
    assert(block.norm1 !== undefined, "norm1 exists");
    assert(block.attention !== undefined, "attention exists");
    assert(block.norm2 !== undefined, "norm2 exists");
    assert(block.ffn !== undefined, "ffn exists");
  }

  // Test 1b: Module tree — parameters() returns all weights
  console.log("TensorTransformerBlock — parameter count:");
  {
    const params = block.parameters();

    // Expected: 2 norm gamma + 4 attention weights + 3 FFN weights = 9
    assert(params.length === 9, `parameters() returns 9 (got ${params.length})`);

    // Calculate total elements
    let totalElements = 0;
    for (const p of params) {
      totalElements += p.size;
    }
    // norm1.gamma: D, norm2.gamma: D
    // attention.q_proj.weight: D*D, attention.k_proj.weight: D*D
    // attention.v_proj.weight: D*D, attention.o_proj.weight: D*D
    // ffn.gate.weight: dFF*D, ffn.up.weight: dFF*D, ffn.down.weight: D*dFF
    const expectedTotal = 2 * D + 4 * D * D + 3 * dFF * D;
    assert(
      totalElements === expectedTotal,
      `total elements = ${expectedTotal} (got ${totalElements})`
    );
  }

  // Test 1c: namedParameters() returns correct names
  console.log("TensorTransformerBlock — named parameter tree:");
  {
    const named = block.namedParameters();
    assert(named.length === 9, `namedParameters() returns 9 (got ${named.length})`);

    const names = named.map((p) => p.name).sort();
    const expectedNames = [
      "attention.k_proj.weight",
      "attention.o_proj.weight",
      "attention.q_proj.weight",
      "attention.v_proj.weight",
      "ffn.down.weight",
      "ffn.gate.weight",
      "ffn.up.weight",
      "norm1.gamma",
      "norm2.gamma",
    ].sort();

    for (const expected of expectedNames) {
      assert(
        names.includes(expected),
        `named params include "${expected}"`
      );
    }
  }

  // Test 1d: Construction with invalid config
  console.log("TensorTransformerBlock — invalid config:");
  {
    let threw = false;
    try { new TensorTransformerBlock({ dModel: -1, numHeads: 2, dFF: 8, maxSeqLen: 10 }); }
    catch { threw = true; }
    assert(threw, "throws on negative dModel");

    threw = false;
    try { new TensorTransformerBlock({ dModel: 10, numHeads: 3, dFF: 40, maxSeqLen: 10 }); }
    catch { threw = true; }
    assert(threw, "throws on dModel not divisible by numHeads");

    threw = false;
    try { new TensorTransformerBlock({ dModel: 10, numHeads: 2, dFF: 0, maxSeqLen: 10 }); }
    catch { threw = true; }
    assert(threw, "throws on non-positive dFF");

    threw = false;
    try { new TensorTransformerBlock({ dModel: 10, numHeads: 2, dFF: 40, maxSeqLen: 0 }); }
    catch { threw = true; }
    assert(threw, "throws on non-positive maxSeqLen");
  }

  // ============================================================
  // SECTION 2: Forward shape validation
  // ============================================================
  console.log("\n--- TensorTransformerBlock forward shape ---");

  // Test 2a: Forward shape [B,T,D] → [B,T,D]
  console.log("TensorTransformerBlock — forward shape:");
  {
    const B = 2;
    const T = 10;
    const x = Tensor.randn([B, T, D]);
    const y = block.forward(x);
    assert(
      y.shape[0] === B && y.shape[1] === T && y.shape[2] === D,
      `forward shape [${B},${T},${D}] (got [${y.shape}])`
    );
  }

  // Test 2b: Forward with different batch/seq combos
  console.log("TensorTransformerBlock — forward with different shapes:");
  {
    // Small batch, long sequence
    const x1 = Tensor.randn([1, 5, D]);
    const y1 = block.forward(x1);
    assert(y1.shape[0] === 1 && y1.shape[1] === 5, "small batch ok");

    // Large batch, short sequence
    const x2 = Tensor.randn([8, 2, D]);
    const y2 = block.forward(x2);
    assert(y2.shape[0] === 8 && y2.shape[1] === 2, "large batch ok");

    // Single token
    const x3 = Tensor.randn([1, 1, D]);
    const y3 = block.forward(x3);
    assert(y3.shape[0] === 1 && y3.shape[1] === 1, "single token ok");
  }

  // Test 2c: Forward without causal mask
  console.log("TensorTransformerBlock — forward without mask:");
  {
    const x = Tensor.randn([1, 5, D]);
    const y = block.forward(x, null);
    assert(y.shape[0] === 1 && y.shape[1] === 5 && y.shape[2] === D,
      "forward(null) returns correct shape");
  }

  // Test 2d: Forward input validation
  console.log("TensorTransformerBlock — forward input validation:");
  {
    let threw = false;
    try { block.forward(Tensor.randn([2, 3])); }
    catch { threw = true; }
    assert(threw, "throws on 2D input");

    threw = false;
    try { block.forward(Tensor.randn([2, 3, 99])); }
    catch { threw = true; }
    assert(threw, "throws on wrong dModel");
  }

  // ============================================================
  // SECTION 3: Forward value sanity
  // ============================================================
  console.log("\n--- TensorTransformerBlock forward values ---");

  // Test 3a: Output values are finite and non-NaN
  console.log("TensorTransformerBlock — value sanity:");
  {
    const x = Tensor.randn([1, 4, D]);
    const y = block.forward(x);
    for (let i = 0; i < y.size; i++) {
      assert(
        isFinite(y.data[i]) && !isNaN(y.data[i]),
        `output[${i}] is finite and non-NaN (got ${y.data[i]})`
      );
    }
  }

  // Test 3b: Same input produces deterministic output
  console.log("TensorTransformerBlock — deterministic:");
  {
    const x = Tensor.randn([1, 3, D]);
    const y1 = block.forward(x);
    const y2 = block.forward(x);
    for (let i = 0; i < y1.size; i++) {
      assertClose(y1.data[i], y2.data[i], 1e-14,
        `output[${i}] deterministic between forward calls`);
    }
  }

  // Test 3c: Different inputs produce different outputs
  console.log("TensorTransformerBlock — input sensitivity:");
  {
    const x1 = Tensor.zeros([1, 3, D]);
    const x2 = Tensor.ones([1, 3, D]);
    const y1 = block.forward(x1);
    const y2 = block.forward(x2);
    let anyDiff = false;
    for (let i = 0; i < y1.size; i++) {
      if (Math.abs(y1.data[i] - y2.data[i]) > 1e-8) {
        anyDiff = true;
        break;
      }
    }
    assert(anyDiff, "all-zeros vs all-ones produce different outputs");
  }

  // ============================================================
  // SECTION 4: Gradient tests
  // ============================================================
  console.log("\n--- TensorTransformerBlock gradient tests ---");

  // Test 4a: Backward populates all 9 parameter gradients
  console.log("TensorTransformerBlock — backward populates gradients:");
  {
    const block2 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
    const x = Tensor.randn([2, 6, D]);
    const y = block2.forward(x);
    const loss = sum(y);
    loss.backward();

    const params = block2.parameters();
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

  // Test 4b: Input gradient is propagated
  console.log("TensorTransformerBlock — input gradient propagation:");
  {
    const block2 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
    const x = Tensor.randn([1, 4, D], true);
    const y = block2.forward(x);
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

  // Test 4c: zeroGrad clears all gradients
  console.log("TensorTransformerBlock — zeroGrad:");
  {
    const block2 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
    const x = Tensor.randn([1, 3, D]);
    const y = block2.forward(x);
    const loss = sum(y);
    loss.backward();

    block2.zeroGrad();

    for (const p of block2.parameters()) {
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

  // Test 4d: Specific parameter gradients are present
  console.log("TensorTransformerBlock — specific param gradients:");
  {
    const block2 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
    const x = Tensor.randn([1, 3, D]);
    const y = block2.forward(x);
    const loss = sum(y);
    loss.backward();

    // Verify specific gradients exist
    assert(
      block2.attention.q_proj.weight.grad !== null,
      "attention.q_proj.weight.grad exists"
    );
    assert(
      block2.ffn.gate.weight.grad !== null,
      "ffn.gate.weight.grad exists"
    );
    assert(
      block2.norm1.gamma.grad !== null,
      "norm1.gamma.grad exists"
    );
  }

  // ============================================================
  // SECTION 5: Finite difference gradient checks
  // ============================================================
  console.log("\n--- TensorTransformerBlock gradient checks ---");

  // Use small model for finite difference checking
  const smallD = 8;
  const smallH = 2;
  const smallFF = 16;
  const smallBlock = new TensorTransformerBlock({
    dModel: smallD,
    numHeads: smallH,
    dFF: smallFF,
    maxSeqLen: 8,
  });
  const testX = Tensor.randn([1, 3, smallD]);

  // Test 5a: Finite difference check — norm1.gamma
  runGradientTest(
    "norm1.gamma gradient check",
    (_params) => {
      smallBlock.zeroGrad();
      const y = smallBlock.forward(testX);
      return sum(y);
    },
    [smallBlock.norm1.gamma],
    1e-4
  );

  // Test 5b: Finite difference check — attention.q_proj.weight
  runGradientTest(
    "attention.q_proj.weight gradient check",
    (_params) => {
      smallBlock.zeroGrad();
      const y = smallBlock.forward(testX);
      return sum(y);
    },
    [smallBlock.attention.q_proj.weight],
    1e-3 // slightly relaxed for deeper computation graph
  );

  // Test 5c: Finite difference check — attention.o_proj.weight
  runGradientTest(
    "attention.o_proj.weight gradient check",
    (_params) => {
      smallBlock.zeroGrad();
      const y = smallBlock.forward(testX);
      return sum(y);
    },
    [smallBlock.attention.o_proj.weight],
    1e-3
  );

  // Test 5d: Finite difference check — ffn.gate.weight
  runGradientTest(
    "ffn.gate.weight gradient check",
    (_params) => {
      smallBlock.zeroGrad();
      const y = smallBlock.forward(testX);
      return sum(y);
    },
    [smallBlock.ffn.gate.weight],
    1e-3
  );

  // Test 5e: Finite difference check — ffn.down.weight
  runGradientTest(
    "ffn.down.weight gradient check",
    (_params) => {
      smallBlock.zeroGrad();
      const y = smallBlock.forward(testX);
      return sum(y);
    },
    [smallBlock.ffn.down.weight],
    1e-3
  );

  // Test 5f: Finite difference check — norm2.gamma
  runGradientTest(
    "norm2.gamma gradient check",
    (_params) => {
      smallBlock.zeroGrad();
      const y = smallBlock.forward(testX);
      return sum(y);
    },
    [smallBlock.norm2.gamma],
    1e-4
  );

  // ============================================================
  // SECTION 6: Integration — multiple blocks chained
  // ============================================================
  console.log("\n--- Integration: multiple blocks ---");

  // Test 6a: Two blocks chained — forward shapes
  console.log("Two blocks — forward shape:");
  {
    const block1 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
    const block2 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });

    const x = Tensor.randn([2, 6, D]);
    const h1 = block1.forward(x);
    assert(h1.shape[0] === 2 && h1.shape[1] === 6 && h1.shape[2] === D,
      "block1 output shape correct");
    const h2 = block2.forward(h1);
    assert(h2.shape[0] === 2 && h2.shape[1] === 6 && h2.shape[2] === D,
      "block2 output shape correct");
  }

  // Test 6b: Two blocks — backward propagates through both
  console.log("Two blocks — backward through both:");
  {
    const block1 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });
    const block2 = new TensorTransformerBlock({ dModel: D, numHeads: H, dFF, maxSeqLen });

    const x = Tensor.randn([1, 3, D]);
    const h1 = block1.forward(x);
    const h2 = block2.forward(h1);
    const loss = sum(h2);
    loss.backward();

    // Both blocks' params should have gradients
    for (const p of block1.parameters()) {
      assert(p.grad !== null, `block1 ${p.name} has grad`);
    }
    for (const p of block2.parameters()) {
      assert(p.grad !== null, `block2 ${p.name} has grad`);
    }
  }

  // ============================================================
  // SECTION 7: Parameter count example
  // ============================================================
  console.log("\n--- Parameter count example ---");

  // Example: MiniMind-like config
  const exampleBlock = new TensorTransformerBlock({
    dModel: 512,
    numHeads: 8,
    dFF: 2048,
    maxSeqLen: 256,
  });

  const params = exampleBlock.parameters();
  let totalParams = 0;
  for (const p of params) {
    totalParams += p.size;
  }

  console.log(`  dModel=512, numHeads=8, dFF=2048`);
  console.log(`  Parameters:`);
  for (const { name, parameter } of exampleBlock.namedParameters()) {
    console.log(`    ${name}: [${parameter.shape}] — ${parameter.size.toLocaleString()} elements`);
  }
  console.log(`  Total: ${totalParams.toLocaleString()} parameters`);

  // Verify expected count
  const expected512 = 2 * 512 + 4 * 512 * 512 + 3 * 2048 * 512;
  assert(
    totalParams === expected512,
    `total matches expected ${expected512.toLocaleString()}`
  );

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n=== TensorTransformerBlock tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
