// ============================================================
// TrainingState — Mutable state tracking for Trainer
// ============================================================
// Phase 41: Tracks epoch, global step, loss history, and
// best-loss tracking during a training run.
//
// Phase 48: Extended with currentBatch, dataloaderState,
// and randomState for full training resume support.
//
// The Trainer mutates a single TrainingState instance across
// epochs and returns it from train() for analysis.
// ============================================================

import type { DataLoaderState } from "../data/DataLoader";
import type { StreamingDataLoaderState } from "../data/streaming/StreamingDataLoader";

/**
 * Snapshot of trainer state at a point in time.
 * Returned by Trainer.train() for post-training analysis.
 * Also used as the checkpoint serialization format.
 */
export interface TrainingStateSnapshot {
  /** Current epoch (0-indexed) */
  epoch: number;
  /** Total number of optimizer steps taken */
  globalStep: number;
  /** Total number of forward/backward passes (includes accumulation steps) */
  totalBatches: number;
  /** Current batch index within the current epoch (0-indexed) */
  currentBatch: number;
  /** Loss values recorded at each log interval, in order */
  lossHistory: number[];
  /** Lowest loss value seen during training */
  bestLoss: number;
  /** Epoch at which bestLoss was recorded */
  bestEpoch: number;
  /** Global step at which bestLoss was recorded */
  bestGlobalStep: number;
  /** Evaluation losses (keyed by global step), empty if no evalLoader */
  evalHistory: Array<{ step: number; loss: number }>;
  /** Whether training completed all epochs */
  completed: boolean;
  /** Serialized global Random RNG state (Phase 48) */
  randomState: number[] | null;
  /** Serialized DataLoader positional state (Phase 48) */
  dataloaderState: DataLoaderState | null;
  /** Serialized StreamingDataLoader positional state (Phase 49) */
  streamingDataloaderState: StreamingDataLoaderState | null;
}

/**
 * TrainingState — mutable training state tracker.
 *
 * The Trainer owns one instance and mutates it throughout
 * the training loop. Call snapshot() to get an immutable
 * copy for return to the caller.
 */
export class TrainingState {
  /** Current epoch (0-indexed) */
  epoch: number;

  /** Total optimizer steps executed (each step() call) */
  globalStep: number;

  /** Total forward/backward passes (each batch) */
  totalBatches: number;

  /** Current batch index within the current epoch (0-indexed) */
  currentBatch: number;

  /** Loss values recorded at log intervals */
  lossHistory: number[];

  /** Lowest loss value recorded so far */
  bestLoss: number;

  /** Epoch at which bestLoss was recorded */
  bestEpoch: number;

  /** Global step at which bestLoss was recorded */
  bestGlobalStep: number;

  /** Evaluation metrics recorded during training */
  evalHistory: Array<{ step: number; loss: number }>;

  /** Whether training completed all epochs */
  completed: boolean;

  /** Serialized global Random RNG state (Phase 48) */
  randomState: number[] | null;

  /** Serialized DataLoader positional state (Phase 48) */
  dataloaderState: DataLoaderState | null;

  /** Serialized StreamingDataLoader positional state (Phase 49) */
  streamingDataloaderState: StreamingDataLoaderState | null;

  constructor() {
    this.epoch = 0;
    this.globalStep = 0;
    this.totalBatches = 0;
    this.currentBatch = 0;
    this.lossHistory = [];
    this.bestLoss = Infinity;
    this.bestEpoch = 0;
    this.bestGlobalStep = 0;
    this.evalHistory = [];
    this.completed = false;
    this.randomState = null;
    this.dataloaderState = null;
    this.streamingDataloaderState = null;
  }

  /**
   * Record a training loss at the current step.
   * Updates bestLoss if this loss is the new minimum.
   */
  recordLoss(loss: number): void {
    this.lossHistory.push(loss);
    if (loss < this.bestLoss) {
      this.bestLoss = loss;
      this.bestEpoch = this.epoch;
      this.bestGlobalStep = this.globalStep;
    }
  }

