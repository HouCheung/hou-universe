# MiniMind Forward Visualization Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a two-level interactive visualization layer (`/ai-lab/playground/forward`) that runs the full MiniMindModel.forward() pipeline and renders both a high-level animated pipeline overview and per-stage deep-dive panels.

**Architecture:** A new `ForwardVisualAdapter` sits between the existing `MiniMindModel` and the UI layer, enriching `ModelTrace` with data from public module APIs (vocabulary, attention weights, FFN activations, RoPE rotation traces, LM head weights) into a typed `VisualTrace`. UI components consume only their typed slice of `VisualTrace` — never the model directly.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS, shadcn/ui, Framer Motion, lucide-react icons

## Global Constraints

- Zero modifications to `src/lib/minimind/model/*`, `tokenizer/*`, `embedding/*`, `rope/*`, `attention/*`, `ffn/*`, `transformer/*`
- Zero modifications to existing playground pages or AI Lab components
- No `any` types — strict TypeScript throughout
- All user-facing strings via i18n (`useTranslation`)
- Glassmorphism UI pattern: `border-brand/15 bg-brand/[0.03] backdrop-blur-sm`
- Framer Motion: `Variants` with `hidden/visible`, `whileInView`, `viewport: { once: true }`
- `npm run build` must pass with zero errors and zero warnings
- `npx tsc --noEmit` must pass with zero errors
- `npm run lint` must pass with zero errors

---

## File Structure Map

```
NEW: src/lib/minimind/visualization/          (4 files)
  types.ts, capabilities.ts, ForwardVisualAdapter.ts, index.ts

NEW: src/components/minimind/playground/forward/  (17 files)
  ForwardPlayground.tsx, ForwardHeader.tsx, InputPanel.tsx,
  PipelineTimeline.tsx, StageNode.tsx, DeepDivePanel.tsx, index.ts
  stages/ (5): TokenizerStage, EmbeddingStage, RoPEStage, TransformerStage, LMHeadStage
  shared/ (6): StageCard, VectorBarChart, HeatmapGrid, DistributionChart, StatRow, CapabilityBadge

NEW: src/app/ai-lab/playground/forward/page.tsx  (1 file)

NEW: src/data/minimind/visualization-capabilities.ts  (1 file)

UNCHANGED: All core modules, all registries, all existing UI
```

---

## Task Dependency Graph

```
Task 1 (types.ts) ─────────────────────────────────────────────────────────────┐
Task 2 (capabilities.ts) ──────────────────────────────────────────────────────┤
Task 3 (Adapter) ─── depends on Task 1, 2 ─────────────────────────────────────┤
Task 4 (barrel export: lib) ─── depends on Task 3 ─────────────────────────────┤
                                                                                │
Task 5 (StatRow + CapabilityBadge) ─── no deps ────────────────────────────────┤
Task 6 (VectorBarChart) ─── no deps ───────────────────────────────────────────┤
Task 7 (DistributionChart + HeatmapGrid) ─── no deps ──────────────────────────┤
Task 8 (StageCard) ─── no deps ────────────────────────────────────────────────┤
                                                                                │
Task 9 (TokenizerStage) ─── depends on Task 1, 5, 8 ───────────────────────────┤
Task 10 (EmbeddingStage) ─── depends on Task 1, 5, 6, 8 ───────────────────────┤
Task 11 (RoPEStage) ─── depends on Task 1, 5, 6, 8 ────────────────────────────┤
Task 12 (TransformerStage) ─── depends on Task 1, 5, 7, 8 ─────────────────────┤
Task 13 (LMHeadStage) ─── depends on Task 1, 5, 6, 7, 8 ───────────────────────┤
                                                                                │
Task 14 (StageNode + PipelineTimeline) ─── depends on Task 1 ──────────────────┤
Task 15 (ForwardHeader + InputPanel + DeepDivePanel) ─── depends on Task 1, 9-13┤
Task 16 (ForwardPlayground) ─── depends on Task 1-15 ──────────────────────────┤
Task 17 (Route + barrel export: UI) ─── depends on Task 16 ────────────────────┤
Task 18 (Capability registry) ─── no deps ─────────────────────────────────────┤
Task 19 (Final verification) ─── depends on all ───────────────────────────────┤
```

