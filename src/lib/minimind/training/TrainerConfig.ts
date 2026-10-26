// ============================================================
// TrainerConfig — Configuration for the MiniMind Trainer
// ============================================================
// Phase 41: PyTorch-style training configuration.
//
// This is distinct from the existing TrainingConfig in
// TrainingLoop.ts (which only has epochs). TrainerConfig
// adds logInterval, evalInterval, and gradient accumulation
// support for the full-featured Trainer class.
// ============================================================

/**
 * Configuration for a Trainer training run.
 *
 * All fields except epochs have sensible defaults so
 * minimal configs are possible:
 *
 *   const config: TrainerConfig = { epochs: 10 };
 *
 * Full config:
 *
 *   const config: TrainerConfig = {
 *     epochs: 20,
 *     learningRate: 0.001,
 *     logInterval: 5,
 *     evalInterval: 50,
 *     gradientAccumulationSteps: 4,
 *   };
 */
export interface TrainerConfig {
  /** Number of full passes over the training dataset */
  epochs: number;

  /**
   * Learning rate (informational — recorded in state for logging).
   * The actual learning rate is set on the Optimizer.
   * @default undefined
   */
  learningRate?: number;

  /**
   * Log training metrics every N global steps.
   * Loss is logged to the callback; set to 1 for per-step logging.
   * @default 10
   */
  logInterval?: number;

  /**
   * Run evaluation on evalLoader every N global steps.
   * Evaluation is skipped if no evalLoader is provided.
   * @default 50
   */
  evalInterval?: number;

  /**
   * Number of batches to accumulate gradients over before
   * calling optimizer.step() + optimizer.zeroGrad().
   *
   * Effective batch size = batchSize × gradientAccumulationSteps.
   * Loss is automatically scaled by 1/gradientAccumulationSteps
   * so gradients are averaged correctly.
   *
   * @default 1 (no accumulation — step every batch)
   */
  gradientAccumulationSteps?: number;

  /**
   * Maximum global L2 norm for gradient clipping.
   *
   * When set, gradients are clipped by global norm before each
   * optimizer step. This prevents gradient explosion during
   * training, especially important for deep models and long
   * sequences.
   *
   * Clipping is applied AFTER gradient accumulation is complete
   * and BEFORE optimizer.step(). Uses the existing clipGradients()
   * function from core/GradientClipper.ts.
   *
   * Set to undefined or 0 to disable clipping.
   *
   * @default undefined (no clipping)
   */
  gradientClipNorm?: number;
}

/**
 * Resolved TrainerConfig with all optional fields filled in.
 * learningRate remains optional (number | undefined) since it's
 * informational and may not be set.
 */
export interface ResolvedTrainerConfig {
  epochs: number;
  learningRate: number | undefined;
  logInterval: number;
  evalInterval: number;
  gradientAccumulationSteps: number;
  gradientClipNorm: number | undefined;
}

/**
 * Default values for optional TrainerConfig fields.
 */
export const DEFAULT_TRAINER_CONFIG = {
  logInterval: 10,
  evalInterval: 50,
  gradientAccumulationSteps: 1,
} as const;

/**
 * Resolve a partial TrainerConfig against defaults.
 */
export function resolveTrainerConfig(
  partial: TrainerConfig
): ResolvedTrainerConfig {
  if (partial.epochs <= 0) {
    throw new Error(
      `TrainerConfig: epochs must be positive, got ${partial.epochs}`
    );
  }
  if (
    partial.gradientAccumulationSteps !== undefined &&
    partial.gradientAccumulationSteps <= 0
  ) {
    throw new Error(
      `TrainerConfig: gradientAccumulationSteps must be positive, ` +
        `got ${partial.gradientAccumulationSteps}`
    );
  }

  // Validate gradientClipNorm if provided.
  // 0 is allowed and means "no clipping" (same as undefined).
  if (
    partial.gradientClipNorm !== undefined &&
    partial.gradientClipNorm < 0
  ) {
    throw new Error(
      `TrainerConfig: gradientClipNorm must be >= 0, ` +
        `got ${partial.gradientClipNorm}`
    );
  }

  return {
    epochs: partial.epochs,
    learningRate: partial.learningRate,
    logInterval:
      partial.logInterval ?? DEFAULT_TRAINER_CONFIG.logInterval,
    evalInterval:
      partial.evalInterval ?? DEFAULT_TRAINER_CONFIG.evalInterval,
    gradientAccumulationSteps:
      partial.gradientAccumulationSteps ??
      DEFAULT_TRAINER_CONFIG.gradientAccumulationSteps,
    gradientClipNorm: partial.gradientClipNorm,
  };
}
