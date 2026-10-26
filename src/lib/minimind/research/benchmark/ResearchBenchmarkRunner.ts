// ============================================================
// MiniMind — research/benchmark/ResearchBenchmarkRunner.ts
// ============================================================
// Phase 62: Real research benchmark runner.
//
// Runs real training benchmarks using the actual Trainer, Model,
// and text data. Produces verifiable, reproducible metrics —
// not synthetic data, not proxy loss, not mock throughput.
//
// Key differences from evaluation/BenchmarkRunner:
//   - Real text corpus (not synthetic random token IDs)
//   - Real cross-entropy loss (not sum(logits) proxy)
//   - Real generation evaluation (not random output)
//   - Multi-run statistical aggregation (mean, std, min/max)
//   - Convergence detection (not fixed step count)
//   - Browser-safe (inline corpus, no fs/path)
//
// Design principles:
//   - Reuse existing Trainer — do NOT modify training modules
//   - Real data only — no synthetic metrics, no hardcoded values
//   - Statistically meaningful — multiple runs with aggregation
//   - Browser-safe — no Node.js dependencies
// ============================================================

import type { ModelConfigEntry } from "../../experiments/ModelRegistry";
import type { TrainingRecipe } from "../../experiments/TrainingRecipe";
import type { DatasetConfig, TokenizerConfig, EvaluationConfig } from "../ResearchExperiment";
import type { TrainingExecutionResult } from "../ResearchExperimentRunner";

// ============================================================
// Benchmark Profile
// ============================================================

/**
 * A benchmark profile defines WHAT to benchmark and HOW.
 *
 * Contains the full experiment config (model, training, dataset,
 * tokenizer, evaluation) plus benchmarking parameters like the
 * number of runs for statistical significance.
 */
export interface ResearchBenchmarkProfile {
  /** Human-readable name for this benchmark profile */
  name: string;

  /** Model architecture configuration */
  modelConfig: ModelConfigEntry;

  /** Training hyperparameters */
  trainingConfig: TrainingRecipe;

  /** Dataset configuration (inline corpus recommended for browser) */
  datasetConfig: DatasetConfig;

  /** Tokenizer configuration */
  tokenizerConfig: TokenizerConfig;

  /** Evaluation configuration */
  evaluationConfig: EvaluationConfig;

  /** Number of runs for statistical significance (default: 3) */
  numRuns?: number;

  /** Random seed base (incremented per run) */
  seed?: number;

  /** Maximum total duration in ms (optional, for timeout) */
  maxDurationMs?: number;

  /** Inline text corpus (browser-safe alternative to filePath) */
  corpus: string[];
}

// ============================================================
// Per-Run Benchmark Result
// ============================================================

/**
 * Result of a single benchmark run.
 */
export interface ResearchBenchmarkRunResult {
  /** Run index (0-based) */
  runIndex: number;

  /** Seed used for this run */
  seed: number;

  /** Initial loss */
  initialLoss: number;

  /** Final loss */
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

  /** Duration in milliseconds */
  durationMs: number;

  /** Per-step loss history */
  lossHistory: Array<{ step: number; loss: number }>;

  /** Per-step learning rate history */
  learningRateHistory: Array<{ step: number; learningRate: number }>;

  /** Per-step gradient norm history (post-clip) */
  gradientNormHistory: Array<{ step: number; norm: number }>;

  /** Mean gradient norm across all steps */
  meanGradientNorm: number;

  /** Maximum gradient norm observed */
  maxGradientNorm: number;

  /** Variance of gradient norms */
  gradientNormVariance: number;

  /** Whether divergence was detected (finalLoss > initialLoss * 1.2) */
  divergenceDetected: boolean;

  /** Whether instability was detected (loss spikes or high variance) */
  instabilityDetected: boolean;

  /** Total model parameter count */
  parameterCount: number;

  /** Generation samples after training */
  generationSamples: Array<{ prompt: string; generatedText: string }>;
}

// ============================================================
// Aggregate Statistics
// ============================================================

/**
 * Statistical aggregate of a metric across multiple runs.
 */
export interface BenchmarkMetricStats {
  /** Arithmetic mean */
  mean: number;
  /** Sample standard deviation */
  std: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Individual run values */
  values: number[];
}

/**
 * Aggregated benchmark result across all runs.
 */