---

### Task 1: Visualization Types (`types.ts`)

**Files:** Create `src/lib/minimind/visualization/types.ts`

**Produces:** `VisualTrace`, `TokenizerVisualData`, `TokenDetail`, `EmbeddingVisualData`, `VectorStat`, `EmbeddingMatrixInfo`, `RoPEVisualData`, `RoPEConfigSummary`, `RoPERotationTrace`, `DimPairTrace`, `TransformerVisualData`, `TransformerOverviewData`, `AttentionVisualData`, `FFNVisualData`, `LMHeadVisualData`, `TokenPrediction`, `LogitsDistribution`, `VisualizationCapabilities` (+ sub-capability interfaces)

See spec Section 3 for the full interface definitions. Write all interfaces into this single file. Each interface must use explicit types with JSDoc comments in Chinese + English (matching existing codebase pattern).

- [ ] Create `types.ts` with all interfaces from the design spec Section 3
- [ ] Verify: `npx tsc --noEmit` — zero errors in this file
- [ ] Commit: `git add src/lib/minimind/visualization/types.ts && git commit -m "feat(minimind): add visualization data contracts"`

---

### Task 2: Capability Defaults (`capabilities.ts`)

**Files:** Create `src/lib/minimind/visualization/capabilities.ts`

**Consumes:** `VisualizationCapabilities` from `./types`
**Produces:** `DEFAULT_CAPABILITIES` constant — all capability flags set to `false`

```typescript
import type { VisualizationCapabilities } from "./types";

export const DEFAULT_CAPABILITIES: VisualizationCapabilities = {
  tokenizer:  { tokenList: false, vocabExplorer: false },
  embedding:  { vectorViewer: false, matrixHeatmap: false, statsPanel: false },
  rope:       { rotation2DView: false, normCheck: false, frequencyChart: false },
  transformer: { attentionHeatmap: false, attentionHeadDiversity: false,
                 ffnGateDistribution: false, residualFlowChart: false },
  lmHead:     { logitsHistogram: false, topKRanking: false, probabilityDistribution: false },
};
```

- [ ] Create `capabilities.ts` with DEFAULT_CAPABILITIES
- [ ] Verify: `npx tsc --noEmit`
- [ ] Commit

---

### Task 3: ForwardVisualAdapter

**Files:** Create `src/lib/minimind/visualization/ForwardVisualAdapter.ts`

**Consumes:** `MiniMindModel` from `../model/MiniMindModel`, `ModelTrace` from `../model/types`, all types from `./types`, `DEFAULT_CAPABILITIES` from `./capabilities`
**Produces:** `ForwardVisualAdapter.enrich(model, inputText)` → `VisualTrace`

Core implementation pattern:

```typescript
export class ForwardVisualAdapter {
  static enrich(model: MiniMindModel, inputText: string): VisualTrace {
    const output = model.forward({ inputText });
    const trace = output.trace;
    const config = model.getConfig();

    const tokenizer = this.enrichTokenizer(model, trace);
    const embedding = this.enrichEmbedding(model, trace);
    const rope = this.enrichRoPE(model, trace, config);
    const transformer = this.enrichTransformer(model, trace);
    const lmHead = this.enrichLMHead(model, trace);
    const capabilities = this.buildCapabilities(tokenizer, embedding, rope, transformer, lmHead);

    return { raw: trace, tokenizer, embedding, rope, transformer, lmHead, capabilities };
  }

  // Private static methods:
  // - enrichTokenizer(): model.getTokenizer().getVocabulary() → TokenDetail[]
  // - enrichEmbedding(): model.getEmbedding().getMatrixInfo() → VectorStat[]
  // - enrichRoPE(): model.getRoPE().rotate(headVec, pos) → RoPERotationTrace[][]
  // - enrichTransformer(): block.getAttention().getAttentionTrace(),
  //                        block.getFFN().getActivationTrace() → TransformerVisualData[]
  // - enrichLMHead(): model.getLMHead().getWeights(), softmax, entropy → LMHeadVisualData
  // - buildCapabilities(): sets flags based on enrichment success
  // - l2NormMatrix(), computeTokenDeltas(): math helpers

  // RoPE enrichment: iterate seqLen × numHeads, extract headDim slice from
  // trace.embeddings, convert to Float64Array, call rope.rotate(), collect
  // RotationResult.traces (sample max 8 pairs per head). Compute normBefore
  // and normAfter for the norm invariance check.

  // Transformer enrichment: wrap attention/FFN trace access in try/catch —
  // if getAttentionTrace() or getActivationTrace() returns null/throws,
  // set corresponding field to null (graceful degradation).

  // LM Head enrichment: compute softmax with numerical stability (subtract
  // maxLogit before exp), compute entropy, sort logits for top-10 ranking,
  // look up token labels via model.getTokenizer().getVocabulary().
}
```

