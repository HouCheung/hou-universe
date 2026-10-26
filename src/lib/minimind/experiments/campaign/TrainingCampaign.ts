// ============================================================
// TrainingCampaign — Real GPT pretraining campaign orchestrator
// ============================================================
// Phase 55: End-to-end training campaign runner that composes
// existing infrastructure (Trainer, GenerationEvaluator, etc.)
// and adds campaign-specific features:
//
//   - Gradient norm tracking at every optimizer step
//   - Training milestone recording (loss, ppl, tok/s, lr, grad norm)
//   - Checkpoint saving with full state
//   - Generation evaluation (before/after comparison)
//   - Reproducibility validation
//   - Campaign report generation (JSON + Markdown)
//   - TrainingRunRecord creation for observatory compatibility
//
// Reuses: TensorMiniMindModel, Trainer, AdamWOptimizer,
// CosineScheduler, DataLoader, GenerationEvaluator,
// saveCheckpoint, TrainingMetricsCollector, etc.
//
// Does NOT modify: Tensor core, Transformer model,
// old MiniMindModel, or AI Lab UI.
//
// Usage:
//   const campaign = new TrainingCampaign({
//     config: ExperimentConfig.fromFile("configs/tinystories-production.json"),
//   });
//   const result = await campaign.run();
//   console.log(result.summarize());
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import type { TensorMiniMindConfig } from "../../model/TensorMiniMindModel";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import type { AdamWConfig } from "../../core/optim/AdamW";
import { SGDOptimizer } from "../../core/optim/SGD";
import { CosineScheduler } from "../../core/scheduler/CosineScheduler";
import { LinearWarmupScheduler } from "../../core/scheduler/LinearWarmupScheduler";
import type { LRScheduler } from "../../core/scheduler/LRScheduler";
import { TextDataset } from "../../data/TextDataset";
import type { TextSample } from "../../data/TextDataset";
import { DataLoader } from "../../data/DataLoader";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import type { ITokenizer } from "../../data/ITokenizer";
import { Trainer } from "../../training/Trainer";
import {
  saveCheckpoint,
  saveCheckpointJSON,
} from "../../training/checkpoint/Checkpoint";
import type { CheckpointData } from "../../training/checkpoint/Checkpoint";
import { GenerationEvaluator } from "../../evaluation/GenerationEvaluator";
import type {
  GenerationEvalResult,
  GenerationComparison,
} from "../../evaluation/GenerationEvaluator";
import { TrainingMetricsCollector } from "../../training/Metrics";
import type { Optimizer } from "../../core/optim/Optimizer";
import { Random } from "../../core/random/Random";
import type { ExperimentConfig } from "../ExperimentConfig";
import { GradientNormTracker } from "./GradientNormTracker";
import { CampaignReport } from "./CampaignReport";
import type { ReproducibilityResult } from "./ReproducibilityValidator";
import { ReproducibilityValidator } from "./ReproducibilityValidator";
import { DEFAULT_PROMPTS } from "../../evaluation/PromptSuite";

// ============================================================
// Types
// ============================================================

/**
 * Input to the TrainingCampaign constructor.
 */
export interface TrainingCampaignInput {
  /** Validated experiment configuration */
  config: ExperimentConfig;

  /** Dataset: TinyStories dataset, string array, or undefined to load from config */
  dataset?: string[] | { stories(): string[] };

  /** Pre-trained BPE tokenizer, or undefined to train from corpus */
  tokenizer?: BPETokenizer;

  /** Pre-built model, or undefined to create from config */
  model?: TensorMiniMindModel;
}

/**
 * Result of a training campaign — contains everything needed
 * for analysis, reproducibility, and reporting.
 */
export interface TrainingCampaignResult {
  /** Campaign name from config */
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

  /** Full checkpoint data */
  checkpoint: CheckpointData;

  /** Collected training metrics */
  metrics: TrainingMetricsCollector;

  /** Gradient norm history (per-step) */
  gradientNorms: Array<{ step: number; norm: number }>;

  /** Generation samples before training */
  generationBefore?: GenerationEvalResult[];

  /** Generation samples after training */
  generationAfter?: GenerationEvalResult[];

  /** Before/after generation comparisons */
  generationComparison?: GenerationComparison[];

  /** Reproducibility validation result (if validated) */
  reproducibility?: ReproducibilityResult;

  /** Campaign report */
  report?: CampaignReport;

  /** Training duration in milliseconds */
  durationMs: number;

