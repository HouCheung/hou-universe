// ============================================================
// MiniMind — research/ResearchState.ts
// ============================================================
// Phase 57: Research state type definitions.
//
// Defines the canonical types for the research workspace:
//   - ResearchSession — a single research session
//   - ResearchStatus — lifecycle states
//   - SessionConfig — configuration for a session
//   - ResearchTimelineEvent — events in the experiment timeline
//
// Design principles:
//   - JSON-serializable — all fields survive stringify/parse
//   - Immutable consumer view — consumers receive copies
//   - Explicit nullability — `| undefined`, not `?` with implicit
//   - Browser-safe — no Node.js types
// ============================================================

import type { ModelConfigEntry } from "../experiments/ModelRegistry";
import type { TrainingRecipe } from "../experiments/TrainingRecipe";

// ============================================================
// Research Session Status
// ============================================================

/**
 * Lifecycle status of a research session.
 *
 *   - "created"    — session exists but not yet configured
 *   - "configured" — model/dataset/training config is set
 *   - "queued"     — training is queued for execution
 *   - "running"    — training is actively executing
 *   - "paused"     — training was paused mid-run (checkpoint saved)
 *   - "stopped"    — training was stopped by user (terminal, can restore)
 *   - "completed"  — training finished all epochs naturally
 *   - "failed"     — training terminated with an error
 *   - "restored"   — session was restored from a checkpoint
 */
export type ResearchStatus =
  | "created"
  | "configured"
  | "queued"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "failed"
  | "restored";

// ============================================================
// Training Metrics Snapshot
// ============================================================

/**
 * Live snapshot of training metrics for a running session.
 *
 * Updated in real-time via the TrainingEventBus.
 */
export interface TrainingMetricsSnapshot {
  /** Current loss value */
  loss: number;
  /** Current perplexity = exp(loss) */
  perplexity: number;
  /** Current learning rate */
  learningRate: number;
  /** Tokens processed per second */
  tokensPerSecond: number;
  /** Current gradient norm (L2) */
  gradientNorm: number | undefined;
  /** Current epoch (0-indexed) */
  epoch: number;
  /** Current global step */
  globalStep: number;
  /** Total number of steps planned */
  totalSteps: number;
  /** Unix timestamp (ms) when this snapshot was taken */
  timestamp: number;
}

// ============================================================
// Checkpoint Metadata
// ============================================================

/**
 * Metadata about a saved checkpoint within a research session.
 *
 * Phase 66: Extended to carry the full serialized CheckpointData
 * for true training restore. checkpointData is stored as a JSON
 * string to keep localStorage compact while supporting full restore.
 */
export interface ResearchCheckpoint {
  /** Unique identifier for this checkpoint */
  id: string;
  /** Step at which the checkpoint was saved */
  step: number;
  /** Loss at checkpoint time */
  loss: number;
  /** Perplexity at checkpoint time */
  perplexity?: number;
  /** Epoch at checkpoint time (0-indexed) */
  epoch: number;
  /** Unix timestamp (ms) when the checkpoint was created */
  timestamp: number;
  /** Duration of training up to this checkpoint (ms) */
  durationMs?: number;
  /** Model config fingerprint (for compatibility check on restore) */
  modelConfigLabel?: string;
  /** Random seed */
  seed?: number;
  /** Estimated serialized size in bytes */
  sizeBytes?: number;
  /** Full serialized checkpoint data as JSON string (Phase 66).
   *  Can be loaded via JSON.parse + loadCheckpoint for true restore.
   *  @deprecated Phase 85: the full blob now lives in the CheckpointStore;
   *  this field is retained only for backward compatibility with legacy
   *  inline checkpoints and tests. */
  checkpointDataJSON?: string;
  /** Phase 85: true when the full checkpoint blob is persisted to the
   *  CheckpointStore (IndexedDB/memory) instead of inline in this metadata.
   *  When true, `checkpointDataJSON` is intentionally absent here — the blob
   *  is loaded via CheckpointStore.get(id). */
  checkpointDataPersisted?: boolean;
}