export interface ResearchBenchmarkAggregate {
  /** Final loss statistics */
  loss: BenchmarkMetricStats;

  /** Best loss statistics */
  bestLoss: BenchmarkMetricStats;

  /** Perplexity statistics */
  perplexity: BenchmarkMetricStats;

  /** Throughput statistics (tokens/sec) */
  throughput: BenchmarkMetricStats;

  /** Duration statistics (ms) */
  durationMs: BenchmarkMetricStats;

  /** Number of runs completed */
  runsCompleted: number;

  /** Total number of runs attempted */
  runsAttempted: number;

  /** Total model parameters */
  totalParams: number;
}

// ============================================================
// Full Benchmark Result
// ============================================================

/**
 * Complete result of a research benchmark run.
 */
export interface ResearchBenchmarkResult {
  /** The profile that was benchmarked */
  profile: ResearchBenchmarkProfile;

  /** Individual run results */
  runs: ResearchBenchmarkRunResult[];

  /** Aggregated statistics */
  aggregate: ResearchBenchmarkAggregate;

  /** When the benchmark started */
  startedAt: number;

  /** When the benchmark completed */
  completedAt: number;

  /** Total wall-clock duration */
  totalDurationMs: number;
}

// ============================================================
// Convergence Statistics
// ============================================================

/**
 * Convergence analysis extracted from loss history.
 */
export interface ConvergenceStats {
  /** Step at which loss first dropped below threshold */
  convergenceStep: number | null;

  /** Loss at convergence step */
  convergenceLoss: number | null;

  /** Threshold used for convergence detection */
  threshold: number;

  /** Fractional loss reduction from initial to final */
  lossReduction: number;

  /** Whether convergence was detected */
  converged: boolean;
}

// ============================================================
// Statistics Helpers
// ============================================================

/**
 * Compute mean of an array of numbers.
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute sample standard deviation.
 */
function std(values: number[], avg: number): number {
  if (values.length <= 1) return 0;
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1));
}

/**
 * Compute aggregate statistics from individual values.
 */
function computeMetricStats(values: number[]): BenchmarkMetricStats {
  const avg = mean(values);
  return {
    mean: avg,
    std: std(values, avg),
    min: Math.min(...values),
    max: Math.max(...values),
    values: [...values],
  };
}

// ============================================================
// Convergence Detection
// ============================================================

/**
 * Detect convergence from loss history.
 *
 * Uses the same plateau-detection algorithm as TrainingAnalyzer:
 * a run has converged when the fractional change in loss over
 * the final 25% of steps is below 3% and the coefficient of
 * variation of those deltas is below 2.0.
 *
 * @param lossHistory — per-step loss values (assumed in order)
 * @param threshold — fractional change threshold (default 0.03)
 * @returns convergence statistics
 */
export function detectConvergence(
  lossHistory: Array<{ step: number; loss: number }>,
  threshold: number = 0.03
): ConvergenceStats {
  if (lossHistory.length < 10) {
    return {
      convergenceStep: null,
      convergenceLoss: null,
      threshold,
      lossReduction: 0,
      converged: false,
    };
  }

  const losses = lossHistory.map((p) => p.loss);
  const initialLoss = losses[0];
  const finalLoss = losses[losses.length - 1];
  const lossReduction = initialLoss > 0
    ? (initialLoss - finalLoss) / initialLoss
    : 0;

  // Check last 25% of steps for plateau
  const windowStart = Math.floor(lossHistory.length * 0.75);
  const window = lossHistory.slice(windowStart);
  const windowLosses = window.map((p) => p.loss);

  // Compute fractional changes in the window
  const deltas: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (windowLosses[i - 1] > 0) {
      deltas.push(Math.abs(windowLosses[i] - windowLosses[i - 1]) / windowLosses[i - 1]);
    }
  }

  const avgDelta = mean(deltas);
  const deltaStd = std(deltas, avgDelta);
  const deltaCV = avgDelta > 0 ? deltaStd / avgDelta : 0;

  // Converged if average delta is small AND consistent
  const converged = avgDelta < threshold && deltaCV < 2.0;

  if (converged) {
    // Find the first step in the window where loss stabilizes
    // (fractional change below threshold for 3 consecutive steps)
    let convergenceStep: number | null = null;
    for (let i = 1; i < window.length - 2; i++) {
      const d1 = windowLosses[i] > 0
        ? Math.abs(windowLosses[i] - windowLosses[i - 1]) / windowLosses[i - 1]
        : 0;
      const d2 = windowLosses[i + 1] > 0
        ? Math.abs(windowLosses[i + 1] - windowLosses[i]) / windowLosses[i]
        : 0;
      const d3 = windowLosses[i + 2] > 0
        ? Math.abs(windowLosses[i + 2] - windowLosses[i + 1]) / windowLosses[i + 1]
        : 0;
      if (d1 < threshold && d2 < threshold && d3 < threshold) {
        convergenceStep = window[i - 1].step;
        break;
      }
    }

    return {
      convergenceStep: convergenceStep ?? window[0].step,
      convergenceLoss: convergenceStep !== null
        ? windowLosses[window.findIndex((p) => p.step === convergenceStep)]
        : windowLosses[0],
      threshold,
      lossReduction,
      converged: true,
    };
  }

  return {
    convergenceStep: null,
    convergenceLoss: null,
    threshold,
    lossReduction,
    converged: false,
  };
}