  /** Path to saved checkpoint JSON */
  checkpointPath?: string;

  /** Path to saved report JSON */
  reportPath?: string;

  /** Tokenizer vocabulary size */
  tokenizerVocabSize: number;

  /** Number of dataset samples */
  datasetSamples: number;

  /** Throughput in tokens per second */
  tokensPerSecond: number;

  /** The ExperimentConfig used */
  config: ExperimentConfig;
}

/**
 * Options for running a training campaign.
 */
export interface TrainingCampaignOptions {
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

  /** Whether to run reproducibility validation (default: false) */
  validateReproducibility?: boolean;

  /** Whether to save TrainingRunRecord for observatory (default: true) */
  saveRunRecord?: boolean;

  /** Whether to generate campaign reports (default: true) */
  generateReports?: boolean;
}

// ============================================================
// TrainingCampaign
// ============================================================

export class TrainingCampaign {
  readonly config: ExperimentConfig;
  private datasetInput?: string[] | { stories(): string[] };
  private prebuiltTokenizer?: BPETokenizer;
  private prebuiltModel?: TensorMiniMindModel;

  constructor(input: TrainingCampaignInput) {
    this.config = input.config;
    this.datasetInput = input.dataset;
    this.prebuiltTokenizer = input.tokenizer;
    this.prebuiltModel = input.model;
  }

