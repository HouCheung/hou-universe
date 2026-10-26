// ============================================================
// LinearWarmupScheduler — Simple linear warmup followed by
//                         constant learning rate.
// ============================================================
// Phase 42: Minimal scheduler for warmup-only scenarios.
//
// Algorithm:
//   During warmup (step < warmupSteps):
//     lr = baseLR * (step / warmupSteps)
//
//   After warmup (step >= warmupSteps):
//     lr = baseLR (stays constant)
//
// This is useful when you want warmup but no decay, or when
// you plan to chain another scheduler after warmup.
//
// Usage:
//   const scheduler = new LinearWarmupScheduler(optimizer, {
//     baseLR: 0.001,
//     warmupSteps: 100,
//   });
// ============================================================

import type { Optimizer } from "../optim/Optimizer";
import { LRScheduler } from "./LRScheduler";
import type { SchedulerState } from "./LRScheduler";

/**
 * Configuration for LinearWarmupScheduler.
 */
export interface LinearWarmupConfig {
  /** Base (target) learning rate */
  baseLR: number;
  /** Number of warmup steps */
  warmupSteps: number;
}

/**
 * Serializable state for LinearWarmupScheduler checkpointing.
 */
export interface LinearWarmupState extends SchedulerState {
  warmupSteps: number;
}

/**
 * Linear warmup scheduler — ramps LR from 0 to baseLR, then stays constant.
 *
 * This is the simplest warmup scheduler. It's useful for:
 *   - Standalone warmup before switching to a decay schedule
 *   - Experiments where you want to study the effect of warmup alone
 *   - Constant-LR training with a gentle start
 */
export class LinearWarmupScheduler extends LRScheduler {
  /** Number of warmup steps */
  readonly warmupSteps: number;

  /**
   * @param optimizer - The optimizer whose LR to manage
   * @param config    - Schedule configuration
   */
  constructor(optimizer: Optimizer, config: LinearWarmupConfig) {
    super(optimizer, config.baseLR);

    this.warmupSteps = config.warmupSteps;

    if (this.baseLR <= 0) {
      throw new Error(
        `LinearWarmupScheduler: baseLR must be positive, got ${this.baseLR}`
      );
    }
    if (this.warmupSteps < 0) {
      throw new Error(
        `LinearWarmupScheduler: warmupSteps must be non-negative, got ${this.warmupSteps}`
      );
    }

    // Initialize optimizer LR
    this.setOptimizerLR(this.computeLR());
  }

  /**
   * Compute the current learning rate.
   *
   * During warmup: linear ramp from 0 to baseLR.
   * After warmup: constant at baseLR.
   */
  computeLR(): number {
    if (this.warmupSteps === 0) {
      return this.baseLR;
    }

    if (this.currentStep < this.warmupSteps) {
      return this.baseLR * (this.currentStep / this.warmupSteps);
    }

    return this.baseLR;
  }

  /**
   * Serialize scheduler state for checkpointing.
   */
  stateDict(): LinearWarmupState {
    return {
      ...super.stateDict(),
      warmupSteps: this.warmupSteps,
    };
  }

  /**
   * Restore scheduler state from a checkpoint.
   */
  loadStateDict(state: LinearWarmupState): void {
    super.loadStateDict(state);
    if (state.warmupSteps !== this.warmupSteps) {
      throw new Error(
        `LinearWarmupScheduler.loadStateDict: warmupSteps mismatch. ` +
        `Saved: ${state.warmupSteps}, current: ${this.warmupSteps}`
      );
    }
  }
}