// ============================================================
// Single Run Executor
// ============================================================

/**
 * Execute a single benchmark run using real training infrastructure.
 *
 * This uses the same pattern as createInlineTrainingExecutor in
 * ResearchExperimentRunner, building a complete pipeline:
 * BPETokenizer → TextDataset → DataLoader → TensorMiniMindModel →
 * AdamW → CosineScheduler → Trainer.
 *
 * All metrics come from REAL forward/backward passes on REAL text.
 * No synthetic data, no mocked loss, no hardcoded perplexity.
 */
async function executeSingleBenchmarkRun(
  profile: ResearchBenchmarkProfile,
  runIndex: number,
  seed: number,
  signal?: AbortSignal
): Promise<ResearchBenchmarkRunResult> {
  // Lazy-load training modules to avoid circular dependency issues
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
    { GradientNormTracker },
  ] = await Promise.all([
    import("../../tokenizer/BPETokenizer"),
    import("../../data/TextDataset"),
    import("../../data/DataLoader"),
    import("../../model/TensorMiniMindModel"),
    import("../../core/optim/AdamW"),
    import("../../core/scheduler/CosineScheduler"),
    import("../../training/Trainer"),
    import("../../evaluation/GenerationEvaluator"),
    import("../../core/random/Random"),
    import("../../experiments/campaign/GradientNormTracker"),
  ]);

  // Set seed for reproducibility
  Random.setSeed(seed);

  // Build tokenizer
  const tokenizer = new BPETokenizer();
  const targetVocab = profile.tokenizerConfig.vocabSize;
  tokenizer.train(
    profile.corpus,
    Math.min(targetVocab, profile.corpus.length * 10)
  );

  // Build dataset
  const blockSize = profile.datasetConfig.blockSize;
  const batchSize = profile.datasetConfig.batchSize;
  const textDataset = new TextDataset({
    tokenizer,
    corpus: profile.corpus,
    blockSize,
  });

  const trainLoader = new DataLoader(textDataset, {
    batchSize,
    shuffle: profile.datasetConfig.shuffle,
    seed,
    dropLast: true,
  });

  // Build model
  const mc = profile.modelConfig;
  const model = new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: mc.dModel ?? 64,
    numHeads: mc.numHeads ?? 4,
    dFF: mc.dFF ?? 128,
    numLayers: mc.numLayers ?? 2,
    maxSeqLen: blockSize,
  });

  // Count parameters
  const totalParams = model.parameters().reduce(
    (sum, p) => sum + p.data.length,
    0
  );

  // Build optimizer
  const tc = profile.trainingConfig;
  const lr = tc.optimizer.lr;
  const baseOptimizer = new AdamWOptimizer(model.parameters(), {
    lr,
    weightDecay: tc.optimizer.weightDecay ?? 0.01,
  });

  // Wrap in GradientNormTracker for stability metrics
  const gradNormTracker = new GradientNormTracker(
    baseOptimizer,
    model.parameters(),
  );

  // Build scheduler
  const totalSteps = tc.epochs * trainLoader.numBatches;
  const scheduler = new CosineScheduler(baseOptimizer, {
    baseLR: lr,
    minLR: lr * 0.01,
    warmupSteps: Math.floor(totalSteps * 0.1),
    totalSteps,
  });

  // Generation BEFORE (record initial capability)
  const genEval = new GenerationEvaluator(model, tokenizer);
  // We only need generation AFTER for benchmarks

  // Track metrics
  const lossHistory: Array<{ step: number; loss: number }> = [];
  const learningRateHistory: Array<{ step: number; learningRate: number }> = [];
  let initialLoss = Infinity;

  const startTime = performance.now();

  // Run Trainer
  const trainer = new Trainer({
    model,
    optimizer: gradNormTracker,
    trainLoader,
    config: {
      epochs: tc.epochs,
      learningRate: lr,
      logInterval: Math.max(1, Math.floor(totalSteps / 20)), // ~20 log points
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

      if (signal?.aborted) {
        throw new Error("Benchmark aborted");
      }
    },
    onEpochEnd: () => {
      scheduler.step();
    },
  });

  trainer.scheduler = scheduler;
  const trainerState = trainer.train();

  const endTime = performance.now();
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
  const generationSamples = genEval.evaluate(
    profile.evaluationConfig.generationPrompts,
    {
      seed,
      maxTokens: profile.evaluationConfig.maxTokens,
      temperature: profile.evaluationConfig.temperature,
    }
  );

  // ── Compute gradient norm statistics ──
  const gradNorms = gradNormTracker.normHistory.map((e) => e.norm);
  const gradNormCount = gradNorms.length;
  const meanGradientNorm =
    gradNormCount > 0
      ? gradNorms.reduce((a, b) => a + b, 0) / gradNormCount
      : 0;
  const maxGradientNorm =
    gradNormCount > 0 ? Math.max(...gradNorms) : 0;
  const gradientNormVariance =
    gradNormCount > 1
      ? (() => {
          const mean = meanGradientNorm;
          const sqDiffs = gradNorms.map((n) => (n - mean) ** 2);
          return sqDiffs.reduce((a, b) => a + b, 0) / (gradNormCount - 1);
        })()
      : 0;

  // ── Detect divergence: final loss > 1.2× initial loss ──
  const divergenceDetected =
    initialLoss > 0 && finalLoss > initialLoss * 1.2;

  // ── Detect instability: loss spikes or high CV ──
  const losses = lossHistory.map((p) => p.loss);
  let instabilityDetected = false;
  if (losses.length >= 5) {
    // Check for spikes: any loss > 2× the running average of previous 5
    for (let i = 5; i < losses.length; i++) {
      const runningAvg =
        losses.slice(i - 5, i).reduce((a, b) => a + b, 0) / 5;
      if (runningAvg > 0 && losses[i] > runningAvg * 2.0) {
        instabilityDetected = true;
        break;
      }
    }
    // Also check if coefficient of variation of deltas is high
    if (!instabilityDetected) {
      const deltas: number[] = [];
      for (let i = 1; i < losses.length; i++) {
        deltas.push(losses[i] - losses[i - 1]);
      }
      const deltaMean =
        deltas.reduce((a, b) => a + Math.abs(b), 0) / deltas.length;
      if (deltaMean > 0) {
        const deltaVar =
          deltas.reduce((s, d) => s + (d - deltaMean) ** 2, 0) /
          (deltas.length - 1);
        const deltaStd = Math.sqrt(deltaVar);
        const deltaCV = deltaStd / deltaMean;
        if (deltaCV > 1.5) {
          instabilityDetected = true;
        }
      }
    }
  }

  return {
    runIndex,
    seed,
    initialLoss,
    finalLoss,
    bestLoss,
    perplexity,
    tokensPerSecond,
    totalTokens: totalTokensTrained,
    totalSteps: trainerState.globalStep,
    durationMs,
    lossHistory,
    learningRateHistory,
    gradientNormHistory: gradNormTracker.normHistory.map((e) => ({
      step: e.step,
      norm: e.norm,
    })),
    meanGradientNorm,
    maxGradientNorm,
    gradientNormVariance,
    divergenceDetected,
    instabilityDetected,
    parameterCount: totalParams,
    generationSamples: generationSamples.map((g) => ({
      prompt: g.prompt,
      generatedText: g.generatedText,
    })),
  };
}

