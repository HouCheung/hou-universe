# MiniMind Inference Runtime — Design Spec

**Date:** 2026-07-30
**Phase:** 21
**Route:** `/ai-lab/playground/inference` (future)
**Status:** design-approved

## Purpose

Design a pure-library inference runtime for MiniMind that enables autoregressive text generation. The `InferenceEngine` wraps `MiniMindModel` via dependency injection — using `model.forward()` for prompt processing and model sub-module accessors for per-token generation with KV cache. Zero modifications to existing model modules.

## Architecture Overview

### Design Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Forward interaction | Hybrid: `model.forward()` for prompt (step 0), sub-module accessors + KV cache for generation (steps 1..N) |
| Generation trace | Hybrid: full `ModelTrace` for step 0, lightweight `GenerationStep` for gen steps, full traces in debug mode |
| KV Cache design | Standard K/V tensors `[numLayers][numHeads][seqLen][headDim]` + inspectable `PositionMetadata` per position |
| Sampler design | Strategy pattern: `GreedySampler`, `TemperatureSampler`, `TopKSampler`, `TopPSampler` composed via `Sampler` orchestrator |
| Engine structure | Orchestrator + specialized modules (`KVCache`, `Sampler`, `GenerationLoop`) — matches existing codebase patterns |

### Approach: Orchestrator + Specialized Modules

`InferenceEngine` is a thin composition root that delegates to three specialized modules. Each module is a single file, independently testable, and injected.

```
InferenceEngine (composition root)
  ├── MiniMindModel            (DI, for prompt processing step)
  ├── KVCache                  (per-layer K/V tensors + metadata)
  ├── Sampler                  (strategy pipeline: temp → topK → topP → select)
  └── GenerationLoop           (step controller, stop-condition evaluator)
```

## Directory Structure

```
src/lib/minimind/inference/           (8 files, all NEW)
├── types.ts                          # All inference type definitions
├── InferenceEngine.ts                # Composition root / orchestrator
├── KVCache.ts                        # Per-layer K/V tensors + inspectable metadata
├── Sampler.ts                        # Strategy pipeline orchestrator
├── strategies/
│   ├── GreedySampler.ts              # Argmax / probabilistic selection
│   ├── TemperatureSampler.ts         # Logits / T → softmax
│   ├── TopKSampler.ts                # Keep top-K, mask rest
│   └── TopPSampler.ts                # Keep nucleus (cumulative ≥ P), mask rest
├── GenerationLoop.ts                 # Step controller + stop conditions
└── index.ts                          # Barrel export

EXISTING FILES — ZERO MODIFICATIONS:
src/lib/minimind/model/*              # Untouched
src/lib/minimind/transformer/*        # Untouched
src/lib/minimind/attention/*          # Untouched
src/lib/minimind/ffn/*                # Untouched
src/lib/minimind/rope/*               # Untouched
src/lib/minimind/embedding/*          # Untouched
src/lib/minimind/tokenizer/*          # Untouched
src/data/minimind/module-registry.ts  # Already has "inference" entry (status: "upcoming")
```

## Module Responsibilities

| Module | Responsibility | Depends on |
|--------|---------------|------------|
| `types.ts` | All interfaces: `InferenceConfig`, `GenerationStep`, `GenerationTrace`, `SamplingStrategy`, `KVCacheEntry`, `StopCondition`, `GenerationResult` | Nothing |
| `InferenceEngine.ts` | Composition root. Accepts `MiniMindModel` via DI. Orchestrates prompt processing → generation loop. Exposes `generate(prompt, config) → AsyncGenerator<GenerationStep>`. | Model (DI), KVCache, Sampler, GenerationLoop |
| `KVCache.ts` | Stores `[numLayers][numHeads][seqLen][headDim]` K and V tensors. Metadata per position: token string, position index, per-head entropy. `get()`, `append()`, `clear()`, `getMetadata()`. | Nothing (pure data structure) |
| `Sampler.ts` | Accepts logits + `SamplingConfig`. Runs pipeline: temperature → topK → topP → select. Returns `{ tokenId, probability, logit, alternatives }`. Delegates to strategy classes. | Strategy classes |
| `strategies/*.ts` | Each implements `SamplingStrategy` interface: `id`, `name`, `apply(logits, config) → LogitsTransformResult`. Isolated, testable, educable. | Nothing |
| `GenerationLoop.ts` | Step controller. Each step: embed new token → RoPE → per-layer forward with KVCache → LMHead → sample. Evaluates stop conditions. Collects `GenerationTrace`. | KVCache, Sampler, model sub-modules (via accessors) |
| `index.ts` | Barrel export. Re-exports all public types and classes. | All above |

## Data Flow

### Step 0 — Prompt Processing

```
model.forward({ inputText: prompt })
  → ModelOutput { logits, hiddenStates, trace }

Record: GenerationStep[0] with full ModelTrace

Extract K/V → populate KVCache:
  for each layer i:
    trace.blockTraces[i].normedForAttention
      × attention.getWeight("K") → K_proj [seqLen][dModel]
      × attention.getWeight("V") → V_proj [seqLen][dModel]
    splitIntoHeads(K_proj) → K_heads [numHeads][seqLen][headDim]
    splitIntoHeads(V_proj) → V_heads [numHeads][seqLen][headDim]
    store in KVCache[i] with PositionMetadata

1st token = sampler.sample(step0.logits, config.sampling)
```

