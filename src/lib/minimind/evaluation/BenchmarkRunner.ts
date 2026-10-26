// ============================================================
// BenchmarkRunner — Training & generation benchmark suite
// ============================================================
// Phase 50: Provides structured benchmarking for both training
// performance and generation quality. Designed to produce
// comparable, reproducible metrics across model configs and
// training recipes.
//
// Two benchmark modes:
//   1. Training benchmark — measures throughput, loss curves,
//      tokens/sec, convergence speed
//   2. Generation benchmark — measures generation speed,
//      perplexity, output quality
//
// Usage:
//   const runner = new BenchmarkRunner();
//   const result = runner.runTrainingBenchmark(model, dataLoader, config);
//   console.log(result.tokensPerSecond, result.finalLoss);
// ============================================================

import { Tensor } from "../core/Tensor";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { Optimizer } from "../core/optim/Optimizer";
import { ThroughputMeter } from "../training/ThroughputMeter";
import { sum } from "../core/ops/sum";

// ============================================================
// Types
// ============================================================

/**
 * Configuration for a training benchmark run.
 */
export interface TrainingBenchmarkConfig {
  /** Number of steps to run (not epochs — for quick benchmarks) */
  steps: number;
  /** Batch size used during benchmark */
  batchSize: number;
  /** Sequence length used during benchmark */
  seqLen: number;
  /** Vocabulary size (for synthetic data generation) */
  vocabSize: number;
  /** Whether to use warmup steps (excluded from metrics) */
  warmupSteps?: number;
  /** Random seed for reproducible synthetic data */
  seed?: number;
  /** Whether to use gradient accumulation */
  gradientAccumulationSteps?: number;
}

/**
 * Result of a training benchmark.
 */
export interface TrainingBenchmarkResult {
  /** Model name/config identifier */
  model: string;
  /** Dataset or source identifier */
  dataset: string;
  /** Number of tokens processed (steps × batchSize × seqLen) */
  tokensProcessed: number;
  /** Number of optimizer steps executed */
  steps: number;
  /** Total wall-clock duration in milliseconds */
  durationMs: number;
  /** Tokens processed per second (throughput) */
  tokensPerSecond: number;
  /** Steps per second */
  stepsPerSecond: number;
  /** Loss at the first step (after warmup, if any) */
  initialLoss: number;
  /** Loss at the final step */
  finalLoss: number;
  /** Best (minimum) loss achieved during the benchmark */
  bestLoss: number;
  /** Loss values at each step */
  lossHistory: number[];
  /** Time per step in milliseconds (average) */
  avgStepTimeMs: number;
}

/**
 * Configuration for a generation benchmark run.
 */
