// ============================================================
// TrainingLoop — MiniMind training orchestrator
// ============================================================
// Phase 38: Composes model, loss criterion, and optimizer into
// a complete training loop with epoch-level history tracking.
//
// The loop:
//   for epoch in epochs:
//     logits = model.forward(inputIds)   // [B,S] → [B,S,V]
//     loss = criterion(logits, targets)  // scalar Tensor
//     loss.backward()                    // autograd
//     optimizer.step()                   // W -= lr * grad
//     optimizer.zeroGrad()               // reset for next step
//     record { epoch, loss, parameterNorm }
//
// Design:
//   - Minimal orchestrator — no data loading, no checkpointing
//   - Accepts Token ID tensors directly (no text preprocessing)
//   - Returns TrainingHistory for analysis and visualization
//   - Independent of UI / AI Lab — pure TypeScript
// ============================================================

import { Tensor } from "../core/Tensor";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { Optimizer } from "../core/optim/Optimizer";

// ============================================================
// Types
// ============================================================

/**
 * Configuration for a training run.
 */
export interface TrainingConfig {
  /** Number of full passes over the dataset */
  epochs: number;
}

/**
 * Recorded metrics for a single training epoch.
 */
export interface EpochHistory {
  /** Zero-based epoch index */
  epoch: number;
  /** Average cross-entropy loss for this epoch (scalar value) */
  loss: number;
  /** L2 norm of all model parameters (√Σ p_i²) after the step */
  parameterNorm: number;
}

/**
 * Complete training history for analysis.
 */
export interface TrainingHistory {
  /** Per-epoch metrics, in order */
  history: EpochHistory[];
  /** Final loss value */
  finalLoss: number;
  /** Initial loss value */
  initialLoss: number;
  /** Total epochs run */
  epochs: number;
}

// ============================================================
// Training Loop
// ============================================================

/**
 * Run a training loop for the given number of epochs.
 *
 * This is the core training primitive. It takes a model, a loss
 * criterion (which is a function from logits+targets to scalar loss
 * Tensor), an optimizer, and input data, and runs the full
 * forward → loss → backward → step → zeroGrad cycle.
 *
 * @param model     - TensorMiniMindModel instance
 * @param criterion - Loss function, e.g. crossEntropyLoss
 * @param optimizer - Optimizer instance (SGD, etc.)
 * @param inputIds  - Token ID tensor [B, S] for model input
 * @param targets   - Target token IDs, targets[b][s] per batch
 * @param config    - Training configuration { epochs }
 * @returns TrainingHistory with per-epoch loss and parameter norms
 *
 * Example:
 *   const history = runTrainingLoop(
 *     model,
 *     crossEntropyLoss,
 *     new SGDOptimizer(model.parameters(), 0.01),
 *     Tensor.fromArray([[1, 2, 3, 4]]),
 *     [[1, 2, 3, 4]],
 *     { epochs: 20 }
 *   );
 *   // history.initialLoss > history.finalLoss → learning happened
 */
export function runTrainingLoop(
  model: TensorMiniMindModel,
  criterion: (logits: Tensor, targets: number[][]) => Tensor,
  optimizer: Optimizer,
  inputIds: Tensor,
  targets: number[][],
  config: TrainingConfig
): TrainingHistory {
  if (config.epochs <= 0) {
    throw new Error(
      `runTrainingLoop: epochs must be positive, got ${config.epochs}`
    );
  }

  const history: EpochHistory[] = [];
  let initialLoss = 0;
  let finalLoss = 0;

  for (let epoch = 0; epoch < config.epochs; epoch++) {
    // ── Zero gradients before forward ──
    optimizer.zeroGrad();

    // ── Forward pass ──
    // inputIds: [B, S] → logits: [B, S, V]
    const logits = model.forward(inputIds);

    // ── Loss computation ──
    // Causal shift is handled inside the criterion
    const lossTensor = criterion(logits, targets);

    // ── Backward pass ──
    // Populates gradients on all model parameters
    lossTensor.backward();

    // ── Parameter update ──
    // In-place: W -= lr * grad
    optimizer.step();

    // ── Compute parameter norm (after update) ──
    let paramNormSq = 0;
    for (const p of model.parameters()) {
      for (let i = 0; i < p.data.length; i++) {
        paramNormSq += p.data[i] * p.data[i];
      }
    }
    const parameterNorm = Math.sqrt(paramNormSq);

    // ── Record ──
    const lossVal = lossTensor.item();
    history.push({ epoch, loss: lossVal, parameterNorm });

    if (epoch === 0) {
      initialLoss = lossVal;
    }
    finalLoss = lossVal;
  }

  return {
    history,
    initialLoss,
    finalLoss,
    epochs: config.epochs,
  };
}
