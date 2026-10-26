// ============================================================
// MiniMind — research/ExperimentController.ts
// ============================================================
// Phase 57: Experiment pipeline controller.
//
// Connects the research workspace to the training infrastructure:
//
//   ExperimentController
//          |
//   ┌──────┼──────────┐
//   │      │          │
//   │  TrainingCampaign│
//   │      │          │
//   │  TrainingObservatory
//   │
//   ResearchWorkspace
//
// States:
//   created → queued → running → {completed | failed}
//                        ↑ ↓
//                      paused
//
// No fake training — wraps existing TrainingCampaign / Trainer.
//
// Usage:
//   import { ExperimentController } from "./ExperimentController";
//   const ctrl = new ExperimentController();
//   const id = ctrl.createExperiment({ ... });
//   ctrl.startExperiment(id);
//   const status = ctrl.getStatus(id);
// ============================================================

import type {
  ResearchSession,
  ResearchStatus,
  SessionConfig,
  TrainingMetricsSnapshot,
  ResearchCheckpoint,
  ResearchTimelineEvent,
} from "./ResearchState";
import {
  generateTimelineEventId,
} from "./ResearchState";
import { workspace } from "./ResearchWorkspace";
import { TrainingEventBus } from "./TrainingEventBus";

// ============================================================
// Experiment Controller State
// ============================================================

/**
 * Runtime state for an experiment managed by the controller.
 *
 * Each state entry tracks the training lifecycle and provides
 * hooks for pause/resume/stop operations.
 */
interface ExperimentRuntimeState {
  /** Associated research session */
  session: ResearchSession;
  /** Whether the experiment is currently paused */
  isPaused: boolean;
  /** Abort controller for stopping training */
  abortController: AbortController | undefined;
}

// ============================================================
// ExperimentController
// ============================================================

export class ExperimentController {
  private workspace = workspace; // Use shared singleton
  private eventBus: TrainingEventBus;
  private runtimeStates: Map<string, ExperimentRuntimeState>;

  constructor() {
    this.eventBus = new TrainingEventBus();
    this.runtimeStates = new Map();
  }

  /**
   * Get the shared TrainingEventBus instance.
   *
   * UI components subscribe to this bus for real-time
   * training updates.
   */
  getEventBus(): TrainingEventBus {
    return this.eventBus;
  }

  // ============================================================
  // Experiment CRUD
  // ============================================================

  /**
   * Create a new experiment (session) in "configured" state.
   *
   * @param config — experiment configuration
   * @param sessionId — optional session ID (generated if not provided)
   * @returns the session ID
   */
  createExperiment(config: SessionConfig, sessionId?: string): string {
    const session = this.workspace.createSession(config, sessionId);
    this.runtimeStates.set(session.id, {
      session,
      isPaused: false,
      abortController: undefined,
    });
    return session.id;
  }

  // ============================================================
  // Lifecycle Operations
  // ============================================================

  /**
   * Start an experiment: transitions from "configured"/"queued"
   * to "running".
   *
   * Emits a "training:start" event on the event bus.
   *
   * @param id — experiment/session ID
   * @throws if the experiment is not found or cannot be started
   */
  startExperiment(id: string): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    const startable: ResearchStatus[] = [
      "created", "configured", "queued", "paused", "restored",
    ];
    if (!startable.includes(session.status)) {
      throw new Error(
        `ExperimentController: cannot start experiment in "${session.status}" status. ` +
        `Must be one of: ${startable.join(", ")}`
      );
    }

    // If this is a resume or restore (continuing from a checkpoint)
    const isResume = session.status === "paused" || session.status === "restored";

    const abortController = new AbortController();

    // Update state
    this.workspace.updateSession(id, {
      status: "running",
      timeline: [
        ...session.timeline,
        createTimelineEvent(
          isResume ? "restored" : "running",
          isResume ? "Training resumed" : "Training started"
        ),
      ],
    });

    // Update runtime state
    this.runtimeStates.set(id, {
      session: this.workspace.getSession(id)!,
      isPaused: false,
      abortController,
    });

