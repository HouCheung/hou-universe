// ============================================================
// MiniMind — research/TrainingRuntime.ts
// ============================================================
// Phase 58: Live Training Runtime Bridge.
// Phase 65: Replaced fake generateStepMetrics() with REAL
//           Web Worker training via TrainingWorker.
// Phase 66: Full lifecycle — pause, resume, checkpoint save/load,
//           page refresh recovery, failure recovery.
//
// Architecture:
//
//   ResearchWorkspace (UI)
//        │
//   TrainingRuntime
//        │
//   ┌────┼────────────────┐
//   │    │                │
//   │  ExperimentController
//   │    │                │
//   │  TrainingWorker    TrainingEventBus
//   │  (Web Worker)          │
//   │    │                LiveTrainingPanel
//   │  Real Trainer      ResearchObservatory
//   │  (forward/backward)
//   │
//
// Lifecycle (Phase 66):
//   created → queued → running → paused → running → completed
//                    ↓           ↓
//                  failed      stopped
//                    ↓           ↓
//                  restored ←────
//                    ↓
//                  running
//
// Checkpoint storage (Phase 85):
//   Full checkpoint blobs live in the CheckpointStore (IndexedDB, with an
//   in-memory Map fallback when IndexedDB is unavailable). The session
//   metadata in ResearchWorkspace keeps only a lightweight
//   `checkpointDataPersisted: true` marker — no inline blob in localStorage.
//
// Page refresh recovery:
//   On mount, scan for sessions in "running"/"paused" state
//   Mark them as interrupted, offer recovery from latest checkpoint
//
// Design:
//   - Web Worker executes REAL training (no Math.random metrics)
//   - Worker messages bridged to TrainingEventBus
//   - Cooperative cancellation via AbortController
//   - Checkpoint blobs stored in CheckpointStore (IndexedDB/memory)
//
// Usage:
//   import { TrainingRuntime } from "./TrainingRuntime";
//   const runtime = new TrainingRuntime();
//   await runtime.start("rs-xxx", config);
//   runtime.pause("rs-xxx");
//   await runtime.resume("rs-xxx");
//   runtime.stop("rs-xxx");
//   await runtime.restoreFromCheckpoint("rs-xxx", "ckpt-xxx");
// ============================================================

import { ExperimentController } from "./ExperimentController";
import { TrainingEventBus } from "./TrainingEventBus";
import type {
  ResearchSession,
  ResearchStatus,
  SessionConfig,
  TrainingMetricsSnapshot,
  ResearchCheckpoint,
} from "./ResearchState";
import { generateTimelineEventId } from "./ResearchState";
import type {
  TrainingWorkerCommand,
  TrainingWorkerEvent,
} from "./worker/TrainingWorkerProtocol";
import { resolveTrainingDataset } from "../data/datasetRegistry";
import { getProductionModelConfig } from "../experiments/ModelRegistry";
import {
  scanForInterruptedSessions,
  type RecoveryScanResult,
} from "./TrainingLifecycleState";
import { workspace } from "./ResearchWorkspace";
import { checkpointStore } from "./CheckpointStore";
import {
  createResearchRun,
  generateRunId,
  startResearchRun,
  completeResearchRun,
  failResearchRun,
  cancelResearchRun,
} from "./ResearchRun";
import {
  createExperiment,
  createRun,
  getRun,
  hasExperiment,
  getExperiment,
  updateExperiment,
} from "./ResearchExperimentStore";
import { markExperimentRunning, markExperimentCompleted } from "./ResearchExperiment";
import { createResearchExperiment } from "./ResearchExperiment";

// ============================================================
// Runtime Types
// ============================================================

/**
 * Runtime status for a training session managed by TrainingRuntime.
 */
export type TrainingRuntimeStatus =
  | "idle"
  | "created"
  | "queued"
  | "running"
  | "paused"
  | "stopped"
  | "completed"
  | "failed"
  | "restored";

/**
 * Detailed status result from getStatus().
 */
export interface TrainingRuntimeState {
  /** Session ID */
  sessionId: string;
  /** Current runtime status */
  status: TrainingRuntimeStatus;
  /** Whether training is actively executing */
  isRunning: boolean;
  /** Whether training is paused */
  isPaused: boolean;
  /** Current metrics snapshot (null if not yet started) */
  metrics: TrainingMetricsSnapshot | null;
  /** Error message if failed */
  error: string | null;
  /** Session name */
  name: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/**
 * Configuration passed to TrainingRuntime.start().
 */
export interface TrainingRuntimeConfig {
  /** Session configuration */
  sessionConfig: SessionConfig;
  /** Whether to auto-start training after creation */
  autoStart?: boolean;
}

/**
 * Internal state for a managed training session.
 */
interface ManagedSession {
  /** Reference to the controller */
  controller: ExperimentController;
  /** Session ID */
  sessionId: string;
  /** Abort controller for cooperative cancellation */
  abortController: AbortController | null;
  /** Whether paused */
  paused: boolean;
  /** Step counter since training started */
  stepCount: number;
  /** Total expected steps */
  totalSteps: number;
  /** Web Worker instance */
  worker: Worker | null;
  /** Configuration used to start this session (for resume) */
  config: SessionConfig | null;
}

// ============================================================
// Constants
// ============================================================

// ============================================================
// TrainingRuntime
// ============================================================

export class TrainingRuntime {
  private controller: ExperimentController;
  private eventBus: TrainingEventBus;
  private sessions: Map<string, ManagedSession>;