  /**
   * Run the full training campaign.
   *
   * Pipeline:
   *   1. Set random seed
   *   2. Build/resolve tokenizer
   *   3. Build/resolve dataset
   *   4. Create DataLoader
   *   5. Create or use pre-built model
   *   6. Create optimizer (wrapped in GradientNormTracker)
   *   7. Create scheduler
   *   8. Run generation BEFORE training
   *   9. Train with milestone recording
   *   10. Run generation AFTER training + compare
   *   11. Save checkpoint
   *   12. (Optional) Validate reproducibility
   *   13. (Optional) Generate campaign reports
   *   14. Return full result
   */
  async run(
    options: TrainingCampaignOptions = {}
  ): Promise<TrainingCampaignResult> {
    const {
      runGenerationEval = true,
      generationPrompts = DEFAULT_PROMPTS.slice(0, 3),
      generationMaxTokens = 30,
      saveToDisk = true,
      outputDir,
      validateReproducibility = false,
      generateReports = true,
    } = options;

    const cfg = this.config.data;
    const startTime = Date.now();

    // ============================================================
    // Step 1: Set seed
    // ============================================================
    Random.setSeed(cfg.seed);

    // ============================================================
    // Step 2: Build/resolve tokenizer
    // ============================================================
    const tokenizer = this.prebuiltTokenizer ?? this.buildTokenizer();

    // ============================================================
    // Step 3: Build/resolve dataset corpus
    // ============================================================
    const corpus = this.resolveCorpus();

    // ============================================================
    // Step 4: Create TextDataset + DataLoader
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
    // Step 5: Create model
    // ============================================================
    const model =
      this.prebuiltModel ?? this.buildModel(tokenizer.vocabSize);

    // ============================================================
    // Step 6: Create optimizer (wrapped for gradient norm tracking)
    // ============================================================
    const { optimizer, gradNormTracker } = this.buildOptimizer(model);

    // ============================================================
    // Step 7: Create scheduler
    // ============================================================
    const scheduler = this.buildScheduler(
      optimizer,
      trainLoader.numBatches
    );

    // ============================================================
    // Step 8: Generation BEFORE training
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
    // Step 9: Train with milestone recording
    // ============================================================
    const metrics = new TrainingMetricsCollector();
    const startTrainTime = Date.now();
    let lastStepTime = startTrainTime;

    const trainer = new Trainer({
      model,
      optimizer: gradNormTracker,
      trainLoader,
      config: {
        epochs: cfg.training.epochs,
        learningRate: cfg.optimizer.lr,
        logInterval: cfg.training.logInterval ?? 10,
        gradientAccumulationSteps:
          cfg.training.gradientAccumulationSteps ?? 1,
        gradientClipNorm: cfg.training.gradientClipNorm,
      },
      onLog: (info) => {
        const now = Date.now();
        const elapsedSinceLast = (now - lastStepTime) / 1000;
        lastStepTime = now;

        // Estimate tokens per second
        const tokensPerStep =
          cfg.dataset.batchSize *
          cfg.dataset.blockSize *
          (cfg.training.gradientAccumulationSteps ?? 1);
        const tokensPerSecond =
          elapsedSinceLast > 0 ? tokensPerStep / elapsedSinceLast : 0;

        // Get current learning rate from scheduler
        const currentLR = scheduler ? scheduler.getLR() : cfg.optimizer.lr;

        // Record milestone (with gradient norm from tracker)
        metrics.record({
          step: info.globalStep,
          epoch: info.epoch,
          loss: info.loss,
          learningRate: currentLR,
          perplexity: info.perplexity,
          tokensPerSecond: Math.round(tokensPerSecond),
          timestamp: now,
        });
      },
      onEpochEnd: (info) => {
        if (scheduler) {
          scheduler.step();
        }
        const lastRecord = metrics.latest();
        if (!lastRecord || lastRecord.epoch < info.epoch) {
          metrics.record({
            step: info.globalStep,
            epoch: info.epoch,
            loss: info.epochAvgLoss,
            learningRate: scheduler ? scheduler.getLR() : cfg.optimizer.lr,
            perplexity: Math.exp(Math.min(info.epochAvgLoss, 709)),
            tokensPerSecond: undefined,
            timestamp: Date.now(),
          });
        }
      },
    });

    // Attach scheduler to trainer
    if (scheduler) {
      trainer.scheduler = scheduler;
    }

    const trainerState = trainer.train();

    // ============================================================
    // Step 10: Generation AFTER training + comparison
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
    // Step 11: Save checkpoint
    // ============================================================
    const checkpoint = saveCheckpoint({
      model,
      optimizer,
      scheduler: scheduler ?? undefined,
      trainerState,
    });

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    const bestLoss = trainerState.bestLoss;
    const finalLoss =
      trainerState.lossHistory.length > 0
        ? trainerState.lossHistory[trainerState.lossHistory.length - 1]
        : Infinity;

    // Calculate throughput
    const totalSteps = trainerState.globalStep;
    const totalTokens =
      totalSteps *
      cfg.dataset.batchSize *
      cfg.dataset.blockSize *
      (cfg.training.gradientAccumulationSteps ?? 1);
    const tokensPerSecond =
      durationMs > 0 ? (totalTokens / durationMs) * 1000 : 0;

    // ============================================================
    // Step 12: Build preliminary result
    // ============================================================
    const result: TrainingCampaignResult = {
      name: cfg.name,
      modelConfig: {
        vocabSize: this.config.getModelDimensions().vocabSize,
        dModel: this.config.getModelDimensions().dModel,
        numHeads: this.config.getModelDimensions().numHeads,
        dFF: this.config.getModelDimensions().dFF,
        numLayers: this.config.getModelDimensions().numLayers,
        maxSeqLen: this.config.getModelDimensions().maxSeqLen,
      },
      totalSteps,
      finalLoss,
      bestLoss,
      perplexity: Math.exp(Math.min(finalLoss, 709)),
      checkpoint,
      metrics,
      gradientNorms: [...gradNormTracker.normHistory],
      generationBefore,
      generationAfter,
      generationComparison,
      durationMs,
      tokenizerVocabSize: tokenizer.vocabSize,
      datasetSamples: textDataset.length(),
      tokensPerSecond,
      config: this.config,
    };

    // ============================================================
    // Step 13: Save to disk
    // ============================================================
    const effectiveOutputDir =
      outputDir ?? cfg.output.dir ?? ".cache/minimind/campaigns";
    const campaignDir = path.join(
      effectiveOutputDir,
      cfg.name.replace(/\s+/g, "-").toLowerCase()
    );

    if (saveToDisk) {
      if (!fs.existsSync(campaignDir)) {
        fs.mkdirSync(campaignDir, { recursive: true });
      }

      // Save config copy
      this.config.save(path.join(campaignDir, "config.json"));

      // Save checkpoint
      result.checkpointPath = path.join(campaignDir, "checkpoint.json");
      fs.writeFileSync(
        result.checkpointPath,
        JSON.stringify(checkpoint, null, 2),
        "utf-8"
      );

      // Save metrics
      fs.writeFileSync(
        path.join(campaignDir, "metrics.json"),
        metrics.toJSON(),
        "utf-8"
      );
    }

    // ============================================================
    // Step 14: Generate campaign reports
    // ============================================================
    if (generateReports) {
      const reportsDir = path.join(campaignDir, "reports");
      const report = CampaignReport.fromCampaignResult(result, {
        generationPrompts,
      });

      if (saveToDisk) {
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }

        const jsonPath = path.join(
          reportsDir,
          `${cfg.name.replace(/\s+/g, "-").toLowerCase()}.json`
        );
        const mdPath = path.join(
          reportsDir,
          `${cfg.name.replace(/\s+/g, "-").toLowerCase()}.md`
        );

        report.saveJSON(jsonPath);
        report.saveMarkdown(mdPath);
        result.reportPath = jsonPath;
      }

      result.report = report;
    }