  /**
   * Record an evaluation loss at the current step.
   */
  recordEval(loss: number): void {
    this.evalHistory.push({ step: this.globalStep, loss });
  }

  /**
   * Advance to the next optimizer step.
   * Called after each optimizer.step() call.
   */
  advanceStep(): void {
    this.globalStep++;
  }

  /**
   * Advance to the next batch (forward/backward pass).
   * Called after each batch regardless of accumulation.
   * Also increments currentBatch for positional tracking.
   */
  advanceBatch(): void {
    this.totalBatches++;
    this.currentBatch++;
  }

  /**
   * Reset the batch counter for a new epoch.
   * Called at the start of each epoch.
   */
  resetBatchCounter(): void {
    this.currentBatch = 0;
  }

  /**
   * Set the current epoch.
   */
  setEpoch(epoch: number): void {
    this.epoch = epoch;
  }

  /**
   * Mark training as completed.
   */
  markCompleted(): void {
    this.completed = true;
  }

  /**
   * Set the DataLoader state for checkpointing.
   * Called by Trainer before saving a checkpoint.
   */
  setDataLoaderState(state: DataLoaderState): void {
    this.dataloaderState = state;
  }

  /**
   * Set the StreamingDataLoader state for checkpointing.
   * Called by Trainer before saving a checkpoint when using streaming data.
   */
  setStreamingDataLoaderState(state: StreamingDataLoaderState): void {
    this.streamingDataloaderState = state;
  }

  /**
   * Set the random state for checkpointing.
   * Called by Trainer before saving a checkpoint.
   */
  setRandomState(state: number[]): void {
    this.randomState = state;
  }

  /**
   * Create an immutable snapshot of the current state.
   * The returned object is independent — further mutations
   * to this TrainingState do not affect the snapshot.
   */
  snapshot(): TrainingStateSnapshot {
    return {
      epoch: this.epoch,
      globalStep: this.globalStep,
      totalBatches: this.totalBatches,
      currentBatch: this.currentBatch,
      lossHistory: [...this.lossHistory],
      bestLoss: this.bestLoss,
      bestEpoch: this.bestEpoch,
      bestGlobalStep: this.bestGlobalStep,
      evalHistory: this.evalHistory.map((e) => ({ ...e })),
      completed: this.completed,
      randomState: this.randomState ? [...this.randomState] : null,
      dataloaderState: this.dataloaderState
        ? { ...this.dataloaderState }
        : null,
      streamingDataloaderState: this.streamingDataloaderState
        ? { ...this.streamingDataloaderState }
        : null,
    };
  }

  /**
   * Restore state from a previously saved snapshot.
   *
   * This is used by the checkpoint system to restore training state
   * after loading a checkpoint. All fields are overwritten with
   * the snapshot values.
   *
   * @param snap - Snapshot previously returned by snapshot()
   */
  loadSnapshot(snap: TrainingStateSnapshot): void {
    this.epoch = snap.epoch;
    this.globalStep = snap.globalStep;
    this.totalBatches = snap.totalBatches;
    this.currentBatch = snap.currentBatch ?? 0;
    this.lossHistory = [...snap.lossHistory];
    this.bestLoss = snap.bestLoss;
    this.bestEpoch = snap.bestEpoch;
    this.bestGlobalStep = snap.bestGlobalStep;
    this.evalHistory = snap.evalHistory.map((e) => ({ ...e }));
    this.completed = snap.completed;
    this.randomState = snap.randomState ? [...snap.randomState] : null;
    this.dataloaderState = snap.dataloaderState
      ? { ...snap.dataloaderState }
      : null;
    this.streamingDataloaderState = snap.streamingDataloaderState
      ? { ...snap.streamingDataloaderState }
      : null;
  }
}
