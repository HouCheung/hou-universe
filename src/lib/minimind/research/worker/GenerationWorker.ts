// ============================================================
// MiniMind — research/worker/GenerationWorker.ts
// ============================================================
// Phase 67: Web Worker that executes REAL generation from
// a trained MiniMind checkpoint.
//
// This worker:
//   1. Receives start command with checkpointJSON + modelConfig
//   2. Builds tokenizer, model
//   3. Loads checkpoint weights into model
//   4. Runs REAL GenerationEvaluator.evaluate()
//   5. Posts "completed" event with real GenerationResult
//   6. Supports cancellation via AbortController
//
// ABSOLUTELY NO Math.random() FOR GENERATION.
// ABSOLUTELY NO fake output / mock data.
//
// Design:
//   - Reuses existing GenerationEvaluator
//   - Reuses existing checkpoint loading infrastructure
//   - All imports are browser-safe (no fs, no path, no Node APIs)
//   - Follows TrainingWorker pattern
// ============================================================

import type {
  GenerationWorkerCommand,
  GenerationWorkerEvent,
} from "./GenerationWorkerProtocol";
import type { CheckpointData } from "../../training/checkpoint/Checkpoint";
import type { GenerationResult } from "../GenerationResult";

// ============================================================
// Worker state
// ============================================================

let currentAbortController: AbortController | null = null;

// ============================================================
// Worker message handler
// ============================================================

self.onmessage = async (
  e: MessageEvent<GenerationWorkerCommand>
) => {
  const msg = e.data;

  switch (msg.type) {
    case "start": {
      // Abort any previous generation
      if (currentAbortController) {
        currentAbortController.abort();
      }
      currentAbortController = new AbortController();

      try {
        await executeGeneration(msg, currentAbortController.signal);
      } catch (err) {
        if (currentAbortController?.signal.aborted) {
          // Aborted intentionally — don't report as error
          return;
        }
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorEvent: GenerationWorkerEvent = {
          type: "error",
          requestId: msg.requestId,
          error: errorMsg,
        };
        self.postMessage(errorEvent);
      }
      break;
    }

    case "cancel": {
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      break;
    }
  }
};

// ============================================================
// Real Generation Executor (in Worker context)
// ============================================================

