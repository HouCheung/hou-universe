// ============================================================
// MiniMind — research/benchmark/BenchmarkSuite.ts
// ============================================================
// Phase 62: Benchmark suite with ablation integration.
//
// A BenchmarkSuite collects multiple benchmark profiles and runs
// them together, producing a unified comparison. It connects the
// existing Ablation framework (config-only) to the new
// ResearchBenchmarkRunner (real training execution).
//
// Key features:
//   1. Preset suite factories — common benchmark patterns
//      (model scaling, LR sweep, batch size sweep, etc.)
//   2. Ablation bridge — convert Ablation variants to profiles
//      and execute them with real training
//   3. Cross-suite comparison — compare results across suites
//   4. Statistical aggregation — per-profile and cross-profile
//
// The Ablation bridge fills the gap: the existing Ablation class
// in experiments/ can only manipulate configs; BenchmarkSuite
// provides the run() capability it lacks via real training.
//
// Design principles:
//   - Reuse > Rewrite — wraps existing Ablation, does not replace
//   - Real training — all benchmarks use the actual Trainer
//   - Browser-safe — no fs/path dependencies
// ============================================================

import type { ModelConfigEntry } from "../../experiments/ModelRegistry";
import type { TrainingRecipe } from "../../experiments/TrainingRecipe";
import { Ablation } from "../../experiments/Ablation";
import type {
  AblationConfig,
  AblationVariant,
  AblationTrainingConfig,
} from "../../experiments/Ablation";
import type { DatasetConfig, TokenizerConfig, EvaluationConfig } from "../ResearchExperiment";
import type {
  ResearchBenchmarkProfile,
  ResearchBenchmarkResult,
  ResearchBenchmarkReport,
  BenchmarkMetricStats,
} from "./ResearchBenchmarkRunner";
import { ResearchBenchmarkRunner } from "./ResearchBenchmarkRunner";

// ============================================================
// Suite Types
// ============================================================

/**
 * A member of a benchmark suite.
 */
export interface SuiteMember {
  /** Unique key within the suite */
  key: string;
  /** Human-readable label */
  label: string;
  /** The benchmark profile to run */
  profile: ResearchBenchmarkProfile;
  /** Arbitrary metadata for filtering/grouping */
  metadata?: Record<string, string>;
  /** Whether this is the baseline for comparison */
  isBaseline: boolean;
}

/**
 * Result of running a single suite member.
 */
export interface SuiteMemberResult {
  /** The suite member */
  member: SuiteMember;
  /** The benchmark result */
  result: ResearchBenchmarkResult;
  /** The formatted benchmark report */
  report: ResearchBenchmarkReport;
}

/**
 * Complete result of running a benchmark suite.
 */
export interface BenchmarkSuiteResult {
  /** Suite name */
  name: string;
  /** When the suite run started */
  startedAt: number;
  /** When the suite run completed */
  completedAt: number;
  /** Total duration across all members */
  totalDurationMs: number;
  /** Results for each suite member */
  members: SuiteMemberResult[];
  /** The baseline result (for comparison) */
  baseline: SuiteMemberResult | null;
  /** Cross-member comparison */
  comparison: SuiteComparison;
}

/**
 * Cross-member comparison within a suite.
 */
export interface SuiteComparison {
  /** Ranked by best loss (lowest first) */
  byBestLoss: Array<{ key: string; label: string; value: number }>;
  /** Ranked by throughput (highest first) */
  byThroughput: Array<{ key: string; label: string; value: number }>;
  /** Ranked by perplexity (lowest first) */
  byPerplexity: Array<{ key: string; label: string; value: number }>;
  /** Improvement of each member over baseline */
  improvements: Array<{
    key: string;
    label: string;
    lossImprovement: number; // negative = better
    throughputImprovement: number; // positive = better
  }>;
}

/**
 * Benchmark suite configuration.
 */
