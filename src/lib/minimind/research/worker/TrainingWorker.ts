// ============================================================
// MiniMind — research/worker/TrainingWorker.ts
// ============================================================
// Phase 65: Web Worker that executes REAL MiniMind training.
// Phase 66: Full lifecycle — pause/resume/checkpoint/stop.
//
// This worker:
//   1. Receives commands from the main thread
//   2. Builds tokenizer, dataset, model, optimizer, scheduler
//   3. Runs real Trainer with forward/backward/AdamW
//   4. Posts "step" events with REAL loss/lr/tokensPerSecond
//   5. Supports cooperative pause (checkpoint → yield)
//   6. Supports resume from checkpoint
//   7. Supports save-checkpoint mid-training
//   8. Supports graceful stop
//
// ABSOLUTELY NO Math.random() FOR METRICS.
// ABSOLUTELY NO fake loss / mock data.
//
// Cooperative pause design (Phase 66):
//   - pauseRequested flag is checked at each logInterval
//   - When set, trainer.saveCheckpoint() captures full state
//   - Worker posts "paused" event with serialized checkpoint
//   - Training loop throws "PAUSED" to exit cleanly
//   - On resume, checkpoint is loaded and trainer.resume() called
//
// Design:
//   - Reuses the same real training pipeline as createInlineTrainingExecutor
//   - All imports are browser-safe (no fs, no path, no Node APIs)
//   - AbortController for cooperative cancellation
//   - Seed reproducibility preserved via Random.setSeed()
// ============================================================

import type {
  TrainingWorkerCommand,
  TrainingWorkerEvent,
} from "./TrainingWorkerProtocol";
import type {
  CheckpointData,
  CheckpointMetadata,
} from "../../training/checkpoint/Checkpoint";

// ============================================================
// Worker state
// ============================================================

let currentAbortController: AbortController | null = null;
let pauseRequested = false;
let saveCheckpointRequested = false;

// ============================================================
// Worker message handler
// ============================================================