// ============================================================
// ResearchBenchmarkRunner
// ============================================================

/**
 * ResearchBenchmarkRunner — runs real training benchmarks with
 * statistical aggregation across multiple runs.
 *
 * Usage:
 *   const runner = new ResearchBenchmarkRunner();
 *   const result = await runner.runBenchmark({
 *     name: "TinyStories Baseline",
 *     modelConfig: getModelConfig("tiny"),
 *     trainingConfig: loadRecipe("tinystories-tiny"),
 *     datasetConfig: { name: "tinystories", blockSize: 64, batchSize: 8, shuffle: true },
 *     tokenizerConfig: { type: "bpe", vocabSize: 32000 },
 *     evaluationConfig: { ... },
 *     numRuns: 3,
 *     corpus: sampleTexts,
 *   });
 */
export class ResearchBenchmarkRunner {
  /**
   * Run a complete research benchmark.
   *
   * Executes `numRuns` independent training runs (each with a
   * different seed) and aggregates the results with statistical
   * metrics (mean, std, min, max).
   *
   * @param profile — the benchmark profile defining what to measure
   * @param signal — optional abort signal for cancellation
   * @returns complete benchmark result with per-run and aggregate data
   */
  async runBenchmark(
    profile: ResearchBenchmarkProfile,
    signal?: AbortSignal
  ): Promise<ResearchBenchmarkResult> {
    const numRuns = profile.numRuns ?? 3;
    const baseSeed = profile.seed ?? 42;

    const startedAt = Date.now();
    const runs: ResearchBenchmarkRunResult[] = [];

    for (let i = 0; i < numRuns; i++) {
      if (signal?.aborted) {
        break;
      }

      // Each run gets a different seed for statistical independence
      const runSeed = baseSeed + i * 1000;

      try {
        const runResult = await executeSingleBenchmarkRun(
          profile,
          i,
          runSeed,
          signal
        );
        runs.push(runResult);
      } catch (error) {
        // Skip failed runs — they don't contribute to aggregate
        if (signal?.aborted) break;
        // Re-throw non-abort errors
        if (
          error instanceof Error &&
          error.message !== "Benchmark aborted"
        ) {
          throw error;
        }
      }
    }

    const completedAt = Date.now();

    // Compute aggregate statistics
    const aggregate = computeAggregate(runs, profile.modelConfig);

    return {
      profile,
      runs,
      aggregate,
      startedAt,
      completedAt,
      totalDurationMs: completedAt - startedAt,
    };
  }

