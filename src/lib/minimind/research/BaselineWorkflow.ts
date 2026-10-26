// ============================================================
// MiniMind — research/BaselineWorkflow.ts
// ============================================================
// Phase 60: Baseline and ablation experiment workflow.
//
// Provides automated workflows for:
//   1. Running a baseline experiment
//   2. Running ablation variants against a baseline
//   3. Comparing all results
//   4. Identifying winners per metric
//   5. Generating comparison insights
//
// Design principles:
//   - Orchestrates existing infrastructure (runner, comparison engine)
//   - No simulated results — all training is real
//   - Deterministic — same inputs produce same outputs
//   - Browser-safe — no Node.js dependencies
// ============================================================

import type { ResearchExperiment } from "./ResearchExperiment";
import { generateExperimentId } from "./ResearchExperiment";
import type { ResearchRun } from "./ResearchRun";
import type { ResearchExperimentRunnerResult } from "./ResearchExperimentRunner";
import type { ResearchExperimentRunner } from "./ResearchExperimentRunner";
import type { ExperimentComparisonResult, MetricWinner, TradeOff } from "./copilot/ComparisonInsightEngine";
import type { ModelConfigEntry } from "../experiments/ModelRegistry";
import type { TrainingRecipe } from "../experiments/TrainingRecipe";

// ============================================================
// Types
// ============================================================

/**
 * A single ablation variant definition.
 */
export interface AblationVariantDef {
  /** Variant name (e.g. "layers=4", "lr=0.01") */
  name: string;
  /** Description of what's being changed */
  description: string;
  /** Model config overrides (partial) */
  modelConfigOverrides?: Partial<ModelConfigEntry>;
  /** Training recipe overrides (partial) */
  trainingConfigOverrides?: Partial<TrainingRecipe>;
}

/**
 * Result of running a baseline experiment.
 */
export interface BaselineResult {
  /** The baseline experiment */
  experiment: ResearchExperiment;
  /** The completed run */
  run: ResearchRun;
  /** Full runner result */
  runnerResult: ResearchExperimentRunnerResult;
}

/**
 * Result of an ablation study.
 */
export interface AblationWorkflowResult {
  /** The baseline result */
  baseline: BaselineResult;
  /** All variant results */
  variants: Array<{
    variant: AblationVariantDef;
    experiment: ResearchExperiment;
    run: ResearchRun;
    runnerResult: ResearchExperimentRunnerResult;
  }>;
  /** Comparison of all runs */
  comparison: ExperimentComparisonResult;
  /** Per-metric winners */
  winners: Record<string, { name: string; value: number }>;
  /** Best overall variant (by lowest loss) */
  bestVariant: string;
  /** Total wall-clock time for the entire study */
  totalDurationMs: number;
}

// ============================================================
// BaselineWorkflow
// ============================================================

export class BaselineWorkflow {
  private runner: ResearchExperimentRunner;

  constructor(runner: ResearchExperimentRunner) {
    this.runner = runner;
  }

  /**
   * Run a baseline experiment.
   *
   * This is the simplest workflow: create and run one experiment.
   *
   * @param experiment — the experiment definition to run as baseline
   * @returns baseline result with run record and training data
   */
  async runBaseline(
    experiment: ResearchExperiment
  ): Promise<BaselineResult> {
    const runnerResult = await this.runner.run(experiment);
    return {
      experiment,
      run: runnerResult.run,
      runnerResult,
    };
  }

