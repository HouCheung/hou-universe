// ============================================================
// MiniMind — research/TrainingLifecycleState.ts
// ============================================================
// Phase 66: Strict training lifecycle state machine.
//
// All training session status transitions are governed by this
// module. UI must NOT modify status directly — it must go through
// the centralized transition functions.
//
// States:
//   created → queued → running → completed
//                    ↕         → stopped
//                  paused      → failed
//                    ↓
//                  stopped
//
// Allowlist transitions:
//   running → paused | stopped | failed
//   paused  → running | stopped | failed
//   stopped → restored → running
//   failed  → restored → running
//   completed → restored → running
//
// Forbidden:
//   - Direct transitions between terminal states
//   - Skipping required intermediate states
//   - UI-originated status mutations
//
// Usage:
//   import { canTransition, transitionState, TrainingLifecycleState } from "./TrainingLifecycleState";
//   if (canTransition("running", "paused")) { ... }
//   const newState = transitionState("running", "paused"); // "paused"
// ============================================================

import type { ResearchStatus } from "./ResearchState";

// ============================================================
// State Definitions
// ============================================================

/**
 * All valid training lifecycle states.
 * This is a subset of ResearchStatus — only the states
 * managed by the training lifecycle (excludes "configured").
 */
export type TrainingLifecycleStatus =
  | "created"
  | "queued"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "failed"
  | "restored";

/**
 * Human-readable labels for each lifecycle state.
 */
export const LIFECYCLE_STATE_LABELS: Record<TrainingLifecycleStatus, string> = {
  created: "Created",
  queued: "Queued",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
  failed: "Failed",
  restored: "Restored",
};

/**
 * Whether each state is considered "terminal" (no further
 * transitions without explicit restore).
 */
export const TERMINAL_STATES: Set<TrainingLifecycleStatus> = new Set([
  "completed",
  "stopped",
  "failed",
]);

/**
 * Whether each state is considered "active" (training is or was
 * recently executing).
 */
export const ACTIVE_STATES: Set<TrainingLifecycleStatus> = new Set([
  "running",
  "paused",
]);

// ============================================================
// Transition Table
// ============================================================

/**
 * Allowed transitions: from → Set<to>
 *
 * This is the SINGLE SOURCE OF TRUTH for state transitions.
 * Any code that changes ResearchStatus must validate through
 * canTransition() first.
 */
const ALLOWED_TRANSITIONS: Map<
  TrainingLifecycleStatus,
  Set<TrainingLifecycleStatus>
> = new Map([
  ["created", new Set<TrainingLifecycleStatus>(["queued"])],
  ["queued", new Set<TrainingLifecycleStatus>(["running", "failed"])],
  [
    "running",
    new Set<TrainingLifecycleStatus>(["paused", "stopped", "completed", "failed"]),
  ],
  [
    "paused",
    new Set<TrainingLifecycleStatus>(["running", "stopped", "failed"]),
  ],
  [
    "stopped",
    new Set<TrainingLifecycleStatus>(["restored"]),
  ],
  [
    "completed",
    new Set<TrainingLifecycleStatus>(["restored"]),
  ],
  [
    "failed",
    new Set<TrainingLifecycleStatus>(["restored"]),
  ],
  [
    "restored",
    new Set<TrainingLifecycleStatus>(["running", "queued"]),
  ],
]);

// ============================================================
// Public API
// ============================================================

/**
 * Check whether a state transition is allowed.
 *
 * @param from — current state
 * @param to — desired state
 * @returns true if the transition is valid
 *
 * Example:
 *   canTransition("running", "paused")   // true
 *   canTransition("completed", "paused") // false
 */
export function canTransition(
  from: TrainingLifecycleStatus,
  to: TrainingLifecycleStatus
): boolean {
  const allowed = ALLOWED_TRANSITIONS.get(from);
  if (!allowed) return false;
  return allowed.has(to);
}

/**
 * Execute a state transition with validation.
 *
 * Returns the new state if valid, or throws if the transition
 * is not allowed.
 *
 * @param from — current state
 * @param to — desired state
 * @returns the new state (same as `to` on success)
 * @throws {TrainingLifecycleError} if the transition is invalid
 *
 * Example:
 *   const newState = transitionState("running", "paused");
 *   // newState === "paused"
 */
export function transitionState(
  from: TrainingLifecycleStatus,
  to: TrainingLifecycleStatus
): TrainingLifecycleStatus {
  if (!canTransition(from, to)) {
    throw new TrainingLifecycleError(
      `Invalid state transition: "${from}" → "${to}" is not allowed. ` +
      `Allowed transitions from "${from}": ${[...allowedFrom(from)].join(", ") || "none"}`
    );
  }
  return to;
}

/**
 * Get all allowed destination states from a given state.
 *
 * @param from — current state
 * @returns iterator of allowed destination states
 */