  constructor() {
    this.controller = new ExperimentController();
    this.eventBus = this.controller.getEventBus();
    this.sessions = new Map();
  }

  /**
   * Get the shared TrainingEventBus instance.
   */
  getEventBus(): TrainingEventBus {
    return this.eventBus;
  }

  /**
   * Get the ExperimentController instance.
   */
  getController(): ExperimentController {
    return this.controller;
  }

  // ============================================================
  // Lifecycle Operations
  // ============================================================

  /**
   * Create and start a training session.
   *
   * Transitions: CREATED → QUEUED → RUNNING
   *
   * Phase 66: If checkpointJSON is provided (resume scenario),
   * the worker will load the checkpoint and continue from the
   * saved position.
   *
   * @param sessionId — unique session identifier
   * @param config — session configuration
   * @param checkpointJSON — optional checkpoint data for resume
   * @returns Promise that resolves when training starts
   */
  async start(
    sessionId: string,
    config: SessionConfig,
    checkpointJSON?: string
  ): Promise<void> {
    // Guard: already managed and running
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.paused) {
      const status = this.controller.getStatus(sessionId);
      if (status.status === "running") {
        throw new Error(
          `TrainingRuntime: session "${sessionId}" is already running`
        );
      }
    }

    // Determine if this is a restore
    const isRestore = checkpointJSON !== undefined;

    // Step 1: Create or reuse experiment
    if (!this.controller.getStatus(sessionId).found) {
      this.controller.createExperiment(config, sessionId);
    }

    // Step 2: Transition to a startable state. Restore/resume must go through
    // "restored" BEFORE queueing — otherwise queueExperiment overwrites the
    // restorable state and restoreFromCheckpoint rejects it.
    if (isRestore) {
      this.controller.restoreFromCheckpoint(sessionId);
    } else {
      this.controller.queueExperiment(sessionId);
    }

    // Step 3: Start (handles restored/queued → running transition)
    this.controller.startExperiment(sessionId);

    // Step 3.5: Auto-create Experiment + Run identity (Phase 68)
    this.ensureExperimentAndRun(sessionId, config);

    // Step 4: Set up managed session
    const abortController = new AbortController();
    const managed: ManagedSession = {
      controller: this.controller,
      sessionId,
      abortController,
      paused: false,
      stepCount: 0,
      totalSteps: this.computeTotalSteps(config),
      worker: null,
      config,
    };

    this.sessions.set(sessionId, managed);

    // Step 5: Spawn Web Worker
    this.spawnWorker(sessionId, managed, config, abortController.signal, checkpointJSON);

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Pause a running training session.
   *
   * Transitions: RUNNING → PAUSED
   *
   * Sends pause command to worker. Worker saves checkpoint at
   * next log interval and posts "paused" event with checkpoint data.
   *
   * @param sessionId — session identifier
   */
  pause(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new Error(
        `TrainingRuntime: session "${sessionId}" not found in runtime`
      );
    }

    const status = this.controller.getStatus(sessionId);
    if (status.status !== "running") {
      throw new Error(
        `TrainingRuntime: cannot pause session in "${status.status}" status`
      );
    }

    managed.paused = true;

    // Send pause command to worker
    if (managed.worker) {
      const cmd: TrainingWorkerCommand = { type: "pause", sessionId };
      managed.worker.postMessage(cmd);
    }

    // Note: controller.pauseExperiment() will be called when the
    // worker responds with the "paused" event (which includes the
    // checkpoint data). The UI should show "pausing..." in the interim.
  }

  /**
   * Resume a paused training session.
   *
   * Transitions: PAUSED → RUNNING
   *
   * Sends the saved checkpoint data back to a new worker so
   * training continues from the exact pause point.
   *
   * @param sessionId — session identifier
   */
  async resume(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new Error(
        `TrainingRuntime: session "${sessionId}" not found in runtime`
      );
    }

    const status = this.controller.getStatus(sessionId);
    if (status.status !== "paused") {
      throw new Error(
        `TrainingRuntime: cannot resume session in "${status.status}" status`
      );
    }

    // Get the latest checkpoint data (Phase 85: read the full blob from the
    // CheckpointStore via the active checkpoint id, not inline metadata).
    const session = workspace.getSession(sessionId);
    const latestCheckpoint = session?.activeCheckpoint;
    const checkpointId = latestCheckpoint?.id;
    const checkpointJSON = checkpointId
      ? await checkpointStore.get(checkpointId)
      : undefined;

    if (!checkpointJSON) {
      throw new Error(
        `TrainingRuntime: no checkpoint data available for session "${sessionId}". ` +
        `Cannot resume without saved training state.`
      );
    }

