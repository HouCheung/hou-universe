// ============================================================
// progressAdapter — Aggregate progress stats from SSOT registries
// ============================================================
//
// This is a DERIVED ADAPTER layer. It computes progress statistics
// from the canonical registries. Components import from HERE,
// never from registries directly.
//
// SSOT sources:
//   - src/data/minimind/module-registry.ts
//   - src/data/minimind/experiment-registry.ts
//   - src/data/minimind/learning-registry.ts
// ============================================================

import { MINIMIND_MODULES, type MiniMindModule } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS, getActiveExperiments, type MiniMindExperiment } from "@/data/minimind/experiment-registry";
import { LEARNING_PATHS } from "@/data/minimind/learning-registry";

// Re-export types for UI component convenience
export type { MiniMindModule, MiniMindExperiment };

// ============================================================
// Types
// ============================================================

export interface ModuleProgressStats {
  /** Total number of modules in registry */
  total: number;
  /** Number of modules with implemented === true */
  implemented: number;
  /** Number of modules with status === "completed" */
  completed: number;
  /** Number of modules with status === "in-progress" */
  inProgress: number;
  /** Number of modules with status === "upcoming" */
  upcoming: number;
}

export interface ExperimentProgressStats {
  /** Total number of experiments in registry */
  total: number;
  /** Number of experiments with status === "active" */
  active: number;
  /** Number of experiments with status === "planned" */
  planned: number;
  /** Number of experiments with status === "legacy" */
  legacy: number;
}

export interface PhaseProgress {
  /** Current critical-path phase label */
  label: string;
  /** Foundation modules completed count */
  foundationDone: number;
  /** Foundation modules total count */
  foundationTotal: number;
}

export interface DashboardProgress {
  modules: ModuleProgressStats;
  experiments: ExperimentProgressStats;
  phase: PhaseProgress;
  /** Whether the inference module is implemented and ready */
  inferenceReady: boolean;
}

// ============================================================
// Pure computation functions
// ============================================================

/** Compute module progress stats from MINIMIND_MODULES */
export function computeModuleStats(): ModuleProgressStats {
  const total = MINIMIND_MODULES.length;
  const implemented = MINIMIND_MODULES.filter((m) => m.implemented).length;
  const completed = MINIMIND_MODULES.filter((m) => m.status === "completed").length;
  const inProgress = MINIMIND_MODULES.filter((m) => m.status === "in-progress").length;
  const upcoming = MINIMIND_MODULES.filter((m) => m.status === "upcoming").length;

  return { total, implemented, completed, inProgress, upcoming };
}

/** Compute experiment progress stats from MINIMIND_EXPERIMENTS */
export function computeExperimentStats(): ExperimentProgressStats {
  const total = MINIMIND_EXPERIMENTS.length;
  const active = MINIMIND_EXPERIMENTS.filter((e) => e.status === "active").length;
  const planned = MINIMIND_EXPERIMENTS.filter((e) => e.status === "planned").length;
  const legacy = MINIMIND_EXPERIMENTS.filter((e) => e.status === "legacy").length;

  return { total, active, planned, legacy };
}

/** Compute current phase information */
export function computePhaseProgress(): PhaseProgress {
  const criticalPath = LEARNING_PATHS.find((p) => p.type === "critical");
  const label = criticalPath?.label ?? "Foundation";

  const foundationModules = MINIMIND_MODULES.filter(
    (m) => m.phase === "foundation"
  );
  const foundationDone = foundationModules.filter(
    (m) => m.status === "completed"
  ).length;

  return {
    label,
    foundationDone,
    foundationTotal: foundationModules.length,
  };
}

/** Compute full dashboard progress aggregate */
export function computeDashboardProgress(): DashboardProgress {
  return {
    modules: computeModuleStats(),
    experiments: computeExperimentStats(),
    phase: computePhaseProgress(),
    inferenceReady: MINIMIND_MODULES.some(
      (m) => m.id === "inference" && m.implemented
    ),
  };
}

// ============================================================
// Convenience re-exports with controlled surface area
// ============================================================

/** Get active experiments (delegated from experiment-registry) */
export { getActiveExperiments };

/** Get all modules with optional phase filter */
export function getModules(phase?: MiniMindModule["phase"]): MiniMindModule[] {
  if (phase) {
    return MINIMIND_MODULES.filter((m) => m.phase === phase);
  }
  return MINIMIND_MODULES;
}

/** Look up a single module by id */
export function getModuleById(id: string): MiniMindModule | undefined {
  return MINIMIND_MODULES.find((m) => m.id === id);
}