  /**
   * Run an ablation study: baseline + N variants.
   *
   * Each variant is an experiment derived from the baseline with
   * specific config overrides. All variants are run sequentially
   * and then compared.
   *
   * @param baseExperiment — the baseline experiment definition
   * @param variants — array of variant definitions
   * @returns complete ablation study result
   */
  async runAblation(
    baseExperiment: ResearchExperiment,
    variants: AblationVariantDef[]
  ): Promise<AblationWorkflowResult> {
    const startTime = Date.now();

    // ── Step 1: Run baseline ──
    const baseline = await this.runBaseline(baseExperiment);

    // ── Step 2: Run each variant ──
    const variantResults: AblationWorkflowResult["variants"] = [];

    for (const variant of variants) {
      // Create variant experiment by cloning baseline with overrides
      const variantExperiment = this.createVariantExperiment(
        baseExperiment,
        variant
      );

      // Run the variant
      const runnerResult = await this.runner.run(variantExperiment);

      variantResults.push({
        variant,
        experiment: variantExperiment,
        run: runnerResult.run,
        runnerResult,
      });
    }

    // ── Step 3: Collect all runs for comparison ──
    const allResults = [
      { name: baseline.experiment.name, run: baseline.run },
      ...variantResults.map((v) => ({
        name: v.experiment.name,
        run: v.run,
      })),
    ];

    // ── Step 4: Compare using ComparisonInsightEngine ──
    // Build comparison input from runs
    const comparison = this.compareRuns(
      baseline.experiment.name,
      baseline.run,
      variantResults
    );

    // ── Step 5: Find winners per metric ──
    const winners = this.findWinners(allResults);

    // ── Step 6: Find best overall variant ──
    const bestVariant = this.findBestVariant(allResults);

    const totalDurationMs = Date.now() - startTime;

    return {
      baseline,
      variants: variantResults,
      comparison,
      winners,
      bestVariant,
      totalDurationMs,
    };
  }

  /**
   * Create a variant experiment from the baseline with overrides.
   */
  private createVariantExperiment(
    base: ResearchExperiment,
    variant: AblationVariantDef
  ): ResearchExperiment {
    const now = Date.now();

    const variantExperiment: ResearchExperiment = {
      ...base,
      id: generateExperimentId(),
      name: `${base.name} — ${variant.name}`,
      description: variant.description || `Ablation variant: ${variant.name}`,
      createdAt: now,
      updatedAt: now,
      status: "ready",
      baselineExperimentId: base.id,
      modelConfig: {
        ...base.modelConfig,
        ...(variant.modelConfigOverrides ?? {}),
      },
      trainingConfig: {
        ...base.trainingConfig,
        ...(variant.trainingConfigOverrides ?? {}),
      },
      tags: [...base.tags, "ablation", variant.name],
    };

    return variantExperiment;
  }

  /**
   * Compare runs and produce an ExperimentComparisonResult.
   *
   * Uses the same ranking logic as ComparisonInsightEngine
   * but operates on ResearchRun directly, avoiding the need
   * for full ExperimentRecord construction.
   */
  private compareRuns(
    baselineName: string,
    baselineRun: ResearchRun,
    variantResults: AblationWorkflowResult["variants"]
  ): ExperimentComparisonResult {
    const allRuns = [
      { name: baselineName, run: baselineRun },
      ...variantResults.map((v) => ({
        name: v.experiment.name,
        run: v.run,
      })),
    ];

    const winners = this.findWinners(allRuns);

    const experimentIds = allRuns.map((r) => r.run.runId);
    const experimentNames: Record<string, string> = {};
    for (const r of allRuns) {
      experimentNames[r.run.runId] = r.name;
    }

    const metricWinners: MetricWinner[] = [];
    for (const [metric, w] of Object.entries(winners)) {
      const values: Record<string, number> = {};
      for (const r of allRuns) {
        values[r.run.runId] = w.value;
      }
      metricWinners.push({
        metric,
        label: metric,
        winnerId: allRuns.find((r) => r.name === w.name)?.run.runId ?? "",
        winnerName: w.name,
        winningValue: w.value,
        values,
        improvementRatio: 0,
        description: `${w.name} wins ${metric} with value ${w.value.toFixed(4)}`,
      });
    }

    const tradeoffs: TradeOff[] = [];
    const summaryLines: string[] = [];
    for (const mw of metricWinners) {
      summaryLines.push(`${mw.label}: ${mw.winnerName} (${mw.winningValue.toFixed(4)})`);
    }

    return {
      experimentIds,
      experimentNames,
      computedAt: Date.now(),
      winners: metricWinners,
      tradeoffs,
      summary: summaryLines.join("; "),
    };
  }

