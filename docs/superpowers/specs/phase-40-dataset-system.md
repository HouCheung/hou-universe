# Phase 40 — MiniMind Dataset & DataLoader System

**Date:** 2026-08-06
**Status:** Implemented
**Branch:** main

## Overview

Transform MiniMind from a toy training framework into a real text training framework by implementing a PyTorch-style Dataset/DataLoader system. This system provides the data pipeline foundation for training `TensorMiniMindModel` with real text corpora.

## Architecture

```
src/lib/minimind/data/
├── Dataset.ts          # Generic abstract Dataset<T> base class
├── TextDataset.ts      # Text corpus → Causal LM training samples
├── BatchSampler.ts     # Deterministic index batch sampling
├── DataLoader.ts       # Batch iterator coordinating Dataset + BatchSampler
├── index.ts            # Barrel export
└── __tests__/
    ├── dataset.test.ts # Comprehensive test suite (223 tests)
    └── run.ts          # Standalone test runner
```

## Component Design

### 1. Dataset<T> — Generic Abstraction

**Path:** `src/lib/minimind/data/Dataset.ts`

Generic abstract base class inspired by PyTorch `torch.utils.data.Dataset`.

```typescript
abstract class Dataset<T> {
  abstract length(): number;
  abstract get(index: number): T;
  [Symbol.iterator](): Iterator<T>;
}
```

**Design decisions:**
- **Minimal interface** — only `length()` and `get()` are abstract; iterator is provided automatically
- **Generic** — `T` parameter allows any sample type (TextSample, future ImageSample, etc.)
- **Index-based access** — enables random sampling by BatchSampler
- **Iterable** — supports `for...of` for simple sequential access
- **Deep copy in subclasses** — `get()` returns copies to prevent mutation of internal state

### 2. TextDataset — Causal LM Sample Generation

**Path:** `src/lib/minimind/data/TextDataset.ts`

Converts raw text corpora into causal language modeling training samples.

```typescript
interface TextSample {
  inputIds: number[];   // Model input token IDs [blockSize]
  targetIds: number[];  // Prediction targets [blockSize], shifted right by 1
}
```

#### Data Flow

```
Raw Text (string | string[])
  → MiniTokenizer.encode() per document
    → Concatenate (optional <eos> separator)
      → Chunk into blockSize-length samples
        → Shift by 1 for causal target
          → TextSample[]
```

#### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tokenizer` | `MiniTokenizer` | (required) | Dependency-injected tokenizer |
| `corpus` | `string \| string[]` | (required) | Single or multiple documents |
| `blockSize` | `number` | (required) | Sequence length per sample (≥ 2) |
| `insertEos` | `boolean` | `true` | Insert `<eos>` between documents |
| `stride` | `number` | `blockSize` | Step between samples (overlapping if < blockSize) |

#### Key Design Decisions

- **Dataset-level causal shift** — `targetIds[i] = tokens[i+1]` at dataset construction time, following PyTorch convention. Loss function operates on aligned pairs without internal shift logic.
- **Non-overlapping by default** — `stride` defaults to `blockSize` for standard pre-training behavior. Overlapping samples available via `stride < blockSize`.
- **Multi-document concatenation** — Documents joined with `<eos>` token separator, matching standard LLM pre-training practice.
- **Empty dataset on insufficient data** — If corpus is too small for even one sample, returns `length() === 0` instead of throwing, enabling dynamic corpus construction.
- **Immutable** — All samples computed at construction time; `get()` returns deep copies.

### 3. BatchSampler — Deterministic Index Sampling

**Path:** `src/lib/minimind/data/BatchSampler.ts`

Generates batches of indices for the DataLoader to collect from the Dataset.

```typescript
interface BatchSamplerOptions {
  batchSize: number;    // Samples per batch (> 0)
  shuffle?: boolean;    // Shuffle indices (default: false)
  seed?: number;        // PRNG seed for deterministic shuffle (default: 0)
  dropLast?: boolean;   // Drop incomplete last batch (default: true)
}
```

#### Deterministic PRNG