    // ============================================================
    // Step 15: Reproducibility validation (optional)
    // ============================================================
    if (validateReproducibility) {
      const validator = new ReproducibilityValidator();

      // For reproducibility, we need to run again with same seed
      // Create a closure that resets the seed and runs again
      const trainFn = async (): Promise<TrainingCampaignResult> => {
        Random.setSeed(cfg.seed);

        const model2 = this.prebuiltModel
          ? undefined
          : undefined;
        // Build fresh model
        const freshModel = new TensorMiniMindModel(result.modelConfig);

        const { optimizer: opt2, gradNormTracker: gnt2 } =
          this.buildOptimizerFromResult(freshModel, cfg);

        const freshLoader = new DataLoader<TextSample>(textDataset, {
          batchSize: cfg.dataset.batchSize,
          shuffle: cfg.dataset.shuffle ?? true,
          seed: cfg.seed,
          dropLast: true,
        });

        const sched2 = this.buildSchedulerFromResult(
          opt2,
          trainLoader.numBatches,
          cfg
        );

        const metrics2 = new TrainingMetricsCollector();
        const trainer2 = new Trainer({
          model: freshModel,
          optimizer: gnt2,
          trainLoader: freshLoader,
          config: {
            epochs: cfg.training.epochs,
            learningRate: cfg.optimizer.lr,
            logInterval: cfg.training.logInterval ?? 10,
            gradientAccumulationSteps:
              cfg.training.gradientAccumulationSteps ?? 1,
            gradientClipNorm: cfg.training.gradientClipNorm,
          },
          onLog: (info) => {
            const currentLR = sched2 ? sched2.getLR() : cfg.optimizer.lr;
            metrics2.record({
              step: info.globalStep,
              epoch: info.epoch,
              loss: info.loss,
              learningRate: currentLR,
              perplexity: info.perplexity,
              timestamp: Date.now(),
            });
          },
          onEpochEnd: () => {
            if (sched2) sched2.step();
          },
        });

        if (sched2) trainer2.scheduler = sched2;

        const state2 = trainer2.train();

        const ckpt2 = saveCheckpoint({
          model: freshModel,
          optimizer: opt2,
          scheduler: sched2 ?? undefined,
          trainerState: state2,
        });

        const finalLoss2 =
          state2.lossHistory.length > 0
            ? state2.lossHistory[state2.lossHistory.length - 1]
            : Infinity;

        return {
          name: cfg.name,
          modelConfig: result.modelConfig,
          totalSteps: state2.globalStep,
          finalLoss: finalLoss2,
          bestLoss: state2.bestLoss,
          perplexity: Math.exp(Math.min(finalLoss2, 709)),
          checkpoint: ckpt2,
          metrics: metrics2,
          gradientNorms: [...gnt2.normHistory],
          durationMs: 0,
          tokenizerVocabSize: tokenizer.vocabSize,
          datasetSamples: textDataset.length(),
          tokensPerSecond: 0,
          config: this.config,
        };
      };

      const reproResult = await validator.validate(
        trainFn,
        generationPrompts
      );
      result.reproducibility = reproResult;

      // Update report with reproducibility info
      if (result.report) {
        const updatedReport = CampaignReport.fromCampaignResult(result, {
          generationPrompts,
          reproducibility: {
            validated: true,
            identical: reproResult.identical,
            maxLossDiff: reproResult.loss.maxDiff,
            checkpointsMatch: reproResult.checkpoint.identical,
            generationsMatch: reproResult.generation.identical,
          },
        });
        result.report = updatedReport;

        if (saveToDisk && result.reportPath) {
          updatedReport.saveJSON(result.reportPath);
          const mdPath = result.reportPath.replace(/\.json$/, ".md");
          updatedReport.saveMarkdown(mdPath);
        }
      }
    }

