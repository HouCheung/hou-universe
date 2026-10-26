// ============================================================
// Trainer — PyTorch-style training engine for MiniMind
// ============================================================
// Phase 41: Full-featured training orchestrator composing
// DataLoader, TensorMiniMindModel, loss criterion, and Optimizer
// into a complete training pipeline.
//
// Pipeline per batch:
//   collate(batch) → model.forward() → criterion() →
//   scale loss (grad accumulation) → backward() →
//   [every N steps] optimizer.step() → optimizer.zeroGrad()
//
// Features:
//   - Gradient accumulation (configurable steps)
//   - Eval loop on separate DataLoader
//   - Configurable logging interval
//   - State tracking (loss history, best loss, perplexity)
//   - Callback hooks (onLog, onEpochEnd)
//   - Deterministic with seed parameter
//
// Usage:
//   const trainer = new Trainer({
//     model,
//     optimizer,
//     trainLoader,
//     config: { epochs: 10, logInterval: 5 },
//   });
//   const state = trainer.train();
//   // state.lossHistory, state.bestLoss, state.completed, ...
//
// Design:
//   - Pure TypeScript — no UI dependencies
//   - Uses existing TensorMiniMindModel, DataLoader, Optimizer
//   - Does NOT modify old MiniMindModel or UI
//   - Coexists with runTrainingLoop in TrainingLoop.ts
// ============================================================

import { Tensor } from "../core/Tensor";
import { crossEntropyLoss } from "../core/loss/CrossEntropyLoss";
import { clipGradients } from "../core/GradientClipper";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { Optimizer } from "../core/optim/Optimizer";
import type { DataLoader } from "../data/DataLoader";
import type { DataLoaderState } from "../data/DataLoader";
import type { TextSample } from "../data/TextDataset";
import { TrainingState } from "./TrainingState";
import type { TrainingStateSnapshot } from "./TrainingState";
import { LossTracker } from "./LossTracker";
import { Perplexity } from "./Perplexity";
import { GradientAccumulator } from "./GradientAccumulator";
import {
  resolveTrainerConfig,
  type TrainerConfig,
  type ResolvedTrainerConfig,
} from "./TrainerConfig";
import { Random } from "../core/random/Random";
import type { CheckpointData, CheckpointMetadata } from "./checkpoint/Checkpoint";
import { loadCheckpoint, saveCheckpoint } from "./checkpoint/Checkpoint";
import type { LRScheduler } from "../core/scheduler/LRScheduler";

// ============================================================
// Types
// ============================================================

/**
 * Loss criterion function signature.
 * Matches crossEntropyLoss: (logits, targets, mask?) → scalar Tensor.
 *
 * mask (optional) is the per-position 0/1 prediction mask [B, S] produced by
 * document-aligned datasets (Phase 90). When undefined the criterion behaves
 * exactly as before — existing two-argument implementations remain assignable.
 */
export type LossCriterion = (
  logits: Tensor,
  targets: number[][],
  mask?: number[][]
) => Tensor;

/**
 * Callback invoked at each log interval.
 */
export interface LogCallback {
  (info: {
    epoch: number;
    globalStep: number;
    loss: number;
    perplexity: number;
    runningAverage: number;
  }): void;
}

/**
 * Callback invoked at the end of each epoch.
 */
export interface EpochEndCallback {
  (info: {
    epoch: number;
    globalStep: number;
    epochAvgLoss: number;
    bestLoss: number;
  }): void;
}

/**
 * Configuration for the Trainer constructor.
 */
export interface TrainerOptions {
  /** TensorMiniMindModel instance (required) */
  model: TensorMiniMindModel;

  /** Optimizer instance (required) — AdamW, SGD, etc. */
  optimizer: Optimizer;

  /** Training DataLoader (required) */
  trainLoader: DataLoader<TextSample>;

  /** Optional evaluation DataLoader */
  evalLoader?: DataLoader<TextSample>;

  /**
   * Loss criterion function.
   * @default crossEntropyLoss
   */
  criterion?: LossCriterion;

  /** Training configuration */
  config: TrainerConfig;

