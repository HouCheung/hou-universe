# MiniMind Experiment Lab — Design Spec

**Date:** 2026-07-30
**Phase:** 18
**Status:** design-approved

## Purpose

Introduce a new experiment layer — `experiment-registry.ts` — as the single source of truth for all MiniMind interactive experiments. Replace the scattered `experiments: string[]` arrays across multiple registry files with a centralized, structured registry that defines each experiment's metadata, lifecycle status, educational concepts, component path, and capability requirements.

## Architecture Context

MiniMind follows a 5-layer architecture:

```
Theory → Registry → Implementation → Trace → Visualization
```

The experiment registry sits in the **Registry** layer (`src/data/minimind/`), alongside the existing module registries and visualization capabilities. It is import-free, self-contained, and follows the same SSOT pattern as every other registry file in the directory.

### Relation to Existing Registries

**Replace & derive.** `experiment-registry.ts` becomes the SSOT for all experiment metadata. Two existing registries are modified to remove their `experiments: string[]` fields and instead derive experiment lists from `experiment-registry.ts` via helper functions:

| File | Change |
|------|--------|
| `module-registry.ts` | Remove `metadata.experiments[]`, add `getExperimentsByModule()` |
| `model-registry.ts` | Remove `experiments[]` from `ModelModule` entries, add `getModelExperiments()` |

Per-module registries (tokenizer, embedding, rope, attention, ffn, transformer) are **not modified** in this phase — their experiment lists are version-scoped and will be migrated in a follow-up cleanup pass.

## Interface Design

### Experiment Lifecycle

Experiments use `"active" | "planned" | "legacy"` — matching the per-module registry pattern (`TokenizerVersion.status`, `ModelModule.status`). An experiment is either live and interactive (`active`), designed but not yet built (`planned`), or superseded/retired (`legacy`).

### Experiment Capability Layer

A dedicated abstraction layer that neither directly exposes raw module API names nor reuses visualization-capability IDs alone. It has two dimensions:

- **`visualization`** — rendering features the experiment UI needs
- **`dataRequirements`** — runtime module API dependencies

```typescript
export interface ExperimentDataRequirement {
  /** Module id — matches MiniMindModule.id (e.g. "tokenizer", "attention") */
  module: string;
  /** Public API method names the experiment component calls at runtime */
  apis: string[];
}

export interface ExperimentCapabilityRequirement {
  /** Visualization feature identifiers needed for rendering */
  visualization: string[];
  /** Runtime module + API dependencies */
  dataRequirements: ExperimentDataRequirement[];
}
```

### Core Interface

```typescript
export interface MiniMindExperiment {
  /** Unique kebab-case identifier (e.g. "tokenizer-comparison-lab") */
  id: string;
  /** Human-readable display title */
  title: string;
  /** One-line summary of what the experiment demonstrates */
  description: string;
  /** Primary module this experiment belongs to (MiniMindModule.id) */
  relatedModule: string;
  /** Lifecycle status */
  status: "active" | "planned" | "legacy";
  /** Educational concepts this experiment teaches */
  concepts: string[];
  /** Path to the experiment UI component (null when not yet built) */
  componentPath: string | null;
  /** Capability requirements — rendering features + runtime API dependencies */
  requiredCapabilities: ExperimentCapabilityRequirement;
}
```

## Canonical Experiment Catalog

Four experiments are defined. All are `"planned"` — no UI implementation exists yet.

### 1. Tokenizer Comparison Lab

```typescript
{
  id: "tokenizer-comparison-lab",
  title: "Tokenizer Comparison Lab",
  description:
    "Side-by-side comparison of MiniTokenizer (word-level) and CharacterTokenizer (character-level). Encode the same input text with both strategies and compare token count, vocabulary coverage, and unknown token rate.",
  relatedModule: "tokenizer",
  status: "planned",
  concepts: [
    "Word Tokenization",
    "Character Tokenization",
    "Vocabulary Coverage",
    "Unknown Token Rate",
    "Sequence Length Trade-off",
  ],
  componentPath: null,
  requiredCapabilities: {
    visualization: ["token-list", "vocab-explorer"],
    dataRequirements: [
      {
        module: "tokenizer",
        apis: ["tokenize", "encode", "decode", "getVocabulary", "explain"],
      },
    ],
  },
}
```

