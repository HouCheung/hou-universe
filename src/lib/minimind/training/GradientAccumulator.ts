// ============================================================
// GradientAccumulator — Micro-batch gradient accumulation
// ============================================================
// Phase 45.1: Manages the lifecycle of gradient accumulation
// across micro-batches, scaling the loss correctly and tracking
// when the optimizer should step.
//
// This is the PyTorch-style pattern:
//   for micro_batch in batches:
//     loss = criterion(model(micro_batch), targets)
//     scaled = accumulator.accumulate(loss)   // loss / steps
//     scaled.backward()                        // accumulate grads
//     accumulator.advance()
//     if accumulator.shouldStep():
//       clip_gradients()
//       optimizer.step()
//       optimizer.zeroGrad()
//       accumulator.reset()
//
// When accumulation_steps = 4 and batch_size = 8:
//   effective_batch_size = 8 * 4 = 32
//   Each micro-batch loss is divided by 4 so gradients are
//   averaged (not summed) across accumulation steps.
// ============================================================

import { Tensor } from "../core/Tensor";
import { divide } from "../core/ops/divide";

/**
 * Manages gradient accumulation state across micro-batches.
 *
 * Responsibilities:
 *  - Scale loss by 1/accumulationSteps so accumulated gradients
 *    match the gradient of an equivalent larger batch
 *  - Track internal step counter
 *  - Signal when the optimizer should step
 *  - Support zeroGrad lifecycle via reset()
 *
 * Example:
 *   const acc = new GradientAccumulator(4);
 *   for (const batch of loader) {
 *     const loss = criterion(model(batch), targets);
 *     const scaled = acc.accumulate(loss);  // scales by 1/4
 *     scaled.backward();
 *     acc.advance();
 *     if (acc.shouldStep()) {
 *       clipGradients(model.parameters(), 1.0);
 *       optimizer.step();
 *       optimizer.zeroGrad();
 *       acc.reset();
 *     }
 *   }
 *   // Drain leftover: if (acc.hasPending()) { step }
 */
export class GradientAccumulator {
  /** Number of micro-batches to accumulate before stepping */
  readonly accumulationSteps: number;

  /** Current micro-batch index within the accumulation window [0, steps) */
  private stepIndex: number;

  /** Cached denominator tensor for loss scaling (created once) */
  private denominator: Tensor | null;

  /**
   * @param accumulationSteps - Number of micro-batches per optimizer step.
   *   Must be >= 1. A value of 1 means no accumulation (step every batch).
   */
  constructor(accumulationSteps: number) {
    if (accumulationSteps < 1 || !Number.isInteger(accumulationSteps)) {
      throw new Error(
        `GradientAccumulator: accumulationSteps must be a positive integer, got ${accumulationSteps}`
      );
    }
    this.accumulationSteps = accumulationSteps;
    this.stepIndex = 0;
    this.denominator =
      accumulationSteps > 1
        ? Tensor.scalar(accumulationSteps)
        : null;
  }

  // ============================================================
  // Core API
  // ============================================================

  /**
   * Scale a loss tensor for gradient accumulation.
   *
   * When accumulationSteps > 1, returns loss / accumulationSteps
   * so that N accumulated backward() calls produce the same total
   * gradient as a single backward() on the summed loss of a batch
   * N× larger.
   *
   * When accumulationSteps === 1, returns the loss unchanged.
   *
   * Important: call this BEFORE backward(), not after.
   *
   * @param loss - Scalar loss tensor from criterion
   * @returns Scaled loss tensor ready for .backward()
   */
  accumulate(loss: Tensor): Tensor {
    if (this.accumulationSteps === 1) {
      return loss;
    }
    // denominator is guaranteed non-null when accumulationSteps > 1
    return divide(loss, this.denominator!);
  }

  /**
   * Advance the internal step counter after a micro-batch backward().
   *
   * Call this after scaledLoss.backward() to move the accumulator
   * forward. shouldStep() will return true when the counter wraps.
   */
  advance(): void {
    this.stepIndex++;
  }

  /**
   * Whether the optimizer should step now.
   *
   * Returns true when stepIndex has reached accumulationSteps,
   * meaning enough micro-batches have been accumulated.
   *
   * Call optimizer.step() → optimizer.zeroGrad() → reset()
   * when this returns true.
   */
  shouldStep(): boolean {
    return this.stepIndex >= this.accumulationSteps;
  }

  /**
   * Reset the internal counter for the next accumulation cycle.
   *
   * Must be called after optimizer.step() + optimizer.zeroGrad()
   * to begin a fresh accumulation window.
   */
  reset(): void {
    this.stepIndex = 0;
  }

  // ============================================================
  // Queries
  // ============================================================

  /**
   * Whether there are pending (un-stepped) gradients.
   *
   * Use this at epoch end to flush leftover accumulated gradients
   * when the total number of batches is not divisible by
   * accumulationSteps.
   */
  hasPending(): boolean {
    return this.stepIndex > 0 && this.stepIndex < this.accumulationSteps;
  }

  /**
   * Current micro-batch index within the accumulation window.
   * Range: [0, accumulationSteps).
   */
  get currentStep(): number {
    return this.stepIndex;
  }

  /**
   * Whether the accumulator is at the start of a new window
   * (no gradients accumulated yet).
   */
  get isFresh(): boolean {
    return this.stepIndex === 0;
  }

  /**
   * Number of micro-batches remaining before the next optimizer step.
   */
  get remainingSteps(): number {
    return Math.max(0, this.accumulationSteps - this.stepIndex);
  }
}