  /** Called every logInterval steps */
  onLog?: LogCallback;

  /** Called at the end of each epoch */
  onEpochEnd?: EpochEndCallback;

  /** Configuration metadata recorded on every saved checkpoint (Phase 80) */
  checkpointMetadata?: CheckpointMetadata;
}

// ============================================================
// Collation
// ============================================================

/**
 * Collate a batch of TextSample into model input format.
 *
 * TextSample[] → { inputIds: Tensor [B, S], targets: number[][] }
 *
 * All samples must have the same inputIds length (guaranteed
 * by TextDataset with fixed blockSize).
 *
 * @param batch - Array of TextSample from DataLoader
 * @returns Collated input tensor and target arrays
 * @throws If batch is empty
 */
export function collateBatch(
  batch: TextSample[]
): { inputIds: Tensor; targets: number[][] } {
  if (batch.length === 0) {
    throw new Error("collateBatch: batch must not be empty");
  }

  const B = batch.length;
  const S = batch[0].inputIds.length;

  // Flatten all inputIds into a single Float64Array
  const flat = new Float64Array(B * S);
  const targets: number[][] = new Array(B);

  for (let b = 0; b < B; b++) {
    const sample = batch[b];
    const offset = b * S;
    for (let s = 0; s < S; s++) {
      flat[offset + s] = sample.inputIds[s];
    }
    targets[b] = [...sample.targetIds];
  }

  return {
    inputIds: new Tensor(flat, [B, S]),
    targets,
  };
}

// ============================================================
// Trainer
// ============================================================

/**
 * Trainer — PyTorch-style training engine.
 *
 * Composes model, optimizer, DataLoader, and loss criterion
 * into a complete training loop with gradient accumulation,
 * evaluation, and state tracking.
 *
 * Example:
 *   const trainer = new Trainer({
 *     model,
 *     optimizer: new AdamWOptimizer(model.parameters(), { lr: 0.001 }),
 *     trainLoader,
 *     evalLoader,
 *     config: { epochs: 10, gradientAccumulationSteps: 4 },
 *     onLog: (info) => console.log(`Step ${info.globalStep}: loss=${info.loss}`),
 *   });
 *   const state = trainer.train();
 */
export class Trainer {
  readonly model: TensorMiniMindModel;
  readonly optimizer: Optimizer;
  readonly trainLoader: DataLoader<TextSample>;
  readonly evalLoader: DataLoader<TextSample> | undefined;
  readonly criterion: LossCriterion;
  readonly config: ResolvedTrainerConfig;
  readonly onLog: LogCallback | undefined;
  readonly onEpochEnd: EpochEndCallback | undefined;

  /** Optional LR scheduler attached for checkpointing */
  scheduler: LRScheduler | undefined;

  /** Mutable training state — updated throughout train() */
  readonly state: TrainingState;

  /** Loss tracker for running averages */
  readonly lossTracker: LossTracker;

  /** Gradient accumulation state machine */
  readonly accumulator: GradientAccumulator;

  /** Configuration metadata recorded on every saved checkpoint (Phase 80) */
  readonly checkpointMetadata: CheckpointMetadata | undefined;

  /**
   * @param options - Trainer configuration (see TrainerOptions)
   */
  constructor(options: TrainerOptions) {
    this.model = options.model;
    this.optimizer = options.optimizer;
    this.trainLoader = options.trainLoader;
    this.evalLoader = options.evalLoader;
    this.criterion = options.criterion ?? crossEntropyLoss;
    this.config = resolveTrainerConfig(options.config);
    this.onLog = options.onLog;
    this.onEpochEnd = options.onEpochEnd;
    this.scheduler = undefined;
    this.state = new TrainingState();
    this.lossTracker = new LossTracker(100);
    this.accumulator = new GradientAccumulator(
      this.config.gradientAccumulationSteps
    );
    this.checkpointMetadata = options.checkpointMetadata;
  }

  // ============================================================
  // Public API — train()
  // ============================================================

