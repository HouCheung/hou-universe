// ============================================================
// MiniMind — experiments/history/ExperimentComparison.ts
// ============================================================
// Phase 51: Experiment record comparison engine.
//
// Compares 2+ ExperimentRecords across all dimensions:
//   - Model architecture (modelConfig)
//   - Training hyperparameters (trainingConfig)
//   - Performance metrics
//
// Produces structured comparison data suitable for UI rendering
// (tables, charts, summary cards).
//
// Design principles:
//   - Pure functions — no side effects, no store dependency
//   - Typed outputs — every comparison returns a structured type
//   - Ranked results — comparisons include winner/loser/delta info
//   - Follows Ablation.buildComparisonTable() and BenchmarkReport.compare() patterns
// ============================================================

import type { ExperimentRecord, ExperimentMetrics } from "./ExperimentRecord";
import type { TrainingRecipe } from "../TrainingRecipe";

// ============================================================
// Types
// ============================================================

/**
 * A single delta value with direction indicator.
 */
export interface MetricDelta {
  /** Absolute difference (b - a) */
  absolute: number;
  /** Relative change as a ratio (b - a) / |a|. 0 when a is 0. */
  relative: number;
  /** Which value is better ("a" | "b" | "tie") */
  winner: "a" | "b" | "tie";
  /** Human-readable description of the difference */
  description: string;
}

/**
 * Pairwise comparison of two experiment records.
 */
export interface RecordPairComparison {
  recordA: ExperimentRecord;
  recordB: ExperimentRecord;
  metrics: {
    initialLoss: MetricDelta;
    finalLoss: MetricDelta;
    bestLoss: MetricDelta;
    perplexity: MetricDelta;
    tokensPerSecond: MetricDelta;
  };
  /** Which record wins on more metrics */
  overallWinner: "a" | "b" | "tie";
  /** Count of metrics won by each side */
  score: { a: number; b: number; ties: number };
  /** Human-readable summary */
  summary: string;
}

/**
 * A single row in a multi-record comparison table.
 */
export interface ComparisonTableRow {
  /** Record name */
  name: string;
  /** Record id */
  id: string;
  /** Model label */
  model: string;
  /** Status */
  status: string;
  /** Metrics */
  initialLoss: number;
  finalLoss: number;
  bestLoss: number;
  perplexity: number;
  tokensPerSecond: number;
  /** Loss reduction percentage */
  lossReduction: number;
  /** Timestamp */
  createdAt: number;
}

/**
 * Multi-record comparison table.
 */
export interface ComparisonTable {
  /** Column headers */
  columns: string[];
  /** Data rows */
  rows: ComparisonTableRow[];
  /** Best value per metric column (for highlighting) */
  best: {
    bestLoss: number;
    perplexity: number;
    tokensPerSecond: number;
    lossReduction: number;
  };
}

/**
 * Training config diff between two records.
 */
export interface TrainingDiff {
  field: string;
  label: string;
  valueA: string;
  valueB: string;
  changed: boolean;
}

// ============================================================
// Delta computation
// ============================================================

/**
 * Compute a metric delta between two values.
 *
 * For loss and perplexity: lower is better.
 * For tokensPerSecond: higher is better.
 */
function computeDelta(
  a: number,
  b: number,
  lowerIsBetter: boolean
): MetricDelta {
  const absolute = b - a;
  const relative = a !== 0 ? (b - a) / Math.abs(a) : 0;

  let winner: "a" | "b" | "tie";
  if (a === b || (isNaN(a) && isNaN(b))) {
    winner = "tie";
  } else if (isNaN(a)) {
    winner = "b";
  } else if (isNaN(b)) {
    winner = "a";
  } else if (lowerIsBetter) {
    winner = b < a ? "b" : "a";
  } else {
    winner = b > a ? "b" : "a";
  }

  const direction =
    absolute === 0
      ? "no change"
      : lowerIsBetter
        ? absolute < 0
          ? "improved"
          : "worsened"
        : absolute > 0
          ? "improved"
          : "worsened";

  const pct =
    relative !== 0
      ? ` (${(Math.abs(relative) * 100).toFixed(1)}% ${direction})`
      : "";

  return {
    absolute,
    relative,
    winner,
    description: `${absolute >= 0 ? "+" : ""}${absolute.toFixed(4)}${pct}`,
  };
}

// ============================================================
// Pairwise comparison
// ============================================================

/**
 * Compare two experiment records side by side.
 *
 * Produces per-metric deltas with winners and an overall assessment.
 *
 * @param a — first record
 * @param b — second record
 * @returns structured pairwise comparison
 */
