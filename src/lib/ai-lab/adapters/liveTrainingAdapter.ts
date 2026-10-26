// ============================================================
// AI Lab — adapters/liveTrainingAdapter.ts
// ============================================================
// Phase 58: Bridges the TrainingRuntime to the Live Training
// Panel UI. Provides pure functions for live metrics, timeline
// transformation, and status badge derivation.
//
// Design principles:
//   - Pure functions — no side effects, no state mutation
//   - Typed outputs — every exported function returns a
//     well-defined structured type
//   - Defensive — handles empty/missing data gracefully
//   - Browser-safe — no Node.js fs/path dependencies
//   - Follows existing adapter patterns
//
// Data sources:
//   - TrainingRuntime (via singleton trainingRuntime)
//   - ExperimentController (via TrainingRuntime.getController())
//   - TrainingEventBus (via TrainingRuntime.getEventBus())
//
// Usage:
//   import { getLiveMetrics, getTrainingTimeline,
//     getTrainingStatusBadge } from
//     "@/lib/ai-lab/adapters/liveTrainingAdapter";
//   const metrics = getLiveMetrics("rs-xxx");
// ============================================================

import type {
  ResearchSession,
  TrainingMetricsSnapshot,
  ResearchTimelineEvent,
  ResearchStatus,
} from "@/lib/minimind/research";
import { workspace } from "@/lib/minimind/research";

// ============================================================
// UI-facing types
// ============================================================

/**
 * Live training metrics for the LiveTrainingPanel.
 * Flattened view of TrainingMetricsSnapshot with
 * computed progress percentage.
 */
export interface LiveMetrics {
  /** Current loss value */
  loss: number;
  /** Current perplexity = exp(loss) */
  perplexity: number;
  /** Current learning rate */
  learningRate: number;
  /** Tokens processed per second */
  throughput: number;
  /** Current gradient norm (L2), null if unavailable */
  gradientNorm: number | null;
  /** Current step number */
  currentStep: number;
  /** Total planned steps */
  totalSteps: number;
  /** Progress percentage (0-100) */
  progressPercent: number;
}

/**
 * A training timeline data point for the UI.
 */
export interface TrainingTimelineEntry {
  /** Event type */
  type: "step" | "checkpoint" | "evaluation" | "start" | "complete" | "error" | "paused" | "resumed";
  /** Human-readable label */
  label: string;
  /** Step number (0 for non-step events) */
  step: number;
  /** Loss value at this point (null if N/A) */
  loss: number | null;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Formatted relative time */
  relativeTime: string;
}

/**
 * Full training timeline data for a session.
 */
export interface TrainingTimeline {
  /** Session ID */
  sessionId: string;
  /** Session name */
  sessionName: string;
  /** Ordered timeline entries */
  entries: TrainingTimelineEntry[];
  /** Total number of entries */
  entryCount: number;
  /** Whether data is available */
  hasData: boolean;
}

/**
 * Training status badge type.
 */
export type TrainingBadgeStatus =
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "failed"
  | "restored"
  | "idle";

/**
 * Training status badge data.
 */
export interface TrainingStatusBadge {
  /** Badge status */
  status: TrainingBadgeStatus;
  /** Human-readable label (e.g. "Running", "Paused") */
  label: string;
  /** Tailwind color classes for the badge */
  colorClasses: string;
  /** Whether to show an animated pulse indicator */
  showPulse: boolean;
}

// ============================================================
// Public API — Live Metrics
// ============================================================

/**
 * Get live training metrics for a session.
 *
 * Reads the latest metrics from the research workspace.
 * Returns null if the session is not found or has no metrics.
 *
 * @param sessionId — session identifier
 * @returns LiveMetrics or null if unavailable
 *
 * Example:
 *   const metrics = getLiveMetrics("rs-xxx");
 *   if (metrics) {
 *     console.log(`Loss: ${metrics.loss}, Progress: ${metrics.progressPercent}%`);
 *   }
 */