// ============================================================
// Timeline Event
// ============================================================

/**
 * A single event in the experiment timeline.
 *
 * Records state transitions and key milestones during
 * the research session lifecycle.
 */
export interface ResearchTimelineEvent {
  /** Unique event identifier */
  id: string;
  /** Event type — matches ResearchStatus transitions */
  type: ResearchStatus | "checkpoint" | "evaluation" | "restored" | "interrupted";
  /** Human-readable label (e.g. "Training started") */
  label: string;
  /** Unix timestamp (ms) when this event occurred */
  timestamp: number;
  /** Optional data payload (loss, step, etc.) */
  data?: Record<string, unknown>;
}

// ============================================================
// Session Configuration
// ============================================================

/**
 * Configuration used to create/update a research session.
 */
export interface SessionConfig {
  /** Human-readable session name */
  name: string;
  /** Model configuration entry */
  modelConfig: ModelConfigEntry;
  /** Training recipe */
  trainingConfig: TrainingRecipe;
  /** Dataset identifier */
  dataset: string;
  /** Random seed for reproducibility */
  seed: number;
  /** Optional custom experiment ID */
  experimentId?: string;
  /** Optional block size override */
  blockSize?: number;
  /** Optional batch size override */
  batchSize?: number;
  /** Optional epochs override */
  epochs?: number;
  /** Optional tags for organization */
  tags?: string[];
  /** Optional notes/description */
  notes?: string;
}

// ============================================================
// Research Session
// ============================================================

/**
 * A single research session.
 *
 * Tracks the full lifecycle of a research experiment:
 * configuration → execution → monitoring → results.
 *
 * Stored in localStorage under the "minimind-research-workspace" key
 * as part of a sessions array managed by ResearchWorkspace.
 */
export interface ResearchSession {
  /** Unique identifier (format: "rs-{timestamp}-{random}") */
  id: string;

  /** FK to ResearchExperiment.id — the experiment this session belongs to */
  experimentId: string | undefined;

  /** FK to ResearchRun.runId — the run this session is executing */
  runId: string | undefined;

  /** Human-readable session name */
  name: string;

  /** Current lifecycle status */
  status: ResearchStatus;

  /** Selected model configuration */
  modelConfig: ModelConfigEntry;

  /** Selected training recipe */
  trainingConfig: TrainingRecipe;

  /** Selected dataset identifier */
  dataset: string;

  /** Random seed */
  seed: number;

  /** Optional block size override */
  blockSize: number | undefined;

  /** Optional batch size override */
  batchSize: number | undefined;

  /** Optional epochs override */
  epochs: number | undefined;

  /** Live training metrics snapshot (undefined when not running) */
  metrics: TrainingMetricsSnapshot | undefined;

  /** Currently active checkpoint metadata */
  activeCheckpoint: ResearchCheckpoint | undefined;

  /** All checkpoints saved during this session */
  checkpoints: ResearchCheckpoint[];

  /** Experiment timeline of state transitions */
  timeline: ResearchTimelineEvent[];

  /** Final result metrics (undefined until completed) */
  finalLoss: number | undefined;
  finalPerplexity: number | undefined;
  bestLoss: number | undefined;
  durationMs: number | undefined;

  /** Error message if status is "failed" */
  errorMessage: string | undefined;

  /** Arbitrary tags for filtering/organization */
  tags: string[];

  /** User-provided notes */
  notes: string | undefined;

  /** Unix timestamp (ms) when the session was created */
  createdAt: number;

  /** Unix timestamp (ms) when the session was last updated */
  updatedAt: number;
}

// ============================================================
// Factory
// ============================================================

/**
 * Generate a unique ID for a research session.
 *
 * Format: "rs-{timestamp}-{random}"
 */
export function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `rs-${ts}-${rand}`;
}

/**
 * Generate a unique ID for a timeline event.
 *
 * Format: "te-{timestamp}-{random}"
 */
export function generateTimelineEventId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `te-${ts}-${rand}`;
}