export function compareRecords(
  a: ExperimentRecord,
  b: ExperimentRecord
): RecordPairComparison {
  const initialLoss = computeDelta(
    a.metrics.initialLoss,
    b.metrics.initialLoss,
    true
  );
  const finalLoss = computeDelta(
    a.metrics.finalLoss,
    b.metrics.finalLoss,
    true
  );
  const bestLoss = computeDelta(
    a.metrics.bestLoss,
    b.metrics.bestLoss,
    true
  );
  const perplexity = computeDelta(
    a.metrics.perplexity,
    b.metrics.perplexity,
    true
  );
  const tokensPerSecond = computeDelta(
    a.metrics.tokensPerSecond,
    b.metrics.tokensPerSecond,
    false
  );

  // Tally scores
  let scoreA = 0;
  let scoreB = 0;
  let ties = 0;

  for (const delta of [initialLoss, finalLoss, bestLoss, perplexity, tokensPerSecond]) {
    if (delta.winner === "a") scoreA++;
    else if (delta.winner === "b") scoreB++;
    else ties++;
  }

  const overallWinner =
    scoreA > scoreB ? "a" : scoreB > scoreA ? "b" : "tie";

  const winnerName =
    overallWinner === "a" ? a.name : overallWinner === "b" ? b.name : "Tie";

  const summary =
    overallWinner === "tie"
      ? `Tie — both "${a.name}" and "${b.name}" perform similarly.`
      : `"${winnerName}" wins (${Math.max(scoreA, scoreB)}/${scoreA + scoreB + ties} metrics better).`;

  return {
    recordA: a,
    recordB: b,
    metrics: {
      initialLoss,
      finalLoss,
      bestLoss,
      perplexity,
      tokensPerSecond,
    },
    overallWinner,
    score: { a: scoreA, b: scoreB, ties },
    summary,
  };
}

// ============================================================
// Multi-record comparison table
// ============================================================

/**
 * Build a comparison table from multiple experiment records.
 *
 * Sorts by bestLoss ascending (best model first).
 * Computes best values across all records for highlighting.
 *
 * @param records — array of records to compare
 * @returns structured table data
 */
