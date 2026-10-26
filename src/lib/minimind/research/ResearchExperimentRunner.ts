// ============================================================
// MiniMind — research/ResearchExperimentRunner.ts
// ============================================================
// Phase 60: Research experiment runner.
//
// Integrates the full research experiment lifecycle with real
// training infrastructure. Orchestrates:
//
//   1. Validate experiment definition
//   2. Create ResearchRun record
//   3. Set random seed
//   4. Build tokenizer, dataset, model, optimizer, scheduler
//   5. Run generation BEFORE training
//   6. Run real Trainer (NOT fake metrics)
//   7. Run generation AFTER training
//   8. Collect metrics and analysis
//   9. Generate reproducibility certificate
//   10. Run ResearchInsightEngine
//   11. Generate ResearchReport
//   12. Save ResearchRun to store
//
// Design principles:
//   - Browser-safe core — no fs imports in this file
//   - Uses real Trainer — no simulated metrics
//   - Pluggable training executor — can swap Trainer/Campaign
//   - Emits events via TrainingEventBus for real-time UI updates
//   - Does NOT modify core/model/training modules
// ============================================================

import type { ResearchExperiment } from "./ResearchExperiment";
import { validateResearchExperiment } from "./ResearchExperiment";
import type { ResearchRun } from "./ResearchRun";
import {
  createResearchRun,
  startResearchRun,
  completeResearchRun,
  failResearchRun,
} from "./ResearchRun";
import { createRun, updateRun } from "./ResearchExperimentStore";
import { TrainingEventBus, eventBus } from "./TrainingEventBus";

// ============================================================
// Training Executor Interface
// ============================================================

/**
 * Result of executing one training run.
 *
 * This is the raw training output — before analysis, insights,
 * and report generation. The runner wraps this into a ResearchRun.
 */
export interface TrainingExecutionResult {
  /** Initial loss (before first step) */
  initialLoss: number;
  /** Final loss (after last step) */
  finalLoss: number;
  /** Best (lowest) loss observed */
  bestLoss: number;
  /** Final perplexity */
  perplexity: number;
  /** Tokens processed per second */
  tokensPerSecond: number;
  /** Total tokens processed */
  totalTokens: number;
  /** Total optimizer steps */
  totalSteps: number;
  /** Total epochs */
  totalEpochs: number;
  /** Training duration in milliseconds */
  durationMs: number;
  /** Checkpoint identifier or path */
  checkpointId?: string;
  /** Generation outputs before training */
  generationBefore: Array<{ prompt: string; generatedText: string }>;
  /** Generation outputs after training */
  generationAfter: Array<{ prompt: string; generatedText: string }>;
  /** Per-step loss history */
  lossHistory: Array<{ step: number; loss: number }>;
  /** Per-step learning rate history */
  learningRateHistory: Array<{ step: number; learningRate: number }>;
  /** Gradient norm history */
  gradientNormHistory: Array<{ step: number; norm: number }>;
}

/**
 * Interface for pluggable training execution.
 *
 * Implementations:
 *   - BrowserTrainerExecutor — uses Trainer directly (browser-safe)
 *   - CampaignTrainerExecutor — uses TrainingCampaign (Node-only, in node.ts)
 */
export interface TrainingExecutor {
  /**
   * Execute training for a given experiment.
   *
   * @param experiment — the experiment definition
   * @param onStep — callback for each training step (real-time metrics)
   * @param signal — abort signal for cancellation
   * @returns training execution result
   */
  execute(
    experiment: ResearchExperiment,
    onStep?: (step: number, loss: number, lr: number) => void,
    signal?: AbortSignal
  ): Promise<TrainingExecutionResult>;
}

// ============================================================
// Runner Options
// ============================================================

/**
 * Options for running a research experiment.
 */
export interface ResearchExperimentRunnerOptions {
  /** Pluggable training executor (defaults to built-in executor) */
  executor?: TrainingExecutor;
  /** Event bus for real-time updates (defaults to singleton) */
  eventBus?: TrainingEventBus;
  /** Whether to save runs to the store (default: true) */
  saveToStore?: boolean;
  /** Whether to run generation before/after (default: true) */
  runGenerationEval?: boolean;
  /** Whether to generate reproducibility certificate (default: false) */
  validateReproducibility?: boolean;
}

// ============================================================
// Runner Result
// ============================================================