### 2. Embedding Explorer

```typescript
{
  id: "embedding-explorer",
  title: "Embedding Explorer",
  description:
    "Interactive vector lookup and comparison tool. Look up any token's embedding vector, compute cosine similarity between token pairs, and explore the semantic relationships captured by the embedding space.",
  relatedModule: "embedding",
  status: "planned",
  concepts: [
    "Embedding Vector",
    "Cosine Similarity",
    "Semantic Space",
    "Vector Arithmetic",
    "Nearest Neighbor Search",
  ],
  componentPath: null,
  requiredCapabilities: {
    visualization: ["vector-viewer", "matrix-heatmap", "stats-panel"],
    dataRequirements: [
      {
        module: "embedding",
        apis: ["lookup", "getMatrixInfo", "getMatrix"],
      },
      {
        module: "tokenizer",
        apis: ["getVocabulary", "encode"],
      },
    ],
  },
}
```

### 3. Attention Heatmap Explorer

```typescript
{
  id: "attention-heatmap-explorer",
  title: "Attention Heatmap Explorer",
  description:
    "Deep-dive into attention patterns. Visualize full [numHeads × seqLen × seqLen] attention matrices, switch between heads to observe pattern diversity, and inspect raw attention scores before and after softmax.",
  relatedModule: "attention",
  status: "planned",
  concepts: [
    "Attention Matrix",
    "Head Diversity",
    "Causal Masking",
    "Softmax Temperature",
    "Attention Entropy",
  ],
  componentPath: null,
  requiredCapabilities: {
    visualization: ["attention-heatmap", "attention-head-diversity"],
    dataRequirements: [
      {
        module: "attention",
        apis: ["forward", "getAttentionTrace"],
      },
    ],
  },
}
```

### 4. Sampling Temperature Lab

```typescript
{
  id: "sampling-temperature-lab",
  title: "Sampling Temperature Lab",
  description:
    "Explore how temperature affects token prediction probabilities. Adjust temperature from 0.1 to 2.0, observe the probability distribution shift, and understand the exploration-exploitation trade-off in autoregressive generation.",
  relatedModule: "inference",
  status: "planned",
  concepts: [
    "Temperature Sampling",
    "Softmax Sharpening",
    "Probability Distribution",
    "Top-K Filtering",
    "Exploration vs Exploitation",
  ],
  componentPath: null,
  requiredCapabilities: {
    visualization: ["logits-histogram", "top-k-ranking", "probability-distribution"],
    dataRequirements: [
      {
        module: "model",
        apis: ["forward", "getLMHead", "getTokenizer"],
      },
    ],
  },
}
```

## Derivation Pattern

The two modified registries derive their experiment lists from `experiment-registry.ts`:

```typescript
// module-registry.ts — NEW helper, replaces metadata.experiments: string[]

import { MINIMIND_EXPERIMENTS } from "./experiment-registry";

export function getExperimentsByModule(moduleId: string): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.relatedModule === moduleId);
}
```

```typescript
// model-registry.ts — NEW helper, replaces MODEL_EXPERIMENTS: string[]

import { MINIMIND_EXPERIMENTS } from "./experiment-registry";

export function getModelExperiments(): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.relatedModule === "model");
}
```

No external consumers reference `metadata.experiments` — grep confirms zero matches outside the registry files themselves. The per-module `experiments[]` arrays are only consumed by their own internal `getAll*Experiments()` helpers and backward-compatibility `*_EXPERIMENTS` constants. This means the modifications to `module-registry.ts` and `model-registry.ts` are self-contained — no UI or component files need updating.

## File Plan

