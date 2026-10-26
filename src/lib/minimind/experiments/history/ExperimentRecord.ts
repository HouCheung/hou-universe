// ============================================================
// MiniMind — experiments/history/ExperimentRecord.ts
// ============================================================
// Phase 51: Experiment Record type definitions.
//
// ExperimentRecord is the canonical shape for a single experiment
// run stored in the history. It captures:
//   - Identity (id, name, createdAt)
//   - Configuration (modelConfig, trainingConfig)
//   - Results (metrics)
//   - Lifecycle (status, checkpoint)
//
// Design principles:
//   - JSON-serializable — all fields must survive JSON.stringify/parse
//   - Immutable consumer view — consumers receive copies, not references
//   - Explicit nullability — optional fields use `| undefined`, not `?` with implicit undefined
// ============================================================

import type { ModelConfigEntry } from "../ModelRegistry";
import type { TrainingRecipe } from "../TrainingRecipe";

// ============================================================
// ExperimentMetrics
// ============================================================

/**
 * Key metrics captured at the end of an experiment run.
 *
 * All loss values are raw float values (no rounding at storage layer).
 * Presentation-layer rounding is the responsibility of UI adapters.
 */
export interface ExperimentMetrics {
  /** Loss before the first training step */
  initialLoss: number;
  /** Loss after the final training step */
  finalLoss: number;
  /** Best (lowest) loss observed during the entire run */
  bestLoss: number;
  /** Perplexity = exp(bestLoss). NaN if bestLoss is not available. */
  perplexity: number;
  /** Tokens processed per second (wall-clock throughput) */
  tokensPerSecond: number;
}

// ============================================================
// ExperimentStatus
// ============================================================

/**
 * Lifecycle status of an experiment run.
 *
 *   - "running"    —  execution in progress (metrics may be partial)
 *   - "completed"  —  execution finished successfully
 *   - "failed"     —  execution terminated with an error
 */
export type ExperimentStatus = "running" | "completed" | "failed";

// ============================================================
// ExperimentRecord
// ============================================================

/**
 * A single experiment run stored in the history store.
 *
 * This is the canonical shape. All history operations read and write
 * ExperimentRecord objects. The store layer handles serialization —
 * consumers never need to call JSON.stringify/parse themselves.
 *
 * Usage:
 *   import type { ExperimentRecord } from "./history/ExperimentRecord";
 *   const record: ExperimentRecord = { ... };
 */
export interface ExperimentRecord {
  /** Unique identifier (UUID v4 or kebab-case) */
  id: string;
  /** Human-readable name for this run (e.g. "TinyStories — LR 0.001") */
  name: string;
  /** Unix timestamp (ms) when the record was created */
  createdAt: number;

  /** Model architecture configuration used for this run */
  modelConfig: ModelConfigEntry;
  /** Training hyperparameters and dataset configuration */
  trainingConfig: TrainingRecipe;

  /** Key result metrics */
  metrics: ExperimentMetrics;

  /** Lifecycle status */
  status: ExperimentStatus;

  /**
   * Path to the saved checkpoint file, if one was produced.
   * Undefined when no checkpoint was saved (e.g., the run failed
   * before the first checkpoint step).
   */
  checkpoint: string | undefined;
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a new ExperimentRecord with defaults filled in.
 *
 * The returned record has status "running" and a current timestamp.
 * Callers should fill in modelConfig, trainingConfig, and metrics
 * after construction.
 *
 * @param id   — unique identifier for this run
 * @param name — human-readable name
 * @returns a new ExperimentRecord with sensible defaults
 */
export function createExperimentRecord(
  id: string,
  name: string,
  modelConfig: ModelConfigEntry,
  trainingConfig: TrainingRecipe
): ExperimentRecord {
  return {
    id,
    name,
    createdAt: Date.now(),
    modelConfig: { ...modelConfig },
    trainingConfig: { ...trainingConfig },
    metrics: {
      initialLoss: Infinity,
      finalLoss: Infinity,
      bestLoss: Infinity,
      perplexity: NaN,
      tokensPerSecond: 0,
    },
    status: "running",
    checkpoint: undefined,
  };
}

// ============================================================
// Guards
// ============================================================

/**
 * Type guard: check whether an unknown value is a valid ExperimentRecord shape.
 *
 * This is a lightweight structural check — it verifies required fields exist
 * with correct types but does NOT deeply validate modelConfig / trainingConfig
 * sub-objects. Use validateExperimentRecord() for full validation.
 */
export function isExperimentRecord(value: unknown): value is ExperimentRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.name === "string" &&
    typeof r.createdAt === "number" &&
    typeof r.modelConfig === "object" &&
    r.modelConfig !== null &&
    typeof r.trainingConfig === "object" &&
    r.trainingConfig !== null &&
    typeof r.metrics === "object" &&
    r.metrics !== null &&
    typeof r.status === "string" &&
    ["running", "completed", "failed"].includes(r.status as string)
  );
}