async function executeGeneration(
  cmd: GenerationWorkerCommand & { type: "start" },
  signal: AbortSignal
): Promise<void> {
  const {
    requestId,
    sessionId,
    checkpointId,
    checkpointJSON,
    modelConfig,
    generationParams,
    corpus,
    isBaseline,
  } = cmd;

  const startTime = Date.now();

  // ── Lazy-load modules ──
  const [
    { BPETokenizer },
    { TensorMiniMindModel },
    { AdamWOptimizer },
    { loadCheckpoint },
    { GenerationEvaluator },
  ] = await Promise.all([
    import("../../tokenizer/BPETokenizer"),
    import("../../model/TensorMiniMindModel"),
    import("../../core/optim/AdamW"),
    import("../../training/checkpoint/Checkpoint"),
    import("../../evaluation/GenerationEvaluator"),
  ]);

  // ── Check abort before work ──
  if (signal.aborted) {
    const cancelledEvent: GenerationWorkerEvent = {
      type: "cancelled",
      requestId,
    };
    self.postMessage(cancelledEvent);
    return;
  }

  // ── Parse checkpoint early to read its metadata (Phase 80) ──
  let checkpoint: CheckpointData | null = null;
  if (!isBaseline && checkpointJSON) {
    try {
      checkpoint = JSON.parse(checkpointJSON) as CheckpointData;
    } catch {
      throw new Error("Failed to parse checkpoint JSON for generation");
    }
  }

  // ── Build tokenizer ──
  // Phase 80: no `corpus.length * 10` cap — train toward the real target.
  // When the checkpoint records its own tokenizer, restore it losslessly so
  // generation decodes with the EXACT tokenizer training used.
  const tokenizer = new BPETokenizer();
  const metadata = checkpoint?.metadata;
  if (metadata?.tokenizerState) {
    tokenizer.fromState(metadata.tokenizerState);
  } else {
    tokenizer.train(corpus, modelConfig.vocabSize);
  }

  // ── Build model ──
  // Phase 80: reconstruct from checkpoint metadata when available so the
  // model architecture is IDENTICAL to the one that produced the weights.
  const arch = metadata?.modelConfig ?? modelConfig;
  const model = new TensorMiniMindModel({
    vocabSize: tokenizer.vocabSize,
    dModel: arch.dModel,
    numHeads: arch.numHeads,
    dFF: arch.dFF,
    numLayers: arch.numLayers,
    maxSeqLen: arch.maxSeqLen,
  });

  // ── Load checkpoint weights (unless baseline) ──
  if (!isBaseline && checkpoint) {
    // Build a minimal optimizer for the loadCheckpoint API
    const optimizer = new AdamWOptimizer(model.parameters(), {
      lr: 0.001,
      weightDecay: 0.01,
    });

    // Restore model weights from checkpoint
    loadCheckpoint({
      model,
      optimizer,
      checkpoint,
    });
  }

  // ── Check abort after model setup ──
  if (signal.aborted) {
    const cancelledEvent: GenerationWorkerEvent = {
      type: "cancelled",
      requestId,
    };
    self.postMessage(cancelledEvent);
    return;
  }

  // ── Emit started ──
  const startedEvent: GenerationWorkerEvent = {
    type: "started",
    requestId,
  };
  self.postMessage(startedEvent);

  // ── Run REAL generation with token streaming ──
  // The seed is passed directly to GenerationEvaluator, which owns a local
  // seeded RNG. There is no global RNG monkey patch.
  // Phase 71: onToken callback fires for every real generated token
  const evaluator = new GenerationEvaluator(model, tokenizer);

  let accumulatedText = "";

  const evalResults = evaluator.evaluate([generationParams.prompt], {
    maxTokens: generationParams.maxTokens,
    temperature: generationParams.temperature,
    topK: generationParams.topK,
    topP: generationParams.topP,
    seed: generationParams.seed,
    eosTokenId: generationParams.eosTokenId,
    signal,
    onToken: (token: string, tokenIndex: number) => {
      accumulatedText += token;

      // Emit real token event to main thread
      const tokenEvent: GenerationWorkerEvent = {
        type: "token",
        requestId,
        token,
        tokenIndex,
        textSoFar: accumulatedText,
      };
      self.postMessage(tokenEvent);

      // Emit progress periodically (every 5 tokens or at boundaries)
      if (tokenIndex % 5 === 0 || tokenIndex === 0) {
        const elapsedMs = Date.now() - startTime;
        const progressEvent: GenerationWorkerEvent = {
          type: "progress",
          requestId,
          tokensGenerated: tokenIndex + 1,
          maxTokens: generationParams.maxTokens,
          elapsedMs,
        };
        self.postMessage(progressEvent);
      }
    },
  });

  const evalResult = evalResults[0];
  const durationMs = Date.now() - startTime;

  // Determine if generation was stopped by user
  const wasCancelled = signal.aborted;
  const finalStatus: "completed" | "stopped" = wasCancelled ? "stopped" : "completed";

  // ── Build GenerationResult ──
  const result: GenerationResult = {
    requestId,
    sessionId,
    checkpointId,
    status: finalStatus,
    prompt: generationParams.prompt,
    generatedText: evalResult.generatedText,
    generatedIds: evalResult.generatedIds,
    metrics: {
      tokenCount: evalResult.tokenCount,
      avgLogProb: evalResult.avgLogProb,
      perplexity: evalResult.perplexity,
      stopReason: evalResult.stopReason,
      durationMs,
    },
    generationConfig: {
      prompt: generationParams.prompt,
      params: {
        maxTokens: generationParams.maxTokens,
        temperature: generationParams.temperature,
        topK: generationParams.topK,
        topP: generationParams.topP,
        seed: generationParams.seed,
        eosTokenId: generationParams.eosTokenId,
      },
    },
    isBaseline,
    timestamp: Date.now(),
  };

  // ── Emit completed or stopped with real result ──
  if (wasCancelled) {
    const stoppedEvent: GenerationWorkerEvent = {
      type: "stopped",
      requestId,
      result,
    };
    self.postMessage(stoppedEvent);
  } else {
    const completedEvent: GenerationWorkerEvent = {
      type: "completed",
      requestId,
      result,
    };
    self.postMessage(completedEvent);
  }
}
