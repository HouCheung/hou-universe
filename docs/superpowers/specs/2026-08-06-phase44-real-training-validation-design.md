# Phase 44 — Real Training Validation (Design Spec)

**Date:** 2026-08-06
**Status:** Awaiting approval
**Context:** Building MiniMind as a real trainable GPT framework — first end-to-end pretraining validation experiment.

---

## 1. Architecture Overview

Phase 44 adds four new components and one experiment directory on top of the existing training infrastructure. It does **not** modify any existing module internals — all additions are new files.

```
New files:
  experiments/tiny-gpt-v1/
  ├── config.json              # Reproducible training config
  ├── README.md                # Experiment documentation
  └── validate.ts              # Self-contained validation script

  src/lib/minimind/training/
  ├── TrainingLogger.ts        # Structured file + console logger
  ├── ThroughputMeter.ts       # tokens/sec measurement
  └── TrainingMonitor.ts       # Stability monitor (NaN, inf, grad explosion)

  src/lib/minimind/evaluation/
  └── GenerationEvaluator.ts   # Before/after training generation comparison
```

### Relationship to existing modules

| Existing | How Phase 44 uses it |
|----------|---------------------|
| `Trainer` (Trainer.ts) | Unchanged — new components attach via callbacks (`onLog`, `onEpochEnd`) |
| `Experiment` (Experiment.ts) | Unchanged — `runExperiment()` used by validation script |
| `CLI` (minimind-cli.ts) | Extended with `--log-dir`, `--monitor` flags |
| `Evaluator` (Evaluator.ts) | Unchanged — GenerationEvaluator is a separate concern |
| `TensorGenerator` (TensorGenerator.ts) | Used by GenerationEvaluator for text generation |
| `TrainingMetricsCollector` (Metrics.ts) | Enriched with tokens/sec via ThroughputMeter |
| `Checkpoint` (Checkpoint.ts) | Unchanged — used by validation script |

---

## 2. Component Design

### 2.1 TrainingLogger (`src/lib/minimind/training/TrainingLogger.ts`)

Structured logger that writes training metrics to a JSON-lines file and optionally prints to console.

**Fields per log line:**
- `step` — global optimizer step
- `loss` — current loss
- `perplexity` — exp(loss)
- `learningRate` — current LR
- `tokensPerSecond` — from ThroughputMeter
- `gradientNorm` — from computeGlobalNorm
- `timestamp` — ISO 8601

**API:**
```ts
class TrainingLogger {
  constructor(logDir: string, options?: { consoleLog?: boolean })
  log(record: TrainingLogRecord): void
  flush(): void           // sync file writes
  get filePath(): string   // path to the log file
  close(): void
}
```

**File format:** JSON-lines (one JSON object per line) + a summary object at the end on `close()`.

### 2.2 ThroughputMeter (`src/lib/minimind/training/ThroughputMeter.ts`)

Tracks tokens processed and elapsed time to compute tokens/second.

**API:**
```ts
class ThroughputMeter {
  constructor()
  start(): void                        // record start time
  addTokens(count: number): void       // accumulate tokens
  sample(): number                     // tokens/sec since last sample
  get averageTokensPerSecond(): number // overall average
  get totalTokens(): number
  get elapsedMs(): number
  reset(): void
}
```

### 2.3 TrainingMonitor (`src/lib/minimind/training/TrainingMonitor.ts`)

Monitors training stability and can optionally abort if dangerous conditions are detected.

**Detects:**
- NaN loss → `checkLoss(loss)` returns `"nan"`
- Infinite parameters → `checkParameters(params)` returns param names with inf/nan
- Gradient explosion → `checkGradients(params, threshold)` returns `"explosion"` if global norm > threshold
- Loss spike → `checkLossSpike(loss, history)` returns true if loss jumps >10× running average

**API:**
```ts
class TrainingMonitor {
  constructor(options?: { gradNormThreshold?: number, lossSpikeFactor?: number, autoAbort?: boolean })
  checkLoss(loss: number): "ok" | "nan" | "inf"
  checkParameters(parameters: Parameter[]): string[]   // returns names of bad params
  checkGradients(parameters: Parameter[], threshold?: number): "ok" | "explosion"
  checkLossSpike(loss: number): boolean
  get summary(): MonitorSummary
}
```

### 2.4 GenerationEvaluator (`src/lib/minimind/evaluation/GenerationEvaluator.ts`)

Evaluates generation quality of a model by generating text from fixed prompts and collecting both quantitative and qualitative results.

**API:**
```ts
class GenerationEvaluator {
  constructor(model: TensorMiniMindModel, tokenizer: BPETokenizer)
  evaluate(prompts: string[], options?: GenerationOptions): GenerationEvalResult
  compare(before: GenerationEvalResult, after: GenerationEvalResult): GenerationComparison
}

interface GenerationEvalResult {
  prompt: string
  generatedText: string
  tokenCount: number
  avgLogProb: number         // average log probability of generated tokens
  perplexity: number         // perplexity on generated sequence
}

interface GenerationComparison {
  prompt: string
  beforeText: string
  afterText: string
  changed: boolean
}
```

