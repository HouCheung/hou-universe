# MiniMind Forward Model — Design Spec

**Date:** 2026-07-29
**Phase:** 16
**Status:** approved

## Purpose

Combine Tokenizer, Embedding, RoPE, Transformer Blocks, and a new LM Head into a complete MiniMind Forward Architecture. The model orchestrates the full Text → Logits pipeline without reimplementing any sub-module.

## Architecture

```
src/lib/minimind/model/
├── types.ts           # ModelConfig, ModelInput, ModelOutput, ModelTrace
├── LMHead.ts           # MiniLMHead — hidden [dModel] → logits [vocabSize]
├── MiniMindModel.ts    # Composition root — orchestrates full pipeline
├── examples.ts         # "Hello HOU Universe" demo
└── index.ts            # Module exports
```

## Data Flow

```
Text → Tokenizer → Token IDs → Embedding → Vectors → RoPE → Transformer Blocks (×N) → LM Head → Logits
```

Each stage feeds the next; MiniMindModel orchestrates without duplicating any sub-module code.

## Components

### 1. types.ts — ModelConfig, ModelInput, ModelOutput, ModelTrace

`ModelConfig` extends the pattern of `TransformerConfig` with `vocabSize` and `numLayers`. `ModelTrace` captures per-block traces, final hidden states, and logits for visualization.

### 2. LMHead.ts — MiniLMHead

Simple linear projection: `hidden [dModel] × W [vocabSize × dModel]ᵀ → logits [vocabSize]`. No softmax (that belongs to inference/loss layers). API: `forward()`, `project()`, `getWeights()`.

### 3. MiniMindModel.ts — Orchestrator

Constructor receives config + all sub-module instances via dependency injection. `forward(text)` pipes through the chain. `getTrace()` exposes full intermediate state. Follows the same pattern as TransformerBlock (DI + orchestration).

### 4. examples.ts — Demo

Complete "Hello HOU Universe" walkthrough showing each stage's output.

### 5. Registry

- `src/data/minimind/model-registry.ts` — versioned entries V1–V5
- `src/data/minimind/module-registry.ts` — new model module entry

### 6. Theory doc

`docs/minimind/09-forward.md` — covers LLM Forward Pass, Hidden State Flow, Decoder-only Architecture, LM Head, Logits, Softmax Probability, and MiniMind complete data flow.

## Constraints

- Do NOT modify: Tokenizer, Embedding, RoPE, Attention, FFN, Transformer Block, AI Lab, existing Playground
- Follow existing code patterns: JSDoc + educational comments + DI
- All existing modules remain untouched

## Acceptance

- `npx tsc --noEmit` — no errors
- `npm run lint` — clean
- `npm run build` — no warnings
