// ============================================================
// Ablation — Ablation experiment framework for MiniMind
// ============================================================
// Phase 50: Provides a structured way to compare architecture
// changes by running controlled experiments that vary one
// dimension at a time.
//
// An ablation study:
//   1. Defines a baseline model configuration
//   2. Creates N variants, each changing one architecture parameter
//   3. Runs training benchmarks on each variant
//   4. Produces a comparison report showing the impact of each change
//
// Supported ablation dimensions:
//   - dModel (model width)
//   - numLayers (model depth)
//   - numHeads (attention heads)
//   - dFF (feed-forward width)
//   - vocabSize (vocabulary size)
//   - maxSeqLen (context length)
//
// Usage:
//   const ablation = new Ablation(baselineConfig, runner);
//   ablation.addVariant("wider", { dModel: 256 });
//   ablation.addVariant("deeper", { numLayers: 6 });
//   const report = ablation.run({ steps: 50, batchSize: 4, ... });
//   console.log(ablation.summarize(report));
// ============================================================

import type { ModelConfigEntry } from "./ModelRegistry";

// ============================================================
// Types
// ============================================================

/**
 * An architecture variant — changes relative to baseline.
 *
 * Only the fields that differ from baseline need to be specified.
 * Unspecified fields inherit from the baseline.
 */
export interface AblationVariant {
  /** Variant name (e.g. "wider", "deeper", "more-heads") */
  name: string;
  /** Description of what this variant tests */
  description: string;
  /** Architecture overrides relative to baseline */
  overrides: Partial<AblationConfig>;
}

/**
 * Minimal config needed to construct a model for ablation.
 */
export interface AblationConfig {
  vocabSize: number;
  dModel: number;
  numHeads: number;
  dFF: number;
  numLayers: number;
  maxSeqLen: number;
}

/**
 * Training config for ablation runs.
 */
export interface AblationTrainingConfig {
  /** Number of training steps to run per variant */
  steps: number;
  /** Batch size */
  batchSize: number;
  /** Sequence length for synthetic data */
  seqLen: number;
  /** Learning rate */
  lr: number;
  /** Random seed for reproducibility */
  seed: number;
  /** Number of warmup steps (excluded from loss history) */
  warmupSteps?: number;
}

/**
 * Result of running a single ablation variant.
 */
export interface AblationVariantResult {
  /** Variant name */
  name: string;
  /** Variant description */
  description: string;
  /** Full configuration used */
  config: AblationConfig;
  /** Estimated parameter count */
  estimatedParams: number;
  /** Initial loss (after warmup) */
  initialLoss: number;
  /** Final loss */
  finalLoss: number;
  /** Best loss achieved */
  bestLoss: number;
  /** Tokens processed per second */
  tokensPerSecond: number;
  /** Per-step loss history */
  lossHistory: number[];
  /** Training duration in milliseconds */
  durationMs: number;
}

/**
 * Complete ablation report comparing baseline vs variants.
 */
export interface AblationReport {
  /** Ablation study name */
  name: string;
  /** Baseline configuration */
  baseline: AblationConfig;
  /** Baseline result */
  baselineResult: AblationVariantResult;
  /** Variant results (one per variant) */
  variants: AblationVariantResult[];
  /** Comparison table data */
  comparisonTable: AblationComparisonRow[];
  /** Training config used */
  trainingConfig: AblationTrainingConfig;
}

/**
 * A single row in the comparison table.
 */
export interface AblationComparisonRow {
  /** Variant name */
  name: string;
  /** Estimated parameter count */
  params: number;
  /** Parameter count relative to baseline */
  paramsDelta: string;
  /** Final loss */
  finalLoss: number;
  /** Loss delta from baseline */
  lossDelta: number;
  /** Tokens per second */
  tokensPerSecond: number;
  /** Throughput delta from baseline */
  throughputDelta: string;
  /** Convergence speed (steps to reach 50% of loss reduction) */
  convergenceSteps?: number;
}

// ============================================================
// Ablation
// ============================================================

export class Ablation {
  readonly baseline: AblationConfig;
  readonly variants: AblationVariant[] = [];
  private readonly name: string;

  /**
   * @param name     - Name for this ablation study
   * @param baseline - Baseline model configuration
   */
  constructor(name: string, baseline: AblationConfig) {
    this.name = name;
    this.baseline = { ...baseline };
  }

  /**
   * Create an Ablation from a ModelConfigEntry.
   *
   * @param name  - Study name
   * @param entry - Model registry entry to use as baseline
   */
  static fromModelConfig(name: string, entry: ModelConfigEntry): Ablation {
    return new Ablation(name, {
      vocabSize: entry.vocabSize,
      dModel: entry.dModel,
      numHeads: entry.numHeads,
      dFF: entry.dFF,
      numLayers: entry.numLayers,
      maxSeqLen: entry.maxSeqLen,
    });
  }