  /**
   * Run a single benchmark (convenience method for quick checks).
   *
   * Equivalent to runBenchmark with numRuns = 1.
   */
  async runSingleBenchmark(
    profile: ResearchBenchmarkProfile,
    signal?: AbortSignal
  ): Promise<ResearchBenchmarkResult> {
    return this.runBenchmark(
      { ...profile, numRuns: 1 },
      signal
    );
  }

  /**
   * Benchmark from a ResearchExperiment-like object.
   *
   * Convenience adapter that extracts the profile from an
   * experiment definition and a text corpus.
   */
  async benchmarkExperiment(
    experiment: {
      name: string;
      seed?: number;
      modelConfig: ModelConfigEntry;
      trainingConfig: TrainingRecipe;
      datasetConfig: DatasetConfig;
      tokenizerConfig: TokenizerConfig;
      evaluationConfig: EvaluationConfig;
    },
    corpus: string[],
    numRuns: number = 3,
    signal?: AbortSignal
  ): Promise<ResearchBenchmarkResult> {
    const profile: ResearchBenchmarkProfile = {
      name: experiment.name,
      modelConfig: experiment.modelConfig,
      trainingConfig: experiment.trainingConfig,
      datasetConfig: experiment.datasetConfig,
      tokenizerConfig: experiment.tokenizerConfig,
      evaluationConfig: experiment.evaluationConfig,
      numRuns,
      seed: experiment.seed,
      corpus,
    };

    return this.runBenchmark(profile, signal);
  }

