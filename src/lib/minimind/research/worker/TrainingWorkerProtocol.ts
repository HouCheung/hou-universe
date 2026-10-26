// ============================================================
// MiniMind — research/worker/TrainingWorkerProtocol.ts
// ============================================================
// Phase 65: Web Worker training protocol.
// Phase 66: Extended with full lifecycle commands and events.
//
// Defines the message types exchanged between TrainingRuntime
// (main thread) and TrainingWorker (Web Worker).
//
// Design:
//   - Strict typed commands from main → worker
//   - Strict typed events from worker → main
//   - Reuses existing domain types where applicable
//   - No runtime dependencies — pure types
// ============================================================

// ============================================================
// Commands (Main → Worker)
// ============================================================

export interface TrainingWorkerStartCommand {
  type: "start";
  /** Session ID (ResearchSession.id) — the training session this command targets */
  sessionId: string;
  /** Inline text corpus for training (browser-safe, no fs) */
  corpus: string[];
  /** Dataset identifier the corpus was resolved from (Phase 80) */
  datasetId?: string;
  /** Dataset content version (Phase 82) */
  datasetVersion?: string;
  /** Dataset schema version (Phase 82) */
  datasetSchemaVersion?: number;
  /** Dataset purpose (Phase 82) */
  datasetPurpose?: string;
  /** Model configuration */
  modelConfig: {
    vocabSize: number;
    dModel: number;
    numHeads: number;
    dFF: number;
    numLayers: number;
    maxSeqLen: number;
  };
  /** Training configuration */
  trainingConfig: {
    epochs: number;
    batchSize: number;
    blockSize: number;
    learningRate: number;
    weightDecay: number;
    logInterval: number;
    gradientClipNorm: number;
    warmupSteps: number;
    shuffle: boolean;
  };
  /** Random seed for reproducibility */
  seed: number;
  /** Optional serialized checkpoint data for resume (Phase 66) */
  checkpointJSON?: string;
}

export interface TrainingWorkerPauseCommand {
  type: "pause";
  sessionId: string;
}

export interface TrainingWorkerResumeCommand {
  type: "resume";
  sessionId: string;
  /** Serialized checkpoint data to restore from (Phase 66) */
  checkpointJSON?: string;
}

export interface TrainingWorkerStopCommand {
  type: "stop";
  sessionId: string;
}

export interface TrainingWorkerSaveCheckpointCommand {
  type: "save-checkpoint";
  sessionId: string;
  /** Optional label for the checkpoint */
  label?: string;
}

export interface TrainingWorkerLoadCheckpointCommand {
  type: "load-checkpoint";
  sessionId: string;
  /** Serialized checkpoint data to restore from */
  checkpointJSON: string;
}

export type TrainingWorkerCommand =
  | TrainingWorkerStartCommand
  | TrainingWorkerPauseCommand
  | TrainingWorkerResumeCommand
  | TrainingWorkerStopCommand
  | TrainingWorkerSaveCheckpointCommand
  | TrainingWorkerLoadCheckpointCommand;

// ============================================================
// Events (Worker → Main)
// ============================================================

export interface TrainingWorkerStartedEvent {
  type: "started";
  sessionId: string;
}

export interface TrainingWorkerStepEvent {
  type: "step";
  sessionId: string;
  step: number;
  totalSteps: number;
  loss: number;
  perplexity: number;
  learningRate: number;
  tokensPerSecond: number;
  gradientNorm?: number;
}

export interface TrainingWorkerPausedEvent {
  type: "paused";
  sessionId: string;
  step: number;
  loss: number;
  /** Serialized checkpoint data (Phase 66) */
  checkpointJSON: string;
}

export interface TrainingWorkerResumedEvent {
  type: "resumed";
  sessionId: string;
  step: number;
}

export interface TrainingWorkerCheckpointSavedEvent {
  type: "checkpoint-saved";
  sessionId: string;
  step: number;
  loss: number;
  /** Serialized checkpoint data (Phase 66) */
  checkpointJSON: string;
}

export interface TrainingWorkerCheckpointLoadedEvent {
  type: "checkpoint-loaded";
  sessionId: string;
  step: number;
}

export interface TrainingWorkerStoppedEvent {
  type: "stopped";
  sessionId: string;
  step: number;
  loss: number;
  /** Serialized checkpoint data at stop point (Phase 66) */
  checkpointJSON?: string;
}

export interface TrainingWorkerCompletedEvent {
  type: "completed";
  sessionId: string;
  initialLoss: number;
  finalLoss: number;
  bestLoss: number;
  perplexity: number;
  totalSteps: number;
  durationMs: number;
  /** Serialized final checkpoint (Phase 75) */
  checkpointJSON?: string;
}

export interface TrainingWorkerErrorEvent {
  type: "error";
  sessionId: string;
  error: string;
  /** Last known step before the error */
  lastStep?: number;
  /** Serialized checkpoint at the error point (Phase 66) */
  checkpointJSON?: string;
}

export type TrainingWorkerEvent =
  | TrainingWorkerStartedEvent
  | TrainingWorkerStepEvent
  | TrainingWorkerPausedEvent
  | TrainingWorkerResumedEvent
  | TrainingWorkerCheckpointSavedEvent
  | TrainingWorkerCheckpointLoadedEvent
  | TrainingWorkerStoppedEvent
  | TrainingWorkerCompletedEvent
  | TrainingWorkerErrorEvent;

// ============================================================
// Worker message envelope
// ============================================================

/** Message from main thread to worker */
export type TrainingWorkerInMessage = TrainingWorkerCommand;

/** Message from worker to main thread */
export type TrainingWorkerOutMessage = TrainingWorkerEvent;
