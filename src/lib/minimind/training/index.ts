// ============================================================
// MiniMind Training — Barrel export
// ============================================================
// Phase 38 + 41 + 42: Training loop primitives, Trainer engine,
// evaluation, metrics, checkpointing, and experiment runner.
// ============================================================

// ── Phase 38: Low-level training loop ──
export { runTrainingLoop } from "./TrainingLoop";
export type {
  TrainingConfig,
  EpochHistory,
  TrainingHistory,
} from "./TrainingLoop";

// ── Phase 41: Trainer engine ──
export { Trainer, collateBatch } from "./Trainer";
export type { TrainerOptions, LossCriterion, LogCallback, EpochEndCallback } from "./Trainer";

export { TrainingState } from "./TrainingState";
export type { TrainingStateSnapshot } from "./TrainingState";

// ── Phase 48: DataLoaderState re-export (used in checkpointing) ──
export type { DataLoaderState } from "../data/DataLoader";

export { LossTracker } from "./LossTracker";

export { Perplexity } from "./Perplexity";

export { GradientAccumulator } from "./GradientAccumulator";

export { resolveTrainerConfig, DEFAULT_TRAINER_CONFIG } from "./TrainerConfig";
export type { TrainerConfig, ResolvedTrainerConfig } from "./TrainerConfig";

// ── Phase 42: Evaluation ──
export { evaluate, evaluateQuick } from "./Evaluator";
export type {
  EvaluationResult,
  BatchMetrics,
  PredictionSample,
  EvaluateOptions,
} from "./Evaluator";

// ── Phase 42: Metrics ──
export { TrainingMetricsCollector } from "./Metrics";
export type { TrainingMetricsRecord, TrainingMetricsSummary } from "./Metrics";

// ── Phase 42: Checkpoint ──
export {
  saveCheckpoint,
  saveCheckpointJSON,
  loadCheckpoint,
  loadCheckpointJSON,
} from "./checkpoint/Checkpoint";
export type {
  CheckpointData,
  SaveCheckpointOptions,
  LoadCheckpointOptions,
} from "./checkpoint/Checkpoint";
export {
  float64ToArray,
  arrayToFloat64,
  float64ToBase64,
  base64ToFloat64,
  validateShapeCompatibility,
} from "./checkpoint/Serializer";

// ── Phase 42: Experiment Runner ──
export { runExperiment, quickExperiment } from "./Experiment";
export type {
  ExperimentConfig,
  ExperimentResult,
  ExperimentDatasetConfig,
  ExperimentModelConfig,
  ExperimentSchedulerConfig,
} from "./Experiment";

// ── Node-only exports ──
// TrainingLogger uses Node.js fs/path — it is NOT browser-safe.
// Import from "@/lib/minimind/training/node" (or "@/lib/minimind/node")
// for CLI / server-side use.
//
// ThroughputMeter and TrainingMonitor are browser-safe and remain below.

// ── Phase 44: Throughput Meter ──
export { ThroughputMeter } from "./ThroughputMeter";

// ── Phase 44: Training Monitor ──
export { TrainingMonitor } from "./TrainingMonitor";
export type {
  AlertLevel,
  MonitorAlert,
  MonitorOptions,
  MonitorSummary,
} from "./TrainingMonitor";
