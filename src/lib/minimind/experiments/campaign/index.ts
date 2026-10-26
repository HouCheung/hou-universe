// ============================================================
// MiniMind — experiments/campaign/index.ts
// ============================================================
// Phase 55: Training Campaign Module — Barrel Export
//
// Unified export for:
//   - TrainingCampaign class and runTrainingCampaign function
//   - TrainingCampaignResult and related types
//   - GradientNormTracker (optimizer wrapper)
//   - CampaignReport (JSON + Markdown report generation)
//   - ReproducibilityValidator
// ============================================================

// ── Main campaign orchestrator ──
export {
  TrainingCampaign,
  runTrainingCampaign,
  runQuickCampaign,
} from "./TrainingCampaign";

export type {
  TrainingCampaignInput,
  TrainingCampaignResult,
  TrainingCampaignOptions,
} from "./TrainingCampaign";

// ── Gradient norm tracking ──
export { GradientNormTracker } from "./GradientNormTracker";

// ── Campaign reports ──
export { CampaignReport } from "./CampaignReport";
export type { CampaignReportData } from "./CampaignReport";

// ── Reproducibility ──
export { ReproducibilityValidator } from "./ReproducibilityValidator";
export type { ReproducibilityResult } from "./ReproducibilityValidator";