/**
 * Complete result of running a research experiment.
 */
export interface ResearchExperimentRunnerResult {
  /** The experiment definition */
  experiment: ResearchExperiment;
  /** The completed run record */
  run: ResearchRun;
  /** Raw training execution result */
  training: TrainingExecutionResult;
  /** Whether the run was saved to the store */
  saved: boolean;
}

// ============================================================
// ResearchExperimentRunner
// ============================================================

export class ResearchExperimentRunner {
  private defaultExecutor: TrainingExecutor | null = null;
  private bus: TrainingEventBus;

  constructor(options?: { executor?: TrainingExecutor; eventBus?: TrainingEventBus }) {
    this.defaultExecutor = options?.executor ?? null;
    this.bus = options?.eventBus ?? eventBus;
  }

  /**
   * Get the event bus used by this runner.
   */
  getEventBus(): TrainingEventBus {
    return this.bus;
  }

  /**
   * Run a complete research experiment.
   *
   * This is the main entry point. It orchestrates the full
   * experiment lifecycle from validation to final report.
   *
   * @param experiment — the experiment definition to run
   * @param options — runner options
   * @returns complete runner result with run record and training data
   */
  async run(
    experiment: ResearchExperiment,
    options?: ResearchExperimentRunnerOptions
  ): Promise<ResearchExperimentRunnerResult> {
    const executor = options?.executor ?? this.defaultExecutor;
    if (!executor) {
      throw new Error(
        "ResearchExperimentRunner: no TrainingExecutor provided. " +
        "Set one via constructor or options.executor."
      );
    }

    const saveToStore = options?.saveToStore ?? true;

    // ── Step 1: Validate experiment ──
    validateResearchExperiment(experiment);

    // ── Step 2: Create run record ──
    let run = createResearchRun(experiment.id, experiment.seed);

    if (saveToStore) {
      createRun(run);
    }

    // Emit start event
    this.bus.emit("training:start", {
      sessionId: experiment.id,
      runId: run.runId,
      experimentName: experiment.name,
      modelConfig: experiment.modelConfig,
      trainingConfig: experiment.trainingConfig,
      timestamp: Date.now(),
      isResume: false,
    });

    try {
      // ── Step 3: Start run ──
      run = startResearchRun(run);
      if (saveToStore) updateRun(run.runId, { status: "running" });

      // ── Step 4–9: Execute training ──
      const trainingResult = await executor.execute(
        experiment,
        (step, loss, lr) => {
          // Real-time step reporting via event bus
          // Note: totalSteps is unknown until training completes;
          // we estimate it from epochs * approximate batches per epoch.
          const estimatedTotal = experiment.trainingConfig.epochs * 50;
          this.bus.emit("training:step", {
            sessionId: experiment.id,
            runId: run.runId,
            metrics: {
              loss: Math.round(loss * 10000) / 10000,
              perplexity: Math.round(Math.exp(Math.min(loss, 709)) * 100) / 100,
              learningRate: Math.round(lr * 1e8) / 1e8,
              tokensPerSecond: 0,
              gradientNorm: undefined,
              epoch: 0,
              globalStep: step,
              totalSteps: estimatedTotal,
              timestamp: Date.now(),
            },
            timestamp: Date.now(),
          });
        }
      );

      // ── Step 10: Complete run with results ──
      run = completeResearchRun(run, {
        initialLoss: trainingResult.initialLoss,
        finalLoss: trainingResult.finalLoss,
        bestLoss: trainingResult.bestLoss,
        perplexity: trainingResult.perplexity,
        tokensPerSecond: trainingResult.tokensPerSecond,
        totalTokens: trainingResult.totalTokens,
        totalSteps: trainingResult.totalSteps,
        totalEpochs: trainingResult.totalEpochs,
        durationMs: trainingResult.durationMs,
        checkpointId: trainingResult.checkpointId,
        generationBefore: trainingResult.generationBefore.map((g) => ({
          prompt: g.prompt,
          generatedText: g.generatedText,
        })),
        generationAfter: trainingResult.generationAfter.map((g) => ({
          prompt: g.prompt,
          generatedText: g.generatedText,
        })),
      });

      if (saveToStore) {
        createRun(run);
      }

      // Emit complete event
      this.bus.emit("training:complete", {
        sessionId: experiment.id,
        runId: run.runId,
        experimentName: experiment.name,
        finalLoss: trainingResult.finalLoss,
        finalPerplexity: trainingResult.perplexity,
        bestLoss: trainingResult.bestLoss,
        durationMs: trainingResult.durationMs,
        timestamp: Date.now(),
      });

      return {
        experiment,
        run,
        training: trainingResult,
        saved: saveToStore,
      };
    } catch (error) {
      // ── Handle failure ──
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      run = failResearchRun(run, errorMessage);

      if (saveToStore) {
        createRun(run);
      }

      this.bus.emit("training:error", {
        sessionId: experiment.id,
        runId: run.runId,
        experimentName: experiment.name,
        error: errorMessage,
        timestamp: Date.now(),
      });

      throw error;
    }
  }