/**
 * Create a new ResearchSession with defaults filled in.
 *
 * @param config — session configuration
 * @param id — optional session ID (generated if not provided)
 * @returns a new ResearchSession with sensible defaults
 */
export function createResearchSession(
  config: SessionConfig,
  id?: string
): ResearchSession {
  const now = Date.now();
  const sessionId = id ?? generateSessionId();

  const initialEvent: ResearchTimelineEvent = {
    id: generateTimelineEventId(),
    type: "created",
    label: "Session created",
    timestamp: now,
  };

  return {
    id: sessionId,
    experimentId: config.experimentId,
    runId: undefined,
    name: config.name,
    status: "configured",
    modelConfig: { ...config.modelConfig },
    trainingConfig: { ...config.trainingConfig },
    dataset: config.dataset,
    seed: config.seed,
    blockSize: config.blockSize,
    batchSize: config.batchSize,
    epochs: config.epochs,
    metrics: undefined,
    activeCheckpoint: undefined,
    checkpoints: [],
    timeline: [initialEvent],
    finalLoss: undefined,
    finalPerplexity: undefined,
    bestLoss: undefined,
    durationMs: undefined,
    errorMessage: undefined,
    tags: config.tags ?? [],
    notes: config.notes,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================
// Guards
// ============================================================

/**
 * Type guard: check whether an unknown value is a valid ResearchSession shape.
 */
export function isResearchSession(
  value: unknown
): value is ResearchSession {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.name === "string" &&
    typeof s.status === "string" &&
    typeof s.modelConfig === "object" &&
    s.modelConfig !== null &&
    typeof s.trainingConfig === "object" &&
    s.trainingConfig !== null &&
    typeof s.dataset === "string" &&
    typeof s.seed === "number" &&
    Array.isArray(s.timeline) &&
    typeof s.createdAt === "number" &&
    typeof s.updatedAt === "number"
  );
}

/**
 * Full validation of a ResearchSession.
 *
 * @throws if any required field is missing or invalid
 */
export function validateResearchSession(
  value: unknown
): asserts value is ResearchSession {
  if (!isResearchSession(value)) {
    throw new Error(
      "ResearchSession: value does not match the ResearchSession shape"
    );
  }

  const s = value as ResearchSession;

  if (s.id.trim().length === 0) {
    throw new Error("ResearchSession: id must be a non-empty string");
  }
  if (s.name.trim().length === 0) {
    throw new Error("ResearchSession: name must be a non-empty string");
  }
  const validStatuses: ResearchStatus[] = [
    "created", "configured", "queued", "running",
    "paused", "stopped", "completed", "failed", "restored",
  ];
  if (!validStatuses.includes(s.status)) {
    throw new Error(
      `ResearchSession: invalid status "${s.status}". ` +
      `Must be one of: ${validStatuses.join(", ")}`
    );
  }
  if (!Number.isFinite(s.createdAt) || s.createdAt <= 0) {
    throw new Error("ResearchSession: createdAt must be a positive number");
  }
  if (!Number.isFinite(s.updatedAt) || s.updatedAt <= 0) {
    throw new Error("ResearchSession: updatedAt must be a positive number");
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Get a human-readable label for a research status.
 */
export function getStatusLabel(status: ResearchStatus): string {
  const labels: Record<ResearchStatus, string> = {
    created: "Created",
    configured: "Configured",
    queued: "Queued",
    running: "Training",
    paused: "Paused",
    stopped: "Stopped",
    completed: "Completed",
    failed: "Failed",
    restored: "Restored",
  };
  return labels[status];
}

/**
 * Compare two sessions by updatedAt (most recent first).
 */
export function compareByUpdatedAt(
  a: ResearchSession,
  b: ResearchSession
): number {
  return b.updatedAt - a.updatedAt;
}

/**
 * Compare two sessions by createdAt (most recent first).
 */
export function compareByCreatedAt(
  a: ResearchSession,
  b: ResearchSession
): number {
  return b.createdAt - a.createdAt;
}