**New directory:** `src/lib/minimind/evaluation/` — a thin module with just this file and an `index.ts` barrel export. This is separate from `training/Evaluator.ts` which evaluates loss/perplexity/accuracy on a dataset — GenerationEvaluator evaluates autoregressive text generation quality.

### 2.5 Experiment Directory (`experiments/tiny-gpt-v1/`)

Plain JSON config + documentation. No TypeScript logic in this directory (the logic lives in the validation script and CLI).

**config.json** — a `TrainingConfigFile` that specifies:
- Model: tiny preset, vocabSize=1024
- Tokenizer: BPE trained from TinyStories, 1024 tokens
- Dataset: TinyStories train split, blockSize=64, 500 stories
- Training: 3 epochs, batchSize=8, lr=3e-4, weightDecay=0.01, warmupSteps=50, maxGradNorm=1.0
- Output: `.cache/minimind/experiments/tiny-gpt-v1/`

**README.md** — experiment description, expected outcomes, reproduction steps.

**validate.ts** — self-contained validation script (runs via `npx tsx`) that:
1. Loads config
2. Trains tokenizer on TinyStories
3. Creates model, trains for 3 epochs, logs metrics
4. Asserts: loss decreases from epoch 0 to epoch N
5. Saves checkpoint mid-training
6. Creates a fresh model, loads checkpoint, continues training
7. Asserts: loss after checkpoint resume < initial loss of epoch 1
8. Generates text with untrained model (record output)
9. Generates text with trained model (record output)
10. Asserts: outputs are different (changed === true)
11. Runs twice with same seed, asserts identical final loss (seed reproducibility)

---

## 3. CLI Extension

The existing `minimind-cli.ts` `train` command already supports `--config <path>`. Add:

| Flag | Type | Description |
|------|------|-------------|
| `--log-dir` | string | Directory for structured training logs (default: config output.dir) |
| `--monitor` | flag | Enable TrainingMonitor with default thresholds |
| `--save-every` | number | Save intermediate checkpoints every N steps |
| `--eval-generate` | flag | Run generation evaluation after training |

Implementation: add these options to the existing `train()` method in `minimind-cli.ts`.

---

## 4. Barrel Export Updates

### `src/lib/minimind/training/index.ts`
Add exports for TrainingLogger, ThroughputMeter, TrainingMonitor.

### `src/lib/minimind/evaluation/index.ts` (NEW)
Barrel export for GenerationEvaluator.

### `src/lib/minimind/index.ts`
Add evaluation module exports.

---

## 5. Validation Criteria

The experiment must prove:

| # | Claim | How verified |
|---|-------|-------------|
| 1 | Loss decreases from random init | validate.ts asserts `finalLoss < initialLoss` |
| 2 | Checkpoint save/load continues training | validate.ts: save mid-training, load into fresh model, continue, verify loss trajectory is continuous |
| 3 | Generation output changes after training | validate.ts: generate before/after, assert texts differ |
| 4 | Deterministic seed reproducibility | validate.ts: run twice with same seed, assert identical final loss |
| 5 | No NaN/inf during training | TrainingMonitor.checkLoss never triggers |
| 6 | No gradient explosion | TrainingMonitor.checkGradients never triggers (maxGradNorm=1.0 clips anyway) |

---

## 6. Constraints (from requirements)

- **Do NOT modify** `MiniMindModel` (old number[][] path)
- **Do NOT modify** AI Lab UI
- **Tensor backend only** — all new code uses `Tensor`, `Parameter`, `TensorMiniMindModel`
- **No fake metrics** — all values come from real forward/backward passes
- **No simulated logits** — use `model.forward()` on real data

---

## 7. Risks

| Risk | Mitigation |
|------|-----------|
| TinyStories download may fail (network) | Config supports `inline` dataset fallback |
| Training too slow in Node.js (no GPU) | Tiny model (128 dModel, 2 layers) + small data (500 stories) |
| BPE tokenizer training may be slow | vocabSize=1024 keeps it fast |
| Memory pressure from autograd graph | Trainer already handles gradient accumulation; 64 block size keeps graphs small |
| Checkpoint recovery: step-counter mismatch | Already handled in Checkpoint.ts `restoreAdamWStepCount` |

---

## 8. Files Summary

| File | Action | Lines (est.) |
|------|--------|-------------|
| `src/lib/minimind/training/TrainingLogger.ts` | CREATE | ~120 |
| `src/lib/minimind/training/ThroughputMeter.ts` | CREATE | ~80 |
| `src/lib/minimind/training/TrainingMonitor.ts` | CREATE | ~130 |
| `src/lib/minimind/evaluation/GenerationEvaluator.ts` | CREATE | ~150 |
| `src/lib/minimind/evaluation/index.ts` | CREATE | ~10 |
| `src/lib/minimind/training/index.ts` | EDIT | +5 lines |
| `src/lib/minimind/index.ts` | EDIT | +5 lines |
| `src/lib/minimind/cli/minimind-cli.ts` | EDIT | ~30 lines |
| `experiments/tiny-gpt-v1/config.json` | CREATE | ~50 |
| `experiments/tiny-gpt-v1/README.md` | CREATE | ~40 |
| `experiments/tiny-gpt-v1/validate.ts` | CREATE | ~200 |
| **Total** | | **~820 lines** |
