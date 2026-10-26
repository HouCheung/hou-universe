// ============================================================
// MiniMind — experiments/history/LegacyExperimentAdapter.ts
// ============================================================
// Phase 68: Compatibility adapter that routes legacy
// ExperimentStore API calls to the canonical
// ResearchExperimentStore.
//
// This adapter preserves the exact same API surface as the
// legacy ExperimentStore while persisting all data through
// ResearchExperimentStore. It handles:
//   - Field mapping (ExperimentRecord ↔ ResearchExperiment + ResearchRun)
//   - Status mapping (legacy 3-state ↔ canonical multi-state)
//   - API compatibility (same function signatures)
//
// Design principles:
//   - NO second persistence — all writes go to canonical store
//   - NO duplicate IDs — experiment ID is the single identity
//   - NO dual-write — this is the ONLY write path for legacy callers
//   - Defensive copies — consumers receive clones
//   - Graceful degradation — corrupted data is handled
//
// This file is the BRIDGE, not a new store.
// ============================================================

import type { ExperimentRecord, ExperimentStatus } from "./ExperimentRecord";
import { validateExperimentRecord } from "./ExperimentRecord";
import {
  createExperiment,
  getExperiment,
  listExperiments,
  updateExperiment,
  deleteExperiment,
  createRun,
  listRunsByExperiment,
  updateRun,
  getBestRun,
  getLatestRun,
  clearAll,
} from "@/lib/minimind/research/ResearchExperimentStore";
import type { ResearchExperiment } from "@/lib/minimind/research/ResearchExperiment";
import { generateExperimentId as canonicalGenerateId } from "@/lib/minimind/research/ResearchExperiment";
import type { ResearchRun } from "@/lib/minimind/research/ResearchRun";
import {
  generateRunId,
  createResearchRun,
} from "@/lib/minimind/research/ResearchRun";
import { generateExperimentId } from "@/lib/minimind/research/ResearchExperiment";

// ============================================================
// Status Mapping
// ============================================================

/**
 * Map legacy 3-state status to canonical experiment + run statuses.
 */
function legacyToCanonicalStatus(
  legacy: ExperimentStatus
): { expStatus: ResearchExperiment["status"]; runStatus: ResearchRun["status"] } {
  switch (legacy) {
    case "running":
      return { expStatus: "running", runStatus: "running" };
    case "completed":
      return { expStatus: "completed", runStatus: "completed" };
    case "failed":
      return { expStatus: "completed", runStatus: "failed" };
  }
}

/**
 * Derive legacy status from canonical experiment + run statuses.
 */
function canonicalToLegacyStatus(
  expStatus: ResearchExperiment["status"],
  runStatus: ResearchRun["status"] | undefined
): ExperimentStatus {
  // If any run is running, the legacy view is "running"
  if (runStatus === "running" || expStatus === "running") return "running";
  // If the most recent/best run failed, legacy view is "failed"
  if (runStatus === "failed") return "failed";
  // If run completed and experiment is completed/archived, legacy view is "completed"
  if (runStatus === "completed") return "completed";
  // Default fallbacks
  if (expStatus === "draft" || expStatus === "ready") return "running";
  return "completed";
}

// ============================================================
// Field Mapping: ExperimentRecord → ResearchExperiment
// ============================================================

/**
 * Convert a legacy ExperimentRecord into a ResearchExperiment.
 * Fills in defaults for fields that don't exist in the legacy schema.
 */
function recordToExperiment(record: ExperimentRecord): ResearchExperiment {
  const now = Date.now();

  // Try to get existing experiment to preserve fields not in the record
  const existing = getExperiment(record.id);

  return {
    id: record.id,
    name: record.name,
    description: existing?.description ?? "",
    hypothesis: existing?.hypothesis ?? "",
    createdAt: existing?.createdAt ?? record.createdAt,
    updatedAt: now,
    seed: record.trainingConfig.seed ?? existing?.seed ?? 42,
    modelConfig: { ...record.modelConfig },
    trainingConfig: { ...record.trainingConfig },
    datasetConfig: existing?.datasetConfig ?? {
      name: record.trainingConfig.dataset?.dataset ?? "synthetic",
      blockSize: record.trainingConfig.dataset?.blockSize ?? 64,
      batchSize: record.trainingConfig.dataset?.batchSize ?? 8,
      shuffle: true,
    },
    tokenizerConfig: existing?.tokenizerConfig ?? {
      type: "bpe",
      vocabSize: record.modelConfig.vocabSize,
    },
    evaluationConfig: existing?.evaluationConfig ?? {
      generationPrompts: ["the", "once upon", "in the"],
      maxTokens: 30,
      temperature: 0.8,
      runGenerationComparison: true,
      runBenchmarks: false,
    },
    tags: existing?.tags ?? [],
    baselineExperimentId: existing?.baselineExperimentId,
    status: legacyToCanonicalStatus(record.status).expStatus,
  };
}