- [ ] Create `ForwardVisualAdapter.ts` with full implementation (all 6 enrichment methods + buildCapabilities + math helpers)
- [ ] Verify: `npx tsc --noEmit` — zero errors
- [ ] Commit

---

### Task 4: Lib Barrel Export (`index.ts`)

**Files:** Create `src/lib/minimind/visualization/index.ts`

Re-export `ForwardVisualAdapter`, `DEFAULT_CAPABILITIES`, and all type exports from `./types`.

- [ ] Create barrel export
- [ ] Verify: `npx tsc --noEmit`
- [ ] Commit

---

### Task 5: Shared Components — StatRow + CapabilityBadge

**Files:** Create:
- `src/components/minimind/playground/forward/shared/StatRow.tsx`
- `src/components/minimind/playground/forward/shared/CapabilityBadge.tsx`

**StatRow:** Takes `{ items: { label, value }[], className? }`. Renders a flex-wrap row of glass pills. Numbers formatted: integers with locale string, floats to 4 decimal places. Uses `font-mono text-xs` for values.

**CapabilityBadge:** Takes `{ available: boolean, label: string, className? }`. Renders a rounded-full badge — emerald with CheckCircle2 when available, slate with XCircle when not. Text size `text-[0.6rem]`.

- [ ] Create both components
- [ ] Verify: `npx tsc --noEmit && npm run build`
- [ ] Commit

---

### Task 6: Shared Component — VectorBarChart

**Files:** Create `src/components/minimind/playground/forward/shared/VectorBarChart.tsx`

Adapts pattern from existing `EmbeddingVectorView`. Props: `{ data: number[], maxBars?: number, positiveColor?: string, negativeColor?: string, height?: number, className? }`. Renders thin (`w-[3px]`) Framer Motion animated bars. Height = abs(value) / absMax * containerHeight. Color by sign. Default: maxBars=128, height=120, positiveColor uses `--brand-rgb`, negativeColor=slate.

- [ ] Create VectorBarChart
- [ ] Verify build
- [ ] Commit

---

### Task 7: Shared Components — DistributionChart + HeatmapGrid

**Files:** Create:
- `src/components/minimind/playground/forward/shared/DistributionChart.tsx`
- `src/components/minimind/playground/forward/shared/HeatmapGrid.tsx`

**DistributionChart:** Props `{ data: number[], bins?: number, barColor?: string, height?: number, className? }`. Computes histogram bins, renders Framer Motion animated bars. Handle empty data with "No data" placeholder. Default: bins=30, height=140.

**HeatmapGrid:** Props `{ data: number[][], rows?, cols?, cellSize?: number, className? }`. Renders a CSS Grid of colored cells. Color intensity = value/absMax, brand for positive, slate for negative. Hover shows tooltip with [row,col] and value. Default: cellSize=16.

- [ ] Create both components
- [ ] Verify build
- [ ] Commit

---

### Task 8: Shared Component — StageCard

**Files:** Create `src/components/minimind/playground/forward/shared/StageCard.tsx`