    return result;
  }

  // ============================================================
  // Internal: Build helpers
  // ============================================================

  private buildTokenizer(): BPETokenizer {
    const cfg = this.config.data;
    const tokenizer = new BPETokenizer();

    if (cfg.tokenizer.type === "load" && cfg.tokenizer.statePath) {
      const stateJson = fs.readFileSync(cfg.tokenizer.statePath, "utf-8");
      tokenizer.fromState(JSON.parse(stateJson));
    } else {
      const corpus = this.resolveCorpus();
      const targetVocab = cfg.tokenizer.vocabSize ?? 32000;
      tokenizer.train(corpus, Math.min(targetVocab, 5000));
    }

    return tokenizer;
  }

  private resolveCorpus(): string[] {
    const corpus = this.datasetInput;
    if (!corpus) {
      return getDefaultCorpus();
    }
    if (Array.isArray(corpus)) {
      return corpus;
    }
    return corpus.stories();
  }

  private buildModel(vocabSize: number): TensorMiniMindModel {
    const dims = this.config.getModelDimensions();
    return new TensorMiniMindModel({
      vocabSize,
      dModel: dims.dModel,
      numHeads: dims.numHeads,
      dFF: dims.dFF,
      numLayers: dims.numLayers,
      maxSeqLen: dims.maxSeqLen,
    });
  }

  private buildOptimizer(model: TensorMiniMindModel): {
    optimizer: Optimizer;
    gradNormTracker: GradientNormTracker;
  } {
    const cfg = this.config.data;
    let baseOptimizer: Optimizer;

    if (cfg.optimizer.type === "sgd") {
      baseOptimizer = new SGDOptimizer(
        model.parameters(),
        cfg.optimizer.lr
      );
    } else {
      const adamwConfig: Partial<AdamWConfig> = {
        lr: cfg.optimizer.lr,
        weightDecay: cfg.optimizer.weightDecay ?? 0.01,
        betas: cfg.optimizer.betas ?? [0.9, 0.999],
        eps: cfg.optimizer.eps ?? 1e-8,
      };
      baseOptimizer = new AdamWOptimizer(model.parameters(), adamwConfig);
    }

    const gradNormTracker = new GradientNormTracker(
      baseOptimizer,
      model.parameters()
    );

    return { optimizer: baseOptimizer, gradNormTracker };
  }

  private buildScheduler(
    optimizer: Optimizer,
    numBatches: number
  ): LRScheduler | undefined {
    const cfg = this.config.data;
    const effectiveLR = cfg.optimizer.lr;
    const totalSteps = this.config.calculateTotalSteps(numBatches);

    if (!cfg.scheduler || cfg.scheduler.type === "none") {
      return undefined;
    }

    if (cfg.scheduler.type === "cosine") {
      return new CosineScheduler(optimizer, {
        baseLR: effectiveLR,
        minLR:
          (cfg.scheduler as { minLR?: number }).minLR ??
          effectiveLR * 0.01,
        warmupSteps:
          (cfg.scheduler as { warmupSteps?: number }).warmupSteps ??
          Math.floor(totalSteps * 0.1),
        totalSteps,
      });
    }

    if (cfg.scheduler.type === "linear") {
      return new LinearWarmupScheduler(optimizer, {
        baseLR: effectiveLR,
        warmupSteps:
          (cfg.scheduler as { warmupSteps: number }).warmupSteps,
      });
    }

    return undefined;
  }

  // Internal helpers for reproducibility (avoiding duplicate construction)
  private buildOptimizerFromResult(
    model: TensorMiniMindModel,
    cfg: ExperimentConfig["data"]
  ): {
    optimizer: Optimizer;
    gradNormTracker: GradientNormTracker;
  } {
    let baseOptimizer: Optimizer;

    if (cfg.optimizer.type === "sgd") {
      baseOptimizer = new SGDOptimizer(model.parameters(), cfg.optimizer.lr);
    } else {
      baseOptimizer = new AdamWOptimizer(model.parameters(), {
        lr: cfg.optimizer.lr,
        weightDecay: cfg.optimizer.weightDecay ?? 0.01,
        betas: cfg.optimizer.betas ?? [0.9, 0.999],
        eps: cfg.optimizer.eps ?? 1e-8,
      });
    }

    const gradNormTracker = new GradientNormTracker(
      baseOptimizer,
      model.parameters()
    );

    return { optimizer: baseOptimizer, gradNormTracker };
  }

  private buildSchedulerFromResult(
    optimizer: Optimizer,
    numBatches: number,
    cfg: ExperimentConfig["data"]
  ): LRScheduler | undefined {
    const effectiveLR = cfg.optimizer.lr;
    const totalSteps = this.config.calculateTotalSteps(numBatches);

    if (!cfg.scheduler || cfg.scheduler.type === "none") return undefined;

    if (cfg.scheduler.type === "cosine") {
      return new CosineScheduler(optimizer, {
        baseLR: effectiveLR,
        minLR:
          (cfg.scheduler as { minLR?: number }).minLR ?? effectiveLR * 0.01,
        warmupSteps:
          (cfg.scheduler as { warmupSteps?: number }).warmupSteps ??
          Math.floor(totalSteps * 0.1),
        totalSteps,
      });
    }

    if (cfg.scheduler.type === "linear") {
      return new LinearWarmupScheduler(optimizer, {
        baseLR: effectiveLR,
        warmupSteps:
          (cfg.scheduler as { warmupSteps: number }).warmupSteps,
      });
    }

    return undefined;
  }

  /**
   * Generate a human-readable summary of the campaign result.
   */
  summarizeResult(result: TrainingCampaignResult): string {
    const lines: string[] = [];
    lines.push(`Training Campaign: ${result.name}`);
    lines.push(`  Steps:      ${result.totalSteps}`);
    lines.push(
      `  Loss:       ${result.finalLoss.toFixed(4)} ` +
        `(best: ${result.bestLoss.toFixed(4)})`
    );
    lines.push(`  Perplexity: ${result.perplexity.toFixed(2)}`);
    lines.push(
      `  Duration:   ${(result.durationMs / 1000).toFixed(1)}s`
    );
    lines.push(
      `  Throughput: ${result.tokensPerSecond.toFixed(0)} tokens/s`
    );

    if (result.reproducibility) {
      lines.push(
        `  Reproducible: ${
          result.reproducibility.identical ? "Yes ✅" : "No ❌"
        }`
      );
    }

    return lines.join("\n");
  }
}

