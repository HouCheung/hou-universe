// ============================================================
// MiniMind — node.ts
// ============================================================
// Node-only barrel export for MiniMind.
//
// These modules use Node.js fs/path and are NOT browser-safe.
// Import from here for CLI, server-side, or build-time use only.
//
// Usage:
//   import { TextCorpus, TinyStoriesDataset } from "@/lib/minimind/node";
//   import { TrainingConfig } from "@/lib/minimind/node";
//   import { ExperimentConfig, runTrainingExperiment } from "@/lib/minimind/node";
//   import { TrainingLogger } from "@/lib/minimind/node";
//   import { BenchmarkReport } from "@/lib/minimind/node";
//   import { TrainingReport } from "@/lib/minimind/node";
//   import { StreamingDataset, StreamingDataLoader } from "@/lib/minimind/node";
// ============================================================

// ── Data (Node-only: TextCorpus, TinyStoriesDataset, streaming) ──
export { TextCorpus } from "./data/TextCorpus";
export type { CorpusSource, TextCorpusOptions } from "./data/TextCorpus";
export { TinyStoriesDataset } from "./data/TinyStoriesDataset";
export type { TinyStoriesConfig } from "./data/TinyStoriesDataset";

// ── Streaming Dataset Engine (Phase 49) ──
export {
  TextShardReader,
  StreamingDataset,
  StreamingDataLoader,
} from "./data/streaming";
export type {
  ShardReaderState,
  TextShardReaderOptions,
  StreamingDatasetOptions,
  StreamingDatasetState,
  StreamingDataLoaderOptions,
  StreamingDataLoaderState,
} from "./data/streaming";

// ── CLI Config ──
export { TrainingConfig, TINY_TRAINING_CONFIG } from "./cli/TrainingConfig";
export type { TrainingConfigFile } from "./cli/TrainingConfig";

// ── Experiments (Node-only) ──
export { ExperimentConfig, DEFAULT_EXPERIMENT_CONFIG } from "./experiments/ExperimentConfig";
export type {
  ExperimentConfigFile,
  ExperimentDatasetSection,
  ExperimentModelSection,
  ExperimentTokenizerSection,
  ExperimentOptimizerSection,
  ExperimentSchedulerSection,
  ExperimentTrainingSection,
  ExperimentOutputSection,
} from "./experiments/ExperimentConfig";

export {
  runTrainingExperiment,
  runExperimentFromConfigFile,
} from "./experiments/TrainingExperimentRunner";
export type {
  TrainingExperimentInput,
  TrainingExperimentResult,
  TrainingExperimentOptions,
} from "./experiments/TrainingExperimentRunner";

export { BenchmarkReport } from "./experiments/BenchmarkReport";
export type { BenchmarkReportData, BenchmarkComparison } from "./experiments/BenchmarkReport";

// ── Training (Node-only) ──
export { TrainingLogger } from "./training/TrainingLogger";
export type { TrainingLogRecord, TrainingLogSummary } from "./training/TrainingLogger";

// ── Evaluation (Node-only) ──
export { TrainingReport } from "./evaluation/TrainingReport";
export type {
  TrainingReportData,
  TrainingReportGenerationComparison,
} from "./evaluation/TrainingReport";

// ── Phase 55: Training Campaign (Node-only) ──
export {
  TrainingCampaign,
  runTrainingCampaign,
  runQuickCampaign,
} from "./experiments/campaign/TrainingCampaign";
export type {
  TrainingCampaignInput,
  TrainingCampaignResult,
  TrainingCampaignOptions,
} from "./experiments/campaign/TrainingCampaign";

export { GradientNormTracker } from "./experiments/campaign/GradientNormTracker";

export { CampaignReport } from "./experiments/campaign/CampaignReport";
export type { CampaignReportData } from "./experiments/campaign/CampaignReport";

export { ReproducibilityValidator } from "./experiments/campaign/ReproducibilityValidator";
export type { ReproducibilityResult } from "./experiments/campaign/ReproducibilityValidator";
