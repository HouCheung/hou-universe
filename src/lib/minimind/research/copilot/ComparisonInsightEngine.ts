// ============================================================
// MiniMind — research/copilot/ComparisonInsightEngine.ts
// ============================================================
// Phase 59: Deterministic experiment comparison intelligence.
//
// Compares multiple ExperimentRecords across key dimensions:
//   - Best loss / perplexity
//   - Training speed (tokens/sec)
//   - Parameter efficiency
//   - Stability (loss reduction consistency)
//   - Reproducibility
//
// Returns winner-by-metric and trade-off analysis.
// Does NOT collapse everything into one arbitrary score.
//
// Design principles:
//   - Pure functions — no side effects
//   - Multi-dimensional — separate winners per metric
//   - Trade-off aware — surfaces where experiments differ
//   - Deterministic — same input always gives same output
// ============================================================

import type { ExperimentRecord } from "../../experiments/history/ExperimentRecord";

// ============================================================
// Types
// ============================================================

/**
 * A comparison result for a single metric.
 */
export interface MetricWinner {
  /** Metric name */
  metric: string;
  /** Human-readable label */
  label: string;
  /** Which experiment ID won */
  winnerId: string;
  /** Winning experiment name */
  winnerName: string;
  /** Winning value */
  winningValue: number;
  /** All values for this metric, keyed by experiment ID */
  values: Record<string, number>;
  /** Relative improvement of winner over runner-up (ratio) */
  improvementRatio: number;
  /** Human-readable description */
  description: string;
}

/**
 * Trade-off between two experiments on a specific dimension.
 */
export interface TradeOff {
  /** Which experiment gains on this dimension */
  winnerId: string;
  /** What the winning experiment is better at */
  advantage: string;
  /** Numerical comparison detail */
  detail: string;
}

/**
 * Complete comparison result for a set of experiments.
 */
export interface ExperimentComparisonResult {
  /** IDs of experiments compared */
  experimentIds: string[];
  /** Experiment names */
  experimentNames: Record<string, string>;
  /** Unix timestamp when computed */
  computedAt: number;
  /** Winner for each metric */
  winners: MetricWinner[];
  /** Trade-offs between experiments */
  tradeoffs: TradeOff[];
  /** Summary text (not an "AI score") */
  summary: string;
}

// ============================================================
// Helper: find winner for a metric
// ============================================================

interface MetricConfig {
  metric: string;
  label: string;
  /** Extract the comparison value from a record */
  extract: (r: ExperimentRecord) => number;
  /** Whether lower is better */
  lowerIsBetter: boolean;
  /** Format a value for display */
  format?: (v: number) => string;
}

const METRICS: MetricConfig[] = [
  {
    metric: "bestLoss",
    label: "Best Loss",
    extract: (r) => r.metrics.bestLoss,
    lowerIsBetter: true,
  },
  {
    metric: "perplexity",
    label: "Perplexity",
    extract: (r) =>
      Number.isFinite(r.metrics.perplexity) ? r.metrics.perplexity : Infinity,
    lowerIsBetter: true,
  },
  {
    metric: "tokensPerSecond",
    label: "Training Speed",
    extract: (r) => r.metrics.tokensPerSecond,
    lowerIsBetter: false,
  },
  {
    metric: "lossReduction",
    label: "Loss Reduction",
    extract: (r) => {
      const { initialLoss, finalLoss } = r.metrics;
      if (
        !Number.isFinite(initialLoss) ||
        !Number.isFinite(finalLoss) ||
        initialLoss <= 0
      ) {
        return 0;
      }
      return (initialLoss - finalLoss) / initialLoss;
    },
    lowerIsBetter: false,
  },
  {
    metric: "parameterEfficiency",
    label: "Parameter Efficiency",
    extract: (r) => {
      const params = r.modelConfig.estimatedParams;
      const { bestLoss } = r.metrics;
      if (!params || params <= 0 || !Number.isFinite(bestLoss) || bestLoss <= 0) {
        return 0;
      }
      // Higher = more efficient (lower loss per parameter)
      return 1 / (bestLoss * params);
    },
    lowerIsBetter: false,
  },
];