```
NEW FILES (1):

src/data/minimind/experiment-registry.ts    # SSOT — interfaces + canonical array + helpers
                                             # Import-free, self-contained
                                             # ~250 lines (estimated)

MODIFIED FILES (2):

src/data/minimind/module-registry.ts         # Remove metadata.experiments: string[]
                                             # from MINIMIND_MODULES entries
                                             # Add getExperimentsByModule() helper
                                             # Update consumers of experiments[] field

src/data/minimind/model-registry.ts          # Remove experiments: string[] from
                                             # each ModelModule entry
                                             # Add getModelExperiments() helper
                                             # Remove MODEL_EXPERIMENTS constant

NOT MODIFIED (all other files):

src/data/minimind/tokenizer-registry.ts      # experiments[] stays — version-scoped,
src/data/minimind/embedding-registry.ts      # follow-up migration
src/data/minimind/rope-registry.ts
src/data/minimind/attention-registry.ts
src/data/minimind/ffn-registry.ts
src/data/minimind/transformer-registry.ts
src/data/minimind/visualization-capabilities.ts  # Unchanged — experiment-registry
                                                  # references its feature IDs
src/lib/minimind/*                          # Zero changes to implementation layer
src/components/minimind/**                  # Zero changes to existing playgrounds
src/app/ai-lab/**                           # Zero route creation
```

## Dependency Analysis

```
experiment-registry.ts
  │
  │  IMPORTED BY:
  │
  ├── module-registry.ts
  │     └── getExperimentsByModule(moduleId) → MiniMindExperiment[]
  │         Replaces: metadata.experiments: string[]
  │         Consumers: MiniMindPlayground, ExperiencePageClient,
  │                     LearningProgress, RoadmapSection
  │
  ├── model-registry.ts
  │     └── getModelExperiments() → MiniMindExperiment[]
  │         Replaces: MODEL_EXPERIMENTS: string[]
  │         Consumers: (future) model playground, model docs
  │
  └── (future) experiment page route
        └── Reads experiment-registry directly to build
            the experiment browser / launcher UI

IMPORTED BY experiment-registry.ts:
  │
  └── NOTHING — import-free, matches all existing registry files
      All type interfaces are defined inline.
      Zero circular dependency risk.
```

## Implementation Order

| Step | File | Action | Depends on |
|------|------|--------|------------|
| 1 | `experiment-registry.ts` | Create — interfaces + canonical experiment array + lookup helpers | Nothing |
| 2 | `module-registry.ts` | Modify — remove `experiments[]`, add `getExperimentsByModule()` | Step 1 |
| 3 | `model-registry.ts` | Modify — remove `experiments[]`, add `getModelExperiments()` | Step 1 |

Steps 2 and 3 are independent and can be done in parallel.

## Constraints

1. Do NOT modify: Tokenizer, Embedding, RoPE, Attention, FFN, TransformerBlock, MiniMindModel, LM Head, ForwardVisualAdapter, existing playgrounds, AI Lab pages
2. Do NOT create new routes or UI components
3. Follow existing registry pattern: import-free, inline type interfaces, canonical array + lookup helpers
4. All 4 experiments start with `status: "planned"` and `componentPath: null`
5. `module-registry.ts` and `model-registry.ts` changes must be backward-compatible — existing consumers of `experiments[]` string arrays must be updated to use the new derivation helpers
6. TypeScript strict mode: no `any` types

## Future Compatibility

- **Per-module registry migration:** When experiments in per-module registries (tokenizer, embedding, etc.) need structured metadata, those version-scoped `experiments[]` arrays can be replaced with `getExperimentsByVersion(versionId)` helpers deriving from `experiment-registry.ts`
- **Experiment page route:** The existing `/ai-lab/experiments` placeholder page can read `MINIMIND_EXPERIMENTS` directly to render experiment cards filtered by status and module
- **Experiment launcher:** Each experiment card can deep-link to its dedicated playground route using `componentPath` once implemented
- **New experiments:** Add to `MINIMIND_EXPERIMENTS` array — automatically available to all consumers via lookup helpers

## Verification

- `npx tsc --noEmit` — zero errors
- `npm run lint` — zero errors
- `npm run build` — zero errors, zero warnings
- `getExperimentsByModule("tokenizer")` returns Tokenizer Comparison Lab
- `getExperimentsByModule("attention")` returns Attention Heatmap Explorer
- `getExperimentsByModule("inference")` returns Sampling Temperature Lab (inference module is `upcoming`, but its experiment is registered)
- All 4 experiments have valid `requiredCapabilities` with both `visualization` and `dataRequirements`
- Existing playground routes (`/ai-lab/playground`, `/ai-lab/playground/forward`, `/ai-lab/experience`) continue to render without errors