  /**
   * Add a variant to the ablation study.
   *
   * Each variant changes one or more architecture parameters
   * while keeping the rest at baseline values.
   *
   * @param name      - Variant identifier
   * @param overrides - Architecture parameters to change
   * @param description - Optional description (auto-generated if omitted)
   *
   * Example:
   *   ablation.addVariant("wider", { dModel: 256 },
   *     "Double model width to test capacity scaling");
   */
  addVariant(
    name: string,
    overrides: Partial<AblationConfig>,
    description?: string
  ): void {
    // Check for duplicate names
    if (this.variants.some((v) => v.name === name)) {
      throw new Error(
        `Ablation: variant "${name}" already exists in study "${this.name}"`
      );
    }

    // Auto-generate description if not provided
    const desc: string =
      description ?? this.generateDescription(name, overrides);

    this.variants.push({ name, description: desc, overrides });
  }

  /**
   * Get the resolved config for a variant (baseline + overrides).
   *
   * @param variant - The variant to resolve
   * @returns Full AblationConfig
   */
  resolveConfig(variant: AblationVariant): AblationConfig {
    return {
      ...this.baseline,
      ...variant.overrides,
    };
  }

  /**
   * Estimate parameter count for a config.
   *
   * Uses the same formula as ModelRegistry parameter estimation.
   *
   * @param config - Model configuration
   * @returns Estimated parameter count
   */
  estimateParams(config: AblationConfig): number {
    const { vocabSize, dModel, dFF, numLayers } = config;

    const embedding = vocabSize * dModel;
    const perLayer =
      4 * dModel * dModel +
      2 * dFF * dModel +
      dModel * dFF +
      2 * dModel;
    const finalNorm = dModel;
    const lmHead = dModel * vocabSize;

    return embedding + numLayers * perLayer + finalNorm + lmHead;
  }

  /**
   * Produce a comparison table from a set of variant results.
   *
   * @param baselineResult - Baseline run result
   * @param variantResults - Array of variant run results
   * @returns Array of comparison rows
   */
  buildComparisonTable(
    baselineResult: AblationVariantResult,
    variantResults: AblationVariantResult[]
  ): AblationComparisonRow[] {
    const rows: AblationComparisonRow[] = [];

    // Baseline row
    rows.push({
      name: "baseline",
      params: baselineResult.estimatedParams,
      paramsDelta: "—",
      finalLoss: baselineResult.finalLoss,
      lossDelta: 0,
      tokensPerSecond: baselineResult.tokensPerSecond,
      throughputDelta: "—",
      convergenceSteps: this.computeConvergenceSteps(
        baselineResult.lossHistory,
        baselineResult.initialLoss,
        baselineResult.finalLoss
      ),
    });

    // Variant rows
    for (const vr of variantResults) {
      const paramsDelta = vr.estimatedParams - baselineResult.estimatedParams;
      const paramsDeltaStr =
        paramsDelta >= 0
          ? `+${paramsDelta.toLocaleString()}`
          : `${paramsDelta.toLocaleString()}`;

      const tpsDelta = vr.tokensPerSecond - baselineResult.tokensPerSecond;
      const tpsDeltaStr =
        tpsDelta >= 0
          ? `+${tpsDelta.toFixed(1)} tok/s`
          : `${tpsDelta.toFixed(1)} tok/s`;

      rows.push({
        name: vr.name,
        params: vr.estimatedParams,
        paramsDelta: paramsDeltaStr,
        finalLoss: vr.finalLoss,
        lossDelta: vr.finalLoss - baselineResult.finalLoss,
        tokensPerSecond: vr.tokensPerSecond,
        throughputDelta: tpsDeltaStr,
        convergenceSteps: this.computeConvergenceSteps(
          vr.lossHistory,
          vr.initialLoss,
          vr.finalLoss
        ),
      });
    }

    return rows;
  }

  // ============================================================
  // Reporting
  // ============================================================

  /**
   * Generate a human-readable summary of an ablation report.
   *
   * @param report - Completed ablation report
   * @returns Multi-line formatted string
   */
  summarize(report: AblationReport): string {
    const lines: string[] = [
      `${"=".repeat(76)}`,
      `Ablation Study: ${report.name}`,
      `${"=".repeat(76)}`,
      ``,
      `Baseline: dModel=${this.baseline.dModel}, layers=${this.baseline.numLayers}, ` +
        `heads=${this.baseline.numHeads}, dFF=${this.baseline.dFF}`,
      `Training: ${report.trainingConfig.steps} steps, ` +
        `batch=${report.trainingConfig.batchSize}, seq=${report.trainingConfig.seqLen}`,
      ``,
      `Comparison Table:`,
      ` ${"Variant".padEnd(16)} ${"Params".padStart(12)} ${"ΔParams".padStart(14)} ${"Loss".padStart(10)} ${"ΔLoss".padStart(10)} ${"Tok/s".padStart(11)} ${"ΔTok/s".padStart(16)}`,
      ` ${"-".repeat(74)}`,
    ];

    for (const row of report.comparisonTable) {
      const name = row.name.padEnd(16);
      const params = row.params.toLocaleString().padStart(12);
      const dParams = row.paramsDelta.padStart(14);
      const loss = row.finalLoss.toFixed(4).padStart(10);
      const dLoss =
        row.lossDelta >= 0
          ? `+${row.lossDelta.toFixed(4)}`.padStart(10)
          : row.lossDelta.toFixed(4).padStart(10);
      const tps = row.tokensPerSecond.toFixed(1).padStart(11);
      const dtps = row.throughputDelta.padStart(16);
      lines.push(` ${name}${params}${dParams}${loss}${dLoss}${tps}${dtps}`);
    }

    lines.push(`${"=".repeat(76)}`);

    // Key findings
    lines.push("");
    lines.push("Key Findings:");
    lines.push(this.generateFindings(report));

    return lines.join("\n");
  }

