// ============================================================
// TrainingExperimentRunner — Reproducible training experiment
// ============================================================
// Phase 46: High-level runner that orchestrates a complete
// training experiment from a config + dataset + tokenizer.
//
// Pipeline:
//   ExperimentConfig
//       │
//   BPETokenizer.train()
//       │
//   TinyStoriesDataset / TextDataset
//       │
//   DataLoader
//       │
//   TensorMiniMindModel
//       │
//   AdamW / SGD
//       │
//   CosineScheduler / LinearWarmup
//       │
//   Trainer.train()
//       │
//   Checkpoint (save)
//       │
//   GenerationEvaluator (before/after)
//       │
//   BenchmarkReport
//       │
//   TrainingExperimentResult
//
// Reuses existing modules — does NOT duplicate training logic.
//
// Usage:
//   const result = await runTrainingExperiment({
//     config: ExperimentConfig.fromFile("configs/tinystories-tiny.json"),
//     dataset: await TinyStoriesDataset.load({ maxStories: 500 }),
//     tokenizer: bpeTokenizer,
//   });
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type { ExperimentConfig } from "./ExperimentConfig";
import type { ExperimentConfigFile } from "./ExperimentConfig";
import { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { TensorMiniMindConfig } from "../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../core/optim/AdamW";
import type { AdamWConfig } from "../core/optim/AdamW";
import { SGDOptimizer } from "../core/optim/SGD";
import type { Optimizer } from "../core/optim/Optimizer";
import { CosineScheduler } from "../core/scheduler/CosineScheduler";
import { LinearWarmupScheduler } from "../core/scheduler/LinearWarmupScheduler";
import type { LRScheduler } from "../core/scheduler/LRScheduler";
import { TextDataset } from "../data/TextDataset";
import type { TextSample } from "../data/TextDataset";
import { DataLoader } from "../data/DataLoader";
import { BPETokenizer } from "../tokenizer/BPETokenizer";
import type { ITokenizer } from "../data/ITokenizer";
import type { TinyStoriesDataset } from "../data/TinyStoriesDataset";
import { Trainer } from "../training/Trainer";
import {
  saveCheckpoint,
  saveCheckpointJSON,
} from "../training/checkpoint";
import type { CheckpointData } from "../training/checkpoint";
import { GenerationEvaluator } from "../evaluation/GenerationEvaluator";
import type {
  GenerationEvalResult,
  GenerationComparison,
} from "../evaluation/GenerationEvaluator";
import { BenchmarkReport } from "./BenchmarkReport";
import { TrainingMetricsCollector } from "../training/Metrics";
import { DEFAULT_PROMPTS } from "../evaluation/PromptSuite";

// ============================================================
// Types
// ============================================================

/**
 * Input to runTrainingExperiment — the minimal set of
 * ingredients needed to reproduce a training run.
 */
export interface TrainingExperimentInput {
  /** Validated experiment configuration */
  config: ExperimentConfig;
  /** Dataset (TinyStories or in-memory texts) */
  dataset: TinyStoriesDataset | string[];
  /** BPE tokenizer (trained or loaded) */
  tokenizer: BPETokenizer;
}

/**
 * Result of a training experiment — everything needed to
 * evaluate and reproduce the run.
 */
export interface TrainingExperimentResult {
  /** Experiment name */
  name: string;

  /** Model configuration used */
  modelConfig: TensorMiniMindConfig;

  /** Total optimizer steps taken */
  totalSteps: number;

  /** Final training loss */
  finalLoss: number;

  /** Best (minimum) loss during training */
  bestLoss: number;

  /** Final perplexity */
  perplexity: number;

  /** Final checkpoint (full state) */
  checkpoint: CheckpointData;

  /** Collected training metrics */
  metrics: TrainingMetricsCollector;

  /** Generation samples before training (if requested) */
  generationBefore?: GenerationEvalResult[];

  /** Generation samples after training (if requested) */
  generationAfter?: GenerationEvalResult[];

  /** Before/after generation comparisons */
  generationComparison?: GenerationComparison[];

  /** Benchmark report */
  report: BenchmarkReport;

  /** Training duration in milliseconds */
  durationMs: number;

  /** Path to saved checkpoint JSON */
  checkpointPath?: string;

  /** Path to saved report */
  reportPath?: string;
}

/**
 * Options for running a training experiment.
 */
export interface TrainingExperimentOptions {
  /** Whether to run generation evaluation (default: true) */
  runGenerationEval?: boolean;

  /** Prompts for generation evaluation (default: DEFAULT_PROMPTS) */
  generationPrompts?: string[];

  /** Max tokens for generation (default: 30) */
  generationMaxTokens?: number;

  /** Whether to save checkpoints and reports to disk (default: true) */
  saveToDisk?: boolean;

  /** Override output directory (default: from config) */
  outputDir?: string;
}

// ============================================================
// runTrainingExperiment()
// ============================================================

/**
 * Run a complete, reproducible training experiment.
 *
 * This is the main entry point for Phase 46. It orchestrates
 * the full pipeline:
 *
 *   1. Build tokenizer (train or load)
 *   2. Build dataset → DataLoader
 *   3. Create TensorMiniMindModel from config
 *   4. Create AdamW/SGD optimizer
 *   5. Create Cosine/Linear scheduler
 *   6. Create Trainer
 *   7. (Optional) Generate samples BEFORE training
 *   8. Train
 *   9. (Optional) Generate samples AFTER training + compare
 *   10. Save checkpoint
 *   11. Build BenchmarkReport
 *   12. Return full result
 *
 * @param input    - Config + dataset + tokenizer
 * @param options  - Optional behavior flags
 * @returns Complete experiment result
 */
export async function runTrainingExperiment(
  input: TrainingExperimentInput,
  options: TrainingExperimentOptions = {}
): Promise<TrainingExperimentResult> {
  const {
    config,
    dataset: datasetInput,
    tokenizer,
  } = input;

  const {
    runGenerationEval = true,
    generationPrompts = DEFAULT_PROMPTS,
    generationMaxTokens = 30,
    saveToDisk = true,
    outputDir,
  } = options;

  const cfg = config.data;
  const startTime = Date.now();
  const startedAt = new Date(startTime);

  // ============================================================
  // Step 1: Resolve dataset
  // ============================================================
  const corpus: string[] = Array.isArray(datasetInput)
    ? datasetInput
    : datasetInput.stories();

  // ============================================================
  // Step 2: Build TextDataset + DataLoader
  // ============================================================
  const textDataset = new TextDataset({
    tokenizer: tokenizer as ITokenizer,
    corpus,
    blockSize: cfg.dataset.blockSize,
  });

  const trainLoader = new DataLoader<TextSample>(textDataset, {
    batchSize: cfg.dataset.batchSize,
    shuffle: cfg.dataset.shuffle ?? true,
    seed: cfg.seed,
    dropLast: true,
  });

  // ============================================================
  // Step 3: Create model
  // ============================================================
  const dims = config.getModelDimensions();
  const modelConfig: TensorMiniMindConfig = {
    vocabSize: dims.vocabSize,
    dModel: dims.dModel,
    numHeads: dims.numHeads,
    dFF: dims.dFF,
    numLayers: dims.numLayers,
    maxSeqLen: dims.maxSeqLen,
  };

  const model = new TensorMiniMindModel(modelConfig);

  // ============================================================
  // Step 4: Create optimizer
  // ============================================================
  let optimizer: Optimizer;

  if (cfg.optimizer.type === "sgd") {
    optimizer = new SGDOptimizer(
      model.parameters(),
      cfg.optimizer.lr
    );
  } else {
    // adamw
    const adamwConfig: Partial<AdamWConfig> = {
      lr: cfg.optimizer.lr,
      weightDecay: cfg.optimizer.weightDecay ?? 0.01,
      betas: cfg.optimizer.betas ?? [0.9, 0.999],
      eps: cfg.optimizer.eps ?? 1e-8,
    };
    optimizer = new AdamWOptimizer(model.parameters(), adamwConfig);
  }

  const effectiveLR = cfg.optimizer.lr;

  // ============================================================
  // Step 5: Create scheduler
  // ============================================================
  const totalSteps = config.calculateTotalSteps(trainLoader.numBatches);

  let scheduler: LRScheduler | undefined;

  if (cfg.scheduler && cfg.scheduler.type !== "none") {
    if (cfg.scheduler.type === "cosine") {
      scheduler = new CosineScheduler(optimizer, {
        baseLR: effectiveLR,
        minLR: cfg.scheduler.minLR ?? effectiveLR * 0.01,
        warmupSteps: cfg.scheduler.warmupSteps ?? Math.floor(totalSteps * 0.1),
        totalSteps,
      });
    } else if (cfg.scheduler.type === "linear") {
      scheduler = new LinearWarmupScheduler(optimizer, {
        baseLR: effectiveLR,
        warmupSteps: cfg.scheduler.warmupSteps,
      });
    }
  }

  // ============================================================
  // Step 6: Create metrics collector
  // ============================================================
  const metrics = new TrainingMetricsCollector();

  // ============================================================
  // Step 7: Generation BEFORE training (optional)
  // ============================================================
  let generationBefore: GenerationEvalResult[] | undefined;

  if (runGenerationEval) {
    const genEval = new GenerationEvaluator(model, tokenizer);
    generationBefore = genEval.evaluate(generationPrompts, {
      seed: cfg.seed,
      maxTokens: generationMaxTokens,
      temperature: 0.8,
    });
  }

  // ============================================================
  // Step 8: Create and run Trainer
  // ============================================================
  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader,
    config: {
      epochs: cfg.training.epochs,
      learningRate: effectiveLR,
      logInterval: cfg.training.logInterval ?? 10,
      gradientAccumulationSteps:
        cfg.training.gradientAccumulationSteps ?? 1,
      gradientClipNorm: cfg.training.gradientClipNorm,
    },
    onLog: (info) => {
      metrics.record({
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
      // Step the scheduler if attached
      if (scheduler) {
        scheduler.step();
      }
      // Ensure epoch-level metric is recorded
      const lastRecord = metrics.latest();
      if (!lastRecord || lastRecord.epoch < info.epoch) {
        metrics.record({
          step: info.globalStep,
          epoch: info.epoch,
          loss: info.epochAvgLoss,
          learningRate: effectiveLR,
          perplexity: Math.exp(Math.min(info.epochAvgLoss, 709)),
          tokensPerSecond: undefined,
          timestamp: Date.now(),
        });
      }
    },
  });

  const trainerState = trainer.train();

  // ============================================================
  // Step 9: Generation AFTER training + comparison (optional)
  // ============================================================
  let generationAfter: GenerationEvalResult[] | undefined;
  let generationComparison: GenerationComparison[] | undefined;

  if (runGenerationEval && generationBefore) {
    const genEval = new GenerationEvaluator(model, tokenizer);
    generationAfter = genEval.evaluate(generationPrompts, {
      seed: cfg.seed,
      maxTokens: generationMaxTokens,
      temperature: 0.8,
    });
    generationComparison = genEval.compare(
      generationBefore,
      generationAfter
    );
  }

  // ============================================================
  // Step 10: Save checkpoint
  // ============================================================
  const checkpoint = saveCheckpoint({
    model,
    optimizer,
    scheduler,
    trainerState,
  });

  const endTime = Date.now();
  const endedAt = new Date(endTime);
  const durationMs = endTime - startTime;

  // ============================================================
  // Step 11: Build benchmark report
  // ============================================================
  const report = BenchmarkReport.create({
    model,
    config: {
      version: 1,
      metadata: {
        name: cfg.name,
        description: cfg.description,
        seed: cfg.seed,
      },
      model: {
        preset: cfg.model.preset,
        vocabSize: cfg.model.vocabSize,
        dModel: cfg.model.dModel,
        numHeads: cfg.model.numHeads,
        dFF: cfg.model.dFF,
        numLayers: cfg.model.numLayers,
        maxSeqLen: cfg.model.maxSeqLen,
      },
      tokenizer: cfg.tokenizer,
      dataset: {
        type: cfg.dataset.type,
        split: cfg.dataset.split,
        maxDocuments: cfg.dataset.maxDocuments,
        blockSize: cfg.dataset.blockSize,
      },
      training: {
        epochs: cfg.training.epochs,
        batchSize: cfg.dataset.batchSize,
        learningRate: cfg.optimizer.lr,
        weightDecay: cfg.optimizer.weightDecay ?? 0,
        gradientAccumulationSteps:
          cfg.training.gradientAccumulationSteps ?? 1,
        maxGradNorm: cfg.training.gradientClipNorm ?? 0,
        warmupSteps:
          cfg.scheduler && cfg.scheduler.type !== "none"
            ? (cfg.scheduler as { warmupSteps?: number }).warmupSteps ?? 0
            : 0,
        evalEvery: cfg.training.evalEvery ?? 0,
        saveEvery: 0,
      },
      output: {
        dir: cfg.output.dir,
        finalOnly: true,
      },
    },
    metrics,
    tokenizerVocabSize: tokenizer.vocabSize,
    tokenizerType: "bpe",
    datasetSamples: textDataset.length(),
    startedAt,
    endedAt,
  });

  // ============================================================
  // Step 12: Save to disk (optional)
  // ============================================================
  const effectiveOutputDir = outputDir ?? cfg.output.dir;
  const runDir = path.join(
    effectiveOutputDir,
    cfg.name.replace(/\s+/g, "-")
  );

  let checkpointPath: string | undefined;
  let reportPath: string | undefined;

  if (saveToDisk) {
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    // Save config copy
    config.save(path.join(runDir, "config.json"));

    // Save checkpoint
    checkpointPath = path.join(runDir, "checkpoint.json");
    fs.writeFileSync(
      checkpointPath,
      JSON.stringify(checkpoint, null, 2),
      "utf-8"
    );

    // Save metrics
    fs.writeFileSync(
      path.join(runDir, "metrics.json"),
      metrics.toJSON(),
      "utf-8"
    );

    // Save benchmark report
    reportPath = path.join(runDir, "report.json");
    report.save(reportPath);

    // Save tokenizer state
    fs.writeFileSync(
      path.join(runDir, "tokenizer.json"),
      JSON.stringify(tokenizer.toState(), null, 2),
      "utf-8"
    );

    // Save generation comparison if available
    if (generationComparison && generationComparison.length > 0) {
      fs.writeFileSync(
        path.join(runDir, "generation-comparison.json"),
        JSON.stringify(
          {
            before: generationBefore,
            after: generationAfter,
            comparison: generationComparison,
          },
          null,
          2
        ),
        "utf-8"
      );
    }
  }

  // ============================================================
  // Step 13: Build result
  // ============================================================
  const bestLoss = trainerState.bestLoss;
  const finalLoss =
    trainerState.lossHistory.length > 0
      ? trainerState.lossHistory[trainerState.lossHistory.length - 1]
      : Infinity;

  const result: TrainingExperimentResult = {
    name: cfg.name,
    modelConfig,
    totalSteps: trainerState.globalStep,
    finalLoss,
    bestLoss,
    perplexity: Math.exp(Math.min(finalLoss, 709)),
    checkpoint,
    metrics,
    generationBefore,
    generationAfter,
    generationComparison,
    report,
    durationMs,
    checkpointPath,
    reportPath,
  };

  return result;
}

// ============================================================
// Quick Experiment Launcher
// ============================================================

/**
 * Run a quick training experiment from a config file path.
 *
 * Loads config, trains BPE tokenizer, loads TinyStories,
 * and runs the full experiment pipeline.
 *
 * @param configPath - Path to JSON config file
 * @param options    - Optional behavior overrides
 */
export async function runExperimentFromConfigFile(
  configPath: string,
  options?: TrainingExperimentOptions
): Promise<TrainingExperimentResult> {
  const { ExperimentConfig } = await import("./ExperimentConfig");
  const config = ExperimentConfig.fromFile(configPath);
  const cfg = config.data;

  // Prepare tokenizer
  const tokenizer = new BPETokenizer();

  if (cfg.tokenizer.type === "load" && cfg.tokenizer.statePath) {
    // Load from file
    const stateJson = fs.readFileSync(cfg.tokenizer.statePath, "utf-8");
    tokenizer.fromState(JSON.parse(stateJson));
  } else {
    // Train BPE from corpus
    const corpus = await loadCorpusFromConfig(cfg);
    const targetVocab = cfg.tokenizer.vocabSize ?? 32000;
    tokenizer.train(corpus, targetVocab);
  }

  // Load dataset
  const dataset = await loadDatasetFromConfig(cfg);

  return runTrainingExperiment(
    { config, dataset, tokenizer },
    options
  );
}

// ============================================================
// Internal Helpers
// ============================================================

async function loadCorpusFromConfig(
  cfg: ExperimentConfigFile
): Promise<string[]> {
  switch (cfg.dataset.type) {
    case "tinystories": {
      const { TinyStoriesDataset } = await import(
        "../data/TinyStoriesDataset"
      );
      const ds = await TinyStoriesDataset.load({
        split: cfg.dataset.split ?? "train",
        maxStories: cfg.dataset.maxDocuments,
      });
      return ds.stories();
    }
    case "textfile": {
      if (!cfg.dataset.path) {
        throw new Error("dataset.path required for textfile type");
      }
      const content = fs.readFileSync(cfg.dataset.path, "utf-8");
      return content
        .split(/\n\s*\n/)
        .filter((s) => s.trim().length > 0);
    }
    case "inline":
      return getDefaultInlineCorpus();
    default:
      throw new Error(`Unknown dataset type: ${(cfg.dataset as { type: string }).type}`);
  }
}

async function loadDatasetFromConfig(
  cfg: ExperimentConfigFile
): Promise<TinyStoriesDataset | string[]> {
  switch (cfg.dataset.type) {
    case "tinystories": {
      const { TinyStoriesDataset } = await import(
        "../data/TinyStoriesDataset"
      );
      return TinyStoriesDataset.load({
        split: cfg.dataset.split ?? "train",
        maxStories: cfg.dataset.maxDocuments,
      });
    }
    case "textfile": {
      if (!cfg.dataset.path) {
        throw new Error("dataset.path required for textfile type");
      }
      const content = fs.readFileSync(cfg.dataset.path, "utf-8");
      return content
        .split(/\n\s*\n/)
        .filter((s) => s.trim().length > 0);
    }
    case "inline":
      return getDefaultInlineCorpus();
    default:
      throw new Error(`Unknown dataset type: ${(cfg.dataset as { type: string }).type}`);
  }
}

function getDefaultInlineCorpus(): string[] {
  const sentences = [
    "the cat sat on the mat",
    "the dog ran in the park",
    "once upon a time there was a princess",
    "the sun was shining brightly in the sky",
    "a bird flew over the tall tree",
    "the fish swam in the clear water",
    "the boy played with his red ball",
    "a beautiful rainbow appeared after the rain",
    "the girl read a book under the lamp",
    "the horse jumped over the fence",
  ];
  return Array.from(
    { length: 100 },
    (_, i) => sentences[i % sentences.length]
  );
}
