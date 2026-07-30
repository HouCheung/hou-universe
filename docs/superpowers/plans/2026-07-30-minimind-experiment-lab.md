# MiniMind Experiment Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `experiment-registry.ts` as the SSOT for all MiniMind interactive experiments, and modify `module-registry.ts` + `model-registry.ts` to derive experiment lists from it.

**Architecture:** One new import-free registry file (`experiment-registry.ts`) defines the `MiniMindExperiment` interface, capability layer types, a canonical experiment array (4 experiments), and lookup helpers. Two existing registries remove their `experiments: string[]` fields and gain derivation helpers that import from the new SSOT.

**Tech Stack:** TypeScript (strict mode), zero dependencies, import-free registry pattern

## Global Constraints

- TypeScript strict mode — no `any` types
- Follow existing registry pattern: import-free (for new file), inline type interfaces, canonical array + lookup helpers
- All 4 experiments start with `status: "planned"` and `componentPath: null`
- Do NOT modify any existing file except `module-registry.ts` and `model-registry.ts`
- Do NOT create routes, UI components, or modify implementation layer
- `npm run build` must produce zero errors and zero warnings
- Per-module registries (tokenizer, embedding, rope, attention, ffn, transformer) are NOT modified

---

### Task 1: Create `experiment-registry.ts`

**Files:**
- Create: `src/data/minimind/experiment-registry.ts`

**Interfaces:**
- Produces:
  - `ExperimentDataRequirement` — `{ module: string; apis: string[] }`
  - `ExperimentCapabilityRequirement` — `{ visualization: string[]; dataRequirements: ExperimentDataRequirement[] }`
  - `MiniMindExperiment` — `{ id, title, description, relatedModule, status: "active"|"planned"|"legacy", concepts: string[], componentPath: string|null, requiredCapabilities: ExperimentCapabilityRequirement }`
  - `MINIMIND_EXPERIMENTS: MiniMindExperiment[]` — canonical array of 4 experiments
  - `getExperimentById(id: string): MiniMindExperiment | undefined`
  - `getExperimentsByModule(moduleId: string): MiniMindExperiment[]`
  - `getActiveExperiments(): MiniMindExperiment[]`
  - `getPlannedExperiments(): MiniMindExperiment[]`

- [ ] **Step 1: Create the complete file**

```typescript
// ============================================================
// MiniMind Experiment Registry — Single Source of Truth
// ============================================================
//
// This file is the canonical definition of every MiniMind
// interactive experiment. All consumers — module cards,
// experiment browser, playground launcher — MUST derive their
// experiment data from MINIMIND_EXPERIMENTS, never maintain
// their own copy.
//
// When an experiment's status changes, update it HERE and all
// views stay in sync automatically.
// ============================================================

// ============================================================
// Experiment Capability Layer
// ============================================================

/**
 * Runtime data dependency on a specific module's public API.
 * Declares which module methods an experiment component
 * needs to call at runtime.
 */
export interface ExperimentDataRequirement {
  /** Module id — matches MiniMindModule.id (e.g. "tokenizer", "attention") */
  module: string;
  /** Public API method names the experiment calls at runtime */
  apis: string[];
}

/**
 * Complete capability requirement for one experiment.
 *
 * visualization: rendering features the UI needs to support
 * dataRequirements: runtime module API dependencies
 *
 * The experiment registry owns this abstraction layer.
 * It does NOT directly expose raw module internals,
 * and it does NOT reuse visualization-capability IDs alone.
 */
export interface ExperimentCapabilityRequirement {
  /** Visualization feature identifiers needed for rendering */
  visualization: string[];
  /** Runtime module + API dependencies */
  dataRequirements: ExperimentDataRequirement[];
}

// ============================================================
// Experiment interface
// ============================================================

/**
 * Canonical experiment definition — the SSOT for all MiniMind
 * interactive experiments.
 *
 * When an experiment's status changes, update it HERE and all
 * views (module cards, experiment browser, playground launcher)
 * stay in sync automatically.
 */
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

// ============================================================
// Canonical experiment list — the ONLY place experiment data lives
// ============================================================

export const MINIMIND_EXPERIMENTS: MiniMindExperiment[] = [
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
  },
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
  },
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
  },
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
  },
];

// ============================================================
// Lookup helpers — convenience, not duplication
// ============================================================

/** O(1) lookup by experiment id */
export function getExperimentById(id: string): MiniMindExperiment | undefined {
  return MINIMIND_EXPERIMENTS.find((e) => e.id === id);
}

/** All experiments belonging to a specific module */
export function getExperimentsByModule(moduleId: string): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.relatedModule === moduleId);
}

/** Experiments that are currently live and interactive */
export function getActiveExperiments(): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.status === "active");
}

/** Experiments that are designed but not yet built */
export function getPlannedExperiments(): MiniMindExperiment[] {
  return MINIMIND_EXPERIMENTS.filter((e) => e.status === "planned");
}
```

- [ ] **Step 2: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: zero errors from the new file

- [ ] **Step 3: Commit**