  /**
   * Run the full training loop.
   *
   * Algorithm (Phase 48 — with resume support):
   *   for epoch in startEpoch..epochs:
   *     state.setEpoch(epoch)
   *     lossTracker.resetEpoch()
   *     state.resetBatchCounter()
   *     for batchIdx, batch in trainLoader:
   *       if resuming and batchIdx < resumeBatch: skip
   *
   *       ── Collate ──
   *       { inputIds } = collateBatch(batch)
   *
   *       ── Forward ──
   *       logits = model.forward(inputIds)              // [B, S, V]
   *
   *       ── Loss (Phase 89) ──
   *       targets = batch.inputIds (UN-shifted)
   *       loss = criterion(logits, targets)             // scalar Tensor
   *       // crossEntropyLoss shifts internally → logits[s] predicts token[s+1]
   *
   *       ── Scale for gradient accumulation ──
   *       scaledLoss = accumulator.accumulate(loss)      // loss / accSteps
   *
   *       ── Backward ──
   *       scaledLoss.backward()                          // accumulate grads
   *
   *       ── Track ──
   *       lossTracker.add(lossVal)
   *       state.advanceBatch()
   *       trainLoader.updatePosition(epoch, state.currentBatch)
   *
   *       ── Advance accumulator ──
   *       accumulator.advance()
   *
   *       ── Step when accumulation complete ──
   *       if accumulator.shouldStep():
   *         if gradientClipNorm is set:
   *           clipGradients(model.parameters(), gradientClipNorm)
   *         optimizer.step()
   *         scheduler.step()         // if scheduler attached
   *         optimizer.zeroGrad()
   *         accumulator.reset()
   *         state.advanceStep()
   *         // ... log, eval, record ...
   *
   *   ── Flush pending at epoch end ──
   *   ... (same as before)
   *
   *   ── Epoch End ──
   *   onEpochEnd(...)
   *
   *   state.markCompleted()
   *   return state.snapshot()
   *
   * Resume support:
   *   If state.dataloaderState is set (from a checkpoint restore),
   *   training starts from state.epoch (not 0) and skips the first
   *   state.currentBatch batches in that epoch. This ensures the
   *   exact same batch sequence as uninterrupted training.
   *
   * @returns TrainingStateSnapshot with full training history
   */
  train(): TrainingStateSnapshot {
    const {
      epochs,
      logInterval,
      evalInterval,
      gradientClipNorm,
    } = this.config;

    // Determine start epoch for resume support
    const startEpoch = this.state.epoch;
    const resumeBatch = this.state.currentBatch;

    for (let epoch = startEpoch; epoch < epochs; epoch++) {
      this.state.setEpoch(epoch);
      this.lossTracker.resetEpoch();
      this.state.resetBatchCounter();

      let batchIdx = 0;
      for (const batch of this.trainLoader) {
        // ── Resume: skip already-processed batches in the first epoch ──
        if (epoch === startEpoch && batchIdx < resumeBatch) {
          batchIdx++;
          continue;
        }

        // ── Step 1: Collate ──
        // Phase 89 (objective fix): crossEntropyLoss applies its own internal
        // causal shift (targets[b][s+1]) and must therefore receive the
        // UN-shifted input tokens. Passing the pre-shifted TextDataset.targetIds
        // here double-shifts the objective to 2-step-ahead prediction — the
        // confirmed Phase 88 root cause (PHASE88-ALIGNMENT-AUDIT-REPORT.md §3).
        // collateBatch keeps its existing contract (the Evaluator's 1-step
        // token-accuracy loop depends on targets == targetIds).
        const { inputIds } = collateBatch(batch);

        // ── Step 2: Forward ──
        const logits = this.model.forward(inputIds);

        // ── Step 3: Loss ──
        // logits[s] is trained to predict targets[s+1] = inputIds[s+1], i.e.
        // the true 1-step next token (what the capability evaluator measures).
        // Phase 90: document-aligned datasets attach an optional per-position
        // mask; when present, masked (padding) positions are ignored by the
        // criterion so no gradient crosses a document boundary.
        const unshiftedTargets = batch.map((sample) => sample.inputIds);
        const masks = this.collectMasks(batch);
        const lossTensor = masks !== undefined
          ? this.criterion(logits, unshiftedTargets, masks)
          : this.criterion(logits, unshiftedTargets);
        const lossVal = lossTensor.item();

        // ── Step 4: Scale for gradient accumulation ──
        const scaledLoss = this.accumulator.accumulate(lossTensor);

        // ── Step 5: Backward ──
        scaledLoss.backward();

        // ── Step 6: Track ──
        this.lossTracker.add(lossVal);
        this.state.advanceBatch();

        // Update DataLoader positional tracking
        this.trainLoader.updatePosition(epoch, this.state.currentBatch);

        batchIdx++;

        // ── Step 7: Advance accumulator ──
        this.accumulator.advance();

        // ── Step 8: Optimizer step when accumulation complete ──
        if (this.accumulator.shouldStep()) {
          // Gradient clipping (Phase 45.1)
          if (gradientClipNorm !== undefined && gradientClipNorm > 0) {
            clipGradients(
              this.model.parameters(),
              gradientClipNorm
            );
          }

          this.optimizer.step();
          if (this.scheduler) {
            this.scheduler.step();
          }
          this.optimizer.zeroGrad();
          this.accumulator.reset();
          this.state.advanceStep();

          // ── Step 9: Record loss for state tracking ──
          {
            const runningAvg = this.lossTracker.runningAverage();
            this.state.recordLoss(runningAvg);
          }

          // ── Step 10: Log at configured interval ──
          if (
            logInterval > 0 &&
            this.state.globalStep % logInterval === 0
          ) {
            if (this.onLog) {
              this.onLog({
                epoch,
                globalStep: this.state.globalStep,
                loss: lossVal,
                perplexity: Perplexity.fromLoss(lossVal),
                runningAverage: this.lossTracker.runningAverage(),
              });
            }
          }

          // ── Step 11: Evaluate at configured interval ──
          if (
            this.evalLoader &&
            evalInterval > 0 &&
            this.state.globalStep % evalInterval === 0
          ) {
            const evalLoss = this.runEvaluation();
            this.state.recordEval(evalLoss);
          }
        }
      }

      // ── Flush pending optimizer step at epoch end ──
      if (this.accumulator.hasPending()) {
        if (gradientClipNorm !== undefined && gradientClipNorm > 0) {
          clipGradients(
            this.model.parameters(),
            gradientClipNorm
          );
        }
        this.optimizer.step();
        if (this.scheduler) {
          this.scheduler.step();
        }
        this.optimizer.zeroGrad();
        this.accumulator.reset();
        this.state.advanceStep();
      }

      // ── Epoch end ──
      if (this.onEpochEnd) {
        this.onEpochEnd({
          epoch,
          globalStep: this.state.globalStep,
          epochAvgLoss: this.lossTracker.epochAverage(),
          bestLoss: this.state.bestLoss,
        });
      }
    }

    this.state.markCompleted();
    return this.state.snapshot();
  }

