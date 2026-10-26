// ============================================================
// GradientNormTracker — Wrapper optimizer that records gradient
// L2 norm before each optimizer step.
// ============================================================
// Phase 55: Tracks per-step gradient norms for training milestone
// recording without modifying the Trainer or existing optimizer.
//
// The wrapper intercepts optimizer.step() to compute the global
// L2 norm of all parameter gradients BEFORE the step is applied.
// After zeroGrad(), the norm is still accessible via lastNorm.
//
// Usage:
//   const baseOptimizer = new AdamWOptimizer(model.parameters(), config);
//   const tracker = new GradientNormTracker(baseOptimizer);
//   // Pass tracker to Trainer — it implements Optimizer interface
//   const trainer = new Trainer({ model, optimizer: tracker, ... });
//   // Read gradient norm in onLog callback:
//   onLog: (info) => console.log(tracker.lastNorm);
// ============================================================

import { computeGlobalNorm } from "../../core/GradientClipper";
import type { Parameter } from "../../core/Parameter";
import type { Optimizer } from "../../core/optim/Optimizer";

/**
 * Optimizer wrapper that records the global L2 gradient norm
 * immediately before each optimizer step.
 *
 * Implements the Optimizer interface so it can be passed directly
 * to Trainer in place of a real optimizer.
 */
export class GradientNormTracker implements Optimizer {
  private inner: Optimizer;

  /** The model's trainable parameters (matches Optimizer field) */
  parameters: Parameter[];

  /** The gradient norm from the most recent optimizer step */
  private _lastNorm: number = 0;

  /** History of gradient norms keyed by step number */
  private _normHistory: Array<{ step: number; norm: number }> = [];

  /** Step counter, incremented on each step() call */
  private _stepCount: number = 0;

  constructor(inner: Optimizer, params: Parameter[]) {
    this.inner = inner;
    this.parameters = params;
  }

  // ============================================================
  // Optimizer interface
  // ============================================================

  /**
   * Apply one optimizer step, recording gradient norm first.
   *
   * The Trainer calls clipGradients (modifying grads in-place),
   * then this.step() — so the norm captured here reflects the
   * post-clip gradient norm.
   */
  step(): void {
    this._lastNorm = computeGlobalNorm(this.parameters);
    this._normHistory.push({ step: this._stepCount, norm: this._lastNorm });
    this._stepCount++;
    this.inner.step();
  }

  /**
   * Zero all parameter gradients.
   */
  zeroGrad(): void {
    this.inner.zeroGrad();
  }

  // ============================================================
  // Gradient norm accessors
  // ============================================================

  /**
   * The gradient norm from the most recent optimizer step.
   * Returns 0 if no steps have been taken yet.
   */
  get lastNorm(): number {
    return this._lastNorm;
  }

  /**
   * Full history of gradient norms recorded at each step.
   * Each entry is { step: number, norm: number }.
   */
  get normHistory(): ReadonlyArray<{ step: number; norm: number }> {
    return this._normHistory;
  }

  /**
   * Number of optimizer steps taken (equivalent to stepCount).
   */
  get stepCount(): number {
    return this._stepCount;
  }

  /**
   * Get gradient norm at a specific step, or undefined.
   */
  normAt(step: number): number | undefined {
    const entry = this._normHistory.find((e) => e.step === step);
    return entry?.norm;
  }

  /**
   * Get the average gradient norm across all recorded steps.
   * Returns 0 if no steps recorded.
   */
  get averageNorm(): number {
    if (this._normHistory.length === 0) return 0;
    let sum = 0;
    for (const entry of this._normHistory) {
      sum += entry.norm;
    }
    return sum / this._normHistory.length;
  }

  /**
   * Clear all recorded gradient norm history.
   */
  resetHistory(): void {
    this._lastNorm = 0;
    this._normHistory = [];
    this._stepCount = 0;
  }
}