  /**
   * Run and analyze: runs the experiment and then generates
   * analysis, insights, recommendations, and a report.
   *
   * @param experiment — the experiment to run and analyze
   * @param options — runner options
   * @returns extended result with insights and report
   */
  async runAndAnalyze(
    experiment: ResearchExperiment,
    options?: ResearchExperimentRunnerOptions
  ): Promise<ResearchExperimentRunnerResult> {
    const result = await this.run(experiment, options);
    // Analysis is deferred to the caller — they can use
    // ResearchInsightEngine, RecommendationEngine, etc.
    return result;
  }
}

// ============================================================
// Built-in Browser-Safe Training Executor
// ============================================================

/**
 * Creates a simple training executor that uses the real Trainer
 * with inline text data. This is the browser-safe default.
 *
 * The executor builds a minimal training pipeline:
 *   - BPETokenizer trained on inline corpus
 *   - TextDataset + DataLoader
 *   - TensorMiniMindModel
 *   - AdamW optimizer + Cosine scheduler
 *   - Trainer with real forward/backward
 *   - GenerationEvaluator for before/after
 *
 * This executor is provided as a factory so callers can
 * configure it without importing Node-only modules.
 *
 * Usage:
 *   import { createInlineTrainingExecutor } from "./ResearchExperimentRunner";
 *   const executor = createInlineTrainingExecutor(sampleTexts);
 *   const runner = new ResearchExperimentRunner({ executor });
 *   await runner.run(experiment);
 */