  // ============================================================
  // Resume API (Phase 48)
  // ============================================================

  /**
   * Resume training from a saved checkpoint.
   *
   * Restores all training state (model, optimizer, scheduler, random state,
   * dataloader state, training state) from the checkpoint and continues
   * training from the exact point where it was paused.
   *
   * After resume, the training continues from:
   *   - The same epoch
   *   - The same batch within that epoch
   *   - The same random state (next random numbers match)
   *   - The same optimizer momentum (AdamW m, v preserved)
   *
   * The total epoch count from the original TrainerConfig is preserved —
   * resume only trains the remaining epochs.
   *
   * Example:
   *   // Train 10 steps, save checkpoint
   *   trainer.train(); // runs 10 steps then stops (if epochs limited)
   *   const ckpt = trainer.saveCheckpoint();
   *
   *   // Later, resume from checkpoint
   *   const trainer2 = new Trainer({ model, optimizer, trainLoader, config });
   *   trainer2.resume(ckpt);
   *   // Continues from step 11
   *
   * @param checkpoint - Checkpoint data from a previous saveCheckpoint() call
   * @returns TrainingStateSnapshot with full training history (including pre-resume)
   */
  resume(checkpoint: CheckpointData): TrainingStateSnapshot {
    // Restore all state from checkpoint
    loadCheckpoint({
      model: this.model,
      optimizer: this.optimizer,
      scheduler: this.scheduler,
      state: this.state,
      checkpoint,
    });

    // Restore DataLoader state if present
    if (checkpoint.dataloaderState) {
      this.trainLoader.loadStateDict(checkpoint.dataloaderState);
    }

    // Continue training from the restored position
    return this.train();
  }