// ============================================================
// Main Engine
// ============================================================

/**
 * ComparisonInsightEngine — deterministic multi-experiment comparison.
 *
 * Usage:
 *   const engine = new ComparisonInsightEngine();
 *   const result = engine.compare(experimentRecords);
 *   console.log(result.winners[0].description);
 */
export class ComparisonInsightEngine {
  /**
   * Compare a set of experiment records.
   *
   * @param records — array of ExperimentRecord (2 or more)
   * @returns ExperimentComparisonResult with per-metric winners and trade-offs
   */
  compare(records: ExperimentRecord[]): ExperimentComparisonResult {
    if (records.length < 1) {
      return {
        experimentIds: [],
        experimentNames: {},
        computedAt: Date.now(),
        winners: [],
        tradeoffs: [],
        summary: "No experiments to compare.",
      };
    }

    const ids = records.map((r) => r.id);
    const names: Record<string, string> = {};
    for (const r of records) {
      names[r.id] = r.name;
    }

    // ── Compute winners per metric ──
    const winners: MetricWinner[] = [];

    for (const metric of METRICS) {
      const values: Record<string, number> = {};
      for (const r of records) {
        const v = metric.extract(r);
        values[r.id] = Number.isFinite(v) ? v : (metric.lowerIsBetter ? Infinity : -Infinity);
      }

      const validEntries = Object.entries(values).filter(([, v]) =>
        Number.isFinite(v) && v !== Infinity && v !== -Infinity
      );

      if (validEntries.length < 2) {
        // Not enough data to compare
        if (validEntries.length === 1) {
          const [soleId, soleValue] = validEntries[0];
          winners.push({
            metric: metric.metric,
            label: metric.label,
            winnerId: soleId,
            winnerName: names[soleId] ?? soleId,
            winningValue: soleValue,
            values,
            improvementRatio: 0,
            description: `${names[soleId]} — only valid entry for ${metric.label}`,
          });
        }
        continue;
      }

      // Find winner
      let winnerId = validEntries[0][0];
      let winnerValue = validEntries[0][1];

      for (const [id, value] of validEntries) {
        const isBetter = metric.lowerIsBetter
          ? value < winnerValue
          : value > winnerValue;
        if (isBetter) {
          winnerId = id;
          winnerValue = value;
        }
      }

      // Find runner-up for improvement ratio
      const others = validEntries.filter(([id]) => id !== winnerId);
      let runnerUpValue = others[0]?.[1] ?? winnerValue;
      for (const [, value] of others) {
        const isCloser = metric.lowerIsBetter
          ? value < runnerUpValue
          : value > runnerUpValue;
        if (isCloser) runnerUpValue = value;
      }

      const improvementRatio =
        runnerUpValue !== 0 && Number.isFinite(runnerUpValue)
          ? metric.lowerIsBetter
            ? (runnerUpValue - winnerValue) / Math.abs(runnerUpValue)
            : (winnerValue - runnerUpValue) / Math.abs(runnerUpValue)
          : 0;

      const improvementPct = (Math.abs(improvementRatio) * 100).toFixed(1);
      const direction = improvementRatio >= 0 ? "better" : "worse";

      winners.push({
        metric: metric.metric,
        label: metric.label,
        winnerId,
        winnerName: names[winnerId] ?? winnerId,
        winningValue: winnerValue,
        values,
        improvementRatio: Math.abs(improvementRatio),
        description: `${names[winnerId]} ${direction} by ${improvementPct}% (${metric.label})`,
      });
    }

    // ── Build trade-offs ──
    const tradeoffs: TradeOff[] = [];

    if (records.length >= 2) {
      // For each pair, find where they differ meaningfully
      for (let i = 0; i < records.length; i++) {
        for (let j = i + 1; j < records.length; j++) {
          const a = records[i];
          const b = records[j];

          // Loss comparison
          const aLoss = a.metrics.bestLoss;
          const bLoss = b.metrics.bestLoss;
          if (
            Number.isFinite(aLoss) &&
            Number.isFinite(bLoss) &&
            Math.abs(aLoss - bLoss) > 0.01
          ) {
            const lossWinner = aLoss < bLoss ? a : b;
            const lossLoser = aLoss < bLoss ? b : a;
            const delta = Math.abs(aLoss - bLoss);
            const pct = Math.min(aLoss, bLoss) > 0
              ? (delta / Math.min(aLoss, bLoss) * 100).toFixed(1)
              : "0";
            tradeoffs.push({
              winnerId: lossWinner.id,
              advantage: "Lower Loss",
              detail: `${lossWinner.name} achieves ${pct}% lower best loss than ${lossLoser.name}`,
            });
          }

          // Throughput comparison
          const aTps = a.metrics.tokensPerSecond;
          const bTps = b.metrics.tokensPerSecond;
          if (
            Number.isFinite(aTps) &&
            Number.isFinite(bTps) &&
            aTps > 0 &&
            bTps > 0 &&
            Math.abs(aTps - bTps) / Math.max(aTps, bTps) > 0.1
          ) {
            const tpsWinner = aTps > bTps ? a : b;
            const tpsLoser = aTps > bTps ? b : a;
            const ratio = (Math.max(aTps, bTps) / Math.min(aTps, bTps)).toFixed(1);
            tradeoffs.push({
              winnerId: tpsWinner.id,
              advantage: "Higher Throughput",
              detail: `${tpsWinner.name} trains ${ratio}× faster than ${tpsLoser.name}`,
            });
          }

          // Parameter efficiency comparison
          const aParams = a.modelConfig.estimatedParams;
          const bParams = b.modelConfig.estimatedParams;
          if (
            aParams &&
            bParams &&
            aParams !== bParams &&
            Number.isFinite(aLoss) &&
            Number.isFinite(bLoss)
          ) {
            const aEff = 1 / (aLoss * aParams);
            const bEff = 1 / (bLoss * bParams);
            const effWinner = aEff > bEff ? a : b;
            const ratio = (Math.max(aEff, bEff) / Math.min(aEff, bEff)).toFixed(1);
            tradeoffs.push({
              winnerId: effWinner.id,
              advantage: "Better Parameter Efficiency",
              detail: `${effWinner.name} is ${ratio}× more parameter-efficient (lower loss per parameter)`,
            });
          }
        }
      }
    }

    // ── Build summary ──
    const lossWinner = winners.find((w) => w.metric === "bestLoss");
    const speedWinner = winners.find((w) => w.metric === "tokensPerSecond");
    const pplWinner = winners.find((w) => w.metric === "perplexity");

    let summary = "";
    if (lossWinner && speedWinner) {
      if (lossWinner.winnerId === speedWinner.winnerId) {
        summary = `${lossWinner.winnerName} dominates across both loss and speed metrics.`;
      } else {
        summary = `${lossWinner.winnerName} achieves the best loss, while ${speedWinner.winnerName} trains faster. Trade-off: accuracy vs. speed.`;
      }
    } else if (lossWinner) {
      summary = `${lossWinner.winnerName} leads in best loss.`;
    } else if (speedWinner) {
      summary = `${speedWinner.winnerName} leads in training speed.`;
    } else {
      summary = "Insufficient data to determine a clear winner.";
    }

    return {
      experimentIds: ids,
      experimentNames: names,
      computedAt: Date.now(),
      winners,
      tradeoffs,
      summary,
    };
  }

  /**
   * Get the winner for a specific metric.
   */
  getWinner(
    result: ExperimentComparisonResult,
    metric: string
  ): MetricWinner | undefined {
    return result.winners.find((w) => w.metric === metric);
  }

  /**
   * Get all trade-offs for a specific experiment.
   */
  getTradeoffsFor(
    result: ExperimentComparisonResult,
    experimentId: string
  ): TradeOff[] {
    return result.tradeoffs.filter((t) => t.winnerId === experimentId);
  }
}