Props: `{ children, title?, className? }`. Reusable glass card wrapper with the standard pattern: `rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm`, glow accent line at top, optional title rendered as `h3`.

- [ ] Create StageCard
- [ ] Verify build
- [ ] Commit

---

### Task 9: TokenizerStage

**Files:** Create `src/components/minimind/playground/forward/stages/TokenizerStage.tsx`

**Consumes:** `TokenizerVisualData` from `@/lib/minimind/visualization`
**Uses:** StageCard, StatRow

Renders: summary stats row (token count, vocab size), original text display, interactive token pills (brand = known, amber = `<unk>`), expandable detail panel on pill click (shows token, ID, exists flag, isSpecial flag). Pills use Framer Motion staggered animation (`delay: i * 0.05`).

- [ ] Create TokenizerStage
- [ ] Verify build
- [ ] Commit

---

### Task 10: EmbeddingStage

**Files:** Create `src/components/minimind/playground/forward/stages/EmbeddingStage.tsx`

**Consumes:** `EmbeddingVisualData`
**Uses:** StageCard, VectorBarChart, StatRow

Renders: matrix context stats (vocab×dim, params), token position selector (pill buttons, one per sequence position), VectorBarChart for selected position, per-vector stats row (min, max, mean, L2 norm).

- [ ] Create EmbeddingStage
- [ ] Verify build
- [ ] Commit

---

### Task 11: RoPEStage

**Files:** Create `src/components/minimind/playground/forward/stages/RoPEStage.tsx`

**Consumes:** `RoPEVisualData`
**Uses:** StageCard, VectorBarChart, StatRow, CapabilityBadge

Renders: rope config stats (heads, headDim, theta), position + head selectors (dropdown), side-by-side before/after VectorBarChart for selected head slice, norm invariance check (normBefore, normAfter, preserved flag), rotation pair cards showing 2D rotation details (before → after coordinates, angle, frequency).

- [ ] Create RoPEStage
- [ ] Verify build
- [ ] Commit

---

### Task 12: TransformerStage

**Files:** Create `src/components/minimind/playground/forward/stages/TransformerStage.tsx`

**Consumes:** `TransformerVisualData[]`
**Uses:** StageCard, HeatmapGrid, DistributionChart, StatRow, CapabilityBadge

Renders: layer selector (pill buttons), three-tab switcher:
- **Residual Flow tab:** StatRow of all 6 sub-stage norms, per-token L2 delta bars
- **Attention tab:** head selector, HeatmapGrid for selected head, head entropy bars (if attention trace available; otherwise CapabilityBadge "not available")
- **FFN tab:** dFF stat, gate activation DistributionChart (if FFN trace available; otherwise CapabilityBadge)

- [ ] Create TransformerStage
- [ ] Verify build
- [ ] Commit

---

### Task 13: LMHeadStage

**Files:** Create `src/components/minimind/playground/forward/stages/LMHeadStage.tsx`

**Consumes:** `LMHeadVisualData`
**Uses:** StageCard, DistributionChart, VectorBarChart, StatRow

Renders: distribution stats row (vocab size, min, max, mean, stdDev, entropy), logits DistributionChart, top-10 probability VectorBarChart, top-10 ranking table (rank | token | ID | logit | probability) with Framer Motion staggered row animation.

- [ ] Create LMHeadStage
- [ ] Verify build
- [ ] Commit

---

### Task 14: StageNode + PipelineTimeline

**Files:** Create:
- `src/components/minimind/playground/forward/StageNode.tsx`
- `src/components/minimind/playground/forward/PipelineTimeline.tsx`

**StageNode:** Props `{ stageId, label, summary, isSelected, isComputed, onClick, delay }`. Glass card button with status dot (emerald glow when computed, slate when pending), label + summary text, layoutId indicator for selected state. Framer Motion staggered entrance.

