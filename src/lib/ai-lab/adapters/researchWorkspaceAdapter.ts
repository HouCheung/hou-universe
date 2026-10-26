// ============================================================
// AI Lab — adapters/researchWorkspaceAdapter.ts
// ============================================================
// Phase 57: Bridges the MiniMind research workspace to the
// Research Studio UI. Provides pure functions for session
// listing, status, and timeline display.
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
//   - ResearchWorkspace (localStorage via singleton)
//
// Usage:
//   import { getWorkspaceSessions, getActiveSession } from
//     "@/lib/ai-lab/adapters/researchWorkspaceAdapter";
//   const sessions = getWorkspaceSessions();
// ============================================================

import {
  workspace,
  getStatusLabel,
  type ResearchSession,
  type ResearchStatus,
  type ResearchTimelineEvent,
  type TrainingMetricsSnapshot,
} from "@/lib/minimind/research";

// ============================================================
// UI-facing types
// ============================================================

/**
 * Lightweight session summary for the research workspace UI.
 */
export interface SessionSummary {
  /** Session ID */
  id: string;
  /** Session name */
  name: string;
  /** Current status */
  status: ResearchStatus;
  /** Human-readable status label */
  statusLabel: string;
  /** Selected model label */
  modelLabel: string;
  /** Selected recipe label */
  recipeLabel: string;
  /** Dataset identifier */
  dataset: string;
  /** Current loss (undefined if not started) */
  currentLoss: number | undefined;
  /** Current perplexity (undefined if not started) */
  currentPerplexity: number | undefined;
  /** Best loss achieved */
  bestLoss: number | undefined;
  /** Final loss (undefined if not completed) */
  finalLoss: number | undefined;
  /** Training progress percentage (0-100) */
  progressPercent: number;
  /** Unix timestamp (ms) when created */
  createdAt: number;
  /** Unix timestamp (ms) when last updated */
  updatedAt: number;
  /** Whether this is the currently active session */
  isActive: boolean;
  /** FK to ResearchExperiment.id — for provenance */
  experimentId: string | undefined;
  /** FK to ResearchRun.runId — for provenance */
  runId: string | undefined;
}

/**
 * Training status with live metrics.
 */
export interface TrainingStatusData {
  /** Whether training is currently active */
  isTraining: boolean;
  /** Session ID of active training (undefined if none) */
  sessionId: string | undefined;
  /** Session name of active training (undefined if none) */
  sessionName: string | undefined;
  /** Current live metrics (null if not training) */
  metrics: TrainingMetricsSnapshot | null;
  /** Current status */
  status: ResearchStatus | null;
}

/**
 * A single timeline entry for the UI.
 */
export interface TimelineEntry {
  /** Event type */
  type: ResearchTimelineEvent["type"];
  /** Human-readable label */
  label: string;
  /** Formatted timestamp */
  time: string;
  /** ISO timestamp string */
  isoTime: string;
  /** Unix timestamp (ms) */
  timestamp: number;
}

/**
 * Timeline data for a session.
 */
export interface SessionTimeline {
  /** Session ID */
  sessionId: string;
  /** Session name */
  sessionName: string;
  /** Ordered timeline entries */
  events: TimelineEntry[];
  /** Current status */
  status: ResearchStatus;
  /** Total number of events */
  eventCount: number;
}

// ============================================================
// Public API — Session Listing
// ============================================================

/**
 * Get all research workspace sessions as UI-ready summaries.
 *
 * The most recently updated session is marked as active.
 *
 * @returns Array of SessionSummary, sorted by updatedAt desc
 *
 * Example:
 *   const sessions = getWorkspaceSessions();
 *   sessions.forEach(s => console.log(s.name, s.statusLabel));
 */
export function getWorkspaceSessions(): SessionSummary[] {
  const sessions = workspace.listSessions();
  const activeSession = workspace.getActiveSession();

  return sessions.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    statusLabel: getStatusLabel(s.status),
    modelLabel: s.modelConfig.label,
    recipeLabel: s.trainingConfig.label,
    dataset: s.dataset,
    currentLoss: s.metrics?.loss,
    currentPerplexity: s.metrics?.perplexity,
    bestLoss: s.bestLoss,
    finalLoss: s.finalLoss,
    progressPercent: computeProgress(s),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    isActive: activeSession?.id === s.id,
    experimentId: s.experimentId,
    runId: s.runId,
  }));
}

/**
 * Get the currently active session summary.
 *
 * @returns SessionSummary or null if no active session exists
 */
export function getActiveSession(): SessionSummary | null {
  const session = workspace.getActiveSession();
  if (!session) return null;

  const summaries = getWorkspaceSessions();
  return summaries.find((s) => s.id === session.id) ?? null;
}

/**
 * Get a detailed session summary by ID.
 *
 * @param id — session identifier
 * @returns SessionSummary or null if not found
 */