  /**
   * Create a structured benchmark report from a result.
   *
   * Produces a comprehensive summary suitable for display,
   * comparison, and export.
   */
  createBenchmarkReport(
    result: ResearchBenchmarkResult
  ): ResearchBenchmarkReport {
    const { aggregate, runs, profile } = result;

    // Detect convergence for each run
    const convergenceResults = runs.map((run) =>
      detectConvergence(run.lossHistory)
    );

    const convergenceStats = {
      runsConverged: convergenceResults.filter((c) => c.converged).length,
      totalRuns: runs.length,
      avgLossReduction: mean(
        convergenceResults.map((c) => c.lossReduction)
      ),
    };

    // Build generation comparison
    const generationSummary = runs.length > 0
      ? runs[0].generationSamples.map((sample, idx) => ({
          prompt: sample.prompt,
          samples: runs.map((r) => r.generationSamples[idx]?.generatedText ?? ""),
        }))
      : [];

    return {
      profile: profile.name,
      model: profile.modelConfig.label,
      recipe: profile.trainingConfig.name,
      dataset: profile.datasetConfig.name,
      numRuns: runs.length,
      totalDurationMs: result.totalDurationMs,
      metrics: {
        finalLoss: aggregate.loss,
        bestLoss: aggregate.bestLoss,
        perplexity: aggregate.perplexity,
        throughput: aggregate.throughput,
        durationMs: aggregate.durationMs,
        totalParams: aggregate.totalParams,
      },
      convergence: convergenceStats,
      generation: generationSummary,
      timestamp: result.completedAt,
    };
  }
}

// ============================================================
// Benchmark Report Type
// ============================================================

/**
 * A structured benchmark report suitable for display and comparison.
 *
 * Aggregates multi-run statistics, convergence analysis, and
 * generation samples into a single comprehensive report.
 */
export interface ResearchBenchmarkReport {
  /** Benchmark profile name */
  profile: string;

  /** Model label */
  model: string;

  /** Training recipe name */
  recipe: string;

  /** Dataset name */
  dataset: string;

  /** Number of runs completed */
  numRuns: number;

  /** Total wall-clock duration across all runs */
  totalDurationMs: number;

  /** Aggregated metrics */
  metrics: {
    finalLoss: BenchmarkMetricStats;
    bestLoss: BenchmarkMetricStats;
    perplexity: BenchmarkMetricStats;
    throughput: BenchmarkMetricStats;
    durationMs: BenchmarkMetricStats;
    totalParams: number;
  };

  /** Convergence analysis */
  convergence: {
    runsConverged: number;
    totalRuns: number;
    avgLossReduction: number;
  };

  /** Generation output comparison across runs */
  generation: Array<{
    prompt: string;
    samples: string[];
  }>;

  /** When the report was generated */
  timestamp: number;
}

// ============================================================
// Aggregate Computation
// ============================================================

/**
 * Compute aggregate statistics across all runs.
 */
function computeAggregate(
  runs: ResearchBenchmarkRunResult[],
  modelConfig: ModelConfigEntry
): ResearchBenchmarkAggregate {
  if (runs.length === 0) {
    const empty: BenchmarkMetricStats = {
      mean: 0, std: 0, min: 0, max: 0, values: [],
    };
    return {
      loss: empty,
      bestLoss: empty,
      perplexity: empty,
      throughput: empty,
      durationMs: empty,
      runsCompleted: 0,
      runsAttempted: 0,
      totalParams: estimateParams(modelConfig),
    };
  }

  return {
    loss: computeMetricStats(runs.map((r) => r.finalLoss)),
    bestLoss: computeMetricStats(runs.map((r) => r.bestLoss)),
    perplexity: computeMetricStats(runs.map((r) => r.perplexity)),
    throughput: computeMetricStats(runs.map((r) => r.tokensPerSecond)),
    durationMs: computeMetricStats(runs.map((r) => r.durationMs)),
    runsCompleted: runs.length,
    runsAttempted: runs.length,
    totalParams: estimateParams(modelConfig),
  };
}

/**
 * Estimate total trainable parameters from model config.
 *
 * Uses the same formula as ModelRegistry.estimateParams():
 *   embParams = vocabSize * dModel * 2 (token + position)
 *   perLayer = 4 * dModel^2 + 2 * dModel * dFF + ...
 *   total = embParams + numLayers * perLayer + dModel (ln)
 *
 * For simplicity we use a close approximation:
 *   params ≈ vocabSize * dModel * 2 + numLayers * (4 * dModel^2 + 2 * dModel * dFF)
 */
function estimateParams(config: ModelConfigEntry): number {
  const dModel = config.dModel ?? 128;
  const numLayers = config.numLayers ?? 4;
  const dFF = config.dFF ?? 512;
  const vocabSize = config.vocabSize ?? 32000;

  const embedding = vocabSize * dModel * 2; // token + position embeddings
  const perLayer = 4 * dModel * dModel + 2 * dModel * dFF + 4 * dModel; // attn + ffn + norms
  const total = embedding + numLayers * perLayer;

  return total;
}