export function getLiveMetrics(sessionId: string): LiveMetrics | null {
  const session = workspace.getSession(sessionId);
  if (!session) return null;

  const metrics = session.metrics;
  if (!metrics) return null;

  return transformMetrics(metrics);
}

/**
 * Get live metrics for the currently active session.
 *
 * @returns LiveMetrics or null if no active session
 */
export function getActiveLiveMetrics(): LiveMetrics | null {
  const session = workspace.getActiveSession();
  if (!session) return null;

  const metrics = session.metrics;
  if (!metrics) {
    // Return zero metrics for active sessions without live data
    return {
      loss: 0,
      perplexity: 0,
      learningRate: 0,
      throughput: 0,
      gradientNorm: null,
      currentStep: 0,
      totalSteps: 0,
      progressPercent: 0,
    };
  }

  return transformMetrics(metrics);
}

// ============================================================
// Public API — Training Timeline
// ============================================================

/**
 * Get the training timeline for a session.
 *
 * Converts the ResearchSession's timeline events into
 * training-specific timeline entries suitable for the
 * LiveTrainingPanel UI.
 *
 * @param sessionId — session identifier
 * @returns TrainingTimeline or null if session not found
 *
 * Example:
 *   const timeline = getTrainingTimeline("rs-xxx");
 *   timeline.entries.forEach(e => console.log(e.label));
 */
export function getTrainingTimeline(sessionId: string): TrainingTimeline | null {
  const session = workspace.getSession(sessionId);
  if (!session) return null;

  const entries = session.timeline
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((event) => mapTimelineEvent(event, session));

  return {
    sessionId: session.id,
    sessionName: session.name,
    entries,
    entryCount: entries.length,
    hasData: entries.length > 0,
  };
}

/**
 * Get the training timeline for the currently active session.
 *
 * @returns TrainingTimeline or null if no active session
 */
export function getActiveTrainingTimeline(): TrainingTimeline | null {
  const session = workspace.getActiveSession();
  if (!session) return null;

  return getTrainingTimeline(session.id);
}

// ============================================================
// Public API — Status Badge
// ============================================================

/**
 * Get the training status badge for a session.
 *
 * @param sessionId — session identifier
 * @returns TrainingStatusBadge
 *
 * Example:
 *   const badge = getTrainingStatusBadge("rs-xxx");
 *   // badge.status === "running", badge.label === "Running"
 */
export function getTrainingStatusBadge(sessionId: string): TrainingStatusBadge {
  const session = workspace.getSession(sessionId);
  if (!session) {
    return createBadge("idle");
  }

  return createBadge(mapStatusToBadgeStatus(session.status));
}

/**
 * Get the training status badge for the active session.
 *
 * @returns TrainingStatusBadge (always returns idle badge if no active session)
 */
export function getActiveTrainingStatusBadge(): TrainingStatusBadge {
  const session = workspace.getActiveSession();
  if (!session) {
    return createBadge("idle");
  }

  return createBadge(mapStatusToBadgeStatus(session.status));
}

// ============================================================
// Public API — Batch
// ============================================================

/**
 * Get all live training data for a session in one call.
 *
 * Convenience function that bundles metrics, timeline, and status
 * badge into a single object for the LiveTrainingPanel.
 *
 * @param sessionId — session identifier
 * @returns bundled training data
 */