Uses **Mulberry32** — a simple 32-bit PRNG with 2³² period. Same `seed` always produces identical shuffle order, ensuring experiment reproducibility.

#### Fisher-Yates Shuffle

In-place O(n) shuffle using the deterministic PRNG. All indices 0..N-1 appear exactly once after shuffle.

#### Iteration Semantics

- Each `[Symbol.iterator]()` call creates a fresh iterator with independent index sequence
- Supports multiple epochs by re-iterating
- `numBatches` property for progress tracking

### 4. DataLoader<T> — Batch Iterator

**Path:** `src/lib/minimind/data/DataLoader.ts`

Coordinates Dataset and BatchSampler: uses sampler indices to gather samples from the dataset into batches.

```typescript
interface DataLoaderOptions {
  batchSize: number;
  shuffle?: boolean;
  seed?: number;
  dropLast?: boolean;
}
```

#### Composition Pattern

```
DataLoader
  ├── Dataset<T>      # Provides samples via get(index)
  └── BatchSampler    # Provides batch index arrays
```

#### Design Decisions

- **Lazy collection** — samples fetched on-demand during iteration, not pre-loaded
- **No collate function** — returns `T[]` (array of samples); consumer (training loop) handles tensor stacking. This keeps the DataLoader generic and type-safe.
- **Independent iterations** — each `[Symbol.iterator]()` call creates a new BatchSampler, supporting multiple epochs with different shuffles.

## Integration Points

### TensorMiniMindModel Training Path

The data module is designed for the Tensor backend training flow:

```
TextDataset → DataLoader → Training Loop
                              ↓
                    Tensor.fromArray(batch)
                              ↓
                    TensorMiniMindModel.forward()
                              ↓
                    CrossEntropyLoss (tensor version)
                              ↓
                    loss.backward() → optimizer.step()
```

### Non-Modification Guarantees

- **Playground / AI Lab UI** — Not modified
- **MiniMindModel (legacy)** — Not modified; `number[][]` path untouched
- **ToyDataset / Pretrainer** — Not modified; remains functional
- **pretrain/types.ts TrainingSample** — Not modified; data module uses its own `TextSample` type

## Testing

### Test Coverage (223 tests, all passing)

| Test Group | Tests | Key Verifications |
|-----------|-------|-------------------|
| Dataset | 6 | Constructor, length, get, iterator, empty dataset |
| TextDataset | 25+ | Sample count, token shifting, multi-doc, EOS, stride, validation, deep copy |
| BatchSampler | 20+ | Batch generation, dropLast, shuffle determinism, seed variation, numBatches |
| DataLoader | 15+ | Batch iteration, sizes, drop last, shuffle, multiple iterations |

### Key Test Verifications

- **Token shifting correctness** — `targetIds[i]` is the next token after `inputIds[i]`
- **Batch shapes** — correct batch and sample dimensions
- **Deterministic sampling** — same seed → identical order; different seeds → different order
- **EOS insertion** — `<eos>` token appears between documents when `insertEos=true`
- **Stride behavior** — overlapping samples when `stride < blockSize`
- **Immutability** — `get()` returns deep copies; modifications don't affect internal state

### Running Tests

```bash
# Data module standalone
npx tsx src/lib/minimind/data/__tests__/run.ts

# Full MiniMind suite (includes data module)
npx tsx src/lib/minimind/core/__tests__/run.ts
```

## Validation

- ✅ `npm run build` — compiles with zero errors
- ✅ All 223 data module tests pass
- ✅ Full MiniMind suite (1,069,179 tests) passes with 0 failures
- ✅ Zero new ESLint warnings or errors
- ✅ Existing modules unchanged (Playground, AI Lab UI, MiniMindModel, ToyDataset)

## Future Extensions

The Dataset abstraction enables future additions without architectural changes:

- **TensorDataset** — Wrap TextDataset output as Tensor batches for direct model consumption
- **Collate functions** — Custom batching logic (padding, truncation)
- **Streaming datasets** — Lazy-loading from files for large corpora
- **Data augmentation** — Token masking, permutation within the Dataset abstraction
- **Validation split** — Random or sequential train/val splitting via Dataset wrapper
