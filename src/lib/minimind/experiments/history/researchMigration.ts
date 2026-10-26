// ============================================================
// MiniMind — experiments/history/researchMigration.ts
// ============================================================
// Phase 68: One-time browser data migration from legacy
// ExperimentStore (minimind-experiment-history) to canonical
// ResearchExperimentStore.
//
// Design principles:
//   - Idempotent — running multiple times produces same result
//   - Non-destructive — legacy data is preserved (not deleted)
//   - Validates before migrating — malformed records are skipped
//   - Preserves original createdAt timestamps
//   - Does NOT overwrite existing canonical experiments
//   - Reports warnings for partially-mappable records
//   - Version-tracked — migration completion is recorded
//
// Migration version key:
//   "minimind-research-migration-version" → "v1"
//
// v1 = legacy experiment migration completed
// ============================================================

import type { ExperimentRecord } from "./ExperimentRecord";
import { validateExperimentRecord } from "./ExperimentRecord";
import type { ResearchExperiment } from "@/lib/minimind/research/ResearchExperiment";
import {
  createExperiment,
  getExperiment,
} from "@/lib/minimind/research/ResearchExperimentStore";
import type { ResearchRun } from "@/lib/minimind/research/ResearchRun";
import { createRun } from "@/lib/minimind/research/ResearchExperimentStore";
import { generateRunId } from "@/lib/minimind/research/ResearchRun";

// ============================================================
// Constants
// ============================================================

const LEGACY_KEY = "minimind-experiment-history";
const MIGRATION_VERSION_KEY = "minimind-research-migration-version";
const CURRENT_MIGRATION_VERSION = "v1";

// ============================================================
// Types
// ============================================================

export interface MigrationWarning {
  recordId: string;
  message: string;
}

export interface MigrationResult {
  /** Whether the migration ran successfully (no crashes) */
  success: boolean;
  /** Number of legacy records found */
  legacyCount: number;
  /** Number of experiments successfully migrated */
  migratedCount: number;
  /** Number of experiments skipped (already exist in canonical) */
  skippedCount: number;
  /** Number of records that failed validation */
  invalidCount: number;
  /** Warnings for partially-mappable records */
  warnings: MigrationWarning[];
  /** Whether this was a fresh run or a re-run */
  alreadyMigrated: boolean;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Read legacy experiment records from localStorage.
 * Returns empty array if no legacy data exists or data is corrupted.
 */
function readLegacyRecords(): ExperimentRecord[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("records" in parsed)
    ) {
      return [];
    }

    const store = parsed as { v: number; records: unknown[] };
    if (!Array.isArray(store.records)) return [];

    return store.records.filter((r): r is ExperimentRecord => {
      try {
        validateExperimentRecord(r);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Check if migration has already been completed.
 */
function isAlreadyMigrated(): boolean {
  try {
    const version = localStorage.getItem(MIGRATION_VERSION_KEY);
    return version === CURRENT_MIGRATION_VERSION;
  } catch {
    return false;
  }
}

/**
 * Mark the migration as complete.
 */
function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATION_VERSION_KEY, CURRENT_MIGRATION_VERSION);
  } catch {
    // Non-critical — migration will re-run next time
  }
}

/**
 * Map a legacy ExperimentRecord to a ResearchExperiment.
 * Fills in sensible defaults for fields not present in legacy schema.
 */
function mapToExperiment(record: ExperimentRecord): ResearchExperiment {
  return {
    id: record.id,
    name: record.name,
    description: `Migrated from legacy experiment history (v1).`,
    hypothesis: "",
    createdAt: record.createdAt,
    updatedAt: Date.now(),
    seed: record.trainingConfig.seed ?? 42,
    modelConfig: { ...record.modelConfig },
    trainingConfig: { ...record.trainingConfig },
    datasetConfig: {
      name: record.trainingConfig.dataset?.dataset ?? "synthetic",
      blockSize: record.trainingConfig.dataset?.blockSize ?? 64,
      batchSize: record.trainingConfig.dataset?.batchSize ?? 8,
      shuffle: true,
    },
    tokenizerConfig: {
      type: "bpe",
      vocabSize: record.modelConfig.vocabSize,
    },
    evaluationConfig: {
      generationPrompts: ["the", "once upon", "in the"],
      maxTokens: 30,
      temperature: 0.8,
      runGenerationComparison: true,
      runBenchmarks: false,
    },
    tags: ["migrated"],
    baselineExperimentId: undefined,
    status: mapLegacyStatus(record.status),
  };
}

/**
 * Map legacy ExperimentStatus to canonical ResearchExperimentStatus.
 */
function mapLegacyStatus(
  legacy: ExperimentRecord["status"]
): ResearchExperiment["status"] {
  switch (legacy) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "completed"; // failed runs → experiment is "completed" (no longer active)
  }
}