    // Clean up old managed session (worker was terminated on pause)
    if (managed.abortController) {
      managed.abortController.abort();
    }
    if (managed.worker) {
      managed.worker.terminate();
      managed.worker = null;
    }
    this.sessions.delete(sessionId);

    // Phase 74: start() handles the paused → restored → running transition.
    // Do NOT call resumeExperiment first — start() with a checkpoint re-runs
    // restoreFromCheckpoint, which rejects a session already in "running".
    const config = managed.config ?? this.buildConfigFromSession(session);
    await this.start(sessionId, config, checkpointJSON);
  }

  /**
   * Stop a training session.
   *
   * Transitions: RUNNING/PAUSED → STOPPED
   *
   * Terminates the Web Worker and saves final checkpoint.
   *
   * @param sessionId — session identifier
   */
  stop(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      throw new Error(
        `TrainingRuntime: session "${sessionId}" not found in runtime`
      );
    }

    const status = this.controller.getStatus(sessionId);
    const stoppable: ResearchStatus[] = ["running", "paused", "restored"];
    if (!stoppable.includes(status.status)) {
      throw new Error(
        `TrainingRuntime: cannot stop session in "${status.status}" status`
      );
    }

    // Abort via controller
    if (managed.abortController) {
      managed.abortController.abort();
    }

    // Send stop command to worker
    if (managed.worker) {
      const cmd: TrainingWorkerCommand = { type: "stop", sessionId };
      managed.worker.postMessage(cmd);
    }

    // Note: worker cleanup happens in handleWorkerMessage when
    // "stopped" or error event is received
  }

  /**
   * Mark a training session as failed.
   *
   * Transitions: any → FAILED
   *
   * @param sessionId — session identifier
   * @param error — error message
   * @param lastStep — last known step before failure
   * @param checkpointJSON — optional checkpoint at failure point
   */
  fail(
    sessionId: string,
    error: string,
    lastStep?: number,
    checkpointJSON?: string
  ): void {
    const managed = this.sessions.get(sessionId);
    if (!managed) {
      this.sessions.set(sessionId, {
        controller: this.controller,
        sessionId,
        abortController: null,
        paused: false,
        stepCount: 0,
        totalSteps: 0,
        worker: null,
        config: null,
      });
    }

    // Clean up worker
    const mgr = this.sessions.get(sessionId)!;
    if (mgr.abortController) {
      mgr.abortController.abort();
    }
    if (mgr.worker) {
      mgr.worker.terminate();
      mgr.worker = null;
    }

    // Save failure checkpoint if available (fire-and-forget — the blob write
    // is best-effort; finalizeRun below does not depend on it).
    if (checkpointJSON && lastStep !== undefined) {
      void this.saveCheckpointData(sessionId, lastStep, checkpointJSON, true);
    }

    // Phase 75: finalize the ResearchRun on failure so a worker-creation
    // error (or worker.onerror) never leaves an orphan "running" Run.
    this.finalizeRun(sessionId, "failed", { errorMessage: error });

    this.controller.failExperiment(sessionId, error, lastStep);
    this.sessions.delete(sessionId);
  }

  /**
   * Restore training from a saved checkpoint.
   *
   * Transitions: STOPPED/COMPLETED/FAILED → RESTORED → RUNNING
   *
   * @param sessionId — session identifier
   * @param checkpointId — ID of the checkpoint to restore from
   */
  async restoreFromCheckpoint(
    sessionId: string,
    checkpointId: string
  ): Promise<void> {
    const session = workspace.getSession(sessionId);
    if (!session) {
      throw new Error(
        `TrainingRuntime: session "${sessionId}" not found`
      );
    }

    // Find the checkpoint
    const checkpoint = session.checkpoints.find((c) => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(
        `TrainingRuntime: checkpoint "${checkpointId}" not found in session "${sessionId}"`
      );
    }

    // Phase 85: read the full blob from the CheckpointStore via the
    // checkpoint id (the session metadata holds only a persisted marker).
    const checkpointJSON = await checkpointStore.get(checkpointId);
    if (!checkpointJSON) {
      throw new Error(
        `TrainingRuntime: checkpoint "${checkpointId}" has no training data. ` +
        `Cannot restore.`
      );
    }

    // Validate checkpoint can be parsed
    try {
      JSON.parse(checkpointJSON);
    } catch {
      throw new Error(
        `TrainingRuntime: checkpoint "${checkpointId}" data is corrupted.`
      );
    }

    // Clean up any existing managed session
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.abortController) existing.abortController.abort();
      if (existing.worker) {
        existing.worker.terminate();
        existing.worker = null;
      }
      this.sessions.delete(sessionId);
    }

    // Build config from session if needed
    const config = this.buildConfigFromSession(session);

    // Start with checkpoint (this handles restored → running transition)
    await this.start(sessionId, config, checkpointJSON);
  }

  /**
   * Start a new training run (discarding previous state).
   *
   * @param sessionId — existing session to restart
   * @param config — new session config
   */
  async newRun(sessionId: string, config: SessionConfig): Promise<void> {
    // Clean up old state
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.abortController) existing.abortController.abort();
      if (existing.worker) {
        existing.worker.terminate();
        existing.worker = null;
      }
      this.sessions.delete(sessionId);
    }

    // Reset session status
    workspace.updateSession(sessionId, {
      status: "configured",
      metrics: undefined,
      activeCheckpoint: undefined,
      checkpoints: [],
    });

    await this.start(sessionId, config);
  }

  /**
   * Save a checkpoint for a running session.
   *
   * Sends save-checkpoint command to worker. Worker responds
   * with checkpoint-saved event containing the full data.
   *
   * @param sessionId — session identifier
   */
  saveCheckpoint(sessionId: string): void {
    const managed = this.sessions.get(sessionId);
    if (!managed || !managed.worker) {
      throw new Error(
        `TrainingRuntime: cannot save checkpoint — session "${sessionId}" ` +
        `is not running in a worker`
      );
    }

    const cmd: TrainingWorkerCommand = {
      type: "save-checkpoint",
      sessionId,
    };
    managed.worker.postMessage(cmd);
  }

  /**
   * Get the current runtime status of a session.
   */
  getStatus(sessionId: string): TrainingRuntimeState {
    const managed = this.sessions.get(sessionId);
    const controllerStatus = this.controller.getStatus(sessionId);

    if (!controllerStatus.found) {
      return {
        sessionId,
        status: "idle",
        isRunning: false,
        isPaused: false,
        metrics: null,
        error: null,
        name: "",
        createdAt: 0,
        updatedAt: 0,
      };
    }

    const managedPaused = managed?.paused ?? false;

    return {
      sessionId,
      status: mapResearchStatusToRuntime(controllerStatus.status, managedPaused),
      isRunning: controllerStatus.status === "running" && !managedPaused,
      isPaused: controllerStatus.status === "paused" || managedPaused,
      metrics: controllerStatus.metrics,
      error: controllerStatus.errorMessage,
      name: controllerStatus.name ?? "",
      createdAt: 0,
      updatedAt: Date.now(),
    };
  }

  /**
   * Check if a session exists in the runtime.
   */
  has(sessionId: string): boolean {
    return this.controller.getStatus(sessionId).found;
  }

  /**
   * Get all managed session IDs.
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get the number of managed sessions.
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  // ============================================================
  // Recovery (Phase 66)
  // ============================================================

  /**
   * Scan for interrupted sessions after a page refresh.
   *
   * Any session in "running" or "paused" state was interrupted
   * because the Web Worker dies when the page refreshes.
   *
   * @returns RecoveryScanResult
   */
  scanForInterruptedSessions(): RecoveryScanResult {
    const sessions = workspace.listSessions();
    return scanForInterruptedSessions(
      sessions.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        metrics: s.metrics
          ? { globalStep: s.metrics.globalStep, loss: s.metrics.loss }
          : null,
        checkpoints: s.checkpoints.map((c) => ({ id: c.id, step: c.step })),
      }))
    );
  }

  /**
   * Mark interrupted sessions with the "interrupted" timeline event
   * and transition them to the appropriate recovery state.
   *
   * Call this on page load to ensure UI shows correct state.
   */
  recoverFromPageRefresh(): RecoveryScanResult {
    const scan = this.scanForInterruptedSessions();

    if (scan.hasInterruptedSession && scan.interruptedSessionId) {
      const sessionId = scan.interruptedSessionId;
      const session = workspace.getSession(sessionId);

      // Only "running" sessions were actively training when the worker died
      // on refresh. "paused" sessions are already in a stable, resumable
      // state; touching them here would append a duplicate "interrupted"
      // timeline event on every re-mount.
      if (session && session.status === "running") {
        // If we have a checkpoint, transition to "paused" so user can resume
        // Otherwise, transition to "failed" with interruption message
        if (scan.canRecover) {
          workspace.updateSession(sessionId, {
            status: "paused",
            timeline: [
              ...session.timeline,
              {
                id: generateTimelineEventId(),
                type: "interrupted",
                label: "Training interrupted (page refresh). Checkpoint available for recovery.",
                timestamp: Date.now(),
              },
            ],
          });
        } else {
          workspace.updateSession(sessionId, {
            status: "failed",
            errorMessage:
              "Training interrupted by page refresh. No checkpoint available.",
            timeline: [
              ...session.timeline,
              {
                id: generateTimelineEventId(),
                type: "interrupted",
                label: "Training interrupted (page refresh). No checkpoint available.",
                timestamp: Date.now(),
              },
            ],
          });
        }
      }
    }

    return scan;
  }

  /**
   * Discard an interrupted session.
   *
   * @param sessionId — session identifier
   */
  discardSession(sessionId: string): void {
    workspace.deleteSession(sessionId);
    this.sessions.delete(sessionId);
  }

  // ============================================================
  // Checkpoint Storage (Phase 66)
  // ============================================================

  /**
   * List all checkpoints for a session.
   *
   * @param sessionId — session identifier
   * @returns array of ResearchCheckpoint with computed fields
   */
  listCheckpoints(sessionId: string): ResearchCheckpoint[] {
    const session = workspace.getSession(sessionId);
    if (!session) return [];
    return [...session.checkpoints].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get a specific checkpoint by ID.
   *
   * @param sessionId — session identifier
   * @param checkpointId — checkpoint identifier
   * @returns ResearchCheckpoint or null
   */
  getCheckpoint(
    sessionId: string,
    checkpointId: string
  ): ResearchCheckpoint | null {
    const session = workspace.getSession(sessionId);
    if (!session) return null;
    return session.checkpoints.find((c) => c.id === checkpointId) ?? null;
  }

  /**
   * Delete a checkpoint.
   *
   * @param sessionId — session identifier
   * @param checkpointId — checkpoint identifier
   * @returns true if deleted
   */
  deleteCheckpoint(sessionId: string, checkpointId: string): boolean {
    const session = workspace.getSession(sessionId);
    if (!session) return false;

    const idx = session.checkpoints.findIndex((c) => c.id === checkpointId);
    if (idx === -1) return false;

    const updatedCheckpoints = [...session.checkpoints];
    updatedCheckpoints.splice(idx, 1);

    // If deleting the active checkpoint, clear it
    const updates: Partial<ResearchSession> = {
      checkpoints: updatedCheckpoints,
    };
    if (session.activeCheckpoint?.id === checkpointId) {
      updates.activeCheckpoint = undefined;
    }

    workspace.updateSession(sessionId, updates);

    // Phase 85: also drop the full blob from the CheckpointStore (best-effort).
    void checkpointStore.delete(checkpointId);

    return true;
  }

  /**
   * Save checkpoint data to the session.
   *
   * Called when the worker posts a checkpoint-saved or paused event.
   *
   * Phase 85: the full blob is written to the CheckpointStore (IndexedDB /
   * memory), and the session metadata carries only a lightweight
   * `checkpointDataPersisted: true` marker (no inline blob in localStorage).
   */
  private async saveCheckpointData(
    sessionId: string,
    step: number,
    checkpointJSON: string,
    isFailure: boolean = false
  ): Promise<void> {
    const session = workspace.getSession(sessionId);
    if (!session) return;

    // Compute checkpoint size
    const sizeBytes = new Blob([checkpointJSON]).size;

    // Parse for metadata
    let loss = session.metrics?.loss ?? Infinity;
    let perplexity = session.metrics?.perplexity;
    try {
      const parsed = JSON.parse(checkpointJSON);
      if (parsed.trainerState?.lossHistory?.length > 0) {
        const history = parsed.trainerState.lossHistory as number[];
        loss = history[history.length - 1];
        perplexity = Math.exp(Math.min(loss, 709));
      }
    } catch {
      // Use session metrics as fallback
    }

    const checkpointId = `ckpt-${Date.now().toString(36)}-${step}`;

    const checkpoint: ResearchCheckpoint = {
      id: checkpointId,
      step,
      loss: Math.round(loss * 10000) / 10000,
      perplexity: perplexity !== undefined
        ? Math.round(perplexity * 100) / 100
        : undefined,
      epoch: session.metrics?.epoch ?? 0,
      timestamp: Date.now(),
      sizeBytes,
      seed: session.seed,
      durationMs: session.durationMs ?? undefined,
      checkpointDataPersisted: true,
    };

    // Phase 85: persist the full blob before marking the metadata persisted,
    // so resume/restore/generate can always load it by id.
    await checkpointStore.put(checkpointId, checkpointJSON);

    workspace.updateSession(sessionId, {
      activeCheckpoint: checkpoint,
      checkpoints: [...session.checkpoints, checkpoint],
      timeline: [
        ...session.timeline,
        {
          id: generateTimelineEventId(),
          type: "checkpoint",
          label: isFailure
            ? `Failure checkpoint at step ${step}`
            : `Checkpoint saved at step ${step}`,
          timestamp: Date.now(),
          data: { step, loss, checkpointId: checkpoint.id },
        },
      ],
    });

    this.eventBus.emit("training:checkpoint", {
      sessionId,
      checkpoint,
      timestamp: Date.now(),
    });
  }

  // ============================================================
  // Web Worker Management
  // ============================================================

  /**
   * Spawn a Web Worker for real training execution.
   */
  private spawnWorker(
    sessionId: string,
    managed: ManagedSession,
    config: SessionConfig,
    signal: AbortSignal,
    checkpointJSON?: string
  ): void {
    try {
      const worker = new Worker(
        new URL("./worker/TrainingWorker.ts", import.meta.url)
      );
      managed.worker = worker;

      worker.onmessage = (e: MessageEvent<TrainingWorkerEvent>) => {
        void this.handleWorkerMessage(sessionId, managed, e.data);
      };

      worker.onerror = (err: ErrorEvent) => {
        const errorMsg = err.message || "Unknown worker error";
        console.error(`TrainingRuntime: worker error for "${sessionId}":`, err);
        this.fail(sessionId, errorMsg);
      };

      signal.addEventListener("abort", () => {
        if (managed.worker) {
          const cmd: TrainingWorkerCommand = {
            type: "stop",
            sessionId,
          };
          managed.worker.postMessage(cmd);
        }
      });

      const trainingConfig = config.trainingConfig ?? {};
      const datasetConfig = trainingConfig.dataset ?? {};

      // ── Dataset resolution (Phase 80) ──
      // The selected dataset now ACTUALLY drives the training corpus. The
      // default is the bilingual foundation corpus; unavailable datasets
      // (network/fs-backed) fail honestly instead of silently swapping in
      // a fixture.
      const resolved = resolveTrainingDataset(config.dataset);
      if (!resolved.available || resolved.corpus.length === 0) {
        const reason = resolved.warning ?? "the selected dataset has no usable corpus";
        this.fail(
          sessionId,
          `Dataset "${config.dataset ?? "bilingual"}" is not available: ${reason}`
        );
        return;
      }

      // ── Model config (Phase 80) ──
      // Single source of truth: the production config drives BOTH training
      // and generation. `vocabSize` is the tokenizer TARGET — the actual
      // model vocab is tokenizer-derived inside the worker.
      const productionConfig = getProductionModelConfig();

      const startCmd = {
        type: "start" as const,
        sessionId,
        corpus: resolved.corpus,
        datasetId: resolved.id,
        datasetVersion: resolved.version,
        datasetSchemaVersion: resolved.schemaVersion,
        datasetPurpose: resolved.purpose,
        modelConfig: {
          vocabSize: productionConfig.vocabSize,
          dModel: productionConfig.dModel,
          numHeads: productionConfig.numHeads,
          dFF: productionConfig.dFF,
          numLayers: productionConfig.numLayers,
          maxSeqLen: productionConfig.maxSeqLen,
        },
        trainingConfig: {
          epochs: config.epochs ?? trainingConfig.epochs ?? 5,
          batchSize: config.batchSize ?? datasetConfig.batchSize ?? 4,
          blockSize: config.blockSize ?? datasetConfig.blockSize ?? 16,
          learningRate: trainingConfig.optimizer?.lr ?? 0.001,
          weightDecay: trainingConfig.optimizer?.weightDecay ?? 0.01,
          logInterval: 5,
          gradientClipNorm: trainingConfig.gradientClipNorm ?? 1.0,
          warmupSteps: trainingConfig.warmupSteps ?? 0,
          shuffle: true,
        },
        seed: config.seed ?? trainingConfig.seed ?? 42,
        checkpointJSON,
      };

      worker.postMessage(startCmd);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `TrainingRuntime: failed to create worker for "${sessionId}":`,
        err
      );
      this.fail(sessionId, `Worker creation failed: ${errorMsg}`);
    }
  }

  /**
   * Handle a message from the Web Worker.
   */
  private async handleWorkerMessage(
    sessionId: string,
    managed: ManagedSession,
    event: TrainingWorkerEvent
  ): Promise<void> {
    switch (event.type) {
      case "started": {
        break;
      }

      case "step": {
        managed.stepCount = event.step;

        const epochs =
          managed.config?.epochs ?? managed.config?.trainingConfig?.epochs ?? 5;

        const metrics: TrainingMetricsSnapshot = {
          loss: event.loss,
          perplexity: event.perplexity,
          learningRate: event.learningRate,
          tokensPerSecond: event.tokensPerSecond,
          gradientNorm: event.gradientNorm,
          epoch: Math.floor(
            (event.step / Math.max(1, event.totalSteps)) * epochs
          ),
          globalStep: event.step,
          totalSteps: event.totalSteps,
          timestamp: Date.now(),
        };

        this.controller.reportStep(sessionId, metrics);
        break;
      }

      case "paused": {
        // Worker saved checkpoint and yielded
        managed.paused = true;
        managed.stepCount = event.step;

        // Save checkpoint data to session
        await this.saveCheckpointData(sessionId, event.step, event.checkpointJSON);

        // Delegate pause to controller
        this.controller.pauseExperiment(sessionId);

        // Clean up worker
        if (managed.worker) {
          managed.worker.terminate();
          managed.worker = null;
        }
        break;
      }

      case "resumed": {
        managed.paused = false;
        managed.stepCount = event.step;
        break;
      }

      case "checkpoint-saved": {
        await this.saveCheckpointData(sessionId, event.step, event.checkpointJSON);
        managed.stepCount = event.step;
        break;
      }

      case "checkpoint-loaded": {
        managed.stepCount = event.step;
        break;
      }

      case "stopped": {
        // Worker stopped gracefully with final checkpoint
        managed.stepCount = event.step;

        // Save final checkpoint if provided
        if (event.checkpointJSON) {
          await this.saveCheckpointData(sessionId, event.step, event.checkpointJSON);
        }

        // Transition to stopped
        const stopEpochs =
          managed.config?.epochs ?? managed.config?.trainingConfig?.epochs ?? 5;
        this.controller.stopExperiment(sessionId, {
          loss: event.loss,
          perplexity: Math.exp(Math.min(event.loss, 709)),
          learningRate: 0,
          tokensPerSecond: 0,
          gradientNorm: undefined,
          epoch: Math.floor(
            (event.step / Math.max(1, managed.totalSteps)) * stopEpochs
          ),
          globalStep: event.step,
          totalSteps: managed.totalSteps,
          timestamp: Date.now(),
        });

        // Phase 68: Mark ResearchRun as cancelled (user-initiated stop)
        this.finalizeRun(sessionId, "cancelled");

        // Clean up
        if (managed.worker) {
          managed.worker.terminate();
          managed.worker = null;
        }
        this.sessions.delete(sessionId);
        break;
      }

      case "completed": {
        managed.stepCount = event.totalSteps;
        if (managed.worker) {
          managed.worker.terminate();
          managed.worker = null;
        }

        // Phase 75: persist the final checkpoint so the completed run's
        // checkpointId resolves to real training state.
        if (event.checkpointJSON) {
          await this.saveCheckpointData(
            sessionId,
            event.totalSteps,
            event.checkpointJSON
          );
        }

        const completedEpochs =
          managed.config?.epochs ?? managed.config?.trainingConfig?.epochs ?? 5;
        this.controller.completeExperiment(sessionId, {
          loss: event.finalLoss,
          perplexity: event.perplexity,
          learningRate: 0,
          tokensPerSecond: 0,
          gradientNorm: undefined,
          epoch: completedEpochs,
          globalStep: event.totalSteps,
          totalSteps: event.totalSteps,
          timestamp: Date.now(),
        });

        // Phase 68: Populate ResearchRun with training results
        this.finalizeRun(sessionId, "completed", {
          finalLoss: event.finalLoss,
          perplexity: event.perplexity,
          totalSteps: event.totalSteps,
        });

        this.sessions.delete(sessionId);
        break;
      }

      case "error": {
        if (managed.worker) {
          managed.worker.terminate();
          managed.worker = null;
        }

        // Phase 68: Mark ResearchRun as failed
        this.finalizeRun(sessionId, "failed", { errorMessage: event.error });

        this.fail(
          sessionId,
          event.error,
          event.lastStep,
          event.checkpointJSON
        );
        break;
      }
    }
  }

  /**
   * Auto-create a ResearchExperiment and ResearchRun for this session
   * if they don't already exist (Phase 68).
   *
   * Links the session to its experiment and run via workspace.updateSession().
   * Called from start() after the controller transitions the session to running.
   *
   * @param sessionId — the session being started
   * @param config — the session configuration
   * @param isRestore — whether this is a restore from checkpoint
   */
  private ensureExperimentAndRun(
    sessionId: string,
    config: SessionConfig
  ): void {
    const session = workspace.getSession(sessionId);
    if (!session) return;

    let experimentId = session.experimentId ?? config.experimentId;

    // 1. Create or resolve the ResearchExperiment
    if (!experimentId || !hasExperiment(experimentId)) {
      const exp = createResearchExperiment({
        name: config.name,
        seed: config.seed,
        modelConfig: config.modelConfig,
        trainingConfig: config.trainingConfig,
        datasetConfig: {
          name: config.dataset,
          blockSize: config.blockSize ?? config.trainingConfig?.dataset?.blockSize ?? 16,
          batchSize: config.batchSize ?? config.trainingConfig?.dataset?.batchSize ?? 4,
          shuffle: true,
        },
        tags: config.tags,
        description: config.notes ?? "",
      });
      createExperiment(exp);
      experimentId = exp.id;
    }

    // 2. Reuse the in-flight ResearchRun if one exists, otherwise create a new one.
    //    Resume/restore must continue the SAME run — minting a fresh run here
    //    strands the previous run in "running" forever.
    let runId = session.runId;
    const existingRun = runId ? getRun(runId) : undefined;
    if (!existingRun || existingRun.status !== "running") {
      runId = generateRunId();
      const pendingRun = createResearchRun(experimentId, config.seed, runId);
      const run = startResearchRun(pendingRun);
      createRun(run);
    }

    // 3. Mark experiment as running (status transition: draft/ready → running)
    const existingExp = getExperiment(experimentId);
    if (existingExp && existingExp.status !== "running") {
      updateExperiment(experimentId, markExperimentRunning(existingExp));
    }

    // 4. Link session → experiment + run via workspace
    workspace.updateSession(sessionId, {
      experimentId,
      runId,
    });
  }

  /**
   * Finalize a ResearchRun with the outcome of training (Phase 68).
   *
   * Called from handleWorkerMessage when training completes, is stopped,
   * or fails. Fetches the run from the store, applies the appropriate
   * lifecycle transition, and persists the result.
   *
   * @param sessionId — the session that finished
   * @param outcome — "completed", "cancelled", or "failed"
   * @param results — training results (for "completed" outcome)
   */
  private finalizeRun(
    sessionId: string,
    outcome: "completed" | "cancelled" | "failed",
    results?: {
      finalLoss?: number;
      perplexity?: number;
      totalSteps?: number;
      errorMessage?: string;
    }
  ): void {
    const session = workspace.getSession(sessionId);
    if (!session?.runId) return;

    const existingRun = getRun(session.runId);
    if (!existingRun) return;

    // Only finalize if the run is still running
    if (existingRun.status !== "running") return;

    let finalizedRun = existingRun;

    switch (outcome) {
      case "completed": {
        const durationMs = Date.now() - existingRun.startedAt;
        const blockSize = session.blockSize ?? session.trainingConfig?.dataset?.blockSize ?? 16;
        const batchSize = session.batchSize ?? session.trainingConfig?.dataset?.batchSize ?? 4;
        const totalTokens = (results?.totalSteps ?? existingRun.totalSteps) * blockSize * batchSize;
        const totalEpochs = session.epochs ?? session.trainingConfig?.epochs ?? 5;
        finalizedRun = completeResearchRun(existingRun, {
          initialLoss: existingRun.initialLoss !== Infinity ? existingRun.initialLoss : (results?.finalLoss ?? 10),
          finalLoss: results?.finalLoss ?? existingRun.finalLoss,
          bestLoss: Math.min(
            existingRun.bestLoss !== Infinity ? existingRun.bestLoss : Infinity,
            results?.finalLoss ?? Infinity
          ),
          perplexity: results?.perplexity ?? existingRun.perplexity,
          tokensPerSecond: durationMs > 0 ? totalTokens / (durationMs / 1000) : existingRun.tokensPerSecond,
          totalTokens,
          totalSteps: results?.totalSteps ?? existingRun.totalSteps,
          totalEpochs,
          durationMs,
          checkpointId: session.activeCheckpoint?.id ?? existingRun.checkpointId,
        });
        break;
      }
      case "cancelled": {
        finalizedRun = cancelResearchRun(existingRun);
        break;
      }
      case "failed": {
        finalizedRun = failResearchRun(
          existingRun,
          results?.errorMessage ?? "Unknown error"
        );
        break;
      }
    }

    // Persist the finalized run
    createRun(finalizedRun);

    // Update experiment status
    const experimentId = session.experimentId ?? existingRun.experimentId;
    if (experimentId) {
      const exp = getExperiment(experimentId);
      if (exp) {
        if (outcome === "completed") {
          updateExperiment(experimentId, markExperimentCompleted(exp));
        } else if (outcome === "failed") {
          // Keep experiment as "running" if there are other active runs,
          // but for now just mark it — the experiment can have multiple runs
          // and we don't track per-experiment run state yet
        }
      }
    }
  }

  /**
   * Compute estimated total steps from session config.
   */
  private computeTotalSteps(config: SessionConfig): number {
    const epochs = config.epochs ?? config.trainingConfig?.epochs ?? 5;
    const batchSize = config.batchSize ?? config.trainingConfig?.dataset?.batchSize ?? 4;
    const blockSize = config.blockSize ?? config.trainingConfig?.dataset?.blockSize ?? 16;
    const resolved = resolveTrainingDataset(config.dataset);
    const corpusChars = resolved.corpus.join(" ").length;
    const batchesPerEpoch = Math.max(
      1,
      Math.floor(corpusChars / (blockSize * batchSize))
    );
    return epochs * batchesPerEpoch;
  }

  /**
   * Build a SessionConfig from a ResearchSession.
   * Used for restore scenarios where the original config is lost.
   */
  private buildConfigFromSession(
    session: ResearchSession | undefined
  ): SessionConfig {
    if (session) {
      return {
        name: session.name,
        modelConfig: session.modelConfig,
        trainingConfig: session.trainingConfig,
        dataset: session.dataset,
        seed: session.seed,
        blockSize: session.blockSize,
        batchSize: session.batchSize,
        epochs: session.epochs,
      };
    }
    return {
      name: "Restored Session",
      modelConfig: {
        name: "tiny",
        label: "Tiny",
        description: "Tiny model (default restore)",
        vocabSize: 260,
        dModel: 64,
        numHeads: 2,
        dFF: 128,
        numLayers: 1,
        maxSeqLen: 64,
        eps: 1e-6,
        estimatedParams: 50000,
      },
      trainingConfig: {
        name: "default",
        label: "Default",
        description: "Default training recipe (restore)",
        version: 1 as const,
        model: "tiny",
        dataset: { dataset: "synthetic", blockSize: 16, batchSize: 4 },
        optimizer: { type: "adamw", lr: 0.001 },
        scheduler: { type: "none" },
        epochs: 5,
        gradientAccumulation: 1,
        warmupSteps: 0,
        seed: 42,
      },
      dataset: "tiny",
      seed: 42,
    };
  }
}

// ============================================================
// Helpers
// ============================================================

function mapResearchStatusToRuntime(
  status: ResearchStatus,
  managedPaused: boolean
): TrainingRuntimeStatus {
  if (status === "running" && managedPaused) return "paused";
  switch (status) {
    case "created":
    case "configured":
      return "created";
    case "queued":
      return "queued";
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

// ============================================================
// Singleton convenience
// ============================================================

export const trainingRuntime = new TrainingRuntime();