self.onmessage = async (
  e: MessageEvent<TrainingWorkerCommand>
) => {
  const msg = e.data;

  switch (msg.type) {
    case "start": {
      // Abort any previous run
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();
      pauseRequested = false;
      saveCheckpointRequested = false;

      try {
        await executeTraining(
          msg,
          currentAbortController.signal,
          msg.checkpointJSON ?? undefined
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Cooperative pause: the "paused" event (with checkpoint) was already posted.
        if (message === PAUSE_SENTINEL) {
          pauseRequested = false;
          return;
        }

        // Cooperative stop: the "stopped" event (with final checkpoint) was already posted.
        if (message === ABORT_SENTINEL) {
          return;
        }

        // Defensive: aborted between events without reaching a sentinel — treat as stop.
        if (currentAbortController?.signal.aborted) {
          return;
        }

        const errorEvent: TrainingWorkerEvent = {
          type: "error",
          sessionId: msg.sessionId,
          error: message,
        };
        self.postMessage(errorEvent);
      }
      break;
    }

    case "pause": {
      pauseRequested = true;
      break;
    }

    case "resume": {
      // Resume is handled via a new "start" command with checkpointJSON
      // This case handles the scenario where the worker is still running
      // and receives a resume (shouldn't normally happen since pause exits)
      pauseRequested = false;
      break;
    }

    case "save-checkpoint": {
      saveCheckpointRequested = true;
      break;
    }

    case "stop": {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;
    }

    case "load-checkpoint":
      // load-checkpoint is handled as part of the "start" flow
      break;
  }
};

// ============================================================
// Sentinels for cooperative pause
// ============================================================

const PAUSE_SENTINEL = "__TRAINING_PAUSED__";
const ABORT_SENTINEL = "__TRAINING_ABORTED__";

// ============================================================
// Real Training Executor (in Worker context)
// ============================================================

async function executeTraining(
  cmd: TrainingWorkerCommand & { type: "start" },
  signal: AbortSignal,
  resumeCheckpointJSON?: string
): Promise<void> {
  const {
    sessionId,
    corpus,
    datasetId,
    datasetVersion,
    datasetSchemaVersion,
    datasetPurpose,
    modelConfig,
    trainingConfig,
    seed,
  } = cmd;

  // ── Lazy-load training modules ──
  const [
    { BPETokenizer },
    { TextDataset },
    { DataLoader },
    { TensorMiniMindModel },
    { AdamWOptimizer },
    { CosineScheduler },
    { Trainer },
    { Random },
    {},
  ] = await Promise.all([
    import("../../tokenizer/BPETokenizer"),
    import("../../data/TextDataset"),
    import("../../data/DataLoader"),
    import("../../model/TensorMiniMindModel"),
    import("../../core/optim/AdamW"),
    import("../../core/scheduler/CosineScheduler"),
    import("../../training/Trainer"),
    import("../../core/random/Random"),
    import("../../training/checkpoint/Checkpoint"),
  ]);

  // ── Set seed for reproducibility ──
  Random.setSeed(seed);

  // ── Build tokenizer ──
  // Phase 80: no `corpus.length * 10` cap. Train toward the real target;
  // the tokenizer reports its ACTUAL vocab size via `vocabSize`, which the
  // model and checkpoint both derive from. A small corpus yields a small
  // vocab — honestly, not silently masked to a fake 32000.
  const tokenizer = new BPETokenizer();
  const targetVocab = modelConfig.vocabSize;
  tokenizer.train(corpus, targetVocab);

  // ── Build dataset ──
  const blockSize = trainingConfig.blockSize;
  const batchSize = trainingConfig.batchSize;
  const textDataset = new TextDataset({
    tokenizer,
    corpus,
    blockSize,
  });

  const trainLoader = new DataLoader(textDataset, {
    batchSize,
    shuffle: trainingConfig.shuffle,
    seed,
    dropLast: true,
  });

  // ── Build model ──
  // Phase 80: maxSeqLen comes from the shared model config (not blockSize),
  // so training and generation build the SAME architecture.
  const model = new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: modelConfig.dModel,
    numHeads: modelConfig.numHeads,
    dFF: modelConfig.dFF,
    numLayers: modelConfig.numLayers,
    maxSeqLen: modelConfig.maxSeqLen,
  });

  // ── Build optimizer ──
  const lr = trainingConfig.learningRate;
  const optimizer = new AdamWOptimizer(model.parameters(), {
    lr,
    weightDecay: trainingConfig.weightDecay,
  });

  // ── Build scheduler ──
  const totalSteps = trainingConfig.epochs * trainLoader.numBatches;
  const scheduler = new CosineScheduler(optimizer, {
    baseLR: lr,
    minLR: lr * 0.01,
    warmupSteps: Math.floor(totalSteps * 0.1),
    totalSteps,
  });

  // ── Sanity: check abort before expensive work ──
  if (signal.aborted) return;

  // ── Build Trainer ──
  const startTime = Date.now();
  let initialLoss = Infinity;

  // ── Checkpoint metadata (Phase 80) ──
  // Records the EXACT model + tokenizer + dataset config used for this
  // run, so generation can reconstruct an identical architecture and the
  // checkpoint is self-describing. The actual completed step count lives
  // in `trainerState.globalStep`; `trainingSteps` here is the planned total.
  const checkpointMetadata: CheckpointMetadata = {
    modelConfig: {
      vocabSize: tokenizer.vocabSize,
      dModel: modelConfig.dModel,
      numHeads: modelConfig.numHeads,
      dFF: modelConfig.dFF,
      numLayers: modelConfig.numLayers,
      maxSeqLen: modelConfig.maxSeqLen,
    },
    vocabSize: tokenizer.vocabSize,
    parameterCount: model.totalParamCount,
    trainingDataset: datasetId ?? "unknown",
    datasetVersion,
    datasetSchemaVersion,
    datasetPurpose,
    trainingSteps: totalSteps,
    epochs: trainingConfig.epochs,
    createdAt: Date.now(),
    tokenizerState: tokenizer.toState(),
  };

  const trainer = new Trainer({
    model,
    optimizer,
    trainLoader,
    checkpointMetadata,
    config: {
      epochs: trainingConfig.epochs,
      learningRate: lr,
      logInterval: trainingConfig.logInterval,
      gradientAccumulationSteps: 1,
      gradientClipNorm: trainingConfig.gradientClipNorm,
    },
    onLog: (info) => {
      // ── Check abort at each log interval ──
      if (signal.aborted) {
        // Stop requested mid-run — save a final checkpoint and post "stopped".
        const checkpoint = trainer.saveCheckpoint();
        const stoppedEvent: TrainingWorkerEvent = {
          type: "stopped",
          sessionId,
          step: info.globalStep,
          loss: Math.round(info.loss * 10000) / 10000,
          checkpointJSON: JSON.stringify(checkpoint),
        };
        self.postMessage(stoppedEvent);
        throw new Error(ABORT_SENTINEL);
      }

      // ── Check pause request ──
      if (pauseRequested) {
        // Save checkpoint before yielding
        const checkpoint = trainer.saveCheckpoint();
        const checkpointJSON = JSON.stringify(checkpoint);

        const pausedEvent: TrainingWorkerEvent = {
          type: "paused",
          sessionId,
          step: info.globalStep,
          loss: Math.round(info.loss * 10000) / 10000,
          checkpointJSON,
        };
        self.postMessage(pausedEvent);

        // Throw sentinel; the catch block clears the flag after confirming pause.
        throw new Error(PAUSE_SENTINEL);
      }

      // ── Check save-checkpoint request ──
      if (saveCheckpointRequested) {
        saveCheckpointRequested = false;
        const checkpoint = trainer.saveCheckpoint();
        const checkpointJSON = JSON.stringify(checkpoint);

        const checkpointSavedEvent: TrainingWorkerEvent = {
          type: "checkpoint-saved",
          sessionId,
          step: info.globalStep,
          loss: Math.round(info.loss * 10000) / 10000,
          checkpointJSON,
        };
        self.postMessage(checkpointSavedEvent);
      }

      if (!Number.isFinite(initialLoss)) {
        initialLoss = info.loss;
      }

      const currentLR = scheduler.getLR();

      // Compute throughput
      const tokensPerStep = batchSize * blockSize * trainingConfig.logInterval;
      const elapsed = Date.now() - startTime;
      const tokensPerSecond =
        elapsed > 0
          ? ((info.globalStep * tokensPerStep) / elapsed) * 1000 / trainingConfig.logInterval
          : 0;

      // ── Post REAL step event ──
      const stepEvent: TrainingWorkerEvent = {
        type: "step",
        sessionId,
        step: info.globalStep,
        totalSteps,
        loss: Math.round(info.loss * 10000) / 10000,
        perplexity: Math.round(info.perplexity * 100) / 100,
        learningRate: Math.round(currentLR * 1e8) / 1e8,
        tokensPerSecond: Math.round(tokensPerSecond),
      };
      self.postMessage(stepEvent);
    },
    onEpochEnd: () => {
      scheduler.step();
    },
  });

  trainer.scheduler = scheduler;

  // ── Checkpoint resume (Phase 66) ──
  let trainerState;
  if (resumeCheckpointJSON) {
    // Parse and validate checkpoint
    let checkpoint: CheckpointData;
    try {
      checkpoint = JSON.parse(resumeCheckpointJSON) as CheckpointData;
    } catch {
      throw new Error("Failed to parse checkpoint JSON for resume");
    }

    // Load checkpoint into the fresh trainer
    trainerState = trainer.resume(checkpoint);

    // Post checkpoint-loaded event
    const loadedEvent: TrainingWorkerEvent = {
      type: "checkpoint-loaded",
      sessionId,
      step: trainerState.globalStep,
    };
    self.postMessage(loadedEvent);
  } else {
    // ── Emit started ──
    const startedEvent: TrainingWorkerEvent = {
      type: "started",
      sessionId,
    };
    self.postMessage(startedEvent);

    // ── Run real Trainer from scratch ──
    trainerState = trainer.train();
  }

  const endTime = Date.now();
  const durationMs = endTime - startTime;

  // ── Compute final metrics ──
  const finalLoss =
    trainerState.lossHistory.length > 0
      ? trainerState.lossHistory[trainerState.lossHistory.length - 1]
      : initialLoss;
  const bestLoss = trainerState.bestLoss;
  const perplexity = Math.exp(Math.min(bestLoss, 709));

  // ── Check if stopped (aborted after completion) ──
  if (signal.aborted) {
    // Training was stopped mid-run — post stopped event
    const checkpoint = trainer.saveCheckpoint();
    const stoppedEvent: TrainingWorkerEvent = {
      type: "stopped",
      sessionId,
      step: trainerState.globalStep,
      loss: Math.round(finalLoss * 10000) / 10000,
      checkpointJSON: JSON.stringify(checkpoint),
    };
    self.postMessage(stoppedEvent);
    return;
  }

  // ── Emit completed ──
  const completedEvent: TrainingWorkerEvent = {
    type: "completed",
    sessionId,
    initialLoss: Math.round(initialLoss * 10000) / 10000,
    finalLoss: Math.round(finalLoss * 10000) / 10000,
    bestLoss: Math.round(bestLoss * 10000) / 10000,
    perplexity: Math.round(perplexity * 100) / 100,
    totalSteps: trainerState.globalStep,
    durationMs,
    // Phase 75: serialize the final checkpoint so TrainingRuntime can
    // write it back to the completed run (checkpointId + final state).
    checkpointJSON: JSON.stringify(trainer.saveCheckpoint()),
  };
  self.postMessage(completedEvent);
}
