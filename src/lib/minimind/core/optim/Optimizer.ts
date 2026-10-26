// ============================================================
// Optimizer — Abstract base class for parameter optimizers
// ============================================================
// Phase 38: PyTorch-style optimizer interface. All optimizers
// (SGD, AdamW, etc.) extend this class and implement step().
//
// Design:
//   - Owns a reference to the model's Parameter[] array
//   - step() reads param.grad and updates param.data in-place
//   - zeroGrad() clears all parameter gradients before next step
//   - No new Tensor creation during step — purely in-place math
// ============================================================

import type { Parameter } from "../Parameter";

/**
 * Abstract base class for all optimizers.
 *
 * Subclasses must implement step() to apply gradient-based
 * parameter updates. zeroGrad() is provided as a default
 * implementation that calls param.zeroGrad() on each parameter.
 *
 * Usage:
 *   const optim = new SGDOptimizer(model.parameters(), 0.01);
 *   // ... forward + backward ...
 *   optim.step();
 *   optim.zeroGrad();
 */
export abstract class Optimizer {
  /** The model's trainable parameters (in-place references, not copies) */
  parameters: Parameter[];

  /**
   * @param parameters - Array of Parameter instances from model.parameters()
   */
  constructor(parameters: Parameter[]) {
    this.parameters = parameters;
  }

  /**
   * Apply gradient-based updates to all parameters.
   *
   * Called after loss.backward() populates param.grad for each parameter.
   * Subclasses implement the specific update rule (SGD, Adam, etc.).
   *
   * Post-condition: param.data has been modified in-place.
   * Pre-condition:  param.grad is non-null and populated by autograd.
   */
  abstract step(): void;

  /**
   * Reset all parameter gradients to zero.
   *
   * Must be called before each training step to prevent
   * gradient accumulation across batches.
   *
   * Default implementation calls param.zeroGrad() on each parameter.
   */
  zeroGrad(): void {
    for (const p of this.parameters) {
      p.zeroGrad();
    }
  }
}
