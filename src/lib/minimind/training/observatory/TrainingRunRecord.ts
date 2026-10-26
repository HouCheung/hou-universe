// ============================================================
// MiniMind — training/observatory/TrainingRunRecord.ts
// ============================================================
// Phase 53: Training Run Record type definitions.
//
// TrainingRunRecord extends the concept of ExperimentRecord by
// storing full per-step history arrays (loss, perplexity, LR,
// throughput) plus checkpoint info and generation samples —
// data that is too large for the aggregate ExperimentRecord.
//
// Design principles:
//   - JSON-serializable — all fields survive stringify/parse
//   - Immutable consumer view — consumers receive copies
//   - Explicit nullability — `| undefined`, not `?` with implicit
//   - Browser-safe — no Node.js types
// ============================================================

import type { ModelConfigEntry } from "../../experiments/ModelRegistry";
import type { TrainingRecipe } from "../../experiments/TrainingRecipe";

// ============================================================
// History Point Types
// ============================================================

/**
 * A single (step, value) pair for loss history.
 */
export interface LossHistoryPoint {
  /** Optimizer step number */
  step: number;
  /** Loss value at this step */
  loss: number;
}

/**
 * A single (step, value) pair for perplexity history.
 */
export interface PerplexityHistoryPoint {
  /** Optimizer step number */
  step: number;
  /** Perplexity = exp(loss) at this step */
  perplexity: number;
}

/**
 * A single (step, value) pair for learning rate history.
 */
export interface LearningRateHistoryPoint {
  /** Optimizer step number */
  step: number;
  /** Learning rate at this step */
  learningRate: number;
}

/**
 * A single (step, value) pair for throughput history.
 */
export interface ThroughputHistoryPoint {
  /** Optimizer step number */
  step: number;
  /** Tokens processed per second at this step */
  tokensPerSecond: number;
}

// ============================================================
// Generation Sample Types
// ============================================================

/**
 * A single generation sample (before vs after training).
 */
export interface GenerationSample {
  /** The input prompt */
  prompt: string;
  /** Text generated before training */
  before: string;
  /** Text generated after training */
  after: string;
  /** Whether the output changed meaningfully */
  changed: boolean;
  /** Change in average log probability */
  logProbDelta: number;
  /** Change in perplexity */
  perplexityDelta: number;
}

// ============================================================
// Checkpoint Info
// ============================================================

/**
 * Lightweight checkpoint metadata stored in the record.
 *
 * The full checkpoint binary lives on disk; this stores
 * just enough info to locate and describe it.
 */
export interface CheckpointInfo {
  /** File path to the checkpoint (relative to experiment output dir) */
  path: string;
  /** Step at which the checkpoint was saved */
  step: number;
  /** Loss at checkpoint time */
  loss: number;
  /** Size in bytes (approximate) */
  sizeBytes: number;
}

// ============================================================
// Dataset Info
// ============================================================

/**
 * Dataset metadata stored in the training run record.
 */
export interface DatasetInfo {
  /** Dataset name (e.g. "TinyStories") */
  name: string;
  /** Number of training samples */
  sampleCount: number;
  /** Block size (sequence length) */
  blockSize: number;
  /** Batch size */
  batchSize: number;
  /** Tokenizer vocabulary size */
  tokenizerVocabSize: number;
  /** Tokenizer type (e.g. "BPE", "character") */
  tokenizerType: string;
}

// ============================================================
// TrainingRunRecord
// ============================================================

/**
 * A single training run record with full per-step history.
 *
 * This is the canonical shape for the training metrics store.
 * All observatory operations read and write TrainingRunRecord
 * objects. The store layer handles serialization — consumers
 * never call JSON.stringify/parse themselves.
 */
export interface TrainingRunRecord {
  /** Unique identifier (UUID v4 or kebab-case) */
  id: string;

  /** Human-readable experiment name (e.g. "TinyStories — LR 0.001") */
  experimentName: string;

  /** Unix timestamp (ms) when the record was created */
  timestamp: number;

  /** Model architecture configuration used for this run */
  modelConfig: ModelConfigEntry;

  /** Training hyperparameters and dataset configuration */
  trainingConfig: TrainingRecipe;

  /** Dataset metadata */
  datasetInfo: DatasetInfo;

  // ── Full per-step history arrays ──

  /** Loss values recorded at each logging step */
  lossHistory: LossHistoryPoint[];

  /** Perplexity values recorded at each logging step */
  perplexityHistory: PerplexityHistoryPoint[];

  /** Learning rate values recorded at each logging step */
  learningRateHistory: LearningRateHistoryPoint[];

  /** Throughput values recorded at each logging step */
  throughputHistory: ThroughputHistoryPoint[];

  // ── Summary metrics ──

