# Phase 67 — Generation & Evaluation Audit

## Date: 2026-08-12

## Existing Generation Capabilities

### GenerationEvaluator (`src/lib/minimind/evaluation/GenerationEvaluator.ts`)
- ✅ `evaluate(prompts, options)` — generates text for prompts, computes avgLogProb & perplexity
- ✅ `compare(before, after)` — compares two GenerationEvalResult arrays
- ✅ Uses TensorMiniMindModel + BPETokenizer
- ✅ Supports: maxTokens, temperature, topK, topP, seed, eosTokenId
- ✅ Seeded RNG (Mulberry32) for deterministic generation
- ✅ `Tensor.noGrad()` wrapper for forward pass
- ✅ Computes: generatedText, generatedIds, tokenCount, avgLogProb, perplexity, stopReason

### GenerationBenchmark (`src/lib/minimind/evaluation/GenerationBenchmark.ts`)
- ✅ Wraps GenerationEvaluator with prompt suites
- ✅ Aggregate metrics across prompts
- ✅ Before/after comparison with changeRatio
- ✅ Human-readable summary via `summarizeComparison()`

### GenerationLoop (`src/lib/minimind/inference/GenerationLoop.ts`)
- ✅ Uses MiniMindModel (higher-level abstraction with KV Cache)
- ✅ Async generator interface (token-by-token)
- ✅ Works with MiniMindModel, not TensorMiniMindModel
- ⚠️ Different model interface than what training/checkpoints use

### GenerationShowcase (`src/components/ai-lab/dashboard/GenerationShowcase.tsx`)
- ✅ Before/after comparison cards
- ✅ Empty states for no training / no comparison
- ⚠️ Reads from `trainingVisualizationAdapter.getGenerationComparison()` (static/derived data)
- ❌ Not connected to real generation pipeline

## Checkpoint Restoration Path

### Checkpoint Format (`src/lib/minimind/training/checkpoint/Checkpoint.ts`)
```
CheckpointData {
  version, timestamp,
  modelParams: SerializedParam[]  ← model weights
  optimizerState, schedulerState,
  trainerState, randomState,
  dataloaderState, streamingDataloaderState
}
```

### Restoration
- `loadCheckpoint({model, optimizer, checkpoint})` restores model weights + optimizer state
- `deserializeModelParams()` copies checkpoint data into model parameters by name
- TrainingWorker does: build model → checkpoint ? trainer.resume(ckpt) : trainer.train()

### Critical Path for Generation from Checkpoint
```
Checkpoint JSON
  → parse → CheckpointData
  → build TensorMiniMindModel (matching config)
  → build AdamWOptimizer (dummy, for loadCheckpoint API)
  → loadCheckpoint({model, optimizer, checkpoint})
  → model weights restored
  → build BPETokenizer (train on corpus)
  → new GenerationEvaluator(model, tokenizer)
  → evaluator.evaluate(prompts, options)
  → GenerationResult[]
```

## Missing UI Connections

1. **No checkpoint → generation bridge** — After training completes, no UI path to generate text from checkpoint
2. **No generation workspace** — No dedicated UI for prompt input, generation, comparison
3. **No generation worker** — Generation runs on main thread (blocking for large models)
4. **No generation history** — Results not persisted
5. **No export for generation** — Cannot export generation results
6. **GenerationShowcase uses static data** — Not connected to real pipeline
7. **ResearchWorkspace has no "Generate Text" CTA** — After training, no link to generation
8. **No before/after comparison with real checkpoints**

## Proposed Architecture

```
┌─────────────────────────────────────────────────────┐
│ UI Layer                                             │
│                                                       │
│  ResearchWorkspace ──→ GenerationWorkspace            │
│       │                      │                        │
│       ├─ "Generate Text" CTA │                        │
│       │                      ├─ PromptInput           │
│       │                      ├─ GenerationResult      │
│       │                      ├─ GenerationComparison  │
│       │                      └─ GenerationHistory     │
│                                                       │
├─────────────────────────────────────────────────────┤
│ Adapter Layer (pure functions, browser-safe)          │
│                                                       │
│  generationAdapter.ts                                 │
│    - createGenerationRequest()                        │
│    - startGeneration()                                │
│    - cancelGeneration()                               │
│    - getGenerationHistory()                           │
│    - exportGenerationResult()                         │
│                                                       │
├─────────────────────────────────────────────────────┤
│ Research Layer                                        │
│                                                       │
│  GenerationRuntime.ts                                 │
│    - generate()                                       │
│    - evaluate()                                       │
│    - compare()                                        │
│    - Uses GenerationWorker for browser safety         │
│                                                       │
│  GenerationResult.ts (types)                          │
│                                                       │
│  GenerationHistoryStore.ts                            │
│                                                       │
│  worker/GenerationWorker.ts                           │
│  worker/GenerationWorkerProtocol.ts                   │
│                                                       │
├─────────────────────────────────────────────────────┤
│ Existing Infrastructure (DO NOT MODIFY)              │
│                                                       │
│  GenerationEvaluator                                  │
│  GenerationBenchmark                                  │
│  Checkpoint system                                    │
│  TensorMiniMindModel                                 │
│  BPETokenizer                                        │
└─────────────────────────────────────────────────────┘
```

## Files That Should NOT Be Modified

- `src/lib/minimind/core/*` (Tensor, ops, etc.)
- `src/lib/minimind/model/*` (model architecture)
- `src/lib/minimind/training/*` (trainer, checkpoint, etc.)
- `src/data/minimind/*` (registries)

## Implementation Plan

See the spec for the full 20-step plan.
