// ============================================================
// MiniMind — research/ResearchExperimentStore.ts
// ============================================================
// Phase 60: Research experiment and run persistence store.
//
// Provides versioned, localStorage-backed CRUD for:
//   - ResearchExperiment (experiment definitions)
//   - ResearchRun (execution records)
//
// Schema is versioned for forward-compatible migration.
//
// localStorage keys:
//   "minimind-research-experiments" → { v: 1, experiments: ResearchExperiment[] }
//   "minimind-research-runs"        → { v: 1, runs: ResearchRun[] }
//
// Design principles:
//   - Browser-safe — localStorage only, no fs imports
//   - Versioned schema — v: 1 with migration path
//   - Defensive copies — consumers receive clones
//   - Graceful degradation — corrupted data triggers reset
//   - No UI dependencies — pure data layer
// ============================================================

import type { ResearchExperiment } from "./ResearchExperiment";
import {
  validateResearchExperiment,
  serializeResearchExperiment,
  deserializeResearchExperiment,
} from "./ResearchExperiment";

import type { ResearchRun } from "./ResearchRun";
import { validateResearchRun } from "./ResearchRun";

import type { ResearchSession } from "./ResearchState";

// ============================================================
// Constants
// ============================================================

const EXPERIMENTS_KEY = "minimind-research-experiments";
const RUNS_KEY = "minimind-research-runs";
const SCHEMA_VERSION = 1;

// ============================================================
// Generic Store Helpers
// ============================================================

interface VersionedStore<T> {
  v: number;
  items: T[];
}