  /** Initial loss (first recorded) */
  initialLoss: number;
  /** Final loss (last recorded) */
  finalLoss: number;
  /** Best (lowest) loss achieved */
  bestLoss: number;
  /** Step at which bestLoss was achieved */
  bestStep: number;
  /** Final perplexity */
  finalPerplexity: number;
  /** Average tokens per second across the run */
  averageThroughput: number;
  /** Total training duration in milliseconds */
  durationMs: number;
  /** Total number of optimizer steps */
  totalSteps: number;
  /** Total number of epochs */
  totalEpochs: number;

  // ── Checkpoint ──

  /** Checkpoint metadata (undefined if no checkpoint was saved) */
  checkpoint: CheckpointInfo | undefined;

  // ── Generation samples ──

  /** Before/after generation comparison samples */
  generationSamples: GenerationSample[];

  // ── Lifecycle ──

  /** Run status */
  status: "running" | "completed" | "failed";

  /** Error message if status is "failed" */
  errorMessage: string | undefined;

  /** Arbitrary tags for filtering/organization */
  tags: string[];
}

// ============================================================
// Factory
// ============================================================

/**
 * Create a new TrainingRunRecord with defaults filled in.
 *
 * The returned record has status "running" and empty history
 * arrays. Callers fill in data as training progresses.
 *
 * @param id             — unique identifier
 * @param experimentName — human-readable name
 * @param modelConfig    — model architecture config
 * @param trainingConfig — training hyperparameters
 * @param datasetInfo    — dataset metadata
 * @returns a new TrainingRunRecord with sensible defaults
 */
export function createTrainingRunRecord(
  id: string,
  experimentName: string,
  modelConfig: ModelConfigEntry,
  trainingConfig: TrainingRecipe,
  datasetInfo: DatasetInfo
): TrainingRunRecord {
  const now = Date.now();
  return {
    id,
    experimentName,
    timestamp: now,
    modelConfig: { ...modelConfig },
    trainingConfig: { ...trainingConfig },
    datasetInfo: { ...datasetInfo },
    lossHistory: [],
    perplexityHistory: [],
    learningRateHistory: [],
    throughputHistory: [],
    initialLoss: Infinity,
    finalLoss: Infinity,
    bestLoss: Infinity,
    bestStep: 0,
    finalPerplexity: NaN,
    averageThroughput: 0,
    durationMs: 0,
    totalSteps: 0,
    totalEpochs: 0,
    checkpoint: undefined,
    generationSamples: [],
    status: "running",
    errorMessage: undefined,
    tags: [],
  };
}

// ============================================================
// Guards
// ============================================================

/**
 * Type guard: check whether an unknown value has the
 * TrainingRunRecord shape.
 */
export function isTrainingRunRecord(
  value: unknown
): value is TrainingRunRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.experimentName === "string" &&
    typeof r.timestamp === "number" &&
    typeof r.modelConfig === "object" &&
    r.modelConfig !== null &&
    typeof r.trainingConfig === "object" &&
    r.trainingConfig !== null &&
    typeof r.datasetInfo === "object" &&
    r.datasetInfo !== null &&
    Array.isArray(r.lossHistory) &&
    Array.isArray(r.perplexityHistory) &&
    Array.isArray(r.learningRateHistory) &&
    Array.isArray(r.throughputHistory) &&
    typeof r.status === "string" &&
    ["running", "completed", "failed"].includes(r.status as string)
  );
}

/**
 * Full validation of a TrainingRunRecord.
 *
 * @throws if any required field is missing or invalid
 */
export function validateTrainingRunRecord(
  value: unknown
): asserts value is TrainingRunRecord {
  if (!isTrainingRunRecord(value)) {
    throw new Error(
      "TrainingRunRecord: value does not match the TrainingRunRecord shape"
    );
  }

  const r = value as TrainingRunRecord;

  if (r.id.trim().length === 0) {
    throw new Error("TrainingRunRecord: id must be a non-empty string");
  }
  if (r.experimentName.trim().length === 0) {
    throw new Error(
      "TrainingRunRecord: experimentName must be a non-empty string"
    );
  }
  if (!Number.isFinite(r.timestamp) || r.timestamp <= 0) {
    throw new Error(
      "TrainingRunRecord: timestamp must be a positive number"
    );
  }
  if (typeof r.initialLoss !== "number") {
    throw new Error("TrainingRunRecord: initialLoss must be a number");
  }
  if (typeof r.finalLoss !== "number") {
    throw new Error("TrainingRunRecord: finalLoss must be a number");
  }
  if (typeof r.bestLoss !== "number") {
    throw new Error("TrainingRunRecord: bestLoss must be a number");
  }
}

// ============================================================
// Comparison helpers
// ============================================================

/**
 * Compare two records by timestamp (most recent first).
 */
export function compareByTimestamp(
  a: TrainingRunRecord,
  b: TrainingRunRecord
): number {
  return b.timestamp - a.timestamp;
}

/**
 * Compare two records by bestLoss (lowest first).
 */
export function compareByBestLoss(
  a: TrainingRunRecord,
  b: TrainingRunRecord
): number {
  return a.bestLoss - b.bestLoss;
}
