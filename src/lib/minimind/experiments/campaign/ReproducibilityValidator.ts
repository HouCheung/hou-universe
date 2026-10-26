// ============================================================
// ReproducibilityValidator — Validates that training runs are
// deterministic given the same seed.
// ============================================================
// Phase 55: Ensures training reproducibility by running two
// identical training passes and comparing:
//   - Loss curve (per-step loss values)
//   - Checkpoint data (model parameters)
//   - Generation outputs (text from fixed prompts)
//
// A training pipeline is considered reproducible if, given the
// same seed and identical configuration, it produces:
//   - Identical loss values at every step
//   - Identical model parameters in checkpoints
//   - Identical generated text for the same prompts
//
// Usage:
//   const validator = new ReproducibilityValidator();
//   const result = await validator.validate(async () => {
//     return await runTrainingCampaign(config);
//   });
//   console.log(result.identical); // true if fully reproducible
// ============================================================

import type { TrainingCampaignResult } from "./TrainingCampaign";
import type { CheckpointData } from "../../training/checkpoint/Checkpoint";

// ============================================================
// Types
// ============================================================

/**
 * Result of a reproducibility validation run.
 */
export interface ReproducibilityResult {
  /** Whether the two runs were identical in all measured aspects */
  identical: boolean;

  /** Loss curve comparison */
  loss: {
    /** Whether losses matched at every step */
    identical: boolean;
    /** Maximum absolute difference between loss values */
    maxDiff: number;
    /** Number of steps compared */
    stepsCompared: number;
    /** Per-step differences (only non-zero differences included) */
    diffs: Array<{ step: number; lossA: number; lossB: number; diff: number }>;
  };

  /** Checkpoint comparison */
  checkpoint: {
    /** Whether checkpoints had identical model parameters */
    identical: boolean;
    /** Maximum absolute difference between any parameter value */
    maxParamDiff: number;
  };

  /** Generation comparison */
  generation: {
    /** Whether generations were identical for all prompts */
    identical: boolean;
    /** Number of prompts compared */
    promptsCompared: number;
    /** Number of prompts with different outputs */
    differentCount: number;
    /** Per-prompt comparison */
    diffs: Array<{
      prompt: string;
      runA: string;
      runB: string;
      identical: boolean;
    }>;
  };
}

// ============================================================
// ReproducibilityValidator
// ============================================================

export class ReproducibilityValidator {
  /**
   * Validate reproducibility by running the same training function twice
   * and comparing all outputs.
   *
   * The training function should be a closure that, when called, runs
   * a complete training campaign with a fixed seed. The validator calls
   * it twice and compares results.
   *
   * @param trainFn - Async function that runs one complete training campaign
   * @param generationPrompts - Prompts used for generation comparison
   * @returns ReproducibilityResult with detailed comparison
   */
  async validate(
    trainFn: () => Promise<TrainingCampaignResult>,
    generationPrompts: string[] = []
  ): Promise<ReproducibilityResult> {
    const runA = await trainFn();
    const runB = await trainFn();

    return this.compare(runA, runB, generationPrompts);
  }