// ============================================================
// Convenience
// ============================================================

/**
 * Run a training campaign from a config file path.
 *
 * This is the simplest way to launch a campaign.
 *
 * @param configPath - Path to JSON experiment config file
 * @param options - Campaign options
 * @returns TrainingCampaignResult
 */
export async function runTrainingCampaign(
  configPath: string,
  options?: TrainingCampaignOptions
): Promise<TrainingCampaignResult> {
  const { ExperimentConfig } = await import("../ExperimentConfig");
  const config = ExperimentConfig.fromFile(configPath);
  const campaign = new TrainingCampaign({ config });
  return campaign.run(options);
}

/**
 * Quick campaign with inline corpus for testing.
 */
export async function runQuickCampaign(
  options?: TrainingCampaignOptions & {
    seed?: number;
    epochs?: number;
    dModel?: number;
    dFF?: number;
    numLayers?: number;
  }
): Promise<TrainingCampaignResult> {
  const { ExperimentConfig } = await import("../ExperimentConfig");
  const corpus = getDefaultCorpus();

  const config = ExperimentConfig.fromObject({
    version: 1,
    name: "quick-campaign",
    seed: options?.seed ?? 42,
    dataset: {
      type: "inline",
      blockSize: 16,
      batchSize: 4,
    },
    model: {
      preset: "custom",
      vocabSize: 200,
      dModel: options?.dModel ?? 32,
      numHeads: 4,
      dFF: options?.dFF ?? 64,
      numLayers: options?.numLayers ?? 2,
      maxSeqLen: 16,
    },
    tokenizer: {
      type: "bpe",
      vocabSize: 300,
    },
    optimizer: {
      type: "adamw",
      lr: 0.001,
      weightDecay: 0.01,
    },
    scheduler: {
      type: "cosine",
      warmupSteps: 5,
    },
    training: {
      epochs: options?.epochs ?? 2,
      gradientAccumulationSteps: 1,
      gradientClipNorm: 1.0,
      logInterval: 5,
    },
    output: {
      dir: ".cache/minimind/campaigns",
    },
  });

  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, 300);

  const campaign = new TrainingCampaign({
    config,
    dataset: corpus,
    tokenizer,
  });

  return campaign.run({
    runGenerationEval: true,
    generationPrompts: ["the cat", "once upon"],
    generationMaxTokens: 10,
    saveToDisk: false,
    generateReports: false,
    validateReproducibility: false,
    ...options,
  });
}

// ============================================================
// Default corpus for inline testing
// ============================================================

function getDefaultCorpus(): string[] {
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
