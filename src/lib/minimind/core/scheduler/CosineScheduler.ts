// ============================================================
// CosineScheduler — Cosine annealing with linear warmup
// ============================================================
// Phase 42: Standard cosine decay schedule with optional warmup.
//
// Algorithm:
//   During warmup (step < warmupSteps):
//     lr = baseLR * (step / warmupSteps)
//
//   After warmup (step >= warmupSteps):
//     progress = (step - warmupSteps) / (totalSteps - warmupSteps)
//     lr = minLR + (baseLR - minLR) * 0.5 * (1 + cos(π * progress))
//
//   When step >= totalSteps:
//     lr = minLR
//
// This is the most commonly used LR schedule in modern transformer
// training (GPT, LLaMA, etc.). The cosine decay provides smooth
// annealing that outperforms step decay in practice.
//
// Usage:
//   const scheduler = new CosineScheduler(optimizer, {
//     baseLR: 0.001,
//     minLR: 1e-6,
//     warmupSteps: 100,
//     totalSteps: 1000,
//   });
// ============================================================

import type { Optimizer } from "../optim/Optimizer";
import { LRScheduler } from "./LRScheduler";
import type { SchedulerState } from "./LRScheduler";

/**
 * Configuration for CosineScheduler.
 */
export interface CosineSchedulerConfig {
  /** Base (maximum) learning rate */
  baseLR: number;
  /** Minimum learning rate at the end of decay (default: 0) */
  minLR?: number;
  /** Number of warmup steps (LR ramps from 0 to baseLR) */
  warmupSteps?: number;
  /** Total number of training steps */
  totalSteps: number;
}

/**
 * Serializable state for CosineScheduler checkpointing.
 */
export interface CosineSchedulerState extends SchedulerState {
  minLR: number;
  warmupSteps: number;
  totalSteps: number;
}

/**
 * Cosine annealing scheduler with optional linear warmup.
 *
 * Implements the standard cosine decay schedule:
 *
 *   Warmup phase:  lr grows linearly from 0 → baseLR
 *   Decay phase:   lr follows cosine curve from baseLR → minLR
 *
 * The schedule is parameterized by totalSteps, not epochs,
 * making it robust to different dataset sizes and batch sizes.
 */
export class CosineScheduler extends LRScheduler {
  /** Minimum learning rate after full decay */
  readonly minLR: number;

  /** Number of warmup steps */
  readonly warmupSteps: number;

  /** Total number of training steps */
  readonly totalSteps: number;

  /**
   * @param optimizer - The optimizer whose LR to manage
   * @param config    - Schedule configuration
   */
  constructor(optimizer: Optimizer, config: CosineSchedulerConfig) {
    super(optimizer, config.baseLR);

    this.minLR = config.minLR ?? 0;
    this.warmupSteps = config.warmupSteps ?? 0;
    this.totalSteps = config.totalSteps;

    // Validate
    if (this.baseLR <= 0) {
      throw new Error(
        `CosineScheduler: baseLR must be positive, got ${this.baseLR}`
      );
    }
    if (this.minLR < 0) {
      throw new Error(
        `CosineScheduler: minLR must be non-negative, got ${this.minLR}`
      );
    }
    if (this.minLR > this.baseLR) {
      throw new Error(
        `CosineScheduler: minLR (${this.minLR}) must be <= baseLR (${this.baseLR})`
      );
    }
    if (this.warmupSteps < 0) {
      throw new Error(
        `CosineScheduler: warmupSteps must be non-negative, got ${this.warmupSteps}`
      );
    }
    if (this.totalSteps <= 0) {
      throw new Error(
        `CosineScheduler: totalSteps must be positive, got ${this.totalSteps}`
      );
    }
    if (this.warmupSteps >= this.totalSteps) {
      throw new Error(
        `CosineScheduler: warmupSteps (${this.warmupSteps}) must be < totalSteps (${this.totalSteps})`
      );
    }

    // Initialize optimizer LR to the warmup starting value
    this.setOptimizerLR(this.computeLR());
  }

  /**
   * Compute the current learning rate based on step and schedule.
   *
   * Logic:
   *   1. During warmup: linear ramp from 0 to baseLR
   *   2. During decay: cosine annealing from baseLR to minLR
   *   3. After totalSteps: stays at minLR
   */
  computeLR(): number {
    const step = this.currentStep;

    // ── Warmup phase ──
    if (step < this.warmupSteps) {
      // Linear interpolation: lr = baseLR * (step / warmupSteps)
      // Step 0 → LR = 0
      // Step warmupSteps-1 → LR ≈ baseLR
      if (this.warmupSteps === 0) {
        return this.baseLR;
      }
      return this.baseLR * (step / this.warmupSteps);
    }

    // ── Post-training: clamp to minLR ──
    if (step >= this.totalSteps) {
      return this.minLR;
    }

    // ── Cosine decay phase ──
    // progress: 0 (end of warmup) → 1 (end of training)
    const decaySteps = step - this.warmupSteps;
    const totalDecaySteps = this.totalSteps - this.warmupSteps;

    if (totalDecaySteps <= 0) {
      return this.minLR;
    }

    const progress = decaySteps / totalDecaySteps;

    // Cosine formula: minLR + (baseLR - minLR) * 0.5 * (1 + cos(π * progress))
    const cosineTerm = 0.5 * (1.0 + Math.cos(Math.PI * progress));
    const lr = this.minLR + (this.baseLR - this.minLR) * cosineTerm;

    return lr;
  }

  /**
   * Serialize scheduler state for checkpointing.
   */
  stateDict(): CosineSchedulerState {
    return {
      ...super.stateDict(),
      minLR: this.minLR,
      warmupSteps: this.warmupSteps,
      totalSteps: this.totalSteps,
    };
  }

  /**
   * Restore scheduler state from a checkpoint.
   */
  loadStateDict(state: CosineSchedulerState): void {
    super.loadStateDict(state);
    // minLR, warmupSteps, totalSteps are readonly — they must match
    // the original configuration. We validate consistency.
    if (state.minLR !== this.minLR) {
      throw new Error(
        `CosineScheduler.loadStateDict: minLR mismatch. ` +
        `Saved: ${state.minLR}, current: ${this.minLR}`
      );
    }
    if (state.warmupSteps !== this.warmupSteps) {
      throw new Error(
        `CosineScheduler.loadStateDict: warmupSteps mismatch. ` +
        `Saved: ${state.warmupSteps}, current: ${this.warmupSteps}`
      );
    }
    if (state.totalSteps !== this.totalSteps) {
      throw new Error(
        `CosineScheduler.loadStateDict: totalSteps mismatch. ` +
        `Saved: ${state.totalSteps}, current: ${this.totalSteps}`
      );
    }
  }
}