export function getSessionSummary(id: string): SessionSummary | null {
  const session = workspace.getSession(id);
  if (!session) return null;

  const activeSession = workspace.getActiveSession();
  return {
    id: session.id,
    name: session.name,
    status: session.status,
    statusLabel: getStatusLabel(session.status),
    modelLabel: session.modelConfig.label,
    recipeLabel: session.trainingConfig.label,
    dataset: session.dataset,
    currentLoss: session.metrics?.loss,
    currentPerplexity: session.metrics?.perplexity,
    bestLoss: session.bestLoss,
    finalLoss: session.finalLoss,
    progressPercent: computeProgress(session),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    isActive: activeSession?.id === session.id,
    experimentId: session.experimentId,
    runId: session.runId,
  };
}

// ============================================================
// Public API — Training Status
// ============================================================

/**
 * Get the current training status for the active session.
 *
 * If no session is active, returns isTraining: false.
 *
 * @returns TrainingStatusData with live metrics if training
 *
 * Example:
 *   const status = getTrainingStatus();
 *   if (status.isTraining) {
 *     console.log(`Loss: ${status.metrics?.loss}`);
 *   }
 */
export function getTrainingStatus(): TrainingStatusData {
  const session = workspace.getActiveSession();

  if (!session || (session.status !== "running" && session.status !== "paused")) {
    return {
      isTraining: false,
      sessionId: undefined,
      sessionName: undefined,
      metrics: null,
      status: null,
    };
  }

  return {
    isTraining: true,
    sessionId: session.id,
    sessionName: session.name,
    metrics: session.metrics ?? null,
    status: session.status,
  };
}

// ============================================================
// Public API — Timeline
// ============================================================

/**
 * Get the experiment timeline for a session.
 *
 * Returns all timeline events sorted by timestamp ascending
 * (oldest first — chronologically ordered).
 *
 * @param id — session identifier
 * @returns SessionTimeline or null if session not found
 *
 * Example:
 *   const timeline = getExperimentTimeline("rs-xxx");
 *   if (timeline) {
 *     timeline.events.forEach(e => console.log(e.label));
 *   }
 */
export function getExperimentTimeline(id: string): SessionTimeline | null {
  const session = workspace.getSession(id);
  if (!session) return null;

  const events: TimelineEntry[] = session.timeline
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => ({
      type: e.type,
      label: e.label,
      time: formatTimestamp(e.timestamp),
      isoTime: new Date(e.timestamp).toISOString(),
      timestamp: e.timestamp,
    }));

  return {
    sessionId: session.id,
    sessionName: session.name,
    events,
    status: session.status,
    eventCount: events.length,
  };
}

// ============================================================
// Public API — Workspace Stats
// ============================================================

/**
 * Aggregate statistics for the research workspace.
 */
export interface WorkspaceStats {
  /** Total number of sessions */
  totalSessions: number;
  /** Number of running sessions */
  running: number;
  /** Number of paused sessions */
  paused: number;
  /** Number of completed sessions */
  completed: number;
  /** Number of failed sessions */
  failed: number;
  /** Number of configured sessions (not yet started) */
  configured: number;
  /** Best (lowest) loss across all completed sessions */
  bestLossOverall: number | null;
  /** Best perplexity across all completed sessions */
  bestPerplexityOverall: number | null;
}

/**
 * Get aggregate statistics for the research workspace.
 *
 * @returns WorkspaceStats
 */
export function getWorkspaceStats(): WorkspaceStats {
  const sessions = workspace.listSessions();

  const running = sessions.filter((s) => s.status === "running").length;
  const paused = sessions.filter((s) => s.status === "paused").length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const failed = sessions.filter((s) => s.status === "failed").length;
  const configured = sessions.filter(
    (s) => s.status === "configured" || s.status === "queued"
  ).length;

  const completedSessions = sessions.filter((s) => s.status === "completed");
  const bestLossOverall =
    completedSessions.length > 0
      ? Math.min(...completedSessions.map((s) => s.bestLoss ?? Infinity))
      : null;

  const bestPerplexityOverall =
    completedSessions.length > 0
      ? Math.min(
          ...completedSessions.map(
            (s) => s.finalPerplexity ?? Infinity
          )
        )
      : null;

  return {
    totalSessions: sessions.length,
    running,
    paused,
    completed,
    failed,
    configured,
    bestLossOverall:
      bestLossOverall !== null && Number.isFinite(bestLossOverall)
        ? bestLossOverall
        : null,
    bestPerplexityOverall:
      bestPerplexityOverall !== null &&
      Number.isFinite(bestPerplexityOverall)
        ? bestPerplexityOverall
        : null,
  };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Compute a rough progress percentage for a session.
 *
 * Based on current step vs estimated total steps (from recipe config).
 * Returns 0 for sessions that haven't started training.
 *
 * @param session — the research session
 * @returns 0-100 progress percentage
 */
function computeProgress(session: ResearchSession): number {
  if (session.status === "completed") return 100;
  if (session.status === "failed") return 100; // done, just failed
  if (session.status === "created") return 0;

  const currentStep = session.metrics?.globalStep ?? 0;
  const totalSteps = session.metrics?.totalSteps ?? 0;

  if (totalSteps === 0) return 0;

  const pct = Math.round((currentStep / totalSteps) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * Format a timestamp as a relative time string.
 *
 * @param timestamp — unix timestamp in milliseconds
 * @returns human-readable relative time (e.g. "2 min ago")
 */
function formatTimestamp(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) return "just now";
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}
