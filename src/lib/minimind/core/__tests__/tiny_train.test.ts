// ============================================================
// Tiny Training Demo — End-to-End Convergence Test
// ============================================================
// Phase 38: The proof that the training loop actually works.
//
// Creates a tiny model, trains on simple repeated pattern data,
// and verifies:
//   1. Loss decreases after training
//   2. Model parameters actually changed
//   3. The complete forward→loss→backward→step→zeroGrad pipeline
//
// This is the definitive test that Phase 38 is complete.
// ============================================================

import { Tensor } from "../Tensor";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { crossEntropyLoss } from "../loss/CrossEntropyLoss";
import { SGDOptimizer } from "../optim/SGD";
import { AdamWOptimizer } from "../optim/AdamW";
import { runTrainingLoop } from "../../training/TrainingLoop";

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

export function runTinyTrainTests(): { passed: number; failed: number } {
  console.log("\n=== Tiny Training Demo Tests ===\n");

  // ============================================================
  // Setup: Tiny model + simple pattern data
  // ============================================================
  const vocabSize = 32;
  const model = TensorMiniMindModel.tiny(vocabSize);

  // Create a simple repeating pattern: [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]
  const inputTokens = [[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]];
  const targetTokens = [[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]];

  const inputIds = Tensor.fromArray(inputTokens);
  const optimizer = new SGDOptimizer(model.parameters(), 0.1);

  // ============================================================
  // Test 1: Compute loss before training
  // ============================================================
  console.log("--- Before training ---");

  // Snapshot initial parameter values
  const initialParams: Float64Array[] = [];
  for (const p of model.parameters()) {
    initialParams.push(new Float64Array(p.data));
  }

  // Compute initial loss
  const logitsBefore = model.forward(inputIds);
  const lossBefore = crossEntropyLoss(logitsBefore, targetTokens);
  const lossBeforeVal = lossBefore.item();

  console.log(`  Initial loss: ${lossBeforeVal.toFixed(4)}`);
  assert(isFinite(lossBeforeVal), "initial loss is finite");
  assert(lossBeforeVal > 0, "initial loss is positive");

  // ============================================================
  // Test 2: Run training for 20 steps
  // ============================================================
  console.log("\n--- Training (20 steps) ---");

  const result = runTrainingLoop(
    model,
    crossEntropyLoss,
    optimizer,
    inputIds,
    targetTokens,
    { epochs: 20 }
  );

  console.log(`  Epoch 0 loss:  ${result.history[0].loss.toFixed(4)}`);
  console.log(`  Epoch 5 loss:  ${result.history[5].loss.toFixed(4)}`);
  console.log(`  Epoch 10 loss: ${result.history[10].loss.toFixed(4)}`);
  console.log(`  Epoch 19 loss: ${result.history[19].loss.toFixed(4)}`);

  assert(result.history.length === 20, "20 epochs recorded");
  assert(result.epochs === 20, "epochs count matches");
  assert(result.initialLoss === result.history[0].loss, "initialLoss matches first epoch");

  // ============================================================
  // Test 3: Verify loss decreased
  // ============================================================
  console.log("\n--- Loss decrease verification ---");

  const lossAfterVal = result.finalLoss;
  console.log(`  Before: ${lossBeforeVal.toFixed(4)}`);
  console.log(`  After:  ${lossAfterVal.toFixed(4)}`);
  console.log(`  Decrease: ${(lossBeforeVal - lossAfterVal).toFixed(4)}`);

  assert(
    lossAfterVal < lossBeforeVal,
    `afterLoss (${lossAfterVal.toFixed(4)}) < beforeLoss (${lossBeforeVal.toFixed(4)})`
  );

  // ============================================================
  // Test 4: Verify parameters actually changed
  // ============================================================
  console.log("\n--- Parameter change verification ---");

  let totalParamChange = 0;
  let anyParamChanged = false;

  for (let i = 0; i < model.parameters().length; i++) {
    const p = model.parameters()[i];
    const initial = initialParams[i];

    let maxChange = 0;
    for (let j = 0; j < p.data.length; j++) {
      const change = Math.abs(p.data[j] - initial[j]);
      if (change > maxChange) maxChange = change;
      totalParamChange += change;
    }

    if (maxChange > 1e-14) {
      anyParamChanged = true;
    }
  }

  console.log(`  Total absolute param change: ${totalParamChange.toExponential(4)}`);
  assert(anyParamChanged, "at least one parameter has changed");
  assert(totalParamChange > 0, "total param change is positive");

  // ============================================================
  // Test 5: Verify loss is monotonically decreasing (roughly)
  // ============================================================
  console.log("\n--- Loss trend verification ---");

  const firstHalfAvg =
    result.history.slice(0, 10).reduce((s, h) => s + h.loss, 0) / 10;
  const secondHalfAvg =
    result.history.slice(10, 20).reduce((s, h) => s + h.loss, 0) / 10;

  console.log(`  First 10 avg:  ${firstHalfAvg.toFixed(4)}`);
  console.log(`  Last 10 avg:   ${secondHalfAvg.toFixed(4)}`);

  assert(
    secondHalfAvg < firstHalfAvg,
    `second half avg loss (${secondHalfAvg.toFixed(4)}) < first half (${firstHalfAvg.toFixed(4)})`
  );

  // ============================================================
  // Test 6: Parameter norm tracking
  // ============================================================
  console.log("\n--- Parameter norm tracking ---");

  for (const h of result.history) {
    assert(h.parameterNorm > 0, `epoch ${h.epoch}: parameterNorm > 0`);
    assert(isFinite(h.parameterNorm), `epoch ${h.epoch}: parameterNorm is finite`);
  }

  // ============================================================
  // Test 7: Verify training doesn't produce NaN
  // ============================================================
  console.log("\n--- Numerical stability ---");

  for (const h of result.history) {
    assert(!isNaN(h.loss), `epoch ${h.epoch}: loss is not NaN`);
    assert(isFinite(h.loss), `epoch ${h.epoch}: loss is finite`);
  }

  // Check all parameters are finite
  for (const p of model.parameters()) {
    for (let i = 0; i < p.data.length; i++) {
      assert(
        isFinite(p.data[i]) && !isNaN(p.data[i]),
        `${p.name}[${i}] is finite after training`
      );
    }
  }

  // ============================================================
  // SECTION 8: AdamW vs SGD Convergence Comparison
  // ============================================================
  console.log("\n--- AdamW vs SGD Convergence (Phase 39) ---");

  // Test 8a: AdamW training on same data converges
  console.log("AdamW — convergence test:");
  {
    const vocabSize = 32;
    const model2 = TensorMiniMindModel.tiny(vocabSize);
    const inputIds2 = Tensor.fromArray([[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]]);
    const targetTokens2 = [[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]];

    const adamwOptimizer = new AdamWOptimizer(model2.parameters(), {
      lr: 0.01,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.0,
    });

    const logitsBefore = model2.forward(inputIds2);
    const lossBefore = crossEntropyLoss(logitsBefore, targetTokens2).item();

    const adamwResult = runTrainingLoop(
      model2,
      crossEntropyLoss,
      adamwOptimizer,
      inputIds2,
      targetTokens2,
      { epochs: 20 }
    );

    const lossAfter = adamwResult.finalLoss;
    console.log(`  AdamW — Before: ${lossBefore.toFixed(4)}, After: ${lossAfter.toFixed(4)}`);
    console.log(`  AdamW — Decrease: ${(lossBefore - lossAfter).toFixed(4)}`);

    assert(
      lossAfter < lossBefore,
      `AdamW: loss decreased (${lossAfter.toFixed(4)} < ${lossBefore.toFixed(4)})`
    );
    assert(
      adamwResult.history.length === 20,
      `AdamW: 20 epochs recorded (got ${adamwResult.history.length})`
    );

    // Verify monotonic trend
    const adamwFirstHalf = adamwResult.history.slice(0, 10).reduce((s, h) => s + h.loss, 0) / 10;
    const adamwSecondHalf = adamwResult.history.slice(10, 20).reduce((s, h) => s + h.loss, 0) / 10;
    assert(
      adamwSecondHalf < adamwFirstHalf,
      `AdamW: second half avg (${adamwSecondHalf.toFixed(4)}) < first half (${adamwFirstHalf.toFixed(4)})`
    );

    // AdamW should produce finite values throughout
    for (const h of adamwResult.history) {
      assert(!isNaN(h.loss), `AdamW epoch ${h.epoch}: loss is not NaN`);
      assert(isFinite(h.loss), `AdamW epoch ${h.epoch}: loss is finite`);
    }
  }

  // Test 8b: AdamW with weight decay converges
  console.log("AdamW — training with weight decay:");
  {
    const vocabSize = 32;
    const model3 = TensorMiniMindModel.tiny(vocabSize);
    const inputIds3 = Tensor.fromArray([[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]]);
    const targetTokens3 = [[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]];

    const adamwWdOptimizer = new AdamWOptimizer(model3.parameters(), {
      lr: 0.01,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.01,
    });

    const logitsBefore = model3.forward(inputIds3);
    const lossBefore = crossEntropyLoss(logitsBefore, targetTokens3).item();

    const wdResult = runTrainingLoop(
      model3,
      crossEntropyLoss,
      adamwWdOptimizer,
      inputIds3,
      targetTokens3,
      { epochs: 20 }
    );

    const lossAfter = wdResult.finalLoss;
    console.log(`  AdamW+WD — Before: ${lossBefore.toFixed(4)}, After: ${lossAfter.toFixed(4)}`);

    assert(
      lossAfter < lossBefore,
      `AdamW+WD: loss decreased with weight decay`
    );

    // All params should still be finite
    for (const p of model3.parameters()) {
      for (let i = 0; i < p.data.length; i++) {
        assert(isFinite(p.data[i]), `${p.name}[${i}] finite after AdamW+WD training`);
      }
    }
  }

  // Test 8c: Direct comparison — parallel SGD vs AdamW on identical initial models
  console.log("AdamW vs SGD — side-by-side comparison:");
  {
    const vocabSize = 32;
    const inputTokensC = Tensor.fromArray([[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]]);
    const targetTokensC = [[1, 2, 3, 4, 5, 1, 2, 3, 4, 5]];

    // Create two identical models by copying parameters after init
    const sgdModel = TensorMiniMindModel.tiny(vocabSize);
    const adamwModel = TensorMiniMindModel.tiny(vocabSize);

    // Copy sgdModel parameters into adamwModel for identical starting point
    const sgdParams = sgdModel.parameters();
    const adamwParams = adamwModel.parameters();
    for (let i = 0; i < sgdParams.length; i++) {
      adamwParams[i].data.set(sgdParams[i].data);
    }

    const sgdOptimizer = new SGDOptimizer(sgdParams, 0.1);
    const adamwOptimizer = new AdamWOptimizer(adamwParams, {
      lr: 0.01,
      betas: [0.9, 0.999],
      eps: 1e-8,
      weightDecay: 0.0,
    });

    const sgdResult = runTrainingLoop(
      sgdModel, crossEntropyLoss, sgdOptimizer,
      inputTokensC, targetTokensC, { epochs: 20 }
    );

    const adamwResult = runTrainingLoop(
      adamwModel, crossEntropyLoss, adamwOptimizer,
      inputTokensC, targetTokensC, { epochs: 20 }
    );

    console.log(`  SGD initial loss:   ${sgdResult.history[0].loss.toFixed(4)}`);
    console.log(`  AdamW initial loss: ${adamwResult.history[0].loss.toFixed(4)}`);
    console.log(`  SGD final loss:     ${sgdResult.finalLoss.toFixed(4)}`);
    console.log(`  AdamW final loss:   ${adamwResult.finalLoss.toFixed(4)}`);
    console.log(`  SGD decrease:       ${(sgdResult.history[0].loss - sgdResult.finalLoss).toFixed(4)}`);
    console.log(`  AdamW decrease:     ${(adamwResult.history[0].loss - adamwResult.finalLoss).toFixed(4)}`);

    // Both should decrease
    assert(sgdResult.finalLoss < sgdResult.history[0].loss, "SGD: loss decreased");
    assert(adamwResult.finalLoss < adamwResult.history[0].loss, "AdamW: loss decreased");

    // Both should produce finite values
    for (const h of sgdResult.history) {
      assert(isFinite(h.loss), `SGD epoch ${h.epoch}: finite`);
    }
    for (const h of adamwResult.history) {
      assert(isFinite(h.loss), `AdamW epoch ${h.epoch}: finite`);
    }
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n=== Tiny Training tests: ${passed} passed, ${failed} failed ===`);
  return { passed, failed };
}