export function allowedFrom(
  from: TrainingLifecycleStatus
): Set<TrainingLifecycleStatus> {
  return ALLOWED_TRANSITIONS.get(from) ?? new Set();
}

/**
 * Check if a state is terminal (no further transitions without restore).
 */
export function isTerminal(state: TrainingLifecycleStatus): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Check if a state is active (training in progress or paused).
 */
export function isActive(state: TrainingLifecycleStatus): boolean {
  return ACTIVE_STATES.has(state);
}

/**
 * Check if a state is restartable (can go to restored → running).
 */
export function isRestartable(state: TrainingLifecycleStatus): boolean {
  return (
    state === "stopped" ||
    state === "completed" ||
    state === "failed"
  );
}

/**
 * Get the recommended next action for a given state.
 *
 * Used by the UI to determine which controls to show.
 */
export type LifecycleAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "save_checkpoint"
  | "restore"
  | "retry"
  | "new_run"
  | "discard";

export function getAvailableActions(
  state: TrainingLifecycleStatus
): LifecycleAction[] {
  switch (state) {
    case "created":
    case "queued":
      return ["start"];
    case "running":
      return ["pause", "stop", "save_checkpoint"];
    case "paused":
      return ["resume", "stop", "save_checkpoint"];
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

/**
 * Map a ResearchStatus to a TrainingLifecycleStatus.
 *
 * Drops "configured" (maps to "created") since it's not part
 * of the training lifecycle state machine.
 */
export function toLifecycleStatus(
  status: ResearchStatus
): TrainingLifecycleStatus {
  switch (status) {
    case "configured":
      return "created";
    case "created":
    case "queued":
    case "running":
    case "paused":
    case "stopped":
    case "completed":
    case "failed":
    case "restored":
      return status;
    default:
      return "created";
  }
}

// ============================================================
// Error Type
// ============================================================

/**
 * Error thrown when an invalid state transition is attempted.
 */
export class TrainingLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrainingLifecycleError";
  }
}

// ============================================================
// Recovery Helpers (Phase 66 — Page Refresh & Failure Recovery)
// ============================================================

/**
 * Result of scanning for recoverable sessions after a page refresh.
 */
export interface RecoveryScanResult {
  /** Whether any active (running/paused) sessions were found */
  hasInterruptedSession: boolean;
  /** The interrupted session ID, if any */
  interruptedSessionId: string | null;
  /** The interrupted session name */
  interruptedSessionName: string | null;
  /** The state the session was in before interruption */
  interruptedState: TrainingLifecycleStatus | null;
  /** The last known step before interruption */
  lastKnownStep: number;
  /** The latest checkpoint available */
  latestCheckpointId: string | null;
  /** Whether a checkpoint is available for recovery */
  canRecover: boolean;
  /** Human-readable recovery message */
  recoveryMessage: string | null;
}

/**
 * Scan active sessions to determine if any were interrupted.
 *
 * After a page refresh, any session in "running" state was
 * interrupted (the Worker is dead). This function identifies
 * such sessions and determines the recovery path.
 *
 * @param sessions — array of { id, name, status, metrics?, checkpoints? }
 * @returns RecoveryScanResult
 */
export function scanForInterruptedSessions(
  sessions: Array<{
    id: string;
    name: string;
    status: ResearchStatus;
    metrics?: { globalStep?: number; loss?: number } | null;
    checkpoints?: Array<{ id: string; step: number }>;
  }>
): RecoveryScanResult {
  // Find any session in "running" state (was active when page refreshed)
  const interrupted = sessions.find(
    (s) => s.status === "running" || s.status === "paused"
  );

  if (!interrupted) {
    return {
      hasInterruptedSession: false,
      interruptedSessionId: null,
      interruptedSessionName: null,
      interruptedState: null,
      lastKnownStep: 0,
      latestCheckpointId: null,
      canRecover: false,
      recoveryMessage: null,
    };
  }

  const lifecycleState = toLifecycleStatus(interrupted.status);
  const lastKnownStep = interrupted.metrics?.globalStep ?? 0;
  const checkpoints = interrupted.checkpoints ?? [];
  const latestCheckpoint =
    checkpoints.length > 0
      ? checkpoints.reduce((a, b) => (a.step > b.step ? a : b))
      : null;

  const canRecover = latestCheckpoint !== null;

  return {
    hasInterruptedSession: true,
    interruptedSessionId: interrupted.id,
    interruptedSessionName: interrupted.name,
    interruptedState: lifecycleState,
    lastKnownStep,
    latestCheckpointId: latestCheckpoint?.id ?? null,
    canRecover,
    recoveryMessage: canRecover
      ? `Training was interrupted at step ${lastKnownStep}. ` +
        `Latest checkpoint at step ${latestCheckpoint!.step} is available for recovery.`
      : `Training was interrupted at step ${lastKnownStep}. ` +
        `No checkpoint available — session must be discarded.`,
  };
}