  /**
   * Compare two already-completed training results for reproducibility.
   *
   * @param runA - First training run result
   * @param runB - Second training run result
   * @param generationPrompts - Prompts used for generation comparison
   * @returns ReproducibilityResult with detailed comparison
   */
  compare(
    runA: TrainingCampaignResult,
    runB: TrainingCampaignResult,
    generationPrompts: string[] = []
  ): ReproducibilityResult {
    // ── Loss curve comparison ──
    const recordsA = runA.metrics.getRecords();
    const recordsB = runB.metrics.getRecords();
    const minSteps = Math.min(recordsA.length, recordsB.length);
    const lossDiffs: ReproducibilityResult["loss"]["diffs"] = [];
    let maxLossDiff = 0;

    for (let i = 0; i < minSteps; i++) {
      const diff = Math.abs(recordsA[i].loss - recordsB[i].loss);
      if (diff > maxLossDiff) maxLossDiff = diff;
      if (diff > 1e-15) {
        lossDiffs.push({
          step: recordsA[i].step,
          lossA: recordsA[i].loss,
          lossB: recordsB[i].loss,
          diff,
        });
      }
    }

    // ── Checkpoint comparison ──
    const ckptA = runA.checkpoint;
    const ckptB = runB.checkpoint;
    let maxParamDiff = 0;

    if (
      ckptA.modelParams &&
      ckptB.modelParams &&
      ckptA.modelParams.length === ckptB.modelParams.length
    ) {
      for (let i = 0; i < ckptA.modelParams.length; i++) {
        const pA = ckptA.modelParams[i];
        const pB = ckptB.modelParams[i];
        const dataA = pA.data;
        const dataB = pB.data;
        if (dataA && dataB && dataA.length === dataB.length) {
          for (let j = 0; j < dataA.length; j++) {
            const diff = Math.abs(dataA[j] - dataB[j]);
            if (diff > maxParamDiff) maxParamDiff = diff;
          }
        }
      }
    }

    // ── Generation comparison ──
    const genBeforeA = runA.generationBefore ?? [];
    const genBeforeB = runB.generationBefore ?? [];
    const genAfterA = runA.generationAfter ?? [];
    const genAfterB = runB.generationAfter ?? [];

    const genDiffs: ReproducibilityResult["generation"]["diffs"] = [];
    let genDifferentCount = 0;

    // Compare after-training generations
    const maxPrompts = Math.min(genAfterA.length, genAfterB.length);
    for (let i = 0; i < maxPrompts; i++) {
      const textA = genAfterA[i].generatedText;
      const textB = genAfterB[i].generatedText;
      const identical = textA === textB;
      if (!identical) genDifferentCount++;
      genDiffs.push({
        prompt: genAfterA[i].prompt,
        runA: textA,
        runB: textB,
        identical,
      });
    }

    const lossIdentical = maxLossDiff < 1e-10;
    const checkpointIdentical =
      ckptA.modelParams &&
      ckptB.modelParams &&
      ckptA.modelParams.length === ckptB.modelParams.length &&
      maxParamDiff < 1e-10;
    const genIdentical = genDifferentCount === 0;

    const identical = lossIdentical && checkpointIdentical && genIdentical;

    return {
      identical,
      loss: {
        identical: lossIdentical,
        maxDiff: maxLossDiff,
        stepsCompared: minSteps,
        diffs: lossDiffs,
      },
      checkpoint: {
        identical: checkpointIdentical,
        maxParamDiff,
      },
      generation: {
        identical: genIdentical,
        promptsCompared: maxPrompts,
        differentCount: genDifferentCount,
        diffs: genDiffs,
      },
    };
  }

  /**
   * Quick check: verify that two runs produce the same loss on the first step.
   * Returns true if the first recorded losses match within tolerance.
   *
   * This is a fast smoke test for reproducibility — if the first step
   * doesn't match, full reproducibility is impossible.
   */
  static quickCheck(
    runA: TrainingCampaignResult,
    runB: TrainingCampaignResult,
    tolerance: number = 1e-10
  ): boolean {
    const recordsA = runA.metrics.getRecords();
    const recordsB = runB.metrics.getRecords();
    if (recordsA.length === 0 || recordsB.length === 0) return false;

    const firstA = recordsA[0].loss;
    const firstB = recordsB[0].loss;
    return Math.abs(firstA - firstB) <= tolerance;
  }

  /**
   * Verify that two checkpoints have identical model parameters.
   */
  static checkpointsMatch(
    ckptA: CheckpointData,
    ckptB: CheckpointData,
    tolerance: number = 1e-10
  ): boolean {
    if (!ckptA.modelParams || !ckptB.modelParams) return false;
    if (ckptA.modelParams.length !== ckptB.modelParams.length) return false;

    for (let i = 0; i < ckptA.modelParams.length; i++) {
      const pA = ckptA.modelParams[i];
      const pB = ckptB.modelParams[i];
      const dataA = pA.data;
      const dataB = pB.data;
      if (!dataA || !dataB || dataA.length !== dataB.length) return false;
      for (let j = 0; j < dataA.length; j++) {
        if (Math.abs(dataA[j] - dataB[j]) > tolerance) return false;
      }
    }
    return true;
  }
}
