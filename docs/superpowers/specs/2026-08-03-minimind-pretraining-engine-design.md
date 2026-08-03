# MiniMind Pretraining Engine — Design Spec

**Date:** 2026-08-03
**Phase:** 27
**Status:** Approved

## Purpose

Implement a minimal educational pretraining loop for MiniMind that demonstrates the complete training lifecycle: Dataset → Tokenization → Forward → Logits → Cross Entropy Loss → Gradient Boundary → Repeat.

The module must be architecturally honest: forward pass and loss calculation are fully implemented; gradient computation and parameter updates have explicit TODO boundaries and a NoOpOptimizer placeholder, waiting for future autograd support.

## Constraints

- Do NOT modify any existing files in `src/lib/minimind/**`
- Do NOT modify any files in `src/data/minimind/**`
- Do NOT fake gradient computation
- Do NOT claim MiniMind can train weights
- Do NOT access model internal parameters from Pretrainer (no reading embedding matrix, LM head weights, attention weights)
- Keep architecture extensible for future autograd / SFT / LoRA

## Module Structure

```
src/lib/minimind/pretrain/
├── types.ts          # All type definitions
├── dataset.ts        # ToyDataset with built-in corpus
├── loss.ts           # CrossEntropyLoss (pure function, zero dependencies)
├── optimizer.ts      # Optimizer interface + NoOpOptimizer + FutureSGDOptimizer placeholder
├── Pretrainer.ts     # Training loop orchestrator
└── index.ts          # Barrel export
```

## Data Flow

```
ToyDataset
    │  TrainingSample { inputIds, targetIds }
    ▼
MiniMindModel.forward()
    │  Existing model, zero modifications — public API only
    │  ModelOutput { logits, hiddenStates, trace }
    ▼
CrossEntropyLoss.forward(logits, targets)
    │  LossResult { loss, tokenLosses }  ← fully implemented
    ▼
[GRADIENT BOUNDARY]
    │  TrainingCapability.gradientComputation = false
    │  TrainingCapability.parameterUpdate = false
    │
    ├── NoOpOptimizer.step([])    ← accepts gradients, intentionally empty
    └── NoOpOptimizer.zeroGrad()  ← intentionally empty
    ▼
Loss recorded → next epoch → TrainingResult
```

## File Specifications

### types.ts

All type definitions for the pretraining module:

- `TrainingSample` — `{ inputIds: number[]; targetIds: number[] }`
- `TrainingConfig` — `{ epochs: number; learningRate: number }` (learningRate documented as reserved for future use)
- `LossResult` — `{ loss: number; tokenLosses: number[] }`
- `TrainingCapability` — self-documenting status: `{ forwardPass, lossCalculation, gradientComputation, parameterUpdate }` (all boolean)
- `TrainingResult` — `{ epochs, lossHistory, steps, capability, trace }`
- `TrainingTrace` — `{ datasetSize, samplesPerEpoch, epochResults, capability }`
- `EpochResult` — `{ epoch, averageLoss, sampleLosses, sampleCount }`
- `Optimizer` interface — `{ step(gradients), zeroGrad(), capability, description }`
- `ParameterGradient` — `{ name, shape, values }` (the gradient contract for future use)

### dataset.ts

`ToyDataset` class:

- Built-in default corpus of 5 simple English sentences
- Accepts a `MiniTokenizer` instance and optional custom corpus
- Encodes each text sample into `TrainingSample { inputIds, targetIds }`
- For causal LM pretraining, `targetIds = inputIds` (the loss function handles next-token shift internally)
- API: `getSamples()`, `size` getter, iterable
- Filters empty/invalid encodings with warning

### loss.ts

`CrossEntropyLoss` class — pure computation, zero dependencies on model/optimizer/dataset:

- `forward(logits: number[], targetIds: number[]): LossResult`
  - Formula: `-log(softmax(logits)[target])` averaged over positions
  - Handles edge cases: empty targets, logit/target length mismatch
  - `tokenLosses` preserves per-position loss for inspection
- `forwardBatch(logitsBatch: number[][], targetIdsBatch: number[][]): LossResult`
  - Batched version for multiple samples
- Educational comments explaining the cross-entropy formula

### optimizer.ts

Three pieces in one file:

1. **`Optimizer` interface** — the contract:
   - `step(gradients: ParameterGradient[]): void`
   - `zeroGrad(): void`
   - `readonly capability: "noop" | "sgd" | "adamw"`
   - `readonly description: string`

2. **`NoOpOptimizer`** — current implementation:
   - `capability = "noop"`
   - `description` explicitly states: "Training loop implemented, gradient update pending autograd."
   - `step()` accepts gradients but is intentionally empty
   - `zeroGrad()` is intentionally empty
   - Documented as the integration point for future autograd

3. **`FutureSGDOptimizer`** — placeholder class:
   - `capability = "sgd"`
   - Full TODO documentation listing prerequisites: parameter registry, autograd backprop, LR scheduling
   - Not wired into Pretrainer by default; exists as documentation of the future path

### Pretrainer.ts

`Pretrainer` class — training loop orchestrator:

- **Constructor**: accepts `MiniMindModel` (dependency injection, read-only), `ToyDataset`, `Optimizer` (defaults to `NoOpOptimizer`)
- **Primary API**: `runTrainingLoop(config: TrainingConfig): TrainingResult`
- **Accessor**: `getCapability(): TrainingCapability`

`runTrainingLoop()` algorithm:
1. Validate config (epochs > 0)
2. For each epoch:
   a. For each sample in dataset:
      - Call `model.forward({ inputText: decodedSample })` — public API only
      - Call `CrossEntropyLoss.forward(logits, targetIds)` — real loss
      - Call `optimizer.zeroGrad()` — no-op, explicit
      - Call `optimizer.step([])` — no-op, explicit, empty gradients
      - Record per-sample loss
   b. Compute epoch average loss
   c. Append to loss history
3. Build `TrainingResult` with capability, trace, history

**Critical: Pretrainer does NOT access model internals.**
- No `model.getLMHead().getWeights()`
- No `model.getEmbedding()`
- No parameter registry access
- Only `model.forward()` — the single public API

### index.ts

Barrel export file. Exports all public types and classes. Does NOT export from main `src/lib/minimind/index.ts` yet (deferred).

## Capability Status

| Component | Status | Notes |
|-----------|--------|-------|
| ToyDataset | Fully implemented | Built-in corpus, tokenizer-compatible |
| Forward pass | Fully implemented | Delegates to MiniMindModel.forward() |
| Cross-entropy loss | Fully implemented | Pure math, real computation |
| Epoch loop | Fully implemented | Iterates samples, records per-epoch loss |
| Loss history | Fully implemented | Per-epoch averages in TrainingResult |
| Training trace | Fully implemented | Full record of every epoch and sample |
| Gradient computation | TODO boundary | Requires autograd — chain rule through Transformer/Attention/FFN |
| Parameter update | TODO boundary | Requires parameter registry + gradients |
| NoOpOptimizer | Fully implemented | Accepts gradient interface, does nothing (honestly) |

## Design Message

> "MiniMind now has a complete pretraining pipeline skeleton. The training loop runs end-to-end: dataset → forward → loss → (gradient boundary) → record → repeat. Cross-entropy loss is computed correctly with real math. The optimizer interface is defined and accepts gradients. Two things remain for real training: autograd (backprop through the Transformer stack) and a parameter registry (map gradient names to model weights). When those arrive, swap NoOpOptimizer for FutureSGDOptimizer and training becomes real."

## Validation

- `npm run build` must produce 0 errors and 0 warnings
- No existing files modified
- No fake gradients or weight updates