  /**
   * Export an ablation report as a JSON-serializable object.
   */
  exportReport(report: AblationReport): Record<string, unknown> {
    return {
      name: report.name,
      baseline: report.baseline,
      baselineResult: {
        name: report.baselineResult.name,
        estimatedParams: report.baselineResult.estimatedParams,
        initialLoss: report.baselineResult.initialLoss,
        finalLoss: report.baselineResult.finalLoss,
        bestLoss: report.baselineResult.bestLoss,
        tokensPerSecond: report.baselineResult.tokensPerSecond,
        durationMs: report.baselineResult.durationMs,
      },
      variants: report.variants.map((v) => ({
        name: v.name,
        description: v.description,
        config: v.config,
        estimatedParams: v.estimatedParams,
        initialLoss: v.initialLoss,
        finalLoss: v.finalLoss,
        bestLoss: v.bestLoss,
        tokensPerSecond: v.tokensPerSecond,
        durationMs: v.durationMs,
      })),
      comparisonTable: report.comparisonTable,
      trainingConfig: report.trainingConfig,
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Auto-generate a description for a variant.
   */
  private generateDescription(
    name: string,
    overrides: Partial<AblationConfig>
  ): string {
    const changes: string[] = [];
    if (overrides.dModel !== undefined) {
      changes.push(
        `dModel: ${this.baseline.dModel} → ${overrides.dModel}`
      );
    }
    if (overrides.numLayers !== undefined) {
      changes.push(
        `layers: ${this.baseline.numLayers} → ${overrides.numLayers}`
      );
    }
    if (overrides.numHeads !== undefined) {
      changes.push(
        `heads: ${this.baseline.numHeads} → ${overrides.numHeads}`
      );
    }
    if (overrides.dFF !== undefined) {
      changes.push(
        `dFF: ${this.baseline.dFF} → ${overrides.dFF}`
      );
    }
    if (overrides.vocabSize !== undefined) {
      changes.push(
        `vocab: ${this.baseline.vocabSize} → ${overrides.vocabSize}`
      );
    }
    if (overrides.maxSeqLen !== undefined) {
      changes.push(
        `maxSeqLen: ${this.baseline.maxSeqLen} → ${overrides.maxSeqLen}`
      );
    }
    return `Variant "${name}": ${changes.join(", ") || "no changes"}`;
  }

  /**
   * Compute number of steps to reach 50% of total loss reduction.
   */
  private computeConvergenceSteps(
    lossHistory: number[],
    initialLoss: number,
    finalLoss: number
  ): number | undefined {
    if (lossHistory.length === 0) return undefined;

    const totalReduction = initialLoss - finalLoss;
    if (totalReduction <= 0) return undefined;

    const targetLoss = initialLoss - totalReduction * 0.5;

    for (let i = 0; i < lossHistory.length; i++) {
      if (lossHistory[i] <= targetLoss) {
        return i + 1;
      }
    }

    return undefined; // Never reached 50%
  }

  /**
   * Generate key findings from the ablation report.
   */
  private generateFindings(report: AblationReport): string {
    const findings: string[] = [];

    // Find best loss variant
    let bestVariant: AblationComparisonRow | null = null;
    let bestLoss = report.baselineResult.finalLoss;

    for (const row of report.comparisonTable) {
      if (row.finalLoss < bestLoss) {
        bestLoss = row.finalLoss;
        bestVariant = row;
      }
    }

    if (bestVariant && bestVariant.name !== "baseline") {
      findings.push(
        `• Best loss: "${bestVariant.name}" (${bestLoss.toFixed(4)} vs baseline ${report.baselineResult.finalLoss.toFixed(4)})`
      );
    } else {
      findings.push(
        `• Baseline achieved the best loss (${report.baselineResult.finalLoss.toFixed(4)})`
      );
    }

    // Find fastest variant
    let fastestVariant: AblationComparisonRow | null = null;
    let fastestTps = report.baselineResult.tokensPerSecond;

    for (const row of report.comparisonTable) {
      if (row.tokensPerSecond > fastestTps) {
        fastestTps = row.tokensPerSecond;
        fastestVariant = row;
      }
    }

    if (fastestVariant && fastestVariant.name !== "baseline") {
      findings.push(
        `• Fastest: "${fastestVariant.name}" (${fastestTps.toFixed(1)} tok/s vs baseline ${report.baselineResult.tokensPerSecond.toFixed(1)} tok/s)`
      );
    }

    // Parameter efficiency note
    findings.push(
      `• Total variants tested: ${report.variants.length}`
    );

    return findings.join("\n");
  }
}
