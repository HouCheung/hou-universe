# MiniMind Experience Layer — Design Spec

**Date:** 2026-07-29
**Phase:** 11.5
**Route:** `/ai-lab/experience`

## Purpose

Establish MiniMind's architecture visualization layer — a dedicated space to understand how all modules fit into the complete LLM pipeline. The Experience page is the architecture companion to the AI Lab dashboard, not a replacement for it.

## Components

### 1. ArchitectureOverview

**Role:** Educational introduction — why each layer exists, what problem it solves, in MiniMind-specific terms.

Three glass cards in a responsive grid (1→2→3 cols):

| Card | Content |
|------|---------|
| Tokenizer | Text→tokens. Why discrete tokens are the first step. MiniMind V1 Word Tokenizer specifics. |
| Embedding | Discrete→continuous. Why lookup tables for dense vectors. semantic space. |
| Transformer | Layer-by-layer processing. Attention + FFN + residual + LayerNorm. Why depth matters. |

**Data:** i18n keys under `minimind.experience.architecture.*`

### 2. MiniMindFlow

**Role:** Animated vertical flow of the complete MiniMind computation pipeline.

**FlowNode abstraction:**

| Node type | Examples | Source |
|-----------|----------|--------|
| `input` | Text Input | hardcoded — not in registry |
| `module` | Tokenizer, Embedding, RoPE, Attention, Transformer | `MINIMIND_MODULES` |
| `intermediate` | Token IDs | hardcoded — flow-only |
| `output` | Output | hardcoded — not in registry |

**Pipeline order:** Text Input → Tokenizer → Token IDs → Embedding → RoPE → Attention → Transformer → Output

**State derivation** (per node): reads `MINIMIND_MODULES[].implemented` and `status` for `module` nodes; `input`/`intermediate`/`output` nodes always `active`.

**Animation:** Staggered fade-in-up, one node per frame.

### 3. ModuleDependencyGraph

**Role:** Auto-generated dependency graph. Dependency level calculation + CSS grid + SVG connectors. No D3, no React Flow.

**Layout algorithm:**
1. Compute `level` for each module: `level = 0` if `dependencies` is empty, else `max(dep level) + 1`
2. Group modules by level → CSS grid rows
3. SVG overlay for connector lines between dependent modules

**Data:** `MINIMIND_MODULES[].metadata.dependencies`

### 4. LearningProgress

**Role:** Track per-module learning progress from roadmap data.

**Data pipeline:** `roadmap.ts` → `isMiniMindModuleNode()` → cross-reference with `MINIMIND_MODULES` → convert status to progress percentage.

**Helper function:**
```ts
function getModuleProgress(status: string, customPercent?: number): number
```
`completed=100`, `in-progress=50`, `upcoming=0`, overridable via `customPercent`.

## Constraints

- Do NOT modify existing AI Lab pages or sections
- Do NOT modify existing playground components
- Do NOT modify MiniTokenizer, CharacterTokenizer, MiniEmbedding, Pipeline
- Prefer extending `module-registry.ts` and `roadmap.ts` over new data sources
- All text via i18n (no hardcoded strings)
- Use existing cosmic theme, glass cards, Framer Motion patterns

## i18n keys (new)

```
minimind.experience.page.title, .page.description
minimind.experience.architecture.title, .description
minimind.experience.architecture.tokenizer.title, .description
minimind.experience.architecture.embedding.title, .description
minimind.experience.architecture.transformer.title, .description
minimind.experience.flow.title, .description
minimind.experience.flow.nodes.textInput, .tokenIds, .output
minimind.experience.dependencyGraph.title, .description
minimind.experience.progress.title, .description
```

## Verification

- `npm run build` — zero errors, zero warnings
- `npm run lint` — zero errors
- `npx tsc --noEmit` — zero errors
