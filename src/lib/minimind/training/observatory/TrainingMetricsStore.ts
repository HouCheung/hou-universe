// ============================================================
// MiniMind — training/observatory/TrainingMetricsStore.ts
// ============================================================
// Phase 53: localStorage-backed training metrics store.
//
// Provides CRUD operations for TrainingRunRecord objects with
// automatic persistence to localStorage. Follows the exact same
// pattern as ExperimentStore (Phase 51).
//
// Design principles:
//   - Single source of truth — one localStorage key for all records
//   - Defensive copies — consumers receive clones, never live refs
//   - Idempotent writes — saving the same id overwrites previous entry
//   - Graceful degradation — corrupted localStorage data triggers
//     a reset rather than a crash
//   - Synchronous API — localStorage is synchronous; no async needed
//
// localStorage key: "minimind-training-metrics"
// Value schema: { v: 1, records: TrainingRunRecord[] }
// ============================================================

import type { TrainingRunRecord } from "./TrainingRunRecord";
import {
  validateTrainingRunRecord,
  compareByTimestamp,
} from "./TrainingRunRecord";

// ============================================================
// Constants
// ============================================================

/** localStorage key for training metrics */
const STORAGE_KEY = "minimind-training-metrics";

/** Current schema version (for forward-compatible migration) */
const SCHEMA_VERSION = 1;

// ============================================================
// Internal helpers
// ============================================================

/**
 * Read raw records array from localStorage.
 *
 * Returns an empty array when:
 *   - No data exists yet (first visit)
 *   - Data is corrupted (JSON parse failure)
 *   - Schema version mismatch
 *
 * In corruption cases, the bad data is cleared to prevent
 * repeated parse failures.
 */
function readRaw(): TrainingRunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("v" in parsed) ||
      !("records" in parsed)
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    const store = parsed as { v: number; records: unknown[] };
    if (store.v !== SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    if (!Array.isArray(store.records)) {
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // Filter out invalid entries rather than failing entirely
    return store.records.filter((r): r is TrainingRunRecord => {
      try {
        validateTrainingRunRecord(r);
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

/**
 * Persist the records array to localStorage.
 *
 * Catches and logs write errors (e.g., quota exceeded).
 * Returns true on success, false on failure.
 */
function writeRaw(records: TrainingRunRecord[]): boolean {
  try {
    const store = { v: SCHEMA_VERSION, records };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (error) {
    console.error(
      "[TrainingMetricsStore] Failed to write to localStorage:",
      error
    );
    return false;
  }
}

// ============================================================
// Public API — CRUD
// ============================================================

/**
 * Save (or overwrite) a training run record.
 *
 * If a record with the same `id` already exists, it is replaced.
 * Otherwise, the new record is appended.
 *
 * The record is validated before saving. On validation failure,
 * an error is thrown and nothing is persisted.
 *
 * @param record — the record to save
 * @throws if validation fails
 * @returns true if persisted successfully, false on storage error
 */
export function save(record: TrainingRunRecord): boolean {
  validateTrainingRunRecord(record);

  const records = readRaw();
  const index = records.findIndex((r) => r.id === record.id);

  if (index !== -1) {
    records[index] = record;
  } else {
    records.push(record);
  }

  return writeRaw(records);
}

/**
 * Get a single training run record by id.
 *
 * @param id — the record id to look up
 * @returns a deep copy of the record, or undefined if not found
 */
export function get(id: string): TrainingRunRecord | undefined {
  const records = readRaw();
  const found = records.find((r) => r.id === id);
  if (!found) return undefined;
  // Deep copy to prevent mutation of store data
  return JSON.parse(JSON.stringify(found)) as TrainingRunRecord;
}

/**
 * List all training run records.
 *
 * Results are sorted by timestamp descending (most recent first).
 *
 * @returns a new array of deep-copied records — safe to mutate
 */
export function list(): TrainingRunRecord[] {
  const records = readRaw();
  return records
    .slice()
    .sort(compareByTimestamp)
    .map((r) => JSON.parse(JSON.stringify(r)) as TrainingRunRecord);
}

/**
 * Delete a single training run record by id.
 *
 * @param id — the record id to delete
 * @returns true if the record was found and deleted, false if not found
 */
export function deleteRecord(id: string): boolean {
  const records = readRaw();
  const index = records.findIndex((r) => r.id === id);

  if (index === -1) return false;

  records.splice(index, 1);
  return writeRaw(records);
}

/**
 * Delete all training run records.
 *
 * This removes the entire metrics history. Use with caution.
 */
export function clear(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get the most recent record (by timestamp), or undefined if empty.
 *
 * @returns a deep copy of the most recent record, or undefined
 */
export function latest(): TrainingRunRecord | undefined {
  const records = readRaw();
  if (records.length === 0) return undefined;
  const latestRecord = records.reduce((a, b) =>
    a.timestamp > b.timestamp ? a : b
  );
  return JSON.parse(JSON.stringify(latestRecord)) as TrainingRunRecord;
}

/**
 * Get the total number of stored records.
 *
 * @returns count of all records across all statuses
 */
export function count(): number {
  return readRaw().length;
}

/**
 * Check whether a record with the given id exists.
 *
 * @param id — the record id to check
 * @returns true if a record with this id is stored
 */
export function has(id: string): boolean {
  return readRaw().some((r) => r.id === id);
}

/**
 * List records filtered by status.
 *
 * @param status — "running" | "completed" | "failed"
 * @returns filtered array sorted by timestamp descending
 */
export function listByStatus(
  status: "running" | "completed" | "failed"
): TrainingRunRecord[] {
  return list().filter((r) => r.status === status);
}

/**
 * Get summary statistics across all records.
 *
 * Useful for dashboard overviews.
 */
export function stats(): {
  total: number;
  completed: number;
  running: number;
  failed: number;
  bestLoss: number | null;
  bestPerplexity: number | null;
  averageThroughput: number | null;
  totalDurationMs: number;
} {
  const records = readRaw();
  const completed = records.filter((r) => r.status === "completed");

  let bestLoss: number | null = null;
  let bestPerplexity: number | null = null;
  let totalThroughput = 0;
  let throughputCount = 0;
  let totalDurationMs = 0;

  for (const r of completed) {
    if (Number.isFinite(r.bestLoss)) {
      if (bestLoss === null || r.bestLoss < bestLoss) {
        bestLoss = r.bestLoss;
      }
    }
    if (Number.isFinite(r.finalPerplexity)) {
      if (
        bestPerplexity === null ||
        r.finalPerplexity < bestPerplexity
      ) {
        bestPerplexity = r.finalPerplexity;
      }
    }
    if (Number.isFinite(r.averageThroughput) && r.averageThroughput > 0) {
      totalThroughput += r.averageThroughput;
      throughputCount++;
    }
    totalDurationMs += r.durationMs;
  }

  return {
    total: records.length,
    completed: completed.length,
    running: records.filter((r) => r.status === "running").length,
    failed: records.filter((r) => r.status === "failed").length,
    bestLoss,
    bestPerplexity,
    averageThroughput:
      throughputCount > 0 ? totalThroughput / throughputCount : null,
    totalDurationMs,
  };
}