export interface BenchmarkSuiteConfig {
  /** Suite name */
  name: string;
  /** Number of runs per member (default: 3) */
  numRuns?: number;
  /** Base seed (incremented per member) */
  baseSeed?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ============================================================
// BenchmarkSuite
// ============================================================

/**
 * BenchmarkSuite — collects and runs multiple benchmark profiles
 * together with unified comparison.
 *
 * Usage:
 *   const suite = new BenchmarkSuite("Model Scaling Study");
 *   suite.addProfile("tiny", tinyProfile, { isBaseline: true });
 *   suite.addProfile("small", smallProfile);
 *   const results = await suite.runAll(runner, { numRuns: 3 });
 *   console.log(suite.formatResults(results));
 */
export class BenchmarkSuite {
  readonly name: string;
  private members: Map<string, SuiteMember> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Add a benchmark profile to the suite.
   *
   * @param key — unique identifier (e.g. "tiny", "lr-0.01")
   * @param profile — the benchmark profile to run
   * @param options — metadata and baseline flag
   */
  addProfile(
    key: string,
    profile: ResearchBenchmarkProfile,
    options?: {
      label?: string;
      metadata?: Record<string, string>;
      isBaseline?: boolean;
    }
  ): void {
    if (this.members.has(key)) {
      throw new Error(
        `BenchmarkSuite "${this.name}": duplicate key "${key}"`
      );
    }

    this.members.set(key, {
      key,
      label: options?.label ?? key,
      profile,
      metadata: options?.metadata,
      isBaseline: options?.isBaseline ?? false,
    });
  }

  /**
   * Add ablation variants as suite members.
   *
   * This bridges the existing Ablation framework (experiments/)
   * to the new benchmark runner system. Each ablation variant
   * is converted into a benchmark profile and added to the suite.
   *
   * The baseline config from the Ablation becomes the suite baseline.
   *
   * @param ablation — an existing Ablation study (with variants added)
   * @param baseProfile — the base research profile (training, dataset,
   *   tokenizer, evaluation configs shared by all variants)
   *
   * Example:
   *   const ablation = new Ablation("Width Study", baselineConfig);
   *   ablation.addVariant("wider", { dModel: 256 });
   *   ablation.addVariant("widest", { dModel: 512 });
   *   suite.addAblationVariants(ablation, baseProfile);
   */
  addAblationVariants(
    ablation: Ablation,
    baseProfile: Omit<
      ResearchBenchmarkProfile,
      "name" | "modelConfig"
    >
  ): void {
    // Add baseline
    const baselineKey = "baseline";
    const baselineConfig = toModelConfigEntry(ablation.baseline);

    this.addProfile(
      baselineKey,
      {
        ...baseProfile,
        name: `${this.name} — Baseline`,
        modelConfig: baselineConfig,
      },
      {
        label: "Baseline",
        metadata: { type: "baseline" },
        isBaseline: true,
      }
    );

    // Add each variant
    for (const variant of ablation.variants) {
      const variantConfig = ablation.resolveConfig(variant);
      const entry = toModelConfigEntry(variantConfig);

      this.addProfile(
        variant.name,
        {
          ...baseProfile,
          name: `${this.name} — ${variant.name}`,
          modelConfig: entry,
        },
        {
          label: variant.name,
          metadata: {
            type: "variant",
            description: variant.description,
            ...variantToMetadata(variant),
          },
        }
      );
    }
  }

  /**
   * Run all suite members and compare results.
   *
   * @param runner — the benchmark runner to use
   * @param config — suite configuration
   * @returns complete suite result with comparison
   */
  async runAll(
    runner: ResearchBenchmarkRunner,
    config: BenchmarkSuiteConfig = { name: this.name }
  ): Promise<BenchmarkSuiteResult> {
    const numRuns = config.numRuns ?? 3;
    const baseSeed = config.baseSeed ?? 42;

    const startedAt = Date.now();
    const memberResults: SuiteMemberResult[] = [];
    let baselineResult: SuiteMemberResult | null = null;

    let seedOffset = 0;
    for (const member of this.members.values()) {
      if (config.signal?.aborted) break;

      const profile: ResearchBenchmarkProfile = {
        ...member.profile,
        numRuns,
        seed: baseSeed + seedOffset * 1000,
      };
      seedOffset++;

      const result = await runner.runBenchmark(
        profile,
        config.signal
      );

      const report = runner.createBenchmarkReport(result);
      const memberResult: SuiteMemberResult = {
        member,
        result,
        report,
      };
      memberResults.push(memberResult);

      if (member.isBaseline) {
        baselineResult = memberResult;
      }
    }

    const completedAt = Date.now();

    return {
      name: this.name,
      startedAt,
      completedAt,
      totalDurationMs: completedAt - startedAt,
      members: memberResults,
      baseline: baselineResult,
      comparison: buildSuiteComparison(
        memberResults,
        baselineResult
      ),
    };
  }