**PipelineTimeline:** Props `{ visualTrace, selectedStageId, onSelectStage }`. Derives 5 stage definitions from visualTrace (summary stats extracted from each stage's data). Renders vertical flow with SVG connector line (gradient, left-aligned) and 5 StageNodes. Section header with vertical accent bar.

- [ ] Create StageNode + PipelineTimeline
- [ ] Verify build
- [ ] Commit

---

### Task 15: ForwardHeader + InputPanel + DeepDivePanel

**Files:** Create:
- `src/components/minimind/playground/forward/ForwardHeader.tsx`
- `src/components/minimind/playground/forward/InputPanel.tsx`
- `src/components/minimind/playground/forward/DeepDivePanel.tsx`

**ForwardHeader:** Static component matching `MiniMindPlayground` header pattern — glass card, Sparkles icon, "MiniMind Learning Edition" label, "Forward Playground" title, description paragraph, "V1 Forward Model" version badge.

**InputPanel:** Props `{ value, onChange, onRun, isRunning }`. Textarea + "Run Forward" button (brand-colored, with Play/Loader2 icon). Ctrl+Enter shortcut. Example text chips ("Hello HOU Universe", "The quick brown fox", "MiniMind is a learning project").

**DeepDivePanel:** Props `{ visualTrace, stageId }`. Uses `AnimatePresence mode="wait"` to animate between stage viewers. Maps `stageId` to the correct stage component, passing the typed data slice.

- [ ] Create all three components
- [ ] Verify build
- [ ] Commit

---

### Task 16: ForwardPlayground

**Files:** Create `src/components/minimind/playground/forward/ForwardPlayground.tsx`

**State owner.** Creates a `MiniMindModel` instance via `useRef` (V1 config: vocabSize=1000, dModel=512, numHeads=8, headDim=64, dFF=2048, numLayers=1, maxSeqLen=128). Registers "Hello", "HOU", "Universe" in tokenizer vocabulary.

State: `{ inputText, visualTrace: VisualTrace | null, selectedStageId: string | null, isRunning, error }`.

`handleRun()`: calls `ForwardVisualAdapter.enrich(model, inputText.trim())`, catches errors, sets state.

Renders: ForwardHeader → InputPanel → (error banner if present) → PipelineTimeline + DeepDivePanel (when visualTrace exists).

Layout: `mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20` (matching existing playground pattern).

- [ ] Create ForwardPlayground
- [ ] Verify: `npx tsc --noEmit && npm run build`
- [ ] Commit

---

### Task 17: Route Page + UI Barrel Export

**Files:** Create:
- `src/components/minimind/playground/forward/index.ts`
- `src/app/ai-lab/playground/forward/page.tsx`

**Barrel export:** Re-export `ForwardPlayground`.

**Page:** Server component with `Metadata` export (title: "Forward Playground", description), renders `<ForwardPlayground />`.

- [ ] Create both files
- [ ] Verify: `npx tsc --noEmit && npm run lint && npm run build`
- [ ] Commit

---

### Task 18: Visualization Capability Registry

**Files:** Create `src/data/minimind/visualization-capabilities.ts`

Defines `STAGE_CAPABILITIES` array with 5 entries (tokenizer, embedding, rope, transformer, lm-head), each with `order`, `summaryStatKey`, and `features[]` (id, label, description, requiresTrace, traceSource?). Exports helper functions: `getStageCapability(id)`, `getStagesByOrder()`, `getFeaturesRequiringTrace()`.

This is additive — does not modify `module-registry.ts`. Cross-references module IDs independently.

- [ ] Create visualization-capabilities.ts
- [ ] Verify: `npx tsc --noEmit`
- [ ] Commit

---

### Task 19: Final Verification

- [ ] Full build: `npx tsc --noEmit && npm run lint && npm run build` → zero errors, zero warnings
- [ ] Verify all 24 new files exist across 4 directories
- [ ] Verify zero core module changes: `git diff --name-only HEAD~18 -- src/lib/minimind/tokenizer/ src/lib/minimind/embedding/ src/lib/minimind/rope/ src/lib/minimind/attention/ src/lib/minimind/ffn/ src/lib/minimind/transformer/ src/lib/minimind/model/` → no output
- [ ] Verify route is buildable: page at `/ai-lab/playground/forward` compiles without errors
- [ ] Final fixup commit if needed