export function buildComparisonTable(
  records: ExperimentRecord[]
): ComparisonTable {
  if (records.length === 0) {
    return {
      columns: [],
      rows: [],
      best: { bestLoss: 0, perplexity: 0, tokensPerSecond: 0, lossReduction: 0 },
    };
  }

  const rows: ComparisonTableRow[] = records
    .map((r) => ({
      name: r.name,
      id: r.id,
      model: r.modelConfig.label,
      status: r.status,
      initialLoss: r.metrics.initialLoss,
      finalLoss: r.metrics.finalLoss,
      bestLoss: r.metrics.bestLoss,
      perplexity: r.metrics.perplexity,
      tokensPerSecond: r.metrics.tokensPerSecond,
      lossReduction:
        r.metrics.initialLoss !== 0
          ? (r.metrics.initialLoss - r.metrics.finalLoss) /
            r.metrics.initialLoss
          : 0,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => a.bestLoss - b.bestLoss);

  const completed = rows.filter((r) => r.status === "completed");

  const best = {
    bestLoss: Math.min(...rows.map((r) => r.bestLoss)),
    perplexity: Math.min(
      ...completed
        .filter((r) => Number.isFinite(r.perplexity))
        .map((r) => r.perplexity)
    ),
    tokensPerSecond: Math.max(...rows.map((r) => r.tokensPerSecond)),
    lossReduction: Math.max(...rows.map((r) => r.lossReduction)),
  };

  return {
    columns: [
      "Name",
      "Model",
      "Status",
      "Best Loss",
      "Perplexity",
      "Loss ↓%",
      "Tok/s",
    ],
    rows,
    best,
  };
}

// ============================================================
// Training config diff
// ============================================================

/**
 * Compute the training configuration differences between two records.
 *
 * Each field shows the values from both records and whether they differ.
 *
 * @param a — first record
 * @param b — second record
 * @returns array of field diffs
 */
export function diffTrainingConfigs(
  a: ExperimentRecord,
  b: ExperimentRecord
): TrainingDiff[] {
  const ta = a.trainingConfig;
  const tb = b.trainingConfig;

  const fields: TrainingDiff[] = [
    {
      field: "model",
      label: "Model",
      valueA: ta.model,
      valueB: tb.model,
      changed: ta.model !== tb.model,
    },
    {
      field: "dataset",
      label: "Dataset",
      valueA: ta.dataset.dataset,
      valueB: tb.dataset.dataset,
      changed: ta.dataset.dataset !== tb.dataset.dataset,
    },
    {
      field: "blockSize",
      label: "Block Size",
      valueA: String(ta.dataset.blockSize),
      valueB: String(tb.dataset.blockSize),
      changed: ta.dataset.blockSize !== tb.dataset.blockSize,
    },
    {
      field: "batchSize",
      label: "Batch Size",
      valueA: String(ta.dataset.batchSize),
      valueB: String(tb.dataset.batchSize),
      changed: ta.dataset.batchSize !== tb.dataset.batchSize,
    },
    {
      field: "optimizer",
      label: "Optimizer",
      valueA: `${ta.optimizer.type} (lr=${ta.optimizer.lr})`,
      valueB: `${tb.optimizer.type} (lr=${tb.optimizer.lr})`,
      changed:
        ta.optimizer.type !== tb.optimizer.type ||
        ta.optimizer.lr !== tb.optimizer.lr,
    },
    {
      field: "scheduler",
      label: "Scheduler",
      valueA: ta.scheduler.type,
      valueB: tb.scheduler.type,
      changed: ta.scheduler.type !== tb.scheduler.type,
    },
    {
      field: "epochs",
      label: "Epochs",
      valueA: String(ta.epochs),
      valueB: String(tb.epochs),
      changed: ta.epochs !== tb.epochs,
    },
    {
      field: "gradientAccumulation",
      label: "Grad Accum",
      valueA: String(ta.gradientAccumulation),
      valueB: String(tb.gradientAccumulation),
      changed: ta.gradientAccumulation !== tb.gradientAccumulation,
    },
    {
      field: "warmupSteps",
      label: "Warmup Steps",
      valueA: String(ta.warmupSteps),
      valueB: String(tb.warmupSteps),
      changed: ta.warmupSteps !== tb.warmupSteps,
    },
    {
      field: "seed",
      label: "Seed",
      valueA: String(ta.seed),
      valueB: String(tb.seed),
      changed: ta.seed !== tb.seed,
    },
    {
      field: "gradientClipNorm",
      label: "Grad Clip Norm",
      valueA: ta.gradientClipNorm !== undefined ? String(ta.gradientClipNorm) : "disabled",
      valueB: tb.gradientClipNorm !== undefined ? String(tb.gradientClipNorm) : "disabled",
      changed: ta.gradientClipNorm !== tb.gradientClipNorm,
    },
  ];

  return fields;
}

// ============================================================
// Model architecture diff
// ============================================================

/**
 * Compute the model architecture differences between two records.
 */
export interface ModelDiff {
  field: string;
  label: string;
  valueA: string;
  valueB: string;
  changed: boolean;
}

export function diffModelConfigs(
  a: ExperimentRecord,
  b: ExperimentRecord
): ModelDiff[] {
  const ma = a.modelConfig;
  const mb = b.modelConfig;

  return [
    {
      field: "dModel",
      label: "dModel",
      valueA: String(ma.dModel),
      valueB: String(mb.dModel),
      changed: ma.dModel !== mb.dModel,
    },
    {
      field: "numHeads",
      label: "Heads",
      valueA: String(ma.numHeads),
      valueB: String(mb.numHeads),
      changed: ma.numHeads !== mb.numHeads,
    },
    {
      field: "dFF",
      label: "dFF",
      valueA: String(ma.dFF),
      valueB: String(mb.dFF),
      changed: ma.dFF !== mb.dFF,
    },
    {
      field: "numLayers",
      label: "Layers",
      valueA: String(ma.numLayers),
      valueB: String(mb.numLayers),
      changed: ma.numLayers !== mb.numLayers,
    },
    {
      field: "vocabSize",
      label: "Vocab Size",
      valueA: String(ma.vocabSize),
      valueB: String(mb.vocabSize),
      changed: ma.vocabSize !== mb.vocabSize,
    },
    {
      field: "maxSeqLen",
      label: "Max Seq Len",
      valueA: String(ma.maxSeqLen),
      valueB: String(mb.maxSeqLen),
      changed: ma.maxSeqLen !== mb.maxSeqLen,
    },
    {
      field: "estimatedParams",
      label: "Est. Params",
      valueA: ma.estimatedParams.toLocaleString(),
      valueB: mb.estimatedParams.toLocaleString(),
      changed: ma.estimatedParams !== mb.estimatedParams,
    },
  ];
}

// ============================================================
// Ranking
// ============================================================

/**
 * Rank records by a specific metric.
 *
 * @param records — records to rank
 * @param metric  — which metric to rank by
 * @param order   — "asc" (lower is better) or "desc" (higher is better)
 * @returns records with rank positions added
 */
export interface RankedRecord {
  rank: number;
  record: ExperimentRecord;
  value: number;
}

export function rankByMetric(
  records: ExperimentRecord[],
  metric: keyof ExperimentMetrics,
  order: "asc" | "desc" = "asc"
): RankedRecord[] {
  const sorted = [...records]
    .map((r) => ({
      record: r,
      value: r.metrics[metric],
    }))
    .filter((r) => Number.isFinite(r.value));

  sorted.sort((a, b) =>
    order === "asc" ? a.value - b.value : b.value - a.value
  );

  return sorted.map((item, index) => ({
    rank: index + 1,
    record: item.record,
    value: item.value,
  }));
}

// ============================================================
// Summary
// ============================================================

/**
 * Produce a human-readable summary of a comparison table.
 */
export function summarizeComparison(table: ComparisonTable): string {
  if (table.rows.length === 0) return "No records to compare.";

  const lines: string[] = [
    `Comparison: ${table.rows.length} experiment runs`,
    `${"-".repeat(48)}`,
  ];

  for (const row of table.rows) {
    const bestMark =
      row.bestLoss === table.best.bestLoss ? " ★ best loss" : "";
    lines.push(
      `${row.name.padEnd(24)} loss=${row.bestLoss.toFixed(4)} ` +
        `ppl=${Number.isFinite(row.perplexity) ? row.perplexity.toFixed(2) : "N/A"} ` +
        `tok/s=${row.tokensPerSecond.toFixed(0)}${bestMark}`
    );
  }

  return lines.join("\n");
}