export function getLiveTrainingData(sessionId: string): {
  metrics: LiveMetrics | null;
  timeline: TrainingTimeline | null;
  badge: TrainingStatusBadge;
} {
  return {
    metrics: getLiveMetrics(sessionId),
    timeline: getTrainingTimeline(sessionId),
    badge: getTrainingStatusBadge(sessionId),
  };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Transform a TrainingMetricsSnapshot into LiveMetrics.
 */
function transformMetrics(metrics: TrainingMetricsSnapshot): LiveMetrics {
  const totalSteps = metrics.totalSteps || 1;
  const progressPercent = Math.round(
    (metrics.globalStep / totalSteps) * 100
  );

  return {
    loss: metrics.loss,
    perplexity: metrics.perplexity,
    learningRate: metrics.learningRate,
    throughput: metrics.tokensPerSecond,
    gradientNorm: metrics.gradientNorm ?? null,
    currentStep: metrics.globalStep,
    totalSteps: metrics.totalSteps,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
  };
}

/**
 * Map a ResearchTimelineEvent to a TrainingTimelineEntry.
 */
function mapTimelineEvent(
  event: ResearchTimelineEvent,
  session: ResearchSession
): TrainingTimelineEntry {
  const step =
    typeof event.data?.step === "number"
      ? event.data.step
      : session.metrics?.globalStep ?? 0;

  const loss =
    typeof event.data?.loss === "number"
      ? event.data.loss
      : session.metrics?.loss ?? null;

  return {
    type: mapEventTypeToTimelineType(event.type),
    label: event.label,
    step,
    loss,
    timestamp: event.timestamp,
    relativeTime: formatRelativeTime(event.timestamp),
  };
}

/**
 * Map a ResearchTimelineEvent type to a TrainingTimelineEntry type.
 */
function mapEventTypeToTimelineType(
  eventType: ResearchTimelineEvent["type"]
): TrainingTimelineEntry["type"] {
  switch (eventType) {
    case "running":
      return "start";
    case "paused":
      return "paused";
    case "completed":
      return "complete";
    case "failed":
      return "error";
    case "checkpoint":
      return "checkpoint";
    case "evaluation":
      return "evaluation";
    case "restored":
      return "resumed";
    case "created":
    case "configured":
    case "queued":
      return "start";
    default:
      return "start";
  }
}

/**
 * Map a ResearchStatus to a TrainingBadgeStatus.
 */
function mapStatusToBadgeStatus(
  status: ResearchStatus
): TrainingBadgeStatus {
  switch (status) {
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "restored":
      return "restored";
    default:
      return "idle";
  }
}

/**
 * Create a TrainingStatusBadge from a badge status.
 */
function createBadge(status: TrainingBadgeStatus): TrainingStatusBadge {
  switch (status) {
    case "running":
      return {
        status: "running",
        label: "Running",
        colorClasses: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        showPulse: true,
      };
    case "paused":
      return {
        status: "paused",
        label: "Paused",
        colorClasses: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        showPulse: false,
      };
    case "stopped":
      return {
        status: "stopped",
        label: "Stopped",
        colorClasses: "bg-slate-500/10 text-slate-400 border-slate-500/30",
        showPulse: false,
      };
    case "completed":
      return {
        status: "completed",
        label: "Completed",
        colorClasses: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        showPulse: false,
      };
    case "failed":
      return {
        status: "failed",
        label: "Failed",
        colorClasses: "bg-red-500/10 text-red-400 border-red-500/20",
        showPulse: false,
      };
    case "restored":
      return {
        status: "restored",
        label: "Restored",
        colorClasses: "bg-blue-500/10 text-blue-400 border-blue-500/20",
        showPulse: true,
      };
    case "idle":
    default:
      return {
        status: "idle",
        label: "Idle",
        colorClasses: "bg-slate-500/10 text-slate-400 border-slate-500/20",
        showPulse: false,
      };
  }
}

/**
 * Format a timestamp as a relative time string.
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return "just now";
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ============================================================
// Phase 66 — Checkpoint & Recovery Adapter
// ============================================================

/**
 * Checkpoint summary for UI display.
 */
export interface CheckpointSummary {
  /** Checkpoint ID */
  id: string;
  /** Step number */
  step: number;
  /** Loss at checkpoint */
  loss: number;
  /** Perplexity at checkpoint */
  perplexity: number | null;
  /** Epoch number */
  epoch: number;
  /** Timestamp */
  timestamp: number;
  /** Formatted relative time */
  relativeTime: string;
  /** Duration up to this checkpoint (ms) */
  durationMs: number | null;
  /** Serialized size */
  sizeBytes: number | null;
  /** Model label */
  modelLabel: string | null;
  /** Seed */
  seed: number | null;
  /** Whether this is the active checkpoint */
  isActive: boolean;
  /** Whether full training data is available for restore */
  hasTrainingData: boolean;
}

/**
 * Checkpoint list for a session.
 */
export interface CheckpointList {
  sessionId: string;
  checkpoints: CheckpointSummary[];
  count: number;
  hasCheckpoints: boolean;
}

/**
 * Recovery state after page refresh.
 */
export interface RecoveryState {
  /** Whether recovery is needed */
  needsRecovery: boolean;
  /** Session ID that needs recovery */
  sessionId: string | null;
  /** Session name */
  sessionName: string | null;
  /** Recovery message */
  message: string | null;
  /** Whether a checkpoint is available */
  canRecover: boolean;
  /** Latest checkpoint ID if available */
  latestCheckpointId: string | null;
  /** Last known step before interruption */
  lastKnownStep: number;
}

/**
 * Training controls configuration for UI.
 */
export interface TrainingControls {
  /** Which actions are available */
  actions: string[];
  /** Whether controls should be enabled */
  enabled: boolean;
  /** Status for display */
  status: TrainingBadgeStatus;
  /** Status label */
  statusLabel: string;
}

/**
 * Training progress data.
 */
export interface TrainingProgress {
  currentStep: number;
  totalSteps: number;
  progressPercent: number;
  estimatedRemainingMs: number | null;
  elapsedMs: number | null;
  currentEpoch: number;
  totalEpochs: number;
}

/**
 * Get the checkpoint list for a session.
 *
 * @param sessionId — session identifier
 * @returns CheckpointList
 */
export function getCheckpointList(sessionId: string): CheckpointList {
  const session = workspace.getSession(sessionId);
  if (!session) {
    return { sessionId, checkpoints: [], count: 0, hasCheckpoints: false };
  }

  const activeId = session.activeCheckpoint?.id;

  const checkpoints: CheckpointSummary[] = session.checkpoints
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((ckpt) => ({
      id: ckpt.id,
      step: ckpt.step,
      loss: ckpt.loss,
      perplexity: ckpt.perplexity ?? null,
      epoch: ckpt.epoch,
      timestamp: ckpt.timestamp,
      relativeTime: formatRelativeTime(ckpt.timestamp),
      durationMs: ckpt.durationMs ?? null,
      sizeBytes: ckpt.sizeBytes ?? null,
      modelLabel: ckpt.modelConfigLabel ?? null,
      seed: ckpt.seed ?? null,
      isActive: ckpt.id === activeId,
      hasTrainingData: ckpt.checkpointDataPersisted === true,
    }));

  return {
    sessionId,
    checkpoints,
    count: checkpoints.length,
    hasCheckpoints: checkpoints.length > 0,
  };
}

/**
 * Get the current (active) checkpoint for a session.
 *
 * @param sessionId — session identifier
 * @returns CheckpointSummary or null
 */
export function getCurrentCheckpoint(
  sessionId: string
): CheckpointSummary | null {
  const session = workspace.getSession(sessionId);
  if (!session?.activeCheckpoint) return null;

  const ckpt = session.activeCheckpoint;
  return {
    id: ckpt.id,
    step: ckpt.step,
    loss: ckpt.loss,
    perplexity: ckpt.perplexity ?? null,
    epoch: ckpt.epoch,
    timestamp: ckpt.timestamp,
    relativeTime: formatRelativeTime(ckpt.timestamp),
    durationMs: ckpt.durationMs ?? null,
    sizeBytes: ckpt.sizeBytes ?? null,
    modelLabel: ckpt.modelConfigLabel ?? null,
    seed: ckpt.seed ?? null,
    isActive: true,
    hasTrainingData: ckpt.checkpointDataPersisted === true,
  };
}

/**
 * Get the recovery state after a page refresh.
 *
 * Scans for sessions in "running" or "paused" state that were
 * interrupted by a page refresh (Worker is dead).
 *
 * @returns RecoveryState
 */
export function getRecoveryState(): RecoveryState {
  const sessions = workspace.listSessions();
  const interrupted = sessions.find(
    (s) => s.status === "running" || s.status === "paused"
  );

  if (!interrupted) {
    return {
      needsRecovery: false,
      sessionId: null,
      sessionName: null,
      message: null,
      canRecover: false,
      latestCheckpointId: null,
      lastKnownStep: 0,
    };
  }

  const checkpoints = interrupted.checkpoints ?? [];
  const latest =
    checkpoints.length > 0
      ? checkpoints.reduce((a, b) => (a.step > b.step ? a : b))
      : null;
  const canRecover = latest !== null && latest.checkpointDataPersisted === true;
  const lastKnownStep = interrupted.metrics?.globalStep ?? 0;

  return {
    needsRecovery: true,
    sessionId: interrupted.id,
    sessionName: interrupted.name,
    message: canRecover
      ? `Training was interrupted at step ${lastKnownStep}. Latest checkpoint at step ${latest!.step} is available.`
      : `Training was interrupted at step ${lastKnownStep}. No checkpoint available.`,
    canRecover,
    latestCheckpointId: latest?.id ?? null,
    lastKnownStep,
  };
}

/**
 * Get the training controls configuration for a session.
 *
 * Determines which buttons to show based on the current lifecycle state.
 *
 * @param sessionId — session identifier
 * @returns TrainingControls
 */
export function getTrainingControls(sessionId: string): TrainingControls {
  const session = workspace.getSession(sessionId);
  const badge = getTrainingStatusBadge(sessionId);

  if (!session) {
    return {
      actions: [],
      enabled: false,
      status: "idle",
      statusLabel: "Idle",
    };
  }

  const actions = getActionsForStatus(session.status);

  return {
    actions,
    enabled: session.status === "running" || session.status === "paused" || session.status === "restored",
    status: badge.status,
    statusLabel: badge.label,
  };
}

/**
 * Get training progress for a session.
 *
 * @param sessionId — session identifier
 * @returns TrainingProgress or null
 */
export function getTrainingProgress(
  sessionId: string
): TrainingProgress | null {
  const session = workspace.getSession(sessionId);
  if (!session?.metrics) return null;

  const m = session.metrics;
  const totalSteps = m.totalSteps || 1;
  const progressPercent = Math.round((m.globalStep / totalSteps) * 100);

  // Elapsed time: from session creation to now (or to completion)
  const now = Date.now();
  const elapsedMs =
    session.durationMs ?? (now - session.createdAt);

  // Estimated remaining: based on linear extrapolation
  let estimatedRemainingMs: number | null = null;
  if (m.globalStep > 0 && session.status === "running") {
    const msPerStep = elapsedMs / m.globalStep;
    const remainingSteps = totalSteps - m.globalStep;
    estimatedRemainingMs = msPerStep * remainingSteps;
  }

  return {
    currentStep: m.globalStep,
    totalSteps,
    progressPercent: Math.max(0, Math.min(100, progressPercent)),
    estimatedRemainingMs,
    elapsedMs: session.status !== "running" ? elapsedMs : null,
    currentEpoch: m.epoch + 1,
    totalEpochs: session.epochs ?? 5,
  };
}

// ============================================================
// Helpers
// ============================================================

function getActionsForStatus(status: ResearchStatus): string[] {
  switch (status) {
    case "created":
    case "configured":
    case "queued":
      return ["start"];
    case "running":
      return ["pause", "save_checkpoint", "stop"];
    case "paused":
      return ["resume", "save_checkpoint", "stop"];
    case "stopped":
      return ["restore", "new_run"];
    case "completed":
      return ["restore", "new_run"];
    case "failed":
      return ["restore", "retry", "discard"];
    case "restored":
      return ["start"];
    default:
      return [];
  }
}