```bash
git add src/data/minimind/experiment-registry.ts
git commit -m "feat(minimind): add experiment-registry — SSOT for MiniMind interactive experiments"
```

---

### Task 2: Modify `module-registry.ts` — remove `experiments[]`, add derivation helper

**Files:**
- Modify: `src/data/minimind/module-registry.ts`

**Interfaces:**
- Consumes: `MiniMindExperiment`, `getExperimentsByModule` from `src/data/minimind/experiment-registry` (but re-exports via its own helper)
- Produces: `getExperimentsByModule(moduleId: string): MiniMindExperiment[]` (new helper, replaces `metadata.experiments: string[]`)

- [ ] **Step 1: Remove `experiments` field from `MiniMindModuleMetadata` interface**

File: `src/data/minimind/module-registry.ts`

Replace:
```
  /** Named experiments available for this module */
  experiments?: string[];
```
With: (remove the two lines entirely — just delete them)

- [ ] **Step 2: Remove `experiments` from tokenizer entry (line ~89)**

Replace:
```
      experiments: ["word-vs-character"],
      dependencies: [],
```
With:
```
      dependencies: [],
```

- [ ] **Step 3: Remove `experiments` from embedding entry (line ~118)**

Replace:
```
      experiments: ["embedding-visualization", "semantic-similarity"],
      dependencies: ["tokenizer"],
```
With:
```
      dependencies: ["tokenizer"],
```

- [ ] **Step 4: Remove `experiments` from rope entry (lines ~151-157)**

Replace:
```
      experiments: [
        "frequency-analysis",
        "position-sensitivity",
        "rotation-visualization",
        "norm-invariance-verification",
        "relative-position-decay",
      ],
      dependencies: ["embedding"],
```
With:
```
      dependencies: ["embedding"],
```

- [ ] **Step 5: Remove `experiments` from attention entry (lines ~191-198)**

Replace:
```
      experiments: [
        "attention-heatmap",
        "head-diversity",
        "score-distribution",
        "weight-concentration",
        "causal-mask-verification",
        "qkv-similarity",
      ],
      dependencies: ["rope", "embedding"],
```
With:
```
      dependencies: ["rope", "embedding"],
```

- [ ] **Step 6: Remove `experiments` from ffn entry (lines ~231-237)**

Replace:
```
      experiments: [
        "activation-distribution",
        "gate-value-analysis",
        "dimension-importance",
        "token-wise-comparison",
        "swiglu-vs-relu-contrast",
      ],
      dependencies: ["attention"],
```
With:
```
      dependencies: ["attention"],
```

- [ ] **Step 7: Remove `experiments` from transformer entry (lines ~270-275)**

Replace:
```
      experiments: [
        "block-output-trace",
        "residual-flow-analysis",
        "norm-output-distribution",
        "attention-vs-ffn-output-comparison",
        "pre-norm-gradient-analysis",
      ],
      dependencies: ["ffn", "attention", "rope", "embedding"],
```
With:
```
      dependencies: ["ffn", "attention", "rope", "embedding"],
```

- [ ] **Step 8: Remove `experiments` from model entry (lines ~310-316)**

Replace:
```
      experiments: [
        "full-pipeline-trace",
        "hidden-state-evolution",
        "logit-distribution-analysis",
        "token-prediction-ranking",
        "embedding-vs-final-hidden-comparison",
      ],
      dependencies: ["transformer", "tokenizer"],
```
With:
```
      dependencies: ["transformer", "tokenizer"],
```

- [ ] **Step 9: Remove `experiments` from inference entry (lines ~345-349)**

Replace:
```
      experiments: [
        "sampling-comparison",
        "temperature-sweep",
        "repetition-penalty",
      ],
      dependencies: ["model", "transformer", "tokenizer"],
```
With:
```
      dependencies: ["model", "transformer", "tokenizer"],
```

- [ ] **Step 10: Add import for experiment types at top of file**

After the last existing comment block before the interface definitions, add:

```typescript
import type { MiniMindExperiment } from "./experiment-registry";
```

- [ ] **Step 11: Add `getExperimentsByModule` helper at end of file**

Append before the final line of the file:

```typescript
// ============================================================
// Experiment derivation — from experiment-registry SSOT
// ============================================================

/**
 * Get all experiments belonging to a specific module.
 *
 * Derives from experiment-registry.ts — the single source of truth
 * for all MiniMind experiment metadata. Replaces the deprecated
 * metadata.experiments: string[] field.
 */
export function getModuleExperiments(moduleId: string): MiniMindExperiment[] {
  const { getExperimentsByModule } = require("./experiment-registry");
  return getExperimentsByModule(moduleId);
}
```

Wait — actually, since experiment-registry.ts uses named exports and module-registry.ts already uses ES module syntax (it has `export` everywhere), let me use a proper import. But the issue is that existing module-registry.ts is import-free. Adding an import breaks that pattern... but that's the design we approved — module-registry derives from experiment-registry.

Actually, looking at this more carefully: `module-registry.ts` is currently import-free. But the spec says it should import from `experiment-registry.ts`. Since `experiment-registry.ts` is import-free, the dependency is one-directional: `experiment-registry ← module-registry`. No circular risk.