  /**
   * Get the number of members in the suite.
   */
  get size(): number {
    return this.members.size;
  }

  /**
   * List all member keys.
   */
  get memberKeys(): string[] {
    return Array.from(this.members.keys());
  }

  /**
   * Get a specific member by key.
   */
  getMember(key: string): SuiteMember | undefined {
    return this.members.get(key);
  }

  /**
   * Format suite results as a human-readable string.
   */
  formatResults(result: BenchmarkSuiteResult): string {
    const lines: string[] = [];
    lines.push("=".repeat(70));
    lines.push(`BENCHMARK SUITE: ${result.name}`);
    lines.push("=".repeat(70));
    lines.push(
      `Members: ${result.members.length}  |  ` +
      `Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`
    );
    lines.push("");

    // Per-member summary
    lines.push("─ Per-Member Summary ─");
    for (const mr of result.members) {
      const m = mr.report.metrics;
      const isBaseline = mr.member.isBaseline ? " ★ BASELINE" : "";
      lines.push(
        `  ${mr.member.label.padEnd(18)} ` +
        `loss=${m.bestLoss.mean.toFixed(4)} ` +
        `ppl=${m.perplexity.mean.toFixed(1)} ` +
        `tok/s=${m.throughput.mean.toFixed(0)} ` +
        `params=${m.totalParams.toLocaleString()}${isBaseline}`
      );
    }

    lines.push("");
    lines.push("─ Rankings ─");
    lines.push("  By Best Loss:");
    for (let i = 0; i < result.comparison.byBestLoss.length; i++) {
      const r = result.comparison.byBestLoss[i];
      lines.push(`    ${i + 1}. ${r.label}: ${r.value.toFixed(4)}`);
    }

    lines.push("  By Throughput:");
    for (let i = 0; i < result.comparison.byThroughput.length; i++) {
      const r = result.comparison.byThroughput[i];
      lines.push(`    ${i + 1}. ${r.label}: ${r.value.toFixed(0)} tok/s`);
    }

    // Improvements over baseline
    if (result.baseline) {
      lines.push("");
      lines.push("─ Improvement Over Baseline ─");
      for (const imp of result.comparison.improvements) {
        if (imp.key === result.baseline.member.key) continue;
        const lossSign = imp.lossImprovement < 0 ? "↓" : "↑";
        const tpsSign = imp.throughputImprovement > 0 ? "↑" : "↓";
        lines.push(
          `  ${imp.label.padEnd(18)} ` +
          `loss ${lossSign}${Math.abs(imp.lossImprovement * 100).toFixed(1)}%  ` +
          `speed ${tpsSign}${Math.abs(imp.throughputImprovement * 100).toFixed(1)}%`
        );
      }
    }

    lines.push("");
    lines.push("=".repeat(70));
    return lines.join("\n");
  }
}

// ============================================================
// Comparison Logic
// ============================================================

/**
 * Build a SuiteComparison from member results.
 */
function buildSuiteComparison(
  members: SuiteMemberResult[],
  baseline: SuiteMemberResult | null
): SuiteComparison {
  const extractMetrics = (mr: SuiteMemberResult) => ({
    key: mr.member.key,
    label: mr.member.label,
    bestLoss: mr.report.metrics.bestLoss.mean,
    throughput: mr.report.metrics.throughput.mean,
    perplexity: mr.report.metrics.perplexity.mean,
  });

  const metrics = members.map(extractMetrics);

  const byBestLoss = [...metrics]
    .sort((a, b) => a.bestLoss - b.bestLoss)
    .map((m) => ({ key: m.key, label: m.label, value: m.bestLoss }));

  const byThroughput = [...metrics]
    .sort((a, b) => b.throughput - a.throughput)
    .map((m) => ({ key: m.key, label: m.label, value: m.throughput }));

  const byPerplexity = [...metrics]
    .sort((a, b) => a.perplexity - b.perplexity)
    .map((m) => ({ key: m.key, label: m.label, value: m.perplexity }));

  const baselineMetrics = baseline ? extractMetrics(baseline) : null;

  const improvements = metrics.map((m) => {
    let lossImprovement = 0;
    let throughputImprovement = 0;

    if (baselineMetrics && baselineMetrics.bestLoss > 0) {
      lossImprovement =
        (m.bestLoss - baselineMetrics.bestLoss) /
        baselineMetrics.bestLoss;
    }
    if (baselineMetrics && baselineMetrics.throughput > 0) {
      throughputImprovement =
        (m.throughput - baselineMetrics.throughput) /
        baselineMetrics.throughput;
    }

    return {
      key: m.key,
      label: m.label,
      lossImprovement,
      throughputImprovement,
    };
  });

  return {
    byBestLoss,
    byThroughput,
    byPerplexity,
    improvements,
  };
}

// ============================================================
// Preset Suite Factories
// ============================================================

/**
 * Create a model scaling benchmark suite.
 *
 * Compares different model sizes (tiny, small, medium, large)
 * with the same training recipe and dataset.
 *
 * @param baseProfile — shared config (training, dataset, tokenizer, eval)
 * @param sizes — model configs to compare
 * @returns a BenchmarkSuite ready to run
 */
export function createModelScaleSuite(
  baseProfile: Omit<
    ResearchBenchmarkProfile,
    "name" | "modelConfig"
  >,
  sizes: Array<{ key: string; label: string; config: ModelConfigEntry }>
): BenchmarkSuite {
  const suite = new BenchmarkSuite("Model Scale Comparison");

  for (let i = 0; i < sizes.length; i++) {
    const s = sizes[i];
    suite.addProfile(
      s.key,
      {
        ...baseProfile,
        name: `Model Scale — ${s.label}`,
        modelConfig: s.config,
      },
      {
        label: s.label,
        metadata: { type: "scale", key: s.key },
        isBaseline: i === 0,
      }
    );
  }

  return suite;
}

/**
 * Create a learning rate sweep benchmark suite.
 *
 * Tests the same model with different learning rates.
 *
 * @param baseProfile — shared config with base training recipe
 * @param lrs — learning rates to test
 * @returns a BenchmarkSuite ready to run
 */
export function createLearningRateSuite(
  baseProfile: ResearchBenchmarkProfile,
  lrs: number[]
): BenchmarkSuite {
  const suite = new BenchmarkSuite("Learning Rate Sweep");

  for (let i = 0; i < lrs.length; i++) {
    const lr = lrs[i];
    const key = `lr-${lr}`;
    const lrProfile: ResearchBenchmarkProfile = {
      ...baseProfile,
      name: `LR Sweep — lr=${lr}`,
      trainingConfig: {
        ...baseProfile.trainingConfig,
        optimizer: {
          ...baseProfile.trainingConfig.optimizer,
          lr,
        },
      },
    };

    suite.addProfile(
      key,
      lrProfile,
      {
        label: `lr=${lr}`,
        metadata: { type: "lr-sweep", lr: String(lr) },
        isBaseline: i === 0,
      }
    );
  }

  return suite;
}

/**
 * Create a batch size sweep benchmark suite.
 *
 * @param baseProfile — shared config
 * @param batchSizes — batch sizes to test
 */
export function createBatchSizeSuite(
  baseProfile: ResearchBenchmarkProfile,
  batchSizes: number[]
): BenchmarkSuite {
  const suite = new BenchmarkSuite("Batch Size Sweep");

  for (let i = 0; i < batchSizes.length; i++) {
    const bs = batchSizes[i];
    const key = `batch-${bs}`;
    const bsProfile: ResearchBenchmarkProfile = {
      ...baseProfile,
      name: `Batch Size — batch=${bs}`,
      datasetConfig: {
        ...baseProfile.datasetConfig,
        batchSize: bs,
      },
    };

    suite.addProfile(
      key,
      bsProfile,
      {
        label: `batch=${bs}`,
        metadata: { type: "batch-sweep", batchSize: String(bs) },
        isBaseline: i === 0,
      }
    );
  }

  return suite;
}

/**
 * Create an epoch count benchmark suite.
 *
 * Tests loss convergence at different epoch counts.
 *
 * @param baseProfile — shared config
 * @param epochCounts — epoch values to test
 */
export function createEpochSuite(
  baseProfile: ResearchBenchmarkProfile,
  epochCounts: number[]
): BenchmarkSuite {
  const suite = new BenchmarkSuite("Epoch Count Sweep");

  for (let i = 0; i < epochCounts.length; i++) {
    const epochs = epochCounts[i];
    const key = `epochs-${epochs}`;
    const epProfile: ResearchBenchmarkProfile = {
      ...baseProfile,
      name: `Epochs — ${epochs}`,
      trainingConfig: {
        ...baseProfile.trainingConfig,
        epochs,
      },
    };

    suite.addProfile(
      key,
      epProfile,
      {
        label: `epochs=${epochs}`,
        metadata: { type: "epoch-sweep", epochs: String(epochs) },
        isBaseline: i === 0,
      }
    );
  }

  return suite;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert an AblationConfig to a ModelConfigEntry.
 */
function toModelConfigEntry(config: AblationConfig): ModelConfigEntry {
  const estimatedParams = estimateParamsFromConfig(config);
  return {
    name: "ablation-variant",
    label: `d${config.dModel}-l${config.numLayers}-h${config.numHeads}`,
    description: `Ablation variant: dModel=${config.dModel}, layers=${config.numLayers}, heads=${config.numHeads}`,
    dModel: config.dModel,
    numHeads: config.numHeads,
    dFF: config.dFF,
    numLayers: config.numLayers,
    maxSeqLen: config.maxSeqLen,
    vocabSize: config.vocabSize,
    eps: 1e-8,
    estimatedParams,
  };
}

/**
 * Estimate parameter count from AblationConfig.
 */
function estimateParamsFromConfig(config: AblationConfig): number {
  const { vocabSize, dModel, dFF, numLayers } = config;
  const embedding = vocabSize * dModel * 2;
  const perLayer =
    4 * dModel * dModel + 2 * dFF * dModel + dModel * dFF + 2 * dModel;
  const finalNorm = dModel;
  const lmHead = dModel * vocabSize;
  return embedding + numLayers * perLayer + finalNorm + lmHead;
}

/**
 * Convert an AblationVariant to metadata key-value pairs.
 */
function variantToMetadata(
  variant: AblationVariant
): Record<string, string> {
  const meta: Record<string, string> = {};
  if (variant.overrides.dModel !== undefined) {
    meta["dModel"] = String(variant.overrides.dModel);
  }
  if (variant.overrides.numHeads !== undefined) {
    meta["numHeads"] = String(variant.overrides.numHeads);
  }
  if (variant.overrides.dFF !== undefined) {
    meta["dFF"] = String(variant.overrides.dFF);
  }
  if (variant.overrides.numLayers !== undefined) {
    meta["numLayers"] = String(variant.overrides.numLayers);
  }
  if (variant.overrides.vocabSize !== undefined) {
    meta["vocabSize"] = String(variant.overrides.vocabSize);
  }
  if (variant.overrides.maxSeqLen !== undefined) {
    meta["maxSeqLen"] = String(variant.overrides.maxSeqLen);
  }
  return meta;
}
