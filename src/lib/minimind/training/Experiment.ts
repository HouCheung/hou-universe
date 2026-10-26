// ============================================================
// Experiment — Automated experiment runner for MiniMind
// ============================================================
// Phase 42: High-level API for running controlled training
// experiments with automatic setup, execution, and result
// collection.
//
// Design:
//   ExperimentConfig defines the full experiment specification:
//     name, model config, dataset config, optimizer config,
//     scheduler config, and trainer config.
//
//   runExperiment(config) orchestrates:
//     1. Create dataset → DataLoader
//     2. Create model → TensorMiniMindModel
//     3. Create optimizer → AdamW
//     4. Create scheduler → CosineScheduler (optional)
//     5. Create trainer → Trainer
//     6. Execute training → TrainingStateSnapshot
//     7. Collect metrics → TrainingMetricsCollector
//     8. Return ExperimentResult
//
// Future: This enables systematic experiment directories:
//   experiments/
//     tiny-gpt-test/
//     attention-ablation/
//     optimizer-comparison/
//     lr-study/
//
// Usage:
//   const result = runExperiment({
//     name: "tiny-gpt-test",
//     modelConfig: { preset: "tiny", vocabSize: 6400 },
//     datasetConfig: { ... },
//     optimizerConfig: { lr: 0.001 },
//     schedulerConfig: { type: "cosine", baseLR: 0.001, ... },
//     trainerConfig: { epochs: 10 },
//   });
//   console.log(result.finalLoss, result.bestLoss, result.steps);
// ============================================================

import { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../core/optim/AdamW";
import type { AdamWConfig } from "../core/optim/AdamW";
import type { Optimizer } from "../core/optim/Optimizer";
import { CosineScheduler } from "../core/scheduler/CosineScheduler";
import { LinearWarmupScheduler } from "../core/scheduler/LinearWarmupScheduler";
import type { LRScheduler } from "../core/scheduler/LRScheduler";
import { TextDataset } from "../data/TextDataset";
import type { TextSample } from "../data/TextDataset";
import { DataLoader } from "../data/DataLoader";
import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";
import { Trainer } from "./Trainer";
import type { TrainerConfig } from "./TrainerConfig";
import { TrainingMetricsCollector } from "./Metrics";
import type { TrainingMetricsRecord } from "./Metrics";
import { saveCheckpoint } from "./checkpoint/Checkpoint";
import type { CheckpointData } from "./checkpoint/Checkpoint";
import { evaluate } from "./Evaluator";
import type { EvaluationResult } from "./Evaluator";

// ============================================================
// Types
// ============================================================

/**
 * Dataset configuration for an experiment.
 */
export interface ExperimentDatasetConfig {
  /** Tokenizer instance (required) */
  tokenizer: MiniTokenizer;
  /** Text corpus — single string or array of strings */
  corpus: string | string[];
  /** Block size (sequence length) for training samples */
  blockSize: number;
  /** Batch size for DataLoader (default: 4) */
  batchSize?: number;
  /** Whether to shuffle training data (default: true) */
  shuffle?: boolean;
  /** Random seed for shuffle (default: 42) */
  seed?: number;
  /** Optional separate evaluation corpus */
  evalCorpus?: string | string[];
  /** Batch size for evaluation DataLoader (default: same as batchSize) */
  evalBatchSize?: number;
}

/**
 * Model configuration for an experiment.
 *
 * Supports both presets ("tiny", "mini") and custom configs.
 */
export interface ExperimentModelConfig {
  /** Preset name — "tiny" or "mini". Overrides dModel, numHeads, etc. */
  preset?: "tiny" | "mini";
  /** Vocabulary size */
  vocabSize: number;
  /** Custom: model dimension (ignored if preset is set) */
  dModel?: number;
  /** Custom: number of attention heads (ignored if preset is set) */
  numHeads?: number;
  /** Custom: feed-forward hidden dimension (ignored if preset is set) */
  dFF?: number;
  /** Custom: number of transformer layers (ignored if preset is set) */
  numLayers?: number;
  /** Custom: maximum sequence length (ignored if preset is set) */
  maxSeqLen?: number;
}

/**
 * Scheduler configuration for an experiment.
 */
export type ExperimentSchedulerConfig =
  | { type: "none" }
  | {
      type: "cosine";
      baseLR: number;
      minLR?: number;
      warmupSteps?: number;
    }
  | {
      type: "warmup";
      baseLR: number;
      warmupSteps: number;
    };

/**
 * Complete experiment configuration.
 */
export interface ExperimentConfig {
  /** Name of this experiment (used for logging and checkpoint naming) */
  name: string;

  /** Dataset configuration */
  datasetConfig: ExperimentDatasetConfig;

  /** Model configuration */
  modelConfig: ExperimentModelConfig;

  /** Optimizer configuration (AdamW) */
  optimizerConfig?: Partial<AdamWConfig>;

  /** Scheduler configuration (optional — none by default) */
  schedulerConfig?: ExperimentSchedulerConfig;

  /** Trainer configuration */
  trainerConfig: TrainerConfig;

  /** Random seed for reproducibility (default: 42) */
  seed?: number;
}

/**
 * Result of running an experiment.
 */
export interface ExperimentResult {
  /** Experiment name */
  name: string;
  /** Final training loss */
  finalLoss: number;
  /** Best (minimum) loss achieved during training */
  bestLoss: number;
  /** Number of optimizer steps taken */
  steps: number;
  /** Number of batches processed */
  totalBatches: number;
  /** Collected training metrics */
  metrics: TrainingMetricsRecord[];
  /** Training state snapshot from Trainer */
  trainerState: ReturnType<Trainer["train"]>;
  /** Checkpoint at end of training */
  checkpoint: CheckpointData;
  /** Evaluation result on eval dataset (if evalCorpus was provided) */
  evaluation?: EvaluationResult;
  /** Training duration in milliseconds */
  durationMs: number;
}

// ============================================================
// runExperiment()
// ============================================================

/**
 * Run a complete training experiment from a configuration.
 *
 * Orchestrates the full pipeline:
 *   1. Create dataset/loader(s)
 *   2. Create model
 *   3. Create optimizer
 *   4. Create scheduler (optional)
 *   5. Create trainer
 *   6. Execute training
 *   7. Evaluate (if eval data available)
 *   8. Save checkpoint
 *   9. Collect metrics
 *
 * @param config - Complete experiment specification
 * @returns ExperimentResult with all training outputs
 *
 * Example:
 *   const result = runExperiment({
 *     name: "lr-study-001",
 *     modelConfig: { preset: "tiny", vocabSize: 32000 },
 *     datasetConfig: {
 *       tokenizer, corpus: texts, blockSize: 32, batchSize: 4,
 *     },
 *     optimizerConfig: { lr: 0.001 },
 *     schedulerConfig: { type: "cosine", baseLR: 0.001, minLR: 1e-6, warmupSteps: 50 },
 *     trainerConfig: { epochs: 10 },
 *   });
 */
export function runExperiment(
  config: ExperimentConfig
): ExperimentResult {
  const startTime = Date.now();
  const {
    name,
    datasetConfig,
    modelConfig,
    optimizerConfig,
    schedulerConfig,
    trainerConfig,
  } = config;

  // ============================================================
  // Step 1: Create datasets and loaders
  // ============================================================
  const {
    tokenizer,
    corpus,
    blockSize,
    batchSize = 4,
    shuffle = true,
    seed = 42,
    evalCorpus,
    evalBatchSize,
  } = datasetConfig;

  const trainDataset = new TextDataset({
    tokenizer,
    corpus,
    blockSize,
  });

  const trainLoader = new DataLoader<TextSample>(trainDataset, {
    batchSize,
    shuffle,
    seed,
    dropLast: true,
  });

  let evalLoader: DataLoader<TextSample> | undefined;
  if (evalCorpus) {
    const evalDataset = new TextDataset({
      tokenizer,
      corpus: evalCorpus,
      blockSize,
    });
    evalLoader = new DataLoader<TextSample>(evalDataset, {
      batchSize: evalBatchSize ?? batchSize,
      shuffle: false,
      dropLast: true,
    });
  }

  // ============================================================
  // Step 2: Create model
  // ============================================================
  let model: TensorMiniMindModel;

  if (modelConfig.preset === "mini") {
    model = TensorMiniMindModel.miniMind(modelConfig.vocabSize);
  } else {
    // "tiny" preset or custom
    if (modelConfig.preset === undefined && modelConfig.dModel !== undefined) {
      // Custom config
      model = new TensorMiniMindModel({
        vocabSize: modelConfig.vocabSize,
        dModel: modelConfig.dModel,
        numHeads: modelConfig.numHeads ?? 4,
        dFF: modelConfig.dFF ?? modelConfig.dModel * 4,
        numLayers: modelConfig.numLayers ?? 2,
        maxSeqLen: modelConfig.maxSeqLen ?? 64,
      });
    } else {
      // Default: tiny preset
      model = TensorMiniMindModel.tiny(modelConfig.vocabSize);
    }
  }

  // ============================================================
  // Step 3: Create optimizer
  // ============================================================
  const optimizer = new AdamWOptimizer(model.parameters(), optimizerConfig);
  const effectiveLR = optimizer.lr;

  // ============================================================
  // Step 4: Create scheduler (optional)
  // ============================================================
  const totalSteps = calculateTotalSteps(
    trainLoader.numBatches,
    trainerConfig.epochs,
    trainerConfig.gradientAccumulationSteps ?? 1
  );

  let scheduler: LRScheduler | undefined;

  if (schedulerConfig && schedulerConfig.type !== "none") {
    if (schedulerConfig.type === "cosine") {
      scheduler = new CosineScheduler(optimizer as Optimizer, {
        baseLR: schedulerConfig.baseLR,
        minLR: schedulerConfig.minLR,
        warmupSteps: schedulerConfig.warmupSteps ?? Math.floor(totalSteps * 0.1),
        totalSteps,
      });
    } else if (schedulerConfig.type === "warmup") {
      scheduler = new LinearWarmupScheduler(optimizer as Optimizer, {
        baseLR: schedulerConfig.baseLR,
        warmupSteps: schedulerConfig.warmupSteps,
      });
    }
  }

  // ============================================================
  // Step 5: Create metrics collector
  // ============================================================
  const metricsCollector = new TrainingMetricsCollector();

  // ============================================================
  // Step 6: Create and run trainer
  // ============================================================
  const trainer = new Trainer({
    model,
    optimizer: optimizer as Optimizer,
    trainLoader,
    evalLoader,
    config: trainerConfig,
    onLog: (info) => {
      // Record metrics at each log interval
      metricsCollector.record({
        step: info.globalStep,
        epoch: info.epoch,
        loss: info.loss,
        learningRate: effectiveLR,
        perplexity: info.perplexity,
        tokensPerSecond: undefined,
        timestamp: Date.now(),
      });
    },
    onEpochEnd: (info) => {
      // If no per-step logging (logInterval > epoch steps), record at epoch end
      if (metricsCollector.count === 0 || info.epoch > 0) {
        // Record epoch-level metric if we haven't already
        const lastRecord = metricsCollector.latest();
        if (!lastRecord || lastRecord.epoch < info.epoch) {
          metricsCollector.record({
            step: info.globalStep,
            epoch: info.epoch,
            loss: info.epochAvgLoss,
            learningRate: effectiveLR,
            perplexity: Math.exp(Math.min(info.epochAvgLoss, 709)),
            tokensPerSecond: undefined,
            timestamp: Date.now(),
          });
        }
      }
    },
  });

  const trainerState = trainer.train();

  // ============================================================
  // Step 7: Evaluate on eval dataset (if available)
  // ============================================================
  let evaluation: EvaluationResult | undefined;
  if (evalLoader) {
    evaluation = evaluate({
      model,
      loader: evalLoader,
      tokenizer,
      maxSamples: 3,
    });
  }

  // ============================================================
  // Step 8: Save final checkpoint
  // ============================================================
  const checkpoint = saveCheckpoint({
    model,
    optimizer: optimizer as Optimizer,
    scheduler,
    trainerState,
  });

  // ============================================================
  // Step 9: Build result
  // ============================================================
  const durationMs = Date.now() - startTime;
  const bestLoss = trainerState.bestLoss;
  const finalLoss =
    trainerState.lossHistory.length > 0
      ? trainerState.lossHistory[trainerState.lossHistory.length - 1]
      : Infinity;

  const result: ExperimentResult = {
    name,
    finalLoss,
    bestLoss,
    steps: trainerState.globalStep,
    totalBatches: trainerState.totalBatches,
    metrics: metricsCollector.getRecords() as TrainingMetricsRecord[],
    trainerState,
    checkpoint,
    evaluation,
    durationMs,
  };

  return result;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Calculate the total number of optimizer steps for scheduler configuration.
 *
 * totalSteps = numBatchesPerEpoch * epochs / gradientAccumulationSteps
 *
 * This is used to configure schedulers that need to know the total
 * number of steps in advance (e.g., CosineScheduler).
 */
function calculateTotalSteps(
  numBatchesPerEpoch: number,
  epochs: number,
  gradientAccumulationSteps: number
): number {
  // Each epoch: numBatchesPerEpoch batches
  // Each accumulation step spans gradientAccumulationSteps batches
  // So total optimizer steps = (numBatchesPerEpoch * epochs) / gradientAccumulationSteps
  return Math.floor((numBatchesPerEpoch * epochs) / gradientAccumulationSteps);
}

// ============================================================
// Quick experiment helpers
// ============================================================

/**
 * Quick experiment: train a tiny model on a small corpus.
 *
 * Minimal configuration — just provide a tokenizer, corpus, and epochs.
 * Everything else gets sensible defaults.
 *
 * @param tokenizer - Tokenizer instance
 * @param corpus    - Training text
 * @param epochs    - Number of epochs (default: 5)
 * @returns ExperimentResult
 */
export function quickExperiment(
  tokenizer: MiniTokenizer,
  corpus: string | string[],
  epochs: number = 5
): ExperimentResult {
  return runExperiment({
    name: "quick-experiment",
    datasetConfig: {
      tokenizer,
      corpus,
      blockSize: 16,
      batchSize: 4,
    },
    modelConfig: {
      preset: "tiny",
      vocabSize: tokenizer.getVocabulary().size,
    },
    optimizerConfig: {
      lr: 0.001,
      weightDecay: 0.0,
    },
    trainerConfig: {
      epochs,
      logInterval: 10,
    },
  });
}