    // Emit start event
    this.eventBus.emit("training:start", {
      sessionId: id,
      experimentName: session.name,
      modelConfig: session.modelConfig,
      trainingConfig: session.trainingConfig,
      timestamp: Date.now(),
      isResume,
    });
  }

  /**
   * Pause an experiment: transitions from "running" to "paused".
   *
   * Emits a "training:checkpoint" event before pause.
   *
   * @param id — experiment/session ID
   * @throws if the experiment is not found or not running
   */
  pauseExperiment(id: string): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    if (session.status !== "running") {
      throw new Error(
        `ExperimentController: cannot pause experiment in "${session.status}" status. ` +
        `Must be "running"`
      );
    }

    // Phase 74: Do NOT create a metadata-only checkpoint here. The real
    // checkpoint (with serialized training data) is saved by
    // TrainingRuntime.saveCheckpointData() before this transition. Creating a
    // second checkpoint would overwrite activeCheckpoint and drop the data
    // needed to resume.
    this.workspace.updateSession(id, {
      status: "paused",
      timeline: [
        ...session.timeline,
        createTimelineEvent("paused", "Training paused"),
      ],
    });

    // Update runtime
    const rt = this.runtimeStates.get(id);
    if (rt) {
      rt.isPaused = true;
    }
  }

  /**
   * Resume an experiment: transitions from "paused" to "running".
   *
   * @param id — experiment/session ID
   * @throws if the experiment is not found or not paused
   */
  resumeExperiment(id: string): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    if (session.status !== "paused") {
      throw new Error(
        `ExperimentController: cannot resume experiment in "${session.status}" status. ` +
        `Must be "paused"`
      );
    }

    // Same as start but marked as resume
    this.workspace.updateSession(id, {
      status: "running",
      timeline: [
        ...session.timeline,
        createTimelineEvent("running", "Training resumed from checkpoint"),
      ],
    });

    const rt = this.runtimeStates.get(id);
    if (rt) {
      rt.isPaused = false;
    }

    this.eventBus.emit("training:start", {
      sessionId: id,
      experimentName: session.name,
      modelConfig: session.modelConfig,
      trainingConfig: session.trainingConfig,
      timestamp: Date.now(),
      isResume: true,
    });
  }

  /**
   * Stop an experiment: transitions from "running"/"paused"/"restored"
   * to "stopped" (Phase 66: distinct from "completed").
   *
   * This is a user-initiated stop — the status becomes "stopped".
   * For natural completion, use completeExperiment().
   *
   * Emits a "training:complete" event.
   *
   * @param id — experiment/session ID
   * @param finalMetrics — final training metrics to record
   * @throws if the experiment is not found or not in a stoppable state
   */
  stopExperiment(
    id: string,
    finalMetrics?: Partial<TrainingMetricsSnapshot>
  ): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    const stoppable: ResearchStatus[] = ["running", "paused", "restored"];
    if (!stoppable.includes(session.status)) {
      throw new Error(
        `ExperimentController: cannot stop experiment in "${session.status}" status`
      );
    }

    // Abort any running operations
    const rt = this.runtimeStates.get(id);
    if (rt?.abortController) {
      rt.abortController.abort();
    }

    const now = Date.now();
    const durationMs = now - session.createdAt;
    const finalLoss = finalMetrics?.loss ?? session.metrics?.loss;
    const finalPerplexity = finalMetrics?.perplexity ?? session.metrics?.perplexity;
    const bestLoss = Math.min(
      finalLoss ?? Infinity,
      session.bestLoss ?? Infinity
    );

    const newStatus: ResearchStatus = "stopped";

    this.workspace.updateSession(id, {
      status: newStatus,
      finalLoss,
      finalPerplexity,
      bestLoss,
      durationMs,
      timeline: [
        ...session.timeline,
        createTimelineEvent(newStatus, "Training stopped by user"),
      ],
    });

    this.runtimeStates.delete(id);

    this.eventBus.emit("training:complete", {
      sessionId: id,
      experimentName: session.name,
      finalLoss,
      finalPerplexity,
      bestLoss,
      durationMs,
      timestamp: now,
    });
  }

  /**
   * Complete an experiment: transitions from "running" to "completed"
   * (Phase 66: natural training completion — all epochs finished).
   *
   * This is NOT a user-initiated stop — training finished naturally.
   * Use stopExperiment() for user-initiated termination.
   *
   * Emits a "training:complete" event.
   *
   * @param id — experiment/session ID
   * @param finalMetrics — final training metrics to record
   * @throws if the experiment is not found or not running
   */
  completeExperiment(
    id: string,
    finalMetrics?: Partial<TrainingMetricsSnapshot>
  ): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    if (session.status !== "running") {
      throw new Error(
        `ExperimentController: cannot complete experiment in "${session.status}" status. ` +
        `Must be "running"`
      );
    }

    // Abort any running operations
    const rt = this.runtimeStates.get(id);
    if (rt?.abortController) {
      rt.abortController.abort();
    }

    const now = Date.now();
    const durationMs = now - session.createdAt;
    const finalLoss = finalMetrics?.loss ?? session.metrics?.loss;
    const finalPerplexity = finalMetrics?.perplexity ?? session.metrics?.perplexity;
    const bestLoss = Math.min(
      finalLoss ?? Infinity,
      session.bestLoss ?? Infinity
    );

    this.workspace.updateSession(id, {
      status: "completed",
      finalLoss,
      finalPerplexity,
      bestLoss,
      durationMs,
      timeline: [
        ...session.timeline,
        createTimelineEvent("completed", "Training completed"),
      ],
    });

    this.runtimeStates.delete(id);

    this.eventBus.emit("training:complete", {
      sessionId: id,
      experimentName: session.name,
      finalLoss,
      finalPerplexity,
      bestLoss,
      durationMs,
      timestamp: now,
    });
  }

  /**
   * Mark an experiment as failed.
   *
   * Emits a "training:error" event.
   *
   * @param id — experiment/session ID
   * @param error — error message
   * @param lastStep — optional last known step before failure
   */
  failExperiment(id: string, error: string, _lastStep?: number): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    // Abort running operations
    const rt = this.runtimeStates.get(id);
    if (rt?.abortController) {
      rt.abortController.abort();
    }

    this.workspace.updateSession(id, {
      status: "failed",
      errorMessage: error,
      timeline: [
        ...session.timeline,
        createTimelineEvent("failed", `Training failed: ${error}`),
      ],
      durationMs: Date.now() - session.createdAt,
    });

    this.runtimeStates.delete(id);

    this.eventBus.emit("training:error", {
      sessionId: id,
      experimentName: session.name,
      error: error,
      timestamp: Date.now(),
    });
  }

  /**
   * Restore an experiment from a checkpoint (Phase 66).
   *
   * Transitions: stopped/completed/failed → restored
   *
   * @param id — experiment/session ID
   * @throws if the experiment is not in a restorable state
   */
  restoreFromCheckpoint(id: string): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    const restorable: ResearchStatus[] = ["stopped", "completed", "failed", "paused"];
    if (!restorable.includes(session.status)) {
      throw new Error(
        `ExperimentController: cannot restore experiment in "${session.status}" status. ` +
        `Must be one of: ${restorable.join(", ")}`
      );
    }

    this.workspace.updateSession(id, {
      status: "restored",
      timeline: [
        ...session.timeline,
        createTimelineEvent("restored", "Training restored from checkpoint"),
      ],
    });
  }

  /**
   * Get the current status of an experiment.
   *
   * @param id — experiment/session ID
   * @returns a status summary object
   */
  getStatus(id: string): ExperimentStatusResult {
    const session = this.workspace.getSession(id);

    if (!session) {
      return { found: false, id, status: "created", metrics: null, checkpoint: null, durationMs: null, errorMessage: null };
    }

    return {
      found: true,
      id: session.id,
      status: session.status,
      name: session.name,
      metrics: session.metrics ?? null,
      checkpoint: session.activeCheckpoint ?? null,
      timelineLength: session.timeline.length,
      durationMs: session.durationMs ?? null,
      errorMessage: session.errorMessage ?? null,
    };
  }

  /**
   * Report a training step update.
   *
   * Updates metrics in the workspace and emits a "training:step" event.
   *
   * @param id — experiment/session ID
   * @param metrics — current training metrics
   */
  reportStep(id: string, metrics: TrainingMetricsSnapshot): void {
    const session = this.workspace.getSession(id);
    if (!session) return;

    // Update best loss tracking
    const currentBestLoss = session.bestLoss ?? Infinity;
    const newBestLoss = Math.min(currentBestLoss, metrics.loss);

    this.workspace.updateSession(id, {
      metrics,
      bestLoss: newBestLoss,
    });

    this.eventBus.emit("training:step", {
      sessionId: id,
      metrics,
      timestamp: Date.now(),
    });
  }

  /**
   * Report an evaluation result.
   *
   * @param id — experiment/session ID
   * @param evalMetrics — evaluation metrics
   */
  reportEvaluation(
    id: string,
    evalMetrics: Record<string, unknown>
  ): void {
    const session = this.workspace.getSession(id);
    if (!session) return;

    this.workspace.updateSession(id, {
      timeline: [
        ...session.timeline,
        createTimelineEvent("evaluation", "Evaluation completed", evalMetrics),
      ],
    });

    this.eventBus.emit("training:evaluation", {
      sessionId: id,
      metrics: evalMetrics,
      timestamp: Date.now(),
    });
  }

  /**
   * Report a checkpoint save.
   *
   * @param id — experiment/session ID
   * @param step — step number
   * @param loss — loss at checkpoint
   * @param epoch — epoch number
   */
  reportCheckpoint(
    id: string,
    step: number,
    loss: number,
    epoch: number
  ): void {
    const session = this.workspace.getSession(id);
    if (!session) return;

    const checkpoint: ResearchCheckpoint = {
      id: `ckpt-${Date.now().toString(36)}`,
      step,
      loss,
      epoch,
      timestamp: Date.now(),
    };

    this.workspace.updateSession(id, {
      activeCheckpoint: checkpoint,
      checkpoints: [...session.checkpoints, checkpoint],
      timeline: [
        ...session.timeline,
        createTimelineEvent("checkpoint", `Checkpoint at step ${step}`),
      ],
    });

    this.eventBus.emit("training:checkpoint", {
      sessionId: id,
      checkpoint,
      timestamp: Date.now(),
    });
  }

  /**
   * Queue an experiment for execution.
   *
   * @param id — experiment/session ID
   */
  queueExperiment(id: string): void {
    const session = this.workspace.getSession(id);
    if (!session) {
      throw new Error(`ExperimentController: experiment "${id}" not found`);
    }

    this.workspace.updateSession(id, {
      status: "queued",
      timeline: [
        ...session.timeline,
        createTimelineEvent("queued", "Experiment queued for execution"),
      ],
    });
  }
}

// ============================================================
// Status Result Type
// ============================================================

/**
 * Result of getStatus() — provides a complete status summary
 * for an experiment.
 */
export interface ExperimentStatusResult {
  /** Whether the experiment was found */
  found: boolean;
  /** Experiment ID */
  id: string;
  /** Current status */
  status: ResearchStatus;
  /** Experiment name (empty string if not found) */
  name?: string;
  /** Live training metrics (null if not running) */
  metrics: TrainingMetricsSnapshot | null;
  /** Active checkpoint (null if none) */
  checkpoint: ResearchCheckpoint | null;
  /** Number of timeline events */
  timelineLength?: number;
  /** Training duration in ms (null if not completed) */
  durationMs: number | null;
  /** Error message (null if not failed) */
  errorMessage: string | null;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Create a timeline event from a type and label.
 */
function createTimelineEvent(
  type: ResearchTimelineEvent["type"],
  label: string,
  data?: Record<string, unknown>
): ResearchTimelineEvent {
  return {
    id: generateTimelineEventId(),
    type,
    label,
    timestamp: Date.now(),
    data,
  };
}