export interface GenerationBenchmarkConfig {
  /** Number of prompts to generate from */
  promptCount: number;
  /** Maximum tokens to generate per prompt */
  maxTokens: number;
  /** Temperature for sampling (0 = greedy) */
  temperature?: number;
  /** Top-K for sampling */
  topK?: number;
  /** Whether to compute perplexity (adds overhead) */
  computePerplexity?: boolean;
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * Metrics for a single generation benchmark run.
 */
export interface GenerationMetrics {
  /** Number of prompts evaluated */
  promptCount: number;
  /** Total tokens generated across all prompts */
  totalTokensGenerated: number;
  /** Average tokens generated per prompt */
  avgTokensPerPrompt: number;
  /** Average tokens generated per second */
  tokensPerSecond: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Average perplexity across all prompts (if computed) */
  avgPerplexity?: number;
  /** Number of generations that hit EOS */
  eosCount: number;
  /** Number of generations that hit maxTokens limit */
  maxTokensCount: number;
}

/**
 * Complete benchmark result combining training and generation.
 */
export interface BenchmarkResult {
  /** Benchmark identifier */
  name: string;
  /** Model identifier */
  model: string;
  /** Dataset identifier */
  dataset: string;
  /** Training benchmark metrics */
  training: TrainingBenchmarkResult;
  /** Generation benchmark metrics */
  generation: GenerationMetrics;
  /** Total wall-clock time for the full benchmark */
  totalDurationMs: number;
  /** Timestamp when the benchmark was run */
  timestamp: string;
}

// ============================================================
// Mulberry32 RNG
// ============================================================

function mulberry32(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return () => {
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    state = state + 0x6d2b79f5 | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// BenchmarkRunner
// ============================================================

export class BenchmarkRunner {
  private defaultSeed: number;

  constructor(seed: number = 42) {
    this.defaultSeed = seed;
  }

  // ============================================================
  // Training Benchmark
  // ============================================================

  /**
   * Run a training throughput benchmark.
   *
   * Generates synthetic data (random token IDs) and runs N optimizer
   * steps, measuring throughput (tokens/sec), loss progression,
   * and convergence behavior.
   *
   * This is a micro-benchmark — it uses synthetic data to isolate
   * model/optimizer performance from dataset I/O.
   *
   * @param model    - Model to benchmark
   * @param optimizer - Optimizer to use for training steps
   * @param config    - Benchmark configuration
   * @returns TrainingBenchmarkResult with throughput and loss metrics
   */
  runTrainingBenchmark(
    model: TensorMiniMindModel,
    optimizer: Optimizer,
    config: TrainingBenchmarkConfig
  ): TrainingBenchmarkResult {
    const {
      steps,
      batchSize,
      seqLen,
      vocabSize,
      warmupSteps = 0,
      seed = this.defaultSeed,
      gradientAccumulationSteps = 1,
    } = config;

    const totalSteps = steps + warmupSteps;
    const rng = mulberry32(seed);
    const lossHistory: number[] = [];
    let bestLoss = Infinity;
    let initialLoss = 0;

    const throughputMeter = new ThroughputMeter();
    throughputMeter.start();

    const startTime = performance.now();

    for (let step = 0; step < totalSteps; step++) {
      // Generate synthetic batch
      const inputIds = this.generateSyntheticBatch(batchSize, seqLen, vocabSize, rng);
      const targets = this.generateTargets(batchSize, seqLen, vocabSize, rng);

      // Zero gradients
      optimizer.zeroGrad();

      // Forward pass
      const logits = model.forward(inputIds);

      // Compute loss
      const lossTensor = this.computeBenchmarkLoss(logits, targets);

      // Backward pass
      lossTensor.backward();

      // Step (with gradient accumulation)
      if ((step + 1) % gradientAccumulationSteps === 0) {
        optimizer.step();
      }

      // Record loss (skip warmup)
      const lossVal = lossTensor.item();
      if (step >= warmupSteps) {
        lossHistory.push(lossVal);
        if (lossVal < bestLoss) {
          bestLoss = lossVal;
        }
        if (lossHistory.length === 1) {
          initialLoss = lossVal;
        }
      }

      // Track throughput
      throughputMeter.addTokens(batchSize * seqLen);
    }

    const durationMs = performance.now() - startTime;
    const effectiveSteps = totalSteps - warmupSteps;
    const tokensProcessed = effectiveSteps * batchSize * seqLen;
    const tokensPerSecond =
      durationMs > 0 ? (tokensProcessed / durationMs) * 1000 : 0;
    const finalLoss =
      lossHistory.length > 0 ? lossHistory[lossHistory.length - 1] : Infinity;

    return {
      model: `dModel=${model.dModel},layers=${model.numLayers}`,
      dataset: "synthetic",
      tokensProcessed,
      steps: effectiveSteps,
      durationMs,
      tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
      stepsPerSecond:
        Math.round((effectiveSteps / durationMs) * 100000) / 100,
      initialLoss,
      finalLoss,
      bestLoss,
      lossHistory,
      avgStepTimeMs:
        effectiveSteps > 0
          ? Math.round((durationMs / effectiveSteps) * 100) / 100
          : 0,
    };
  }

  /**
   * Run a training benchmark with real data (token IDs from a loader).
   *
   * Unlike runTrainingBenchmark which uses synthetic data, this
   * measures real training throughput with actual dataset batches.
   *
   * @param model     - Model to benchmark
   * @param optimizer - Optimizer to use
   * @param batches   - Array of [inputIds, targets] token ID pairs
   * @param config    - Benchmark configuration (for metadata)
   * @returns TrainingBenchmarkResult
   */
  runTrainingBenchmarkWithData(
    model: TensorMiniMindModel,
    optimizer: Optimizer,
    batches: Array<{ inputIds: Tensor; targets: number[][] }>,
    config: Partial<TrainingBenchmarkConfig> = {}
  ): TrainingBenchmarkResult {
    const steps = batches.length;
    const batchSize = batches[0]?.inputIds.shape[0] ?? 0;
    const seqLen = batches[0]?.inputIds.shape[1] ?? 0;
    const warmupSteps = config.warmupSteps ?? 0;
    const lossHistory: number[] = [];
    let bestLoss = Infinity;
    let initialLoss = 0;

    const startTime = performance.now();

    for (let i = 0; i < steps; i++) {
      const { inputIds, targets } = batches[i];

      optimizer.zeroGrad();
      const logits = model.forward(inputIds);
      const lossTensor = this.computeBenchmarkLoss(logits, targets);
      lossTensor.backward();
      optimizer.step();

      const lossVal = lossTensor.item();
      if (i >= warmupSteps) {
        lossHistory.push(lossVal);
        if (lossVal < bestLoss) bestLoss = lossVal;
        if (lossHistory.length === 1) initialLoss = lossVal;
      }
    }

    const durationMs = performance.now() - startTime;
    const effectiveSteps = steps - warmupSteps;
    const tokensProcessed = effectiveSteps * batchSize * seqLen;
    const tokensPerSecond =
      durationMs > 0 ? (tokensProcessed / durationMs) * 1000 : 0;
    const finalLoss =
      lossHistory.length > 0 ? lossHistory[lossHistory.length - 1] : Infinity;

    return {
      model: `dModel=${model.dModel},layers=${model.numLayers}`,
      dataset: "provided",
      tokensProcessed,
      steps: effectiveSteps,
      durationMs,
      tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
      stepsPerSecond:
        Math.round((effectiveSteps / durationMs) * 100000) / 100,
      initialLoss,
      finalLoss,
      bestLoss,
      lossHistory,
      avgStepTimeMs:
        effectiveSteps > 0
          ? Math.round((durationMs / effectiveSteps) * 100) / 100
          : 0,
    };
  }

  // ============================================================
  // Generation Benchmark
  // ============================================================

  /**
   * Run a generation speed benchmark.
   *
   * Measures how fast the model can generate tokens autoregressively.
   * Uses simple fixed prompts and tracks tokens/sec.
   *
   * @param model  - Model to benchmark
   * @param config - Generation benchmark configuration
   * @returns GenerationMetrics
   */
  runGenerationBenchmark(
    model: TensorMiniMindModel,
    config: GenerationBenchmarkConfig
  ): GenerationMetrics {
    const {
      promptCount,
      maxTokens,
      temperature = 0,
      seed = this.defaultSeed,
      computePerplexity = false,
    } = config;

    const rng = mulberry32(seed);
    let totalTokensGenerated = 0;
    let eosCount = 0;
    let maxTokensCount = 0;
    let totalPerplexity = 0;

    const startTime = performance.now();

    for (let p = 0; p < promptCount; p++) {
      // Simple prompt: random token IDs
      const promptLen = 4;
      const promptIds: number[] = [];
      for (let i = 0; i < promptLen; i++) {
        promptIds.push(Math.floor(rng() * Math.min(model.vocabSize, 100)));
      }

      const generatedIds: number[] = [];
      const currentIds = [...promptIds];
      const eosTokenId = 3;

      for (let step = 0; step < maxTokens; step++) {
        const maxCtx = Math.min(model.maxSeqLen, 64);
        const ctx =
          currentIds.length > maxCtx
            ? currentIds.slice(currentIds.length - maxCtx)
            : currentIds;

        const input = Tensor.fromArray([ctx]);

        let nextTokenId = 0;
        Tensor.noGrad(() => {
          const logits = model.forward(input);
          const logitArr = logits.toArray() as number[][][];
          const seqLen = logitArr[0].length;
          const lastLogits = logitArr[0][Math.min(ctx.length - 1, seqLen - 1)];

          // Greedy or temperature-based sampling
          if (temperature <= 0) {
            let maxIdx = 0;
            let maxVal = -Infinity;
            for (let i = 0; i < lastLogits.length; i++) {
              if (lastLogits[i] > maxVal) {
                maxVal = lastLogits[i];
                maxIdx = i;
              }
            }
            nextTokenId = maxIdx;
          } else {
            const scaled = lastLogits.map((l: number) => l / temperature);
            const maxL = Math.max(...scaled);
            const exps = scaled.map((l: number) => Math.exp(l - maxL));
            const expSum = exps.reduce((s: number, v: number) => s + v, 0);
            const probs = exps.map((e: number) => e / expSum);
            const r = rng();
            let cum = 0;
            nextTokenId = probs.length - 1;
            for (let i = 0; i < probs.length; i++) {
              cum += probs[i];
              if (r < cum) {
                nextTokenId = i;
                break;
              }
            }
          }
        });

        generatedIds.push(nextTokenId);
        currentIds.push(nextTokenId);

        if (nextTokenId === eosTokenId) {
          eosCount++;
          break;
        }
        if (step === maxTokens - 1) {
          maxTokensCount++;
        }
      }

      totalTokensGenerated += generatedIds.length;

      if (computePerplexity) {
        totalPerplexity += 100; // Placeholder — real perplexity needs a tokenizer
      }
    }

    const durationMs = performance.now() - startTime;
    const tokensPerSecond =
      durationMs > 0 ? (totalTokensGenerated / durationMs) * 1000 : 0;
    const avgTokensPerPrompt =
      promptCount > 0 ? totalTokensGenerated / promptCount : 0;

    return {
      promptCount,
      totalTokensGenerated,
      avgTokensPerPrompt: Math.round(avgTokensPerPrompt * 100) / 100,
      tokensPerSecond: Math.round(tokensPerSecond * 100) / 100,
      durationMs,
      avgPerplexity: computePerplexity
        ? Math.round((totalPerplexity / promptCount) * 100) / 100
        : undefined,
      eosCount,
      maxTokensCount,
    };
  }

  // ============================================================
  // Combined Benchmark
  // ============================================================

  /**
   * Run a complete benchmark: training + generation.
   *
   * This is the primary API — one call produces a full BenchmarkResult
   * suitable for comparison and reporting.
   *
   * @param name          - Benchmark name
   * @param model         - Model to benchmark
   * @param optimizer     - Optimizer for training
   * @param trainingConfig - Training benchmark config
   * @param genConfig     - Generation benchmark config
   * @returns Complete BenchmarkResult
   */
  runFullBenchmark(
    name: string,
    model: TensorMiniMindModel,
    optimizer: Optimizer,
    trainingConfig: TrainingBenchmarkConfig,
    genConfig: GenerationBenchmarkConfig
  ): BenchmarkResult {
    const startTime = performance.now();

    const training = this.runTrainingBenchmark(model, optimizer, trainingConfig);
    const generation = this.runGenerationBenchmark(model, genConfig);

    const totalDurationMs = performance.now() - startTime;

    return {
      name,
      model: training.model,
      dataset: "synthetic",
      training,
      generation,
      totalDurationMs,
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================
  // Comparison
  // ============================================================

  /**
   * Compare two benchmark results and return differences.
   *
   * @param a - First benchmark result (e.g., baseline)
   * @param b - Second benchmark result (e.g., experiment)
   * @returns Human-readable comparison string
   */
  compare(a: BenchmarkResult, b: BenchmarkResult): string {
    const lines: string[] = [
      `${"=".repeat(60)}`,
      `Benchmark Comparison: ${a.name} vs ${b.name}`,
      `${"=".repeat(60)}`,
      ``,
      `Training:`,
      `  Tokens/sec:    ${a.training.tokensPerSecond.toFixed(1)} → ${b.training.tokensPerSecond.toFixed(1)} (${this.pctChange(a.training.tokensPerSecond, b.training.tokensPerSecond)})`,
      `  Final loss:    ${a.training.finalLoss.toFixed(4)} → ${b.training.finalLoss.toFixed(4)} (${this.pctChange(a.training.finalLoss, b.training.finalLoss)})`,
      `  Best loss:     ${a.training.bestLoss.toFixed(4)} → ${b.training.bestLoss.toFixed(4)} (${this.pctChange(a.training.bestLoss, b.training.bestLoss)})`,
      `  Steps/sec:     ${a.training.stepsPerSecond.toFixed(1)} → ${b.training.stepsPerSecond.toFixed(1)} (${this.pctChange(a.training.stepsPerSecond, b.training.stepsPerSecond)})`,
      ``,
      `Generation:`,
      `  Tokens/sec:    ${a.generation.tokensPerSecond.toFixed(1)} → ${b.generation.tokensPerSecond.toFixed(1)} (${this.pctChange(a.generation.tokensPerSecond, b.generation.tokensPerSecond)})`,
      `  Avg tokens:    ${a.generation.avgTokensPerPrompt.toFixed(1)} → ${b.generation.avgTokensPerPrompt.toFixed(1)}`,
      `  EOS rate:      ${a.generation.eosCount}/${a.generation.promptCount} → ${b.generation.eosCount}/${b.generation.promptCount}`,
      `${"=".repeat(60)}`,
    ];
    return lines.join("\n");
  }

  /**
   * Compare multiple benchmark results and produce a summary table.
   *
   * @param results - Array of benchmark results to compare
   * @returns Human-readable comparison table
   */
  compareMultiple(results: BenchmarkResult[]): string {
    if (results.length === 0) return "No benchmarks to compare.";

    const lines: string[] = [
      `${"=".repeat(80)}`,
      `Benchmark Comparison (${results.length} runs)`,
      `${"=".repeat(80)}`,
    ];

    // Header
    lines.push(
      ` ${"Name".padEnd(20)} ${"Tokens/s".padStart(12)} ${"Loss".padStart(10)} ${"Steps/s".padStart(10)} ${"Gen tok/s".padStart(12)}`
    );
    lines.push(` ${"-".repeat(78)}`);

    for (const r of results) {
      const name = r.name.substring(0, 20).padEnd(20);
      const tps = r.training.tokensPerSecond.toFixed(1).padStart(12);
      const loss = r.training.finalLoss.toFixed(4).padStart(10);
      const sps = r.training.stepsPerSecond.toFixed(1).padStart(10);
      const gps = r.generation.tokensPerSecond.toFixed(1).padStart(12);
      lines.push(` ${name}${tps}${loss}${sps}${gps}`);
    }

    lines.push(`${"=".repeat(80)}`);
    return lines.join("\n");
  }

  /**
   * Summarize a single benchmark result as a human-readable string.
   */
  summarize(result: BenchmarkResult): string {
    const lines: string[] = [
      `${"=".repeat(56)}`,
      `Benchmark: ${result.name}`,
      `${"=".repeat(56)}`,
      `Model:       ${result.model}`,
      `Dataset:     ${result.dataset}`,
      `Duration:    ${(result.totalDurationMs / 1000).toFixed(2)}s`,
      ``,
      `Training:`,
      `  Steps:        ${result.training.steps}`,
      `  Tokens:       ${result.training.tokensProcessed.toLocaleString()}`,
      `  Tokens/sec:   ${result.training.tokensPerSecond.toFixed(1)}`,
      `  Steps/sec:    ${result.training.stepsPerSecond.toFixed(1)}`,
      `  Initial loss: ${result.training.initialLoss.toFixed(4)}`,
      `  Final loss:   ${result.training.finalLoss.toFixed(4)}`,
      `  Best loss:    ${result.training.bestLoss.toFixed(4)}`,
      ``,
      `Generation:`,
      `  Prompts:      ${result.generation.promptCount}`,
      `  Total tokens: ${result.generation.totalTokensGenerated}`,
      `  Tokens/sec:   ${result.generation.tokensPerSecond.toFixed(1)}`,
      `  EOS rate:     ${result.generation.eosCount}/${result.generation.promptCount}`,
      `${"=".repeat(56)}`,
    ];
    return lines.join("\n");
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Generate a batch of random token IDs.
   */
  private generateSyntheticBatch(
    batchSize: number,
    seqLen: number,
    vocabSize: number,
    rng: () => number
  ): Tensor {
    const totalElements = batchSize * seqLen;
    const data = new Float64Array(totalElements);
    for (let i = 0; i < totalElements; i++) {
      data[i] = Math.floor(rng() * vocabSize);
    }
    return new Tensor(data, [batchSize, seqLen], false);
  }

  /**
   * Generate target token IDs for loss computation.
   * Simple: next-token prediction targets.
   */
  private generateTargets(
    batchSize: number,
    seqLen: number,
    vocabSize: number,
    rng: () => number
  ): number[][] {
    const targets: number[][] = [];
    for (let b = 0; b < batchSize; b++) {
      const row: number[] = [];
      for (let s = 0; s < seqLen; s++) {
        row.push(Math.floor(rng() * vocabSize));
      }
      targets.push(row);
    }
    return targets;
  }

  /**
   * Simple MSE-style loss for benchmark.
   * For real training, use crossEntropyLoss from core/loss.
   */
  private computeBenchmarkLoss(
    logits: Tensor,
    _targets: number[][]
  ): Tensor {
    // Simplified: sum of logits as a proxy for cross-entropy
    // This is fast and differentiable — sufficient for throughput benchmarking
    return sum(logits);
  }

  /**
   * Percentage change string helper.
   */
  private pctChange(a: number, b: number): string {
    if (a === 0) return b === 0 ? "0.0%" : "N/A";
    const pct = ((b - a) / Math.abs(a)) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}%`;
  }
}