Let me fix Step 10 and 11 to use a proper ES import:

- [ ] **Step 10: Add import at top of file**

Add as the first line after the header comment block, before the first interface:

```typescript
import { getExperimentsByModule, type MiniMindExperiment } from "./experiment-registry";
```

- [ ] **Step 11: Add helper at end of file**

Append before the last line:

```typescript
// ============================================================
// Experiment derivation — from experiment-registry SSOT
// ============================================================

/**
 * Get all experiments belonging to a specific module.
 *
 * Derives from experiment-registry.ts — the single source of truth
 * for all MiniMind experiment metadata. Replaces the deprecated
 * metadata.experiments: string[] field on MiniMindModuleMetadata.
 */
export function getModuleExperiments(moduleId: string): MiniMindExperiment[] {
  return getExperimentsByModule(moduleId);
}
```

- [ ] **Step 12: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 13: Commit**

```bash
git add src/data/minimind/module-registry.ts
git commit -m "refactor(minimind): derive module experiments from experiment-registry SSOT"
```

---

### Task 3: Modify `model-registry.ts` — remove `experiments[]`, add derivation helper

**Files:**
- Modify: `src/data/minimind/model-registry.ts`

**Interfaces:**
- Consumes: `MiniMindExperiment`, `getExperimentsByModule` from `src/data/minimind/experiment-registry`
- Produces: `getModelExperiments(): MiniMindExperiment[]` (new helper, replaces `MODEL_EXPERIMENTS`)

- [ ] **Step 1: Remove `experiments` field from `ModelModule` interface**

File: `src/data/minimind/model-registry.ts`

Replace:
```
  /** Named experiments available for this module */
  experiments: string[];
```
With: (remove the two lines entirely — just delete them)

- [ ] **Step 2: Remove `experiments` from model-single-block entry**

Replace:
```
    experiments: [
      "full-pipeline-trace",
      "hidden-state-evolution",
      "logit-distribution-analysis",
      "token-prediction-ranking",
      "embedding-vs-final-hidden-comparison",
    ],
    features: V1_FEATURES.filter((f) =>
```
With:
```
    features: V1_FEATURES.filter((f) =>
```

- [ ] **Step 3: Remove `experiments` from model-multi-layer entry**

Replace:
```
    experiments: [
      "layer-wise-output-comparison",
      "attention-pattern-by-layer",
      "representation-similarity-matrix",
    ],
    features: [
```
With:
```
    features: [
```

- [ ] **Step 4: Remove `experiments` from model-lm-head entry**

Replace:
```
    experiments: [
      "temperature-sweep",
      "probability-entropy-analysis",
      "top-k-prediction-accuracy",
    ],
    features: [
```
With:
```
    features: [
```

- [ ] **Step 5: Remove `experiments` from model-generation entry**

Replace:
```
    experiments: [
      "sampling-strategy-comparison",
      "temperature-effect-on-diversity",
      "repetition-analysis",
    ],
    features: [
```
With:
```
    features: [
```

- [ ] **Step 6: Remove `experiments` from minimind-model entry**

Replace:
```
    experiments: [
      "full-model-forward-benchmark",
      "layer-wise-output-analysis-deep",
      "attention-pattern-evolution-8layer",
      "parameter-count-breakdown",
      "inference-speed-profiling",
    ],
    features: [
```
With:
```
    features: [
```

- [ ] **Step 7: Add import at top of file**

Add as the first line after the header comment block:

```typescript
import { getExperimentsByModule, type MiniMindExperiment } from "./experiment-registry";
```

- [ ] **Step 8: Replace `getAllModelExperiments()` function**

Replace:
```
/** All experiments across all Model modules, deduplicated */
export function getAllModelExperiments(): string[] {
  const seen = new Set<string>();
  for (const m of MODEL_MODULES) {
    for (const e of m.experiments) {
      seen.add(e);
    }
  }
  return Array.from(seen);
}
```
With:
```
/** All experiments related to the model module, from experiment-registry SSOT */
export function getAllModelExperiments(): MiniMindExperiment[] {
  return getExperimentsByModule("model");
}
```

- [ ] **Step 9: Replace `MODEL_EXPERIMENTS` backward-compat constant**

Replace:
```
/** Canonical experiment list from the active (V1) Model module */
export const MODEL_EXPERIMENTS: string[] =
  getActiveModelModule()?.experiments ?? [];
```
With:
```
/** Canonical experiment list for the model module, from experiment-registry SSOT */
export const MODEL_EXPERIMENTS: string[] =
  getAllModelExperiments().map((e) => e.id);
```

- [ ] **Step 10: TypeScript compile check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 11: Lint check**

Run: `npm run lint`
Expected: zero errors

- [ ] **Step 12: Full build**

Run: `npm run build`
Expected: zero errors, zero warnings

- [ ] **Step 13: Commit**

```bash
git add src/data/minimind/model-registry.ts
git commit -m "refactor(minimind): derive model experiments from experiment-registry SSOT"
```