/**
 * Full validation of an ExperimentRecord.
 *
 * Checks all nested fields for correctness. Throws on invalid data.
 * Use this before persisting records to the store.
 *
 * @param value — raw data to validate
 * @throws if any field is missing or invalid
 */
export function validateExperimentRecord(
  value: unknown
): asserts value is ExperimentRecord {
  if (!isExperimentRecord(value)) {
    throw new Error(
      "ExperimentRecord: value does not match the ExperimentRecord shape"
    );
  }

  const r = value as ExperimentRecord;

  if (r.id.trim().length === 0) {
    throw new Error("ExperimentRecord: id must be a non-empty string");
  }
  if (r.name.trim().length === 0) {
    throw new Error("ExperimentRecord: name must be a non-empty string");
  }
  if (!Number.isFinite(r.createdAt) || r.createdAt <= 0) {
    throw new Error("ExperimentRecord: createdAt must be a positive number");
  }

  const m = r.metrics;
  if (typeof m.initialLoss !== "number") {
    throw new Error("ExperimentRecord: metrics.initialLoss must be a number");
  }
  if (typeof m.finalLoss !== "number") {
    throw new Error("ExperimentRecord: metrics.finalLoss must be a number");
  }
  if (typeof m.bestLoss !== "number") {
    throw new Error("ExperimentRecord: metrics.bestLoss must be a number");
  }
  if (typeof m.perplexity !== "number") {
    throw new Error("ExperimentRecord: metrics.perplexity must be a number");
  }
  if (typeof m.tokensPerSecond !== "number" || m.tokensPerSecond < 0) {
    throw new Error(
      "ExperimentRecord: metrics.tokensPerSecond must be a non-negative number"
    );
  }
}

// ============================================================
// Comparison helpers
// ============================================================

/**
 * Compare two records by createdAt (most recent first).
 * Suitable for Array.prototype.sort().
 */
export function compareByDate(
  a: ExperimentRecord,
  b: ExperimentRecord
): number {
  return b.createdAt - a.createdAt;
}

/**
 * Compare two records by bestLoss (lowest loss first).
 * Suitable for Array.prototype.sort().
 */
export function compareByBestLoss(
  a: ExperimentRecord,
  b: ExperimentRecord
): number {
  return a.metrics.bestLoss - b.metrics.bestLoss;
}

/**
 * Human-readable summary of an experiment record.
 *
 * @returns multi-line string suitable for console or UI display
 */
export function summarizeRecord(record: ExperimentRecord): string {
  const m = record.metrics;
  const ckpt = record.checkpoint ?? "(none)";
  return [
    `${"=".repeat(52)}`,
    `Experiment: ${record.name}`,
    `ID:         ${record.id}`,
    `Status:     ${record.status}`,
    `Created:    ${new Date(record.createdAt).toISOString()}`,
    `Model:      ${record.modelConfig.label} (${record.modelConfig.name})`,
    `Recipe:     ${record.trainingConfig.name}`,
    `${"-".repeat(52)}`,
    `Initial Loss:   ${m.initialLoss.toFixed(4)}`,
    `Final Loss:     ${m.finalLoss.toFixed(4)}`,
    `Best Loss:      ${m.bestLoss.toFixed(4)}`,
    `Perplexity:     ${Number.isFinite(m.perplexity) ? m.perplexity.toFixed(2) : "N/A"}`,
    `Tokens/sec:     ${m.tokensPerSecond.toFixed(1)}`,
    `Checkpoint:     ${ckpt}`,
    `${"=".repeat(52)}`,
  ].join("\n");
}