// ============================================================
// Field Mapping: ExperimentRecord → ResearchRun
// ============================================================

/**
 * Convert a legacy ExperimentRecord's metrics into a ResearchRun.
 */
function recordToRun(
  record: ExperimentRecord,
  experimentId: string,
  existingRunId?: string
): ResearchRun {
  const now = Date.now();

  const run: ResearchRun = {
    runId: existingRunId ?? generateRunId(),
    experimentId,
    startedAt: record.createdAt,
    completedAt:
      record.status === "running" ? 0 : now,
    status: legacyToCanonicalStatus(record.status).runStatus,
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
      record.status === "failed" ? "Experiment failed" : undefined,
  };

  return run;
}

// ============================================================
// Field Mapping: ResearchExperiment + ResearchRun → ExperimentRecord
// ============================================================

/**
 * Combine a ResearchExperiment and its best run back into a
 * legacy ExperimentRecord.
 */
function experimentAndRunToRecord(
  experiment: ResearchExperiment,
  bestRun: ResearchRun | undefined
): ExperimentRecord {
  // For failed experiments, bestRun (which filters by "completed") may be
  // undefined. Fall back to the latest run to capture the actual run status.
  const effectiveRun = bestRun ?? getLatestRun(experiment.id);

  // Derive status from experiment + run
  const legacyStatus = canonicalToLegacyStatus(
    experiment.status,
    effectiveRun?.status
  );

  const record: ExperimentRecord = {
    id: experiment.id,
    name: experiment.name,
    createdAt: experiment.createdAt,
    modelConfig: { ...experiment.modelConfig },
    trainingConfig: { ...experiment.trainingConfig },
    metrics: {
      initialLoss: effectiveRun?.initialLoss ?? Infinity,
      finalLoss: effectiveRun?.finalLoss ?? Infinity,
      bestLoss: effectiveRun?.bestLoss ?? Infinity,
      perplexity: effectiveRun?.perplexity ?? NaN,
      tokensPerSecond: effectiveRun?.tokensPerSecond ?? 0,
    },
    status: legacyStatus,
    checkpoint: effectiveRun?.checkpointId,
  };

  return record;
}

// ============================================================
// Helper: find the "active" (running) run for an experiment
// ============================================================

function findActiveRun(experimentId: string): ResearchRun | undefined {
  const runs = listRunsByExperiment(experimentId);
  return runs.find((r) => r.status === "running");
}

// ============================================================
// Public API — CRUD (identical signatures to legacy ExperimentStore)
// ============================================================

/**
 * Save (or overwrite) an experiment record.
 *
 * Routes to ResearchExperimentStore:
 *   1. Creates or updates a ResearchExperiment
 *   2. Creates or updates a ResearchRun
 *
 * If a run with status "running" already exists for this experiment,
 * it is updated. Otherwise a new run is created.
 */
export function save(record: ExperimentRecord): boolean {
  validateExperimentRecord(record);

  // 1. Persist the experiment definition
  const experiment = recordToExperiment(record);
  const expOk = createExperiment(experiment);
  if (!expOk) return false;

  // 2. Persist the run execution
  const activeRun = findActiveRun(record.id);
  const run = recordToRun(record, record.id, activeRun?.runId);
  const runOk = createRun(run);
  if (!runOk) return false;

  return true;
}

/**
 * Get a single experiment record by id.
 *
 * Reads from canonical store: ResearchExperiment + best run.
 */
export function get(id: string): ExperimentRecord | undefined {
  const experiment = getExperiment(id);
  if (!experiment) return undefined;

  const bestRun = getBestRun(id);
  return experimentAndRunToRecord(experiment, bestRun);
}