  /**
   * Save a complete checkpoint of the current training state.
   *
   * Captures model parameters, optimizer state, scheduler state,
   * trainer state, global Random RNG state, and DataLoader position.
   *
   * The returned CheckpointData can be serialized to JSON and later
   * passed to resume() or loadCheckpoint() to restore training.
   *
   * @returns Complete checkpoint data ready for serialization
   */
  saveCheckpoint(): CheckpointData {
    // Capture DataLoader state before building the checkpoint
    const dlState = this.trainLoader.stateDict();
    this.state.setDataLoaderState(dlState);

    // Capture global Random RNG state
    this.state.setRandomState(Random.saveState());

    // Delegate to the standalone saveCheckpoint function
    return saveCheckpoint({
      model: this.model,
      optimizer: this.optimizer,
      scheduler: this.scheduler,
      trainerState: this.state.snapshot(),
      metadata: this.checkpointMetadata,
    });
  }

  // ============================================================
  // Evaluation
  // ============================================================

  /**
   * Run one evaluation pass over the eval DataLoader.
   *
   * Computes average cross-entropy loss without updating
   * parameters (no backward, no step). The computation graph
   * is built but not traversed — gradients are not computed.
   *
   * @returns Average loss over the evaluation dataset
   */
  runEvaluation(): number {
    if (!this.evalLoader) {
      return 0;
    }

    let totalLoss = 0;
    let count = 0;

    for (const batch of this.evalLoader) {
      const { inputIds } = collateBatch(batch);
      const logits = this.model.forward(inputIds);
      // Phase 89: same corrected 1-step objective as the training loop, so the
      // monitored eval loss measures the same quantity the model is trained on.
      const unshiftedTargets = batch.map((sample) => sample.inputIds);
      // Phase 90: honor the document-aligned mask so an aligned eval loader
      // measures the same masked objective as the training loop.
      const masks = this.collectMasks(batch);
      const lossTensor = masks !== undefined
        ? this.criterion(logits, unshiftedTargets, masks)
        : this.criterion(logits, unshiftedTargets);
      totalLoss += lossTensor.item();
      count++;
    }

    return count > 0 ? totalLoss / count : 0;
  }

  // ============================================================
  // Phase 90 — document-aligned mask extraction
  // ============================================================

  /**
   * Extract per-position prediction masks from a batch, if present.
   *
   * Document-aligned datasets (Phase 90) attach an optional `mask` to each
   * TextSample; concatenated (production) datasets do not. Returns undefined
   * when no sample carries a mask so the criterion is invoked with exactly two
   * arguments exactly as before — the production path is unchanged.
   *
   * @param batch - Collated TextSample[] from the DataLoader (non-empty)
   * @returns The masks array [B, S], or undefined when no sample has a mask
   * @throws If only some samples in a mixed batch carry a mask
   */
  private collectMasks(batch: TextSample[]): number[][] | undefined {
    const firstMask = batch[0]?.mask;
    if (firstMask === undefined) {
      return undefined;
    }
    return batch.map((sample) => {
      if (sample.mask === undefined) {
        throw new Error(
          "Trainer.collectMasks: mixed batch — some samples carry a mask, others do not."
        );
      }
      return sample.mask;
    });
  }

  // ============================================================
  // Accessors
  // ============================================================

  /**
   * Get a snapshot of current training state.
   * Useful for mid-training inspection.
   */
  getState(): TrainingStateSnapshot {
    return this.state.snapshot();
  }

  /**
   * Get the current running average loss.
   */
  get runningLoss(): number {
    return this.lossTracker.runningAverage();
  }

  /**
   * Get the current epoch average loss.
   */
  get epochLoss(): number {
    return this.lossTracker.epochAverage();
  }
}