function readStore<T>(
  key: string,
  validator: (item: unknown) => asserts item is T
): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("v" in parsed) ||
      !("items" in parsed)
    ) {
      localStorage.removeItem(key);
      return [];
    }

    const store = parsed as VersionedStore<unknown>;
    if (store.v !== SCHEMA_VERSION) {
      localStorage.removeItem(key);
      return [];
    }

    if (!Array.isArray(store.items)) {
      localStorage.removeItem(key);
      return [];
    }

    return store.items.filter((item): item is T => {
      try {
        validator(item);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    localStorage.removeItem(key);
    return [];
  }
}

function writeStore<T>(key: string, items: T[]): boolean {
  try {
    const store: VersionedStore<T> = { v: SCHEMA_VERSION, items };
    localStorage.setItem(key, JSON.stringify(store));
    return true;
  } catch (error) {
    console.error(`[ResearchExperimentStore] Failed to write ${key}:`, error);
    return false;
  }
}

// ============================================================
// Experiment CRUD
// ============================================================

/**
 * Save or update an experiment definition.
 */
export function createExperiment(
  experiment: ResearchExperiment
): boolean {
  validateResearchExperiment(experiment);
  const items = readStore(EXPERIMENTS_KEY, validateResearchExperiment);
  const idx = items.findIndex((e) => e.id === experiment.id);
  if (idx !== -1) {
    items[idx] = experiment;
  } else {
    items.push(experiment);
  }
  return writeStore(EXPERIMENTS_KEY, items);
}

/**
 * Get a single experiment by ID.
 */
export function getExperiment(
  id: string
): ResearchExperiment | undefined {
  const items = readStore(EXPERIMENTS_KEY, validateResearchExperiment);
  const found = items.find((e) => e.id === id);
  return found ? { ...found } : undefined;
}

/**
 * List all experiments, most recent first.
 */
export function listExperiments(): ResearchExperiment[] {
  const items = readStore(EXPERIMENTS_KEY, validateResearchExperiment);
  return items
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((e) => ({ ...e }));
}

/**
 * Update specific fields of an experiment.
 */
export function updateExperiment(
  id: string,
  updates: Partial<ResearchExperiment>
): boolean {
  const items = readStore(EXPERIMENTS_KEY, validateResearchExperiment);
  const idx = items.findIndex((e) => e.id === id);
  if (idx === -1) return false;

  items[idx] = {
    ...items[idx],
    ...updates,
    updatedAt: Date.now(),
  };

  try {
    validateResearchExperiment(items[idx]);
  } catch {
    return false;
  }

  return writeStore(EXPERIMENTS_KEY, items);
}

/**
 * Delete an experiment and all its runs.
 */
export function deleteExperiment(id: string): boolean {
  const items = readStore(EXPERIMENTS_KEY, validateResearchExperiment);
  const idx = items.findIndex((e) => e.id === id);
  if (idx === -1) return false;

  items.splice(idx, 1);
  const ok = writeStore(EXPERIMENTS_KEY, items);

  // Also delete all associated runs
  deleteRunsByExperiment(id);

  return ok;
}

/**
 * Get the count of experiments.
 */
export function experimentCount(): number {
  return readStore(EXPERIMENTS_KEY, validateResearchExperiment).length;
}

// ============================================================
// Run CRUD
// ============================================================

/**
 * Save or update a run record.
 */
export function createRun(run: ResearchRun): boolean {
  validateResearchRun(run);
  const items = readStore(RUNS_KEY, validateResearchRun);
  const idx = items.findIndex((r) => r.runId === run.runId);
  if (idx !== -1) {
    items[idx] = run;
  } else {
    items.push(run);
  }
  return writeStore(RUNS_KEY, items);
}

/**
 * Get a single run by ID.
 */
export function getRun(runId: string): ResearchRun | undefined {
  const items = readStore(RUNS_KEY, validateResearchRun);
  const found = items.find((r) => r.runId === runId);
  return found ? { ...found } : undefined;
}

/**
 * List all runs, most recent first.
 */
export function listRuns(): ResearchRun[] {
  const items = readStore(RUNS_KEY, validateResearchRun);
  return items
    .slice()
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((r) => ({ ...r }));
}

/**
 * List runs for a specific experiment.
 */
export function listRunsByExperiment(
  experimentId: string
): ResearchRun[] {
  const items = readStore(RUNS_KEY, validateResearchRun);
  return items
    .filter((r) => r.experimentId === experimentId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((r) => ({ ...r }));
}

/**
 * Update specific fields of a run.
 */
export function updateRun(
  runId: string,
  updates: Partial<ResearchRun>
): boolean {
  const items = readStore(RUNS_KEY, validateResearchRun);
  const idx = items.findIndex((r) => r.runId === runId);
  if (idx === -1) return false;

  items[idx] = { ...items[idx], ...updates };

  try {
    validateResearchRun(items[idx]);
  } catch {
    return false;
  }

  return writeStore(RUNS_KEY, items);
}

/**
 * Delete a single run.
 */
export function deleteRun(runId: string): boolean {
  const items = readStore(RUNS_KEY, validateResearchRun);
  const idx = items.findIndex((r) => r.runId === runId);
  if (idx === -1) return false;

  items.splice(idx, 1);
  return writeStore(RUNS_KEY, items);
}

/**
 * Delete all runs for a specific experiment.
 */
export function deleteRunsByExperiment(experimentId: string): void {
  const items = readStore(RUNS_KEY, validateResearchRun);
  const filtered = items.filter((r) => r.experimentId !== experimentId);
  writeStore(RUNS_KEY, filtered);
}

/**
 * Get the latest run for an experiment.
 */
export function getLatestRun(
  experimentId: string
): ResearchRun | undefined {
  const runs = listRunsByExperiment(experimentId);
  return runs.length > 0 ? runs[0] : undefined;
}

/**
 * Get the best run for an experiment (by lowest loss).
 */
export function getBestRun(
  experimentId: string
): ResearchRun | undefined {
  const runs = listRunsByExperiment(experimentId);
  const completed = runs.filter((r) => r.status === "completed");
  if (completed.length === 0) return undefined;

  let best = completed[0];
  for (let i = 1; i < completed.length; i++) {
    if (completed[i].bestLoss < best.bestLoss) {
      best = completed[i];
    }
  }
  return { ...best };
}

/**
 * Get run count for an experiment.
 */
export function runCount(experimentId?: string): number {
  const items = readStore(RUNS_KEY, validateResearchRun);
  if (experimentId) {
    return items.filter((r) => r.experimentId === experimentId).length;
  }
  return items.length;
}

// ============================================================
// Export / Import — Experiments
// ============================================================

/**
 * Export a single experiment to JSON string.
 */
export function exportExperiment(id: string): string | null {
  const experiment = getExperiment(id);
  if (!experiment) return null;
  return serializeResearchExperiment(experiment);
}

/**
 * Import an experiment from a JSON string.
 *
 * @returns the imported experiment, or null on failure
 */
export function importExperiment(
  json: string
): ResearchExperiment | null {
  try {
    const experiment = deserializeResearchExperiment(json);
    createExperiment(experiment);
    return experiment;
  } catch {
    return null;
  }
}

// ============================================================
// Export / Import — Runs
// ============================================================

/**
 * Export a single run to JSON string.
 */
export function exportRun(runId: string): string | null {
  const run = getRun(runId);
  if (!run) return null;
  try {
    return JSON.stringify(run, null, 2);
  } catch {
    return null;
  }
}

/**
 * Import a run from a JSON string.
 *
 * @returns the imported run, or null on failure
 */
export function importRun(json: string): ResearchRun | null {
  try {
    const parsed: unknown = JSON.parse(json);
    validateResearchRun(parsed);
    createRun(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Export all experiments and their runs as a single JSON blob.
 */
export function exportAll(): string {
  const experiments = listExperiments();
  const runs = listRuns();
  const blob = {
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    experiments,
    runs,
  };
  return JSON.stringify(blob, null, 2);
}

/**
 * Import a complete export blob.
 *
 * @returns the count of imported experiments and runs
 */
export function importAll(
  json: string
): { experiments: number; runs: number } | null {
  try {
    const blob: unknown = JSON.parse(json);
    if (typeof blob !== "object" || blob === null) return null;

    const b = blob as Record<string, unknown>;
    if (!Array.isArray(b.experiments) || !Array.isArray(b.runs)) return null;

    let expCount = 0;
    let runCount = 0;

    for (const exp of b.experiments) {
      try {
        validateResearchExperiment(exp);
        createExperiment(exp);
        expCount++;
      } catch {
        // skip invalid entries
      }
    }

    for (const run of b.runs) {
      try {
        validateResearchRun(run);
        createRun(run);
        runCount++;
      } catch {
        // skip invalid entries
      }
    }

    return { experiments: expCount, runs: runCount };
  } catch {
    return null;
  }
}

// ============================================================
// Bulk Operations
// ============================================================

/**
 * Clear all experiments and runs.
 */
export function clearAll(): void {
  localStorage.removeItem(EXPERIMENTS_KEY);
  localStorage.removeItem(RUNS_KEY);
}

/**
 * Get the total number of stored experiments.
 */
export function totalExperiments(): number {
  return experimentCount();
}

/**
 * Get the total number of stored runs.
 */
export function totalRuns(): number {
  return runCount();
}

/**
 * Check if a run exists.
 */
export function hasRun(runId: string): boolean {
  return getRun(runId) !== undefined;
}

/**
 * Check if an experiment exists.
 */
export function hasExperiment(id: string): boolean {
  return getExperiment(id) !== undefined;
}

// ============================================================
// Identity Graph Validation (Phase 67.5)
// ============================================================

/**
 * Severity level for identity graph diagnostics.
 */
export type IdentityGraphErrorSeverity = "error" | "warning";

/**
 * A single diagnostic entry in the identity graph validation.
 */
export interface IdentityGraphDiagnosticEntry {
  /** Human-readable description of the issue */
  message: string;
  /** Severity: "error" = invariant violation, "warning" = likely unintended */
  severity: IdentityGraphErrorSeverity;
  /** Entity type involved */
  entity: "experiment" | "run" | "session";
  /** The ID of the entity with the issue */
  entityId: string;
}

/**
 * Structured result of identity graph validation.
 */
export interface IdentityGraphDiagnostic {
  /** Whether all invariants hold (no errors) */
  valid: boolean;
  /** Error-level diagnostics (invariant violations) */
  errors: IdentityGraphDiagnosticEntry[];
  /** Warning-level diagnostics (likely unintended but not breaking) */
  warnings: IdentityGraphDiagnosticEntry[];
}

/**
 * Validate the identity graph across sessions, experiments, and runs.
 *
 * Checks the following invariants:
 *   1. Every session's experimentId must reference an existing experiment
 *   2. Every session's runId must reference an existing run
 *   3. A run's experimentId must match its parent experiment's id
 *   4. A session's experimentId must match its run's experimentId
 *   5. No dangling runs (run without an owning experiment)
 *   6. No session pointing to a run that belongs to a different experiment
 *
 * This function does NOT throw. It returns a structured diagnostic
 * that callers can inspect and act on.
 *
 * @param sessions — array of ResearchSession to validate
 * @param experiments — array of ResearchExperiment to validate against
 * @param runs — array of ResearchRun to validate against
 * @returns IdentityGraphDiagnostic with errors and warnings
 */
export function validateResearchIdentityGraph(
  sessions: ResearchSession[],
  experiments: ResearchExperiment[],
  runs: ResearchRun[]
): IdentityGraphDiagnostic {
  const errors: IdentityGraphDiagnosticEntry[] = [];
  const warnings: IdentityGraphDiagnosticEntry[] = [];

  const experimentIds = new Set(experiments.map((e) => e.id));
  const runIds = new Set(runs.map((r) => r.runId));
  const runMap = new Map(runs.map((r) => [r.runId, r]));

  // ── Validate each session ──
  for (const session of sessions) {
    // 1. Session's experimentId must reference an existing experiment
    if (session.experimentId !== undefined) {
      if (!experimentIds.has(session.experimentId)) {
        errors.push({
          message: `Session "${session.id}" references experiment "${session.experimentId}" which does not exist (dangling FK)`,
          severity: "error",
          entity: "session",
          entityId: session.id,
        });
      }
    } else {
      warnings.push({
        message: `Session "${session.id}" has no experimentId set (unlinked session)`,
        severity: "warning",
        entity: "session",
        entityId: session.id,
      });
    }

    // 2. Session's runId must reference an existing run
    if (session.runId !== undefined) {
      if (!runIds.has(session.runId)) {
        errors.push({
          message: `Session "${session.id}" references run "${session.runId}" which does not exist (dangling FK)`,
          severity: "error",
          entity: "session",
          entityId: session.id,
        });
      } else {
        // 4. Session's experimentId must match its run's experimentId
        const run = runMap.get(session.runId)!;
        if (
          session.experimentId !== undefined &&
          run.experimentId !== session.experimentId
        ) {
          errors.push({
            message:
              `Session "${session.id}" experimentId "${session.experimentId}" ` +
              `does not match its run "${session.runId}" experimentId "${run.experimentId}" ` +
              `(cross-wired FK)`,
            severity: "error",
            entity: "session",
            entityId: session.id,
          });
        }
      }
    }

    // 6. Session pointing to a run that belongs to a different experiment
    // (already covered by check 4 above)
  }

  // ── Validate each run ──
  for (const run of runs) {
    // 3. Run's experimentId must reference an existing experiment
    if (!experimentIds.has(run.experimentId)) {
      errors.push({
        message: `Run "${run.runId}" references experiment "${run.experimentId}" which does not exist (dangling FK)`,
        severity: "error",
        entity: "run",
        entityId: run.runId,
      });
    }
  }

  // ── 5. Check for dangling runs (runs without any session referencing them) ──
  // This is a warning, not an error — runs can exist without a session
  const referencedRunIds = new Set(
    sessions.filter((s) => s.runId !== undefined).map((s) => s.runId!)
  );
  for (const run of runs) {
    if (!referencedRunIds.has(run.runId)) {
      warnings.push({
        message: `Run "${run.runId}" is not referenced by any session (orphan run)`,
        severity: "warning",
        entity: "run",
        entityId: run.runId,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Convenience: load all data from localStorage and validate the identity graph.
 *
 * Reads experiments, runs, and sessions from their respective stores
 * and runs the full identity validation.
 *
 * @returns IdentityGraphDiagnostic
 */
export function validateCurrentIdentityGraph(): IdentityGraphDiagnostic {
  let experiments: ResearchExperiment[] = [];
  let runs: ResearchRun[] = [];
  let sessions: ResearchSession[] = [];

  try {
    experiments = listExperiments();
  } catch {
    // localStorage unavailable — validate with empty array
  }

  try {
    runs = listRuns();
  } catch {
    // localStorage unavailable — validate with empty array
  }

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem("minimind-research-workspace");
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          sessions = parsed.filter(
            (s): s is ResearchSession =>
              typeof s === "object" &&
              s !== null &&
              typeof (s as ResearchSession).id === "string" &&
              typeof (s as ResearchSession).status === "string"
          );
        }
      }
    }
  } catch {
    // If we can't read sessions, validate with empty array
  }

  return validateResearchIdentityGraph(sessions, experiments, runs);
}