  /**
   * Find the winner per metric.
   */
  private findWinners(
    results: Array<{ name: string; run: ResearchRun }>
  ): Record<string, { name: string; value: number }> {
    const winners: Record<string, { name: string; value: number }> = {};

    // Best loss (lowest)
    const bestLoss = results.reduce((best, r) =>
      r.run.bestLoss < best.run.bestLoss ? r : best
    );
    winners["bestLoss"] = {
      name: bestLoss.name,
      value: bestLoss.run.bestLoss,
    };

    // Fastest (highest tokens/sec)
    const fastest = results.reduce((best, r) =>
      r.run.tokensPerSecond > best.run.tokensPerSecond ? r : best
    );
    winners["tokensPerSecond"] = {
      name: fastest.name,
      value: fastest.run.tokensPerSecond,
    };

    // Most stable (lowest perplexity)
    const bestPpl = results.reduce((best, r) => {
      const pplA = Number.isFinite(best.run.perplexity) ? best.run.perplexity : Infinity;
      const pplB = Number.isFinite(r.run.perplexity) ? r.run.perplexity : Infinity;
      return pplB < pplA ? r : best;
    });
    winners["perplexity"] = {
      name: bestPpl.name,
      value: Number.isFinite(bestPpl.run.perplexity) ? bestPpl.run.perplexity : Infinity,
    };

    return winners;
  }

  /**
   * Find the best variant by composite score.
   *
   * Simple heuristic: lowest bestLoss wins.
   */
  private findBestVariant(
    results: Array<{ name: string; run: ResearchRun }>
  ): string {
    let best = results[0];
    for (const r of results) {
      if (r.run.bestLoss < best.run.bestLoss) {
        best = r;
      }
    }
    return best.name;
  }

  /**
   * Generate a human-readable summary of the ablation study.
   */
  summarizeResult(result: AblationWorkflowResult): string {
    const lines: string[] = [];
    lines.push("=".repeat(60));
    lines.push("ABLATION STUDY RESULTS");
    lines.push("=".repeat(60));
    lines.push("");
    lines.push(`Baseline: ${result.baseline.experiment.name}`);
    lines.push(`  Loss: ${result.baseline.run.bestLoss.toFixed(4)}`);
    lines.push(`  PPL:  ${Number.isFinite(result.baseline.run.perplexity) ? result.baseline.run.perplexity.toFixed(2) : "N/A"}`);
    lines.push("");
    lines.push(`Variants (${result.variants.length}):`);
    for (const v of result.variants) {
      const improvement =
        result.baseline.run.bestLoss > 0
          ? ((result.baseline.run.bestLoss - v.run.bestLoss) /
              result.baseline.run.bestLoss) *
            100
          : 0;
      const sign = improvement > 0 ? "↓" : "↑";
      lines.push(
        `  ${v.variant.name}: loss=${v.run.bestLoss.toFixed(4)} ` +
        `(${sign}${Math.abs(improvement).toFixed(1)}% vs baseline)`
      );
    }
    lines.push("");
    lines.push("Winners:");
    for (const [metric, winner] of Object.entries(result.winners)) {
      lines.push(`  ${metric}: ${winner.name} (${winner.value.toFixed(4)})`);
    }
    lines.push("");
    lines.push(`Best variant: ${result.bestVariant}`);
    lines.push(
      `Total duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`
    );
    lines.push("");
    lines.push("Comparison summary:");
    lines.push(result.comparison.summary);
    lines.push("=".repeat(60));

    return lines.join("\n");
  }
}
