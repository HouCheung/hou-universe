// ============================================================
// LRScheduler — PyTorch-style learning rate scheduler base
// ============================================================
// Phase 42: Abstract base class for all learning rate schedulers.
//
// Design (PyTorch-aligned):
//   - Holds a reference to the optimizer
//   - step() advances the scheduler state and updates optimizer LR
//   - getLR() returns the current computed learning rate
//   - stateDict() / loadStateDict() for checkpoint serialization
//
// Subclasses implement computeLR() to define the schedule curve.
//
// Usage:
//   const scheduler = new CosineScheduler(optimizer, {
//     baseLR: 0.001, minLR: 1e-6, warmupSteps: 100, totalSteps: 1000,
//   });
//   for (...) {
//     loss.backward();
//     optimizer.step();
//     scheduler.step();  // advances step counter, updates optimizer.lr
//     optimizer.zeroGrad();
//   }
// ============================================================

import type { Optimizer } from "../optim/Optimizer";

/**
 * Serializable scheduler state for checkpointing.
 */
export interface SchedulerState {
  /** Current step count */
  stepCount: number;
  /** Base learning rate */
  baseLR: number;
}

/**
 * Abstract base class for all learning rate schedulers.
 *
 * Subclasses must implement:
 *   - computeLR(): returns the LR for the current step
 *
 * The base class handles:
 *   - Step counter management
 *   - Optimizer LR update via step()
 *   - State serialization for checkpointing
 */
export abstract class LRScheduler {
  /** The optimizer whose LR will be managed */
  protected optimizer: Optimizer;

  /** Current step counter — incremented each step() call */
  protected currentStep: number;

  /** Base learning rate (initial/maximum LR) */
  protected baseLR: number;

  /**
   * @param optimizer - The optimizer instance (AdamW or SGD)
   * @param baseLR    - Base learning rate (maximum LR for decay schedules)
   */
  constructor(optimizer: Optimizer, baseLR: number) {
    this.optimizer = optimizer;
    this.baseLR = baseLR;
    this.currentStep = 0;
  }

  /**
   * Get the current learning rate based on the schedule.
   *
   * Subclasses implement this to compute the LR at the current step.
   * Called by step() before updating the optimizer.
   */
  abstract computeLR(): number;

  /**
   * Get the current learning rate without advancing the step counter.
   *
   * Useful for logging and inspection without side effects.
   */
  getLR(): number {
    return this.computeLR();
  }

  /**
   * Advance the scheduler by one step and update the optimizer's LR.
   *
   * Should be called after optimizer.step() in the training loop.
   * The optimizer's LR is updated in-place.
   */
  step(): void {
    this.currentStep++;
    const newLR = this.computeLR();
    this.setOptimizerLR(newLR);
  }

  /**
   * Set the optimizer's learning rate.
   *
   * Handles both AdamW (.lr) and SGD (.learningRate) optimizer types.
   * Protected so subclasses can call it in their constructors.
   */
  protected setOptimizerLR(lr: number): void {
    // Handle both AdamW (.lr) and SGD (.learningRate)
    // Use unknown intermediate to safely cast
    const opt = this.optimizer as unknown as { lr?: number; learningRate?: number };
    if (opt.lr !== undefined) {
      opt.lr = lr;
    } else if (opt.learningRate !== undefined) {
      opt.learningRate = lr;
    }
  }

  /**
   * Serialize scheduler state for checkpointing.
   *
   * Returns a plain object suitable for JSON serialization.
   * Subclasses should call super.stateDict() and extend the result.
   */
  stateDict(): SchedulerState {
    return {
      stepCount: this.currentStep,
      baseLR: this.baseLR,
    };
  }

  /**
   * Restore scheduler state from a checkpoint.
   *
   * Subclasses should call super.loadStateDict() to restore
   * the base state, then restore their own additional fields.
   *
   * @param state - Serialized state from stateDict()
   */
  loadStateDict(state: SchedulerState): void {
    this.currentStep = state.stepCount;
    this.baseLR = state.baseLR;
  }

  /**
   * Get the current step count.
   */
  getStepCount(): number {
    return this.currentStep;
  }
}
