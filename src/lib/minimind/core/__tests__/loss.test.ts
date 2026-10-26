// ============================================================
// CrossEntropyLoss — Unit & Gradient Validation Tests
// ============================================================
// Phase 38: Verifies the Tensor cross-entropy loss function.
//
// Tests:
//   1. Forward — loss value matches manual softmax+NLL
//   2. Forward — different inputs produce different losses
//   3. Backward — gradient shape and non-zero at valid positions
//   4. Backward — zero gradient at last logit position (no target)
//   5. Gradient check — finite difference vs analytic
//   6. Input validation — throws on invalid shapes/targets
//   7. Integration — autograd propagates through Linear layer
// ============================================================

import { Tensor } from "../Tensor";
import { crossEntropyLoss } from "../loss/CrossEntropyLoss";
import { matmul } from "../ops/matmul";
import { reshape } from "../ops/reshape";
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

export function runLossTests(): { passed: number; failed: number } {
  console.log("\n=== CrossEntropyLoss Tests ===\n");

  // ============================================================
  // SECTION 1: Forward — basic correctness
  // ============================================================
  console.log("--- CrossEntropyLoss forward ---");

  // Test 1a: Simple 2-token sequence, single batch
  console.log("CrossEntropyLoss — simple forward:");
  {
    // logits: [1, 3, 4] — one batch, 3 tokens, vocab=4
    // Position 0 predicts token at position 1
    // Position 1 predicts token at position 2
    // Position 2 has no target (last position)
    const logits = Tensor.fromArray(
      [
        [
          [1.0, 2.0, 0.5, 0.1], // pos 0 → predicts token 1 (target=2)
          [0.5, 1.0, 3.0, 0.2], // pos 1 → predicts token 2 (target=0)
          [0.1, 0.2, 0.3, 0.4], // pos 2 → no target
        ],
      ]
    );
    const targets = [[2, 0, 1]]; // tokens: 2, 0, 1
    // Causal: logits[0] → target[1]=0, logits[1] → target[2]=1

    const loss = crossEntropyLoss(logits, targets);

    // Manual computation:
    // Position 0: softmax([1.0, 2.0, 0.5, 0.1]) → compute manually
    //   max=2.0, exp: [e^-1, e^0, e^-1.5, e^-1.9] = [0.3679, 1.0, 0.2231, 0.1496]
    //   sum=1.7406, probs=[0.2114, 0.5744, 0.1282, 0.0859]
    //   target[1]=0 → probs[0]=0.2114 → -log(0.2114)=1.554
    // Position 1: softmax([0.5, 1.0, 3.0, 0.2])
    //   max=3.0, exp: [e^-2.5, e^-2.0, e^0, e^-2.8] = [0.0821, 0.1353, 1.0, 0.0608]
    //   sum=1.2782, probs=[0.0642, 0.1059, 0.7823, 0.0476]
    //   target[2]=1 → probs[1]=0.1059 → -log(0.1059)=2.245
    // Average loss = (1.554 + 2.245) / 2 = 1.899

    assert(loss.shape.length === 0, "loss is scalar (shape=[])");
    assert(isFinite(loss.item()), "loss is finite");
    assert(loss.item() > 0, "loss is positive");
    assertClose(loss.item(), 1.899, 0.01, "loss value matches manual computation");
  }

  // Test 1b: Perfect prediction → low loss
  console.log("CrossEntropyLoss — perfect prediction:");
  {
    // High logit at target position → low loss
    // causal: logits[0] → target[1], logits[1] → target[2]
    const logits = Tensor.fromArray(
      [[
        [-10, 10, -10], // high at v=1 → target[1] should be 1
        [-10, -10, 10], // high at v=2 → target[2] should be 2
        [0, 0, 0],       // unused (last pos, no target)
      ]]
    );
    const targets = [[0, 1, 2]]; // token 0 at pos 0 (not predicted), token 1 at pos 1, token 2 at pos 2
    const loss = crossEntropyLoss(logits, targets);
    assert(loss.item() < 0.01, `perfect prediction loss < 0.01 (got ${loss.item().toExponential(4)})`);
  }

  // Test 1c: Batch of 2 sequences
  console.log("CrossEntropyLoss — batch forward:");
  {
    const logits = Tensor.fromArray([
      [[1.0, 2.0], [0.5, 1.5], [2.0, 0.1]],  // batch 0
      [[0.5, 1.0], [2.0, 0.5], [1.0, 3.0]],  // batch 1
    ]);
    const targets = [
      [1, 0, 0],  // batch 0
      [0, 1, 1],  // batch 1
    ];
    const loss = crossEntropyLoss(logits, targets);
    assert(isFinite(loss.item()), "batch loss is finite");
    assert(loss.item() > 0, "batch loss is positive");
  }

  // ============================================================
  // SECTION 2: Backward — gradient propagation
  // ============================================================
  console.log("\n--- CrossEntropyLoss backward ---");

  // Test 2a: Gradient has correct shape
  console.log("CrossEntropyLoss — grad shape:");
  {
    const logits = Tensor.fromArray(
      [[[1.0, 2.0, 0.5], [0.5, 1.0, 2.0], [0.1, 0.2, 0.3]]],
      undefined,
      true
    );
    const targets = [[0, 1, 2]];
    const loss = crossEntropyLoss(logits, targets);
    loss.backward();

    assert(logits.grad !== null, "logits.grad exists after backward");
    assert(logits.grad!.length === logits.size, "grad size matches data size");
  }

  // Test 2b: Gradient is non-zero at valid positions
  console.log("CrossEntropyLoss — grad non-zero at valid positions:");
  {
    const V = 5;
    const logits = Tensor.randn([2, 4, V], true);
    const targets = [
      [2, 1, 3, 0],
      [4, 2, 1, 3],
    ];
    const loss = crossEntropyLoss(logits, targets);
    loss.backward();

    // Valid positions (s=0,1,2) should have non-zero gradient
    for (let b = 0; b < 2; b++) {
      for (let s = 0; s < 3; s++) { // S-1 = 3 valid positions
        const offset = (b * 4 + s) * V;
        let hasNonZero = false;
        for (let v = 0; v < V; v++) {
          if (Math.abs(logits.grad![offset + v]) > 1e-12) {
            hasNonZero = true;
            break;
          }
        }
        assert(hasNonZero, `batch[${b}] pos[${s}]: grad is non-zero`);
      }
    }
  }

  // Test 2c: Gradient is ZERO at last logit position (no target)
  console.log("CrossEntropyLoss — grad zero at last position:");
  {
    const V = 4;
    const logits = Tensor.randn([1, 3, V], true);
    const targets = [[1, 2, 0]];
    const loss = crossEntropyLoss(logits, targets);
    loss.backward();

    // Last position (s=2) should have ALL zeros
    const lastOffset = (0 * 3 + 2) * V;
    for (let v = 0; v < V; v++) {
      assert(
        logits.grad![lastOffset + v] === 0,
        `last position grad[${v}] is zero (got ${logits.grad![lastOffset + v]})`
      );
    }
  }

  // Test 2d: Gradient sum per position = 0 (softmax property)
  console.log("CrossEntropyLoss — grad sums to zero per position:");
  {
    const V = 5;
    const logits = Tensor.randn([1, 4, V], true);
    const targets = [[2, 1, 3, 0]];
    const loss = crossEntropyLoss(logits, targets);
    loss.backward();

    // For each valid position, the sum of gradients should be ~0
    // because ∂CE/∂logit_i = probs_i - one_hot(target)_i
    // and Σ probs_i = 1, Σ one_hot_i = 1
    for (let s = 0; s < 3; s++) { // only valid positions
      const offset = s * V;
      let gradSum = 0;
      for (let v = 0; v < V; v++) {
        gradSum += logits.grad![offset + v];
      }
      assertClose(gradSum, 0, 1e-12, `position ${s}: grad sum ≈ 0 (got ${gradSum.toExponential(6)})`);
    }
  }

  // ============================================================
  // SECTION 3: Gradient check (finite differences)
  // ============================================================
  console.log("\n--- CrossEntropyLoss gradient check ---");

  // Test 3a: Finite difference gradient check
  console.log("CrossEntropyLoss — finite difference gradient check:");
  {
    const V = 5;
    const S = 3;
    const logits = Tensor.randn([1, S, V], true);
    const targets = [[2, 1, 0]];

    const { passed: gPassed, maxDiff, details } = gradientCheck(
      (params) => crossEntropyLoss(params[0], targets),
      [logits],
      1e-4,
      1e-4
    );

    if (gPassed) {
      console.log(`  PASS (maxDiff=${maxDiff.toExponential(4)})`);
      passed++;
    } else {
      console.error(`  FAIL (maxDiff=${maxDiff.toExponential(4)})`);
      for (const detail of details) {
        console.error(detail);
      }
      failed++;
    }
  }

  // Test 3b: Gradient check with larger vocab
  console.log("CrossEntropyLoss — gradient check (V=10):");
  {
    const V = 10;
    const S = 4;
    const logits = Tensor.randn([2, S, V], true);
    const targets = [
      [3, 7, 1, 5],
      [8, 2, 6, 0],
    ];

    const { passed: gPassed, maxDiff, details } = gradientCheck(
      (params) => crossEntropyLoss(params[0], targets),
      [logits],
      1e-4,
      1e-4
    );

    if (gPassed) {
      console.log(`  PASS (maxDiff=${maxDiff.toExponential(4)})`);
      passed++;
    } else {
      console.error(`  FAIL (maxDiff=${maxDiff.toExponential(4)})`);
      for (const detail of details) {
        console.error(detail);
      }
      failed++;
    }
  }

  // ============================================================
  // SECTION 4: Input validation
  // ============================================================
  console.log("\n--- CrossEntropyLoss input validation ---");

  // Test 4a: Non-3D logits throws
  console.log("CrossEntropyLoss — non-3D logits:");
  {
    let threw = false;
    try { crossEntropyLoss(Tensor.randn([2, 3]), [[1, 2]]); }
    catch { threw = true; }
    assert(threw, "throws on 2D logits");

    threw = false;
    try { crossEntropyLoss(Tensor.scalar(1.0), [[1]]); }
    catch { threw = true; }
    assert(threw, "throws on scalar logits");
  }

  // Test 4b: Batch size mismatch throws
  console.log("CrossEntropyLoss — batch size mismatch:");
  {
    let threw = false;
    try { crossEntropyLoss(Tensor.randn([2, 3, 4]), [[1, 2, 3]]); }
    catch { threw = true; }
    assert(threw, "throws on targets batch size mismatch");
  }

  // Test 4c: Sequence length mismatch throws
  console.log("CrossEntropyLoss — seq length mismatch:");
  {
    let threw = false;
    try { crossEntropyLoss(Tensor.randn([1, 5, 4]), [[1, 2, 3]]); }
    catch { threw = true; }
    assert(threw, "throws on targets seq length mismatch");
  }

  // Test 4d: Out-of-vocab target throws
  console.log("CrossEntropyLoss — out-of-vocab target:");
  {
    let threw = false;
    try { crossEntropyLoss(Tensor.randn([1, 3, 4]), [[0, 99, 1]]); }
    catch { threw = true; }
    assert(threw, "throws on target ID >= vocabSize");
  }

  // Test 4e: Sequence too short throws
  console.log("CrossEntropyLoss — sequence too short:");
  {
    let threw = false;
    try { crossEntropyLoss(Tensor.randn([1, 1, 4]), [[0]]); }
    catch { threw = true; }
    assert(threw, "throws on S=1 (no causal prediction possible)");
  }

  // ============================================================
  // SECTION 5: Integration — autograd propagation
  // ============================================================
  console.log("\n--- CrossEntropyLoss autograd integration ---");

  // Test 5a: Loss backward propagates through Linear layer
  console.log("CrossEntropyLoss — propagates through Linear:");
  {
    // x: [2, D=3], W: [D=3, V=4] → logits: [2, 4] → reshape → [1, 2, 4]
    const x = Tensor.fromArray([
      [1.0, 2.0, 0.5],
      [0.5, 1.0, 2.0],
    ]); // [2, 3]
    const W = Tensor.randn([3, 4], true); // [3, 4]
    const flatLogits = matmul(x, W); // [2, 3] @ [3, 4] → [2, 4]
    const logits = reshape(flatLogits, 1, 2, 4); // [1, 2, 4] — use standalone reshape for autograd
    const targets = [[1, 0]];
    const loss = crossEntropyLoss(logits, targets);
    loss.backward();

    assert(W.grad !== null, "Linear weight receives gradient from crossEntropyLoss");
    let hasNonZero = false;
    for (let i = 0; i < W.grad!.length; i++) {
      if (Math.abs(W.grad![i]) > 1e-12) {
        hasNonZero = true;
        break;
      }
    }
    assert(hasNonZero, "Linear weight gradient is non-zero");
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n=== CrossEntropyLoss tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