/**
 * Map legacy ExperimentStatus to canonical ResearchRunStatus.
 */
function mapLegacyRunStatus(
  legacy: ExperimentRecord["status"]
): ResearchRun["status"] {
  switch (legacy) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
  }
}

/**
 * Map a legacy ExperimentRecord to a ResearchRun.
 */
function mapToRun(record: ExperimentRecord): ResearchRun {
  const now = Date.now();
  return {
    runId: generateRunId(),
    experimentId: record.id,
    startedAt: record.createdAt,
    completedAt: record.status === "running" ? 0 : now,
    status: mapLegacyRunStatus(record.status),
    seed: record.trainingConfig.seed ?? 42,
    initialLoss: record.metrics.initialLoss,
    finalLoss: record.metrics.finalLoss,
    bestLoss: record.metrics.bestLoss,
    perplexity: record.metrics.perplexity,
    tokensPerSecond: record.metrics.tokensPerSecond,
    totalTokens: 0,
    totalSteps: 0,
    totalEpochs: 0,
    durationMs: 0,
    checkpointId: record.checkpoint,
    generationBefore: [],
    generationAfter: [],
    analysis: null,
    reproducibility: null,
    reportId: undefined,
    errorMessage:
      record.status === "failed"
        ? "Migrated from legacy failed experiment"
        : undefined,
  };
}

// ============================================================
// Public API
// ============================================================

/**
 * Run the one-time migration from legacy to canonical store.
 *
 * Idempotent: if already migrated, returns early with
 * `alreadyMigrated: true` and no data is changed.
 *
 * Does NOT delete legacy data — only reads and converts.
 * Does NOT overwrite existing canonical experiments.
 *
 * @returns MigrationResult with detailed counts and warnings
 */
export function migrateLegacyExperiments(): MigrationResult {
  const warnings: MigrationWarning[] = [];

  // Check if already migrated
  if (isAlreadyMigrated()) {
    const legacyRecords = readLegacyRecords();
    return {
      success: true,
      legacyCount: legacyRecords.length,
      migratedCount: 0,
      skippedCount: legacyRecords.length,
      invalidCount: 0,
      warnings: [],
      alreadyMigrated: true,
    };
  }

  // Read legacy data
  const legacyRecords = readLegacyRecords();

  if (legacyRecords.length === 0) {
    // No legacy data — mark as migrated anyway to avoid repeated checks
    markMigrated();
    return {
      success: true,
      legacyCount: 0,
      migratedCount: 0,
      skippedCount: 0,
      invalidCount: 0,
      warnings: [],
      alreadyMigrated: false,
    };
  }

  let migratedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  for (const record of legacyRecords) {
    // Validate the record
    try {
      validateExperimentRecord(record);
    } catch {
      invalidCount++;
      warnings.push({
        recordId: record.id ?? "unknown",
        message: "Record failed validation, skipped.",
      });
      continue;
    }

    // Skip if canonical experiment already exists
    const existing = getExperiment(record.id);
    if (existing) {
      skippedCount++;
      continue;
    }

    // Map and persist experiment
    const experiment = mapToExperiment(record);
    const expOk = createExperiment(experiment);
    if (!expOk) {
      warnings.push({
        recordId: record.id,
        message: "Failed to persist ResearchExperiment.",
      });
      continue;
    }

    // Map and persist run
    const run = mapToRun(record);
    const runOk = createRun(run);
    if (!runOk) {
      warnings.push({
        recordId: record.id,
        message: "Experiment persisted but run failed to save.",
      });
    }

    migratedCount++;
  }

  // Mark migration as complete
  markMigrated();

  return {
    success: true,
    legacyCount: legacyRecords.length,
    migratedCount,
    skippedCount,
    invalidCount,
    warnings,
    alreadyMigrated: false,
  };
}

/**
 * Check whether legacy data exists in localStorage.
 *
 * Useful for conditional UI (e.g., showing a migration banner).
 */
export function hasLegacyData(): boolean {
  return readLegacyRecords().length > 0;
}

/**
 * Get the current migration version, or null if not yet migrated.
 */
export function getMigrationVersion(): string | null {
  try {
    return localStorage.getItem(MIGRATION_VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Reset the migration marker (for testing).
 * Does NOT delete any data — just clears the version key
 * so migration will run again on next call.
 */
export function resetMigrationMarker(): void {
  try {
    localStorage.removeItem(MIGRATION_VERSION_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Get the count of legacy records without running migration.
 */
export function getLegacyCount(): number {
  return readLegacyRecords().length;
}