### Steps 1..N — Autoregressive Generation

```
for each step:

  ① EMBED new token only:
    embedding.getEmbeddings([prevTokenId]) → [1][dModel]

  ② RoPE (single position):
    rope.rotate(headVec, position) per head → [dModel]

  ③ PER-LAYER FORWARD (for each block i):

    a) RMSNorm.preAttention(hidden)

    b) ATTENTION with KV Cache:
       Q   = normed × W_Q → splitIntoHeads → [H][1][hd]
       K_new = normed × W_K → splitIntoHeads → [H][1][hd]
       V_new = normed × W_V → splitIntoHeads → [H][1][hd]

       K_full[h] = concat(cache[layer].K[h], K_new[h])
       V_full[h] = concat(cache[layer].V[h], V_new[h])

       attn[h] = scaledDotProductAttention(Q[h], K_full[h], V_full[h])

       cache[layer].append(K_new[h], V_new[h])  ← UPDATE

    c) mergeFromHeads → W_O projection → [1][dModel]

    d) Residual: x = x + attnOutput

    e) RMSNorm.preFFN(x) → FFN.forward() → residual

  ④ LM HEAD:
    lmHead.forward(hidden) → logits [vocabSize]

  ⑤ SAMPLE:
    sampler.sample(logits, config.sampling) → { tokenId, probability, alternatives }

  ⑥ RECORD GenerationStep (lightweight)
    if debug: also capture full per-step trace

  ⑦ CHECK STOP:
    maxTokens? EOS? stopSequence? → break or continue
```

### Return

```
GenerationResult {
  text: "Hello World, ...",        // prompt + generated
  tokensGenerated: 4,
  stopReason: "eosToken",
  trace: GenerationTrace { promptTrace, steps, finalCache, durationMs }
}
```

## Core Interfaces

### Configuration

```typescript
interface InferenceConfig {
  /** Maximum tokens to generate (excluding prompt). Default 20. */
  maxTokens: number;
  /** Sampling parameters — delegated to Sampler pipeline */
  sampling: SamplingConfig;
  /** Stop conditions — generation halts when ANY condition fires */
  stopConditions: StopCondition[];
  /** When true, capture full per-step ModelTraces. Default false. */
  debug: boolean;
  /** Random seed for reproducible generation. Omit for non-deterministic. */
  seed?: number;
}

interface SamplingConfig {
  /** Temperature — higher = more random. 0 = greedy (argmax). Default 1.0. */
  temperature: number;
  /** Top-K — keep only K highest logits. 0 = disabled. Default 0. */
  topK: number;
  /** Top-P (nucleus) — keep smallest set with cumulative prob ≥ P. 1.0 = disabled. Default 1.0. */
  topP: number;
}

interface StopCondition {
  type: "maxTokens" | "eosToken" | "tokenId" | "custom";
  tokenId?: number;
  predicate?: (generatedIds: number[]) => boolean;
}
```

### KV Cache

```typescript
interface KVCacheEntry {
  layerIndex: number;
  k: number[][][]; // [numHeads][cachedSeqLen][headDim]
  v: number[][][]; // [numHeads][cachedSeqLen][headDim]
  metadata: PositionMetadata[];
}

interface PositionMetadata {
  position: number;
  token: string;
  tokenId: number;
  headEntropies: number[] | null;
}
```

### Generation Trace

```typescript
interface GenerationTrace {
  prompt: string;
  promptTrace: ModelTrace;           // Full trace from step 0
  steps: GenerationStep[];           // One per generated token
  finalCache: KVCacheEntry[];        // Final KV cache for inspection
  durationMs: number;
}

interface GenerationStep {
  stepIndex: number;
  token: string;
  tokenId: number;
  probability: number;
  alternatives: TokenAlternative[];  // Top-K alternatives at this step
  debugTrace?: ModelTrace;           // Only when config.debug === true
  cacheState?: CacheSnapshot;        // KVCache metadata snapshot
}

interface TokenAlternative {
  rank: number;
  tokenId: number;
  token: string;
  logit: number;
  probability: number;
}

interface CacheSnapshot {
  cachedSeqLen: number;
  layerEntropyAverages: number[];
}

interface GenerationResult {
  text: string;
  tokensGenerated: number;
  stopReason: string | null;
  trace: GenerationTrace;
}
```

### Sampler Strategy Interface

```typescript
interface SamplingStrategy {
  readonly id: string;
  readonly name: string;
  apply(logits: number[], config: SamplingConfig): LogitsTransformResult;
}

interface LogitsTransformResult {
  logits: number[];
  maskedIndices: number[];
  description: string;
}
```

## Sampler Pipeline

Strategies execute in fixed order:

```
logits
  → TemperatureSampler  (logits /= T, T=0 → greedy shortcut)
  → TopKSampler         (keep top-K, mask rest to -∞)
  → TopPSampler         (softmax → cumsum ≥ P, mask rest)
  → GreedySampler       (argmax, or sample from distribution if earlier strategies active)
  → { tokenId, probability, alternatives }
```

### Each Strategy

| Strategy | T=0 behavior | T>0 behavior | Description example |
|----------|-------------|--------------|-------------------|
| TemperatureSampler | Shortcut: return greedy | Scale logits by 1/T | `"Scaled by T=0.8"` |
| TopKSampler | No-op (already greedy) | Keep top K, mask rest | `"Kept top 40, masked 960"` |
| TopPSampler | No-op | Softmax → nucleus filtering | `"Nucleus P=0.95 kept 27"` |
| GreedySampler | Argmax of raw logits | Sample from softmax distribution | `"Sampled token 42 (P=0.31)"` |

## InferenceEngine Public API

```typescript
class InferenceEngine {
  constructor(model: MiniMindModel);

  /** Autoregressive generation — yields tokens one at a time */
  generate(prompt: string, config: InferenceConfig): AsyncGenerator<GenerationStep>;

  /** Get the underlying model instance */
  getModel(): MiniMindModel;

  /** Get the KV cache (for inspection/visualization) */
  getCache(): KVCacheEntry[];

  /** Get the last generation trace */
  getTrace(): GenerationTrace | null;
}
```

## Constraints

1. **Do NOT modify** any existing module: Tokenizer, Embedding, RoPE, Attention, FFN, TransformerBlock, MiniMindModel, LMHead, visualization, experiments
2. **Dependency injection** — InferenceEngine receives MiniMindModel via constructor
3. **Independent from React** — no hooks, no JSX, no browser APIs. Pure TypeScript library.
4. **Registry pattern consistency** — update `module-registry.ts` inference entry status from `"upcoming"` to `"in-progress"` when implementation begins
5. **Educational transparency** — every pipeline step produces a human-readable description; KV cache is inspectable; sampler strategies log their actions
6. **All types explicit** — no `any`, no `Record<string, unknown>`, no index signatures
7. **Two internal utilities only** — `splitIntoHeads()` and `mergeFromHeads()` recreated in inference module (10-line array reshape helpers, not exported from MiniAttention where they are private)

## Implementation Phases

### Phase 21a: Types
**File:** `src/lib/minimind/inference/types.ts`
All interfaces and type definitions. Zero dependencies on other inference files.

### Phase 21b: Sampler Strategies
**Files:**
- `src/lib/minimind/inference/strategies/GreedySampler.ts`
- `src/lib/minimind/inference/strategies/TemperatureSampler.ts`
- `src/lib/minimind/inference/strategies/TopKSampler.ts`
- `src/lib/minimind/inference/strategies/TopPSampler.ts`
- `src/lib/minimind/inference/Sampler.ts`

Each strategy is independently testable. Sampler orchestrator composes them.

### Phase 21c: KV Cache
**File:** `src/lib/minimind/inference/KVCache.ts`
Per-layer K/V tensor storage with metadata. Pure data structure — no model dependencies.

### Phase 21d: GenerationLoop
**File:** `src/lib/minimind/inference/GenerationLoop.ts`
Step controller. Uses model sub-module accessors for per-step forward. Manages stop conditions. Depends on KVCache and Sampler.

### Phase 21e: InferenceEngine
**File:** `src/lib/minimind/inference/InferenceEngine.ts`
Composition root. Accepts MiniMindModel via DI. Exposes `generate()` async generator.

### Phase 21f: Barrel Export + Registry
**Files:**
- `src/lib/minimind/inference/index.ts`
- Update `src/data/minimind/module-registry.ts` inference entry: `status: "in-progress"`, `implemented: true`

### Phase 21g (future): InferenceVisualAdapter
**File:** `src/lib/minimind/visualization/InferenceVisualAdapter.ts`
Wraps `InferenceEngine.generate()` to produce per-step `VisualTrace[]` for the forward visualization pattern. Follows same adapter pattern as `ForwardVisualAdapter`.

### Phase 21h (future): Inference Playground UI
**Files:** `src/components/minimind/playground/inference/`
UI components for interactive text generation with streaming token display, sampler configuration, and KV cache visualization.

## Verification

- `npm run build` — zero errors, zero warnings
- `npm run lint` — zero errors
- `npx tsc --noEmit` — zero errors
- All sampler strategies have unit test coverage
- KVCache append/clear/get round-trip is correct
- Generation produces non-empty text for valid prompts
- Stop conditions fire correctly
- Debug mode captures full per-step traces
- TypeScript strict mode: no `any` types in any new file
- Zero modifications to existing modules confirmed via git diff

## Future Compatibility

- **Inference visualization:** `InferenceVisualAdapter` wraps generation loop → per-step `VisualTrace[]`
- **Multi-layer model:** Inference already supports `numLayers > 1` via the per-layer loop in `GenerationLoop`
- **Beam search:** New `BeamSampler` strategy implementing `SamplingStrategy` — no other files change
- **Model versions:** `InferenceEngine` uses public accessor API — works with any future `MiniMindModel` that maintains the same public interface
