// ============================================================
// TensorMiniMindModel — Unit & Gradient Validation Tests
// ============================================================
// Phase 37: Verifies the complete TensorMiniMindModel.
//
// Tests:
//   1. Construction & module tree
//   2. parameters() returns all weights with correct names
//   3. Forward shape validation [B,S] → [B,S,V]
//   4. Forward value sanity (finite, non-NaN)
//   5. Gradient — all sub-module weights receive gradient
//   6. Finite difference gradient check on key params
//   7. Integration: deterministic output, zeroGrad
//   8. Tiny + MiniMind preset verification
// ============================================================

import { Tensor } from "../Tensor";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
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

export function runModelTests(): { passed: number; failed: number } {
  console.log("\n=== TensorMiniMindModel Tests ===\n");

  // ============================================================
  // Test configuration — Tiny preset for fast gradient checks
  // ============================================================
  const V = 100;      // vocabSize (small for testing)
  const D = 32;       // dModel
  const H = 4;        // numHeads
  const dFF = 128;    // expansion 4x
  const L = 2;        // numLayers
  const maxSeqLen = 16;

  // ============================================================
  // SECTION 1: Construction
  // ============================================================
  console.log("--- TensorMiniMindModel construction ---");

  // Test 1a: Basic properties after construction
  console.log("TensorMiniMindModel — properties:");
  const model = new TensorMiniMindModel({
    vocabSize: V, dModel: D, numHeads: H, dFF, numLayers: L, maxSeqLen,
  });
  {
    assert(model.vocabSize === V, `vocabSize=${V}`);
    assert(model.dModel === D, `dModel=${D}`);
    assert(model.numHeads === H, `numHeads=${H}`);
    assert(model.dFF === dFF, `dFF=${dFF}`);
    assert(model.numLayers === L, `numLayers=${L}`);
    assert(model.maxSeqLen === maxSeqLen, `maxSeqLen=${maxSeqLen}`);
    assert(model.embedding !== undefined, "embedding exists");
    assert(model.blocks.length === L, `numLayers=${L} blocks array`);
    assert(model.finalNorm !== undefined, "finalNorm exists");
    assert(model.lmHead !== undefined, "lmHead exists");
  }

  // Test 1b: Sub-module registration — all blocks are distinct instances
  console.log("TensorMiniMindModel — block instances:");
  {
    for (let i = 0; i < L; i++) {
      assert(model.blocks[i] !== undefined, `blocks[${i}] exists`);
      assert(model.blocks[i].dModel === D, `blocks[${i}].dModel=${D}`);
      assert(model.blocks[i].numHeads === H, `blocks[${i}].numHeads=${H}`);
    }
    // Blocks should be distinct instances
    if (L > 1) {
      assert(model.blocks[0] !== model.blocks[1], "blocks[0] !== blocks[1]");
    }
  }

  // Test 1c: Invalid config throws
  console.log("TensorMiniMindModel — invalid config:");
  {
    let threw = false;
    try { new TensorMiniMindModel({ vocabSize: -1, dModel: D, numHeads: H, dFF, numLayers: L, maxSeqLen }); }
    catch { threw = true; }
    assert(threw, "throws on negative vocabSize");

    threw = false;
    try { new TensorMiniMindModel({ vocabSize: V, dModel: 10, numHeads: 3, dFF: 40, numLayers: L, maxSeqLen }); }
    catch { threw = true; }
    assert(threw, "throws on dModel not divisible by numHeads");

    threw = false;
    try { new TensorMiniMindModel({ vocabSize: V, dModel: D, numHeads: H, dFF, numLayers: 0, maxSeqLen }); }
    catch { threw = true; }
    assert(threw, "throws on zero numLayers");

    threw = false;
    try { new TensorMiniMindModel({ vocabSize: V, dModel: D, numHeads: H, dFF, numLayers: L, maxSeqLen: 0 }); }
    catch { threw = true; }
    assert(threw, "throws on zero maxSeqLen");
  }

  // ============================================================
  // SECTION 2: Parameter count & tree
  // ============================================================
  console.log("\n--- TensorMiniMindModel parameter count ---");

  // Test 2a: Total parameter objects
  console.log("TensorMiniMindModel — parameter objects count:");
  {
    const params = model.parameters();
    // 1 embedding + L*9 blocks + 1 finalNorm + 1 lmHead = L*9 + 3
    const expectedParamCount = L * 9 + 3;
    assert(
      params.length === expectedParamCount,
      `parameters() returns ${expectedParamCount} (got ${params.length})`
    );
  }

  // Test 2b: Total parameter elements
  console.log("TensorMiniMindModel — total elements:");
  {
    let totalElements = 0;
    for (const p of model.parameters()) {
      totalElements += p.size;
    }
    // embedding: V*D
    // each block: 2*D + 4*D*D + 3*dFF*D
    // finalNorm: D
    // lmHead: D*V
    const expectedTotal = V * D + L * (2 * D + 4 * D * D + 3 * dFF * D) + D + D * V;
    assert(
      totalElements === expectedTotal,
      `total elements = ${expectedTotal.toLocaleString()} (got ${totalElements.toLocaleString()})`
    );
    assert(
      model.totalParamCount === expectedTotal,
      `totalParamCount matches expected`
    );
  }

  // Test 2c: namedParameters() returns correct hierarchical names
  console.log("TensorMiniMindModel — named parameter tree:");
  {
    const named = model.namedParameters();
    const names = named.map((p) => p.name).sort();

    // Check key parameter names exist
    const requiredNames = [
      "embedding.weight",
      "finalNorm.gamma",
      "lmHead.linear.weight",
    ];
    for (const req of requiredNames) {
      assert(names.includes(req), `named params include "${req}"`);
    }

    // Check block parameters for first layer
    for (let i = 0; i < L; i++) {
      const prefix = `blocks.${i}.`;
      const blockNames = [
        "norm1.gamma",
        "attention.q_proj.weight",
        "attention.k_proj.weight",
        "attention.v_proj.weight",
        "attention.o_proj.weight",
        "norm2.gamma",
        "ffn.gate.weight",
        "ffn.up.weight",
        "ffn.down.weight",
      ];
      for (const bn of blockNames) {
        assert(
          names.includes(prefix + bn),
          `named params include "${prefix}${bn}"`
        );
      }
    }
  }

  // ============================================================
  // SECTION 3: Forward shape validation
  // ============================================================
  console.log("\n--- TensorMiniMindModel forward shape ---");

  // Test 3a: Forward shape [B,S] → [B,S,V]
  console.log("TensorMiniMindModel — forward shape:");
  {
    const B = 2;
    const S = 6;
    const ids = Tensor.fromArray([
      [1, 2, 3, 4, 5, 6],
      [7, 8, 9, 10, 11, 12],
    ]);
    const logits = model.forward(ids);
    assert(
      logits.shape[0] === B && logits.shape[1] === S && logits.shape[2] === V,
      `forward shape [${B},${S},${V}] (got [${logits.shape}])`
    );
  }

  // Test 3b: Forward with different batch/seq combos
  console.log("TensorMiniMindModel — forward with different shapes:");
  {
    // Single token
    const x1 = Tensor.fromArray([[5]]);
    const y1 = model.forward(x1);
    assert(
      y1.shape[0] === 1 && y1.shape[1] === 1 && y1.shape[2] === V,
      "single token shape ok"
    );

    // Long sequence
    const x2 = Tensor.fromArray([[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
    const y2 = model.forward(x2);
    assert(
      y2.shape[0] === 1 && y2.shape[1] === 10 && y2.shape[2] === V,
      "long sequence shape ok"
    );

    // Large batch, short sequence
    const x3 = Tensor.fromArray(
      Array.from({ length: 8 }, (_, i) => [i % V, (i + 1) % V])
    );
    const y3 = model.forward(x3);
    assert(
      y3.shape[0] === 8 && y3.shape[1] === 2 && y3.shape[2] === V,
      "large batch shape ok"
    );
  }

  // Test 3c: Forward input validation
  console.log("TensorMiniMindModel — forward input validation:");
  {
    let threw = false;
    try { model.forward(Tensor.randn([2])); }
    catch { threw = true; }
    assert(threw, "throws on 1D input");

    threw = false;
    try { model.forward(Tensor.randn([2, 3, 4])); }
    catch { threw = true; }
    assert(threw, "throws on 3D input");
  }

  // ============================================================
  // SECTION 4: Forward value sanity
  // ============================================================
  console.log("\n--- TensorMiniMindModel forward values ---");

  // Test 4a: Output values are finite and non-NaN
  console.log("TensorMiniMindModel — value sanity:");
  {
    const ids = Tensor.fromArray([[1, 2, 3, 4]]);
    const logits = model.forward(ids);
    for (let i = 0; i < logits.size; i++) {
      assert(
        isFinite(logits.data[i]) && !isNaN(logits.data[i]),
        `output[${i}] is finite and non-NaN (got ${logits.data[i]})`
      );
    }
  }

  // Test 4b: Same input produces deterministic output
  console.log("TensorMiniMindModel — deterministic:");
  {
    const ids = Tensor.fromArray([[1, 2, 3]]);
    const y1 = model.forward(ids);
    const y2 = model.forward(ids);
    for (let i = 0; i < y1.size; i++) {
      assertClose(y1.data[i], y2.data[i], 1e-14,
        `output[${i}] deterministic between forward calls`);
    }
  }

  // Test 4c: Different inputs produce different outputs
  console.log("TensorMiniMindModel — input sensitivity:");
  {
    const x1 = Tensor.fromArray([[0, 0, 0, 0]]);
    const x2 = Tensor.fromArray([[1, 2, 3, 4]]);
    const y1 = model.forward(x1);
    const y2 = model.forward(x2);
    let anyDiff = false;
    for (let i = 0; i < y1.size; i++) {
      if (Math.abs(y1.data[i] - y2.data[i]) > 1e-8) {
        anyDiff = true;
        break;
      }
    }
    assert(anyDiff, "different token IDs produce different logits");
  }

  // ============================================================
  // SECTION 5: Gradient tests
  // ============================================================
  console.log("\n--- TensorMiniMindModel gradient tests ---");

  // Test 5a: Backward populates all parameter gradients
  console.log("TensorMiniMindModel — backward populates gradients:");
  {
    const m = new TensorMiniMindModel({
      vocabSize: V, dModel: D, numHeads: H, dFF, numLayers: L, maxSeqLen,
    });
    const ids = Tensor.fromArray([[1, 2, 3, 4]]);
    const logits = m.forward(ids);
    const loss = sum(logits);
    loss.backward();

    const params = m.parameters();
    for (const p of params) {
      assert(p.grad !== null, `${p.name} has grad after backward`);
      assert(p.grad!.length === p.size, `${p.name} grad size matches param size`);

      // Verify grad is not all zeros
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

  // Test 5b: Specific parameter gradients exist
  console.log("TensorMiniMindModel — specific param gradients:");
  {
    const m = new TensorMiniMindModel({
      vocabSize: V, dModel: D, numHeads: H, dFF, numLayers: L, maxSeqLen,
    });
    const ids = Tensor.fromArray([[1, 2, 3]]);
    const logits = m.forward(ids);
    const loss = sum(logits);
    loss.backward();

    assert(
      m.embedding.weight.grad !== null,
      "embedding.weight.grad exists"
    );
    assert(
      m.lmHead.linear.weight.grad !== null,
      "lmHead.linear.weight.grad exists"
    );
    assert(
      m.finalNorm.gamma.grad !== null,
      "finalNorm.gamma.grad exists"
    );
    assert(
      m.blocks[0].attention.q_proj.weight.grad !== null,
      "blocks[0].attention.q_proj.weight.grad exists"
    );
    assert(
      m.blocks[0].ffn.gate.weight.grad !== null,
      "blocks[0].ffn.gate.weight.grad exists"
    );
  }

  // Test 5c: zeroGrad clears all gradients
  console.log("TensorMiniMindModel — zeroGrad:");
  {
    const m = new TensorMiniMindModel({
      vocabSize: V, dModel: D, numHeads: H, dFF, numLayers: L, maxSeqLen,
    });
    const ids = Tensor.fromArray([[1, 2]]);
    const logits = m.forward(ids);
    const loss = sum(logits);
    loss.backward();

    m.zeroGrad();

    for (const p of m.parameters()) {
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
  // SECTION 6: Finite difference gradient checks
  // ============================================================
  console.log("\n--- TensorMiniMindModel gradient checks ---");

  // Use ultra-small model for finite difference checking
  const tinyV = 10;
  const tinyD = 8;
  const tinyH = 2;
  const tinyFF = 16;
  const tinyL = 2;
  const tinyModel = new TensorMiniMindModel({
    vocabSize: tinyV, dModel: tinyD, numHeads: tinyH,
    dFF: tinyFF, numLayers: tinyL, maxSeqLen: 4,
  });
  const testIds = Tensor.fromArray([[1, 2, 3]]);

  // Test 6a: Finite difference check — embedding.weight
  runGradientTest(
    "embedding.weight gradient check",
    (_params) => {
      tinyModel.zeroGrad();
      const logits = tinyModel.forward(testIds);
      return sum(logits);
    },
    [tinyModel.embedding.weight],
    1e-4
  );

  // Test 6b: Finite difference check — lmHead.linear.weight
  runGradientTest(
    "lmHead.linear.weight gradient check",
    (_params) => {
      tinyModel.zeroGrad();
      const logits = tinyModel.forward(testIds);
      return sum(logits);
    },
    [tinyModel.lmHead.linear.weight],
    1e-4
  );

  // Test 6c: Finite difference check — blocks[0].attention.q_proj.weight
  runGradientTest(
    "blocks[0].attention.q_proj.weight gradient check",
    (_params) => {
      tinyModel.zeroGrad();
      const logits = tinyModel.forward(testIds);
      return sum(logits);
    },
    [tinyModel.blocks[0].attention.q_proj.weight],
    1e-3 // relaxed for deep computation graph
  );

  // Test 6d: Finite difference check — blocks[0].ffn.down.weight
  runGradientTest(
    "blocks[0].ffn.down.weight gradient check",
    (_params) => {
      tinyModel.zeroGrad();
      const logits = tinyModel.forward(testIds);
      return sum(logits);
    },
    [tinyModel.blocks[0].ffn.down.weight],
    1e-3
  );

  // Test 6e: Finite difference check — blocks[1].norm1.gamma
  runGradientTest(
    "blocks[1].norm1.gamma gradient check",
    (_params) => {
      tinyModel.zeroGrad();
      const logits = tinyModel.forward(testIds);
      return sum(logits);
    },
    [tinyModel.blocks[1].norm1.gamma],
    1e-4
  );

  // Test 6f: Finite difference check — finalNorm.gamma
  runGradientTest(
    "finalNorm.gamma gradient check",
    (_params) => {
      tinyModel.zeroGrad();
      const logits = tinyModel.forward(testIds);
      return sum(logits);
    },
    [tinyModel.finalNorm.gamma],
    1e-4
  );

  // ============================================================
  // SECTION 7: Presets
  // ============================================================
  console.log("\n--- TensorMiniMindModel presets ---");

  // Test 7a: Tiny preset
  console.log("TensorMiniMindModel — tiny preset:");
  {
    const tiny = TensorMiniMindModel.tiny(100);
    assert(tiny.dModel === 128, "tiny dModel=128");
    assert(tiny.numHeads === 4, "tiny numHeads=4");
    assert(tiny.dFF === 512, "tiny dFF=512");
    assert(tiny.numLayers === 2, "tiny numLayers=2");
    assert(tiny.vocabSize === 100, "tiny vocabSize=100");
    assert(tiny.maxSeqLen === 64, "tiny maxSeqLen=64");

    // Verify forward works
    const ids = Tensor.fromArray([[1, 2, 3]]);
    const logits = tiny.forward(ids);
    assert(
      logits.shape[0] === 1 && logits.shape[1] === 3 && logits.shape[2] === 100,
      "tiny forward shape [1,3,100]"
    );

    // Verify parameter count is reasonable
    assert(tiny.parameters().length > 0, "tiny has parameters");
  }

  // Test 7b: MiniMind preset — just verify construction
  console.log("TensorMiniMindModel — miniMind preset:");
  {
    const mini = TensorMiniMindModel.miniMind(200);
    assert(mini.dModel === 512, "miniMind dModel=512");
    assert(mini.numHeads === 8, "miniMind numHeads=8");
    assert(mini.dFF === 2048, "miniMind dFF=2048");
    assert(mini.numLayers === 8, "miniMind numLayers=8");
    assert(mini.vocabSize === 200, "miniMind vocabSize=200");
    assert(mini.maxSeqLen === 256, "miniMind maxSeqLen=256");
  }

  // ============================================================
  // SECTION 8: summarize() method
  // ============================================================
  console.log("\n--- TensorMiniMindModel summarize ---");

  // Test 8a: summarize returns a non-empty string
  console.log("TensorMiniMindModel — summarize:");
  {
    const summary = model.summarize();
    assert(summary.length > 0, "summarize() returns non-empty string");
    assert(summary.includes("TensorMiniMindModel"), "summary includes model name");
    assert(summary.includes("Config:"), "summary includes config line");
    assert(summary.includes("embedding.weight"), "summary includes embedding.weight");
    assert(summary.includes("Total parameters:"), "summary includes total params");
    assert(summary.includes("Total elements:"), "summary includes total elements");
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n=== TensorMiniMindModel tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