/**
 * List all experiment records.
 *
 * Reads all ResearchExperiments and their best runs.
 * Sorted by createdAt descending (most recent first).
 */
export function list(): ExperimentRecord[] {
  const experiments = listExperiments();

  return experiments
    .map((exp) => {
      const bestRun = getBestRun(exp.id);
      return experimentAndRunToRecord(exp, bestRun);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * List records filtered by status.
 */
export function listByStatus(status: ExperimentStatus): ExperimentRecord[] {
  return list().filter((r) => r.status === status);
}

/**
 * Update specific fields of an existing record.
 *
 * Routes to both experiment and run update.
 */
export function update(
  id: string,
  updates: Partial<Omit<ExperimentRecord, "id">>
): boolean {
  const experiment = getExperiment(id);
  if (!experiment) return false;

  // Update experiment fields
  const expUpdates: Partial<ResearchExperiment> = {};
  if (updates.name !== undefined) expUpdates.name = updates.name;
  if (updates.modelConfig !== undefined) expUpdates.modelConfig = { ...updates.modelConfig };
  if (updates.trainingConfig !== undefined) expUpdates.trainingConfig = { ...updates.trainingConfig };
  if (updates.status !== undefined) {
    expUpdates.status = legacyToCanonicalStatus(updates.status).expStatus;
  }

  if (Object.keys(expUpdates).length > 0) {
    const ok = updateExperiment(id, expUpdates);
    if (!ok) return false;
  }

  // Update run fields (metrics, checkpoint, status)
  if (
    updates.metrics !== undefined ||
    updates.status !== undefined ||
    updates.checkpoint !== undefined
  ) {
    const activeRun = findActiveRun(id);
    const runId = activeRun?.runId;
    if (runId) {
      const runUpdates: Partial<ResearchRun> = {};
      if (updates.metrics !== undefined) {
        runUpdates.initialLoss = updates.metrics.initialLoss;
        runUpdates.finalLoss = updates.metrics.finalLoss;
        runUpdates.bestLoss = updates.metrics.bestLoss;
        runUpdates.perplexity = updates.metrics.perplexity;
        runUpdates.tokensPerSecond = updates.metrics.tokensPerSecond;
      }
      if (updates.status !== undefined) {
        runUpdates.status = legacyToCanonicalStatus(updates.status).runStatus;
      }
      if (updates.checkpoint !== undefined) {
        runUpdates.checkpointId = updates.checkpoint;
      }
      updateRun(runId, runUpdates);
    }
  }

  return true;
}

/**
 * Delete a single experiment record by id.
 */
export function deleteRecord(id: string): boolean {
  return deleteExperiment(id);
}

/**
 * Delete all experiment records.
 */
export function clear(): void {
  clearAll();
}

/**
 * Get the total number of stored records.
 */
export function count(): number {
  return listExperiments().length;
}

/**
 * Check whether a record with the given id exists.
 */
export function has(id: string): boolean {
  return getExperiment(id) !== undefined;
}

/**
 * Get the most recent record (by createdAt), or undefined if empty.
 */
export function latest(): ExperimentRecord | undefined {
  const experiments = listExperiments();
  if (experiments.length === 0) return undefined;

  const latest = experiments.reduce((a, b) =>
    a.createdAt > b.createdAt ? a : b
  );
  const bestRun = getBestRun(latest.id);
  return experimentAndRunToRecord(latest, bestRun);
}

/**
 * Get summary statistics across all records.
 */
export function stats(): {
  total: number;
  completed: number;
  running: number;
  failed: number;
  bestPerplexity: number | null;
} {
  const records = list();
  const completed = records.filter((r) => r.status === "completed");

  let bestPerplexity: number | null = null;
  for (const r of completed) {
    if (Number.isFinite(r.metrics.perplexity)) {
      if (
        bestPerplexity === null ||
        r.metrics.perplexity < bestPerplexity
      ) {
        bestPerplexity = r.metrics.perplexity;
      }
    }
  }

  return {
    total: records.length,
    completed: completed.length,
    running: records.filter((r) => r.status === "running").length,
    failed: records.filter((r) => r.status === "failed").length,
    bestPerplexity,
  };
}

// ============================================================
// Re-exports for convenience
// ============================================================

export { generateExperimentId };
export type { ExperimentRecord, ExperimentStatus };