// ============================================================
// Report Formatting
// ============================================================

/**
 * Format a ResearchBenchmarkReport as a human-readable string.
 */
export function formatBenchmarkReport(
  report: ResearchBenchmarkReport
): string {
  const m = report.metrics;

  const lines: string[] = [];
  lines.push("=".repeat(60));
  lines.push("RESEARCH BENCHMARK REPORT");
  lines.push("=".repeat(60));
  lines.push(`Profile:   ${report.profile}`);
  lines.push(`Model:     ${report.model}`);
  lines.push(`Recipe:    ${report.recipe}`);
  lines.push(`Dataset:   ${report.dataset}`);
  lines.push(`Runs:      ${report.numRuns}`);
  lines.push(`Duration:  ${(report.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push(`Params:    ${m.totalParams.toLocaleString()}`);
  lines.push("");
  lines.push("─ Metrics ─");
  lines.push(
    `  Loss:        ${m.finalLoss.mean.toFixed(4)} ± ${m.finalLoss.std.toFixed(4)}`
  );
  lines.push(
    `  Best Loss:   ${m.bestLoss.mean.toFixed(4)} ± ${m.bestLoss.std.toFixed(4)}`
  );
  lines.push(
    `  Perplexity:  ${m.perplexity.mean.toFixed(2)} ± ${m.perplexity.std.toFixed(2)}`
  );
  lines.push(
    `  Throughput:  ${m.throughput.mean.toFixed(0)} ± ${m.throughput.std.toFixed(0)} tok/s`
  );
  lines.push(
    `  Step Time:   ${(m.durationMs.mean / 1000).toFixed(1)} ± ${(m.durationMs.std / 1000).toFixed(1)}s`
  );
  lines.push("");
  lines.push("─ Convergence ─");
  lines.push(
    `  Converged:   ${report.convergence.runsConverged}/${report.convergence.totalRuns}`
  );
  lines.push(
    `  Reduction:   ${(report.convergence.avgLossReduction * 100).toFixed(1)}%`
  );
  lines.push("");
  if (report.generation.length > 0) {
    lines.push("─ Generation Samples ─");
    for (const g of report.generation) {
      lines.push(`  Prompt: "${g.prompt}"`);
      lines.push(`  Output: "${g.samples[0]?.slice(0, 80)}${(g.samples[0]?.length ?? 0) > 80 ? "..." : ""}"`);
      lines.push("");
    }
  }
  lines.push("=".repeat(60));

  return lines.join("\n");
}

/**
 * Compare two benchmark reports and return a structured comparison.
 */
export function compareBenchmarkReports(
  a: ResearchBenchmarkReport,
  b: ResearchBenchmarkReport
): {
  lossImprovement: number; // negative = a is better
  throughputImprovement: number; // positive = a is faster
  perplexityImprovement: number; // negative = a is better
  summary: string;
} {
  const lossImprovement =
    b.metrics.bestLoss.mean > 0
      ? (a.metrics.bestLoss.mean - b.metrics.bestLoss.mean) /
        b.metrics.bestLoss.mean
      : 0;

  const throughputImprovement =
    b.metrics.throughput.mean > 0
      ? (a.metrics.throughput.mean - b.metrics.throughput.mean) /
        b.metrics.throughput.mean
      : 0;

  const perplexityImprovement =
    b.metrics.perplexity.mean > 0
      ? (a.metrics.perplexity.mean - b.metrics.perplexity.mean) /
        b.metrics.perplexity.mean
      : 0;

  const summaryParts: string[] = [];
  if (lossImprovement < -0.01) {
    summaryParts.push(
      `${a.model} has ${Math.abs(lossImprovement * 100).toFixed(1)}% lower loss than ${b.model}`
    );
  } else if (lossImprovement > 0.01) {
    summaryParts.push(
      `${a.model} has ${(lossImprovement * 100).toFixed(1)}% higher loss than ${b.model}`
    );
  } else {
    summaryParts.push(`Loss is comparable between ${a.model} and ${b.model}`);
  }

  if (throughputImprovement > 0.01) {
    summaryParts.push(
      `${a.model} is ${(throughputImprovement * 100).toFixed(1)}% faster`
    );
  }

  return {
    lossImprovement,
    throughputImprovement,
    perplexityImprovement,
    summary: summaryParts.join(". ") + ".",
  };
}
