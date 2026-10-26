// ============================================================
// MiniMind — experiments/history/ExperimentStore.ts
// ============================================================
// Phase 51 → Phase 68: DEPRECATED compatibility facade.
//
// This file is NO LONGER the authoritative experiment store.
// All calls are routed through LegacyExperimentAdapter →
// canonical ResearchExperimentStore.
//
// This facade exists solely to maintain backward compatibility
// for existing import paths. New code should import directly
// from LegacyExperimentAdapter or ResearchExperimentStore.
//
// ⚠️  DO NOT add new functionality here.
// ⚠️  DO NOT add new persistence keys here.
// ⚠️  DO NOT use this as a second source of truth.
//
// Original localStorage key ("minimind-experiment-history")
// is no longer read or written by this module. All persistence
// goes through ResearchExperimentStore keys:
//   - "minimind-research-experiments"
//   - "minimind-research-runs"
// ============================================================

// Re-export EVERYTHING from the canonical adapter.
// This ensures all existing `import { ... } from "./ExperimentStore"`
// statements continue to work without modification.
export {
  save,
  get,
  list,
  listByStatus,
  update,
  deleteRecord,
  clear,
  count,
  has,
  latest,
  stats,
  generateExperimentId,
} from "./LegacyExperimentAdapter";

export type { ExperimentRecord, ExperimentStatus } from "./ExperimentRecord";
