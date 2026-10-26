// ============================================================
// MiniMind — experiments/node.ts
// ============================================================
// Node-only experiment exports.
//
// These modules use Node.js fs/path and are NOT browser-safe.
// Import from here for CLI / server-side use only.
//
// Usage:
//   import { ExperimentConfig } from "@/lib/minimind/experiments/node";
//   import { runTrainingExperiment } from "@/lib/minimind/experiments/node";
// ============================================================

// ── Experiment Config ──
export { ExperimentConfig, DEFAULT_EXPERIMENT_CONFIG } from "./ExperimentConfig";
export type {
  ExperimentConfigFile,
  ExperimentDatasetSection,
  ExperimentModelSection,
  ExperimentTokenizerSection,
  ExperimentOptimizerSection,
  ExperimentSchedulerSection,
  ExperimentTrainingSection,
  ExperimentOutputSection,
} from "./ExperimentConfig";

// ── Training Experiment Runner ──
export {
  runTrainingExperiment,
  runExperimentFromConfigFile,
} from "./TrainingExperimentRunner";
export type {
  TrainingExperimentInput,
  TrainingExperimentResult,
  TrainingExperimentOptions,
} from "./TrainingExperimentRunner";

// ── Benchmark Report ──
export { BenchmarkReport } from "./BenchmarkReport";
export type { BenchmarkReportData, BenchmarkComparison } from "./BenchmarkReport";

// ── Phase 55: Training Campaign ──
export {
  TrainingCampaign,
  runTrainingCampaign,
  runQuickCampaign,
} from "./campaign/TrainingCampaign";
export type {
  TrainingCampaignInput,
  TrainingCampaignResult,
  TrainingCampaignOptions,
} from "./campaign/TrainingCampaign";

export { GradientNormTracker } from "./campaign/GradientNormTracker";

export { CampaignReport } from "./campaign/CampaignReport";
export type { CampaignReportData } from "./campaign/CampaignReport";

export { ReproducibilityValidator } from "./campaign/ReproducibilityValidator";
export type { ReproducibilityResult } from "./campaign/ReproducibilityValidator";