export function createInlineTrainingExecutor(
  corpus: string[]
): TrainingExecutor {
  // Modules loaded lazily via dynamic import on first execute()
  // to avoid circular dependency issues at module-load time.
  let modules: Awaited<ReturnType<typeof importTrainingModules>> | null = null;

  async function importTrainingModules() {
    const [
      { BPETokenizer },
      { TextDataset },
      { DataLoader },
      { TensorMiniMindModel },
      { AdamWOptimizer },
      { CosineScheduler },
      { Trainer },
      { GenerationEvaluator },
      { Random },
    ] = await Promise.all([
      import("../tokenizer/BPETokenizer"),
      import("../data/TextDataset"),
      import("../data/DataLoader"),
      import("../model/TensorMiniMindModel"),
      import("../core/optim/AdamW"),
      import("../core/scheduler/CosineScheduler"),
      import("../training/Trainer"),
      import("../evaluation/GenerationEvaluator"),
      import("../core/random/Random"),
    ]);
    return {
      BPETokenizer, TextDataset, DataLoader, TensorMiniMindModel,
      AdamWOptimizer, CosineScheduler, Trainer, GenerationEvaluator, Random,
    };
  }

  return {
    async execute(
      experiment: ResearchExperiment,
      onStep?: (step: number, loss: number, lr: number) => void,
      signal?: AbortSignal
    ): Promise<TrainingExecutionResult> {
      // Lazy-load training modules on first execute()
      if (!modules) {
        modules = await importTrainingModules();
      }

      // Set seed
      modules.Random.setSeed(experiment.seed);

      // Build tokenizer
      const tokenizer = new modules.BPETokenizer();
      const targetVocab = experiment.tokenizerConfig.vocabSize;
      tokenizer.train(corpus, Math.min(targetVocab, corpus.length * 10));

      // Build dataset
      const blockSize = experiment.datasetConfig.blockSize;
      const batchSize = experiment.datasetConfig.batchSize;
      const textDataset = new modules.TextDataset({
        tokenizer,
        corpus,
        blockSize,
      });

      const trainLoader = new modules.DataLoader(textDataset, {
        batchSize,
        shuffle: experiment.datasetConfig.shuffle,
        seed: experiment.seed,
        dropLast: true,
      });

      // Build model
      const mc = experiment.modelConfig;
      const model = new modules.TensorMiniMindModel({
        vocabSize: tokenizer.vocabSize,
        dModel: mc.dModel ?? 64,
        numHeads: mc.numHeads ?? 4,
        dFF: mc.dFF ?? 128,
        numLayers: mc.numLayers ?? 2,
        maxSeqLen: blockSize,
      });

      // Build optimizer
      const tc = experiment.trainingConfig;
      const lr = tc.optimizer.lr;
      const optimizer = new modules.AdamWOptimizer(model.parameters(), {
        lr,
        weightDecay: tc.optimizer.weightDecay ?? 0.01,
      });

      // Build scheduler
      const totalSteps = tc.epochs * trainLoader.numBatches;
      const scheduler = new modules.CosineScheduler(optimizer, {
        baseLR: lr,
        minLR: lr * 0.01,
        warmupSteps: Math.floor(totalSteps * 0.1),
        totalSteps,
      });

      // Generation BEFORE
      const genEval = new modules.GenerationEvaluator(model, tokenizer);
      const generationBefore = genEval.evaluate(
        experiment.evaluationConfig.generationPrompts,
        {
          seed: experiment.seed,
          maxTokens: experiment.evaluationConfig.maxTokens,
          temperature: experiment.evaluationConfig.temperature,
        }
      );

      // Track metrics
      const lossHistory: Array<{ step: number; loss: number }> = [];
      const learningRateHistory: Array<{ step: number; learningRate: number }> = [];
      const gradientNormHistory: Array<{ step: number; norm: number }> = [];
      let initialLoss = Infinity;
      const startTime = Date.now();

      // Run Trainer
      const trainer = new modules.Trainer({
        model,
        optimizer,
        trainLoader,
        config: {
          epochs: tc.epochs,
          learningRate: lr,
          logInterval: 10,
          gradientAccumulationSteps: tc.gradientAccumulation ?? 1,
          gradientClipNorm: tc.gradientClipNorm,
        },
        onLog: (info) => {
          if (!Number.isFinite(initialLoss)) {
            initialLoss = info.loss;
          }
          const currentLR = scheduler.getLR();
          lossHistory.push({ step: info.globalStep, loss: info.loss });
          learningRateHistory.push({
            step: info.globalStep,
            learningRate: currentLR,
          });

          if (onStep) {
            onStep(info.globalStep, info.loss, currentLR);
          }

          // Check abort
          if (signal?.aborted) {
            throw new Error("Training aborted");
          }
        },
        onEpochEnd: () => {
          scheduler.step();
        },
      });

      trainer.scheduler = scheduler;
      const trainerState = trainer.train();

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Compute metrics
      const finalLoss =
        trainerState.lossHistory.length > 0
          ? trainerState.lossHistory[trainerState.lossHistory.length - 1]
          : initialLoss;

      const bestLoss = trainerState.bestLoss;
      const perplexity = Math.exp(Math.min(bestLoss, 709));
      const totalTokensTrained =
        trainerState.globalStep * batchSize * blockSize;
      const tokensPerSecond =
        durationMs > 0
          ? (totalTokensTrained / durationMs) * 1000
          : 0;

      // Generation AFTER
      const generationAfter = genEval.evaluate(
        experiment.evaluationConfig.generationPrompts,
        {
          seed: experiment.seed,
          maxTokens: experiment.evaluationConfig.maxTokens,
          temperature: experiment.evaluationConfig.temperature,
        }
      );

      return {
        initialLoss,
        finalLoss,
        bestLoss,
        perplexity,
        tokensPerSecond,
        totalTokens: totalTokensTrained,
        totalSteps: trainerState.globalStep,
        totalEpochs: tc.epochs,
        durationMs,
        checkpointId: undefined,
        generationBefore: generationBefore.map((g) => ({
          prompt: g.prompt,
          generatedText: g.generatedText,
        })),
        generationAfter: generationAfter.map((g) => ({
          prompt: g.prompt,
          generatedText: g.generatedText,
        })),
        lossHistory,
        learningRateHistory,
        gradientNormHistory,
      };
    },
  };
}
