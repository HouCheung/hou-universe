# MiniMind Forward Visualization Layer — Design Spec

**Date:** 2026-07-29
**Phase:** 17
**Route:** `/ai-lab/playground/forward`
**Status:** design-approved

## Purpose

Build a two-level interactive visualization layer for the MiniMind complete forward pipeline. Users input text, run the full MiniMindModel.forward() pipeline, and explore every stage — from Tokenizer through LM Head — with both a high-level animated pipeline overview (Level 1) and per-stage deep-dive panels (Level 2).

All visualization data flows through a new adapter layer (`ForwardVisualAdapter`) that enriches the existing `ModelTrace` using only public module APIs. Zero modifications to core modules.

## Architecture

### Adapter Boundary

```
User Input (text)
     │
     ▼
ForwardVisualAdapter.enrich(inputText, model)   ← NEW (lib layer)
     │
     ├─ model.forward({ inputText })            ← existing, unchanged
     │  → ModelOutput { logits, hiddenStates, trace: ModelTrace }
     │
     ├─ model.getTokenizer().getVocabulary()        → token labels
     ├─ model.getEmbedding().getMatrixInfo()        → matrix metadata
     ├─ model.getRoPE().rotate()                    → per-head rotation traces
     ├─ model.getBlocks()[i].getAttention()         → AttentionTrace
     │     .getAttentionTrace()
     ├─ model.getBlocks()[i].getFFN()               → ActivationTrace
     │     .getActivationTrace()
     └─ model.getLMHead().getWeights()              → token prototype vectors
     │
     ▼
VisualTrace                                       ← NEW (data contract)
     │
     ▼
UI Components                                     ← NEW (components)
  ForwardPlayground → PipelineTimeline → Stage Viewers
```

### Key Design Principles

1. **UI never imports from `@/lib/minimind/model/`** — adapter is the sole bridge
2. **VisualTrace is the single data contract** between adapter and UI
3. **Every nullable field corresponds to a `VisualizationCapabilities` boolean** — no implicit checks
4. **Stage components receive typed slices** — `TokenizerStage` gets `VisualTrace.tokenizer`, never the full object
5. **Zero core module modifications** — all enrichment uses existing public APIs
6. **No second state management** — React useState + useCallback is sufficient
7. **All user-facing strings via i18n**

## Directory Structure

```
NEW FILES (24 files across 4 directories):

src/lib/minimind/visualization/         (4 files)
├── types.ts                         # VisualTrace + all stage data contracts
├── ForwardVisualAdapter.ts          # ModelTrace → VisualTrace enrichment
├── capabilities.ts                  # VisualizationCapabilities + defaults
└── index.ts                         # Barrel export

src/components/minimind/playground/forward/
├── ForwardPlayground.tsx            # State owner + orchestrator
├── ForwardHeader.tsx                # Title, version, description
├── InputPanel.tsx                   # Text input + "Run Forward" button
├── PipelineTimeline.tsx             # Level 1: animated stage flow
├── StageNode.tsx                    # Single clickable stage card
├── DeepDivePanel.tsx                # Level 2: stage detail container
├── stages/
│   ├── TokenizerStage.tsx           # Token grid + ID mapping
│   ├── EmbeddingStage.tsx           # Vector bars + stats
│   ├── RoPEStage.tsx                # 2D rotation viz + norm check
│   ├── TransformerStage.tsx         # Heatmap + residual flow + FFN gates
│   └── LMHeadStage.tsx              # Logits histogram + top-K ranking
├── shared/
│   ├── StageCard.tsx                # Reusable glass card wrapper
│   ├── VectorBarChart.tsx           # Thin vertical bar visualization
│   ├── HeatmapGrid.tsx              # Color-grid for attention/embeddings
│   ├── DistributionChart.tsx        # Histogram for logits/activations
│   ├── StatRow.tsx                  # Label + value stats row
│   └── CapabilityBadge.tsx          # Available/missing capability indicator
└── index.ts

src/app/ai-lab/playground/forward/
└── page.tsx                         # Route entry point

src/data/minimind/
└── visualization-capabilities.ts    # Stage capability metadata (extends registry pattern)

EXISTING FILES — UNCHANGED (all core modules + all registries + existing UI):
src/lib/minimind/model/*             # Core modules remain untouched
src/lib/minimind/tokenizer/*
src/lib/minimind/embedding/*
src/lib/minimind/rope/*
src/lib/minimind/attention/*
src/lib/minimind/ffn/*
src/lib/minimind/transformer/*
src/data/minimind/module-registry.ts  # No modification needed — visualization-capabilities.ts is additive
src/components/minimind/playground/MiniMindPlayground.tsx
src/app/ai-lab/playground/page.tsx
```

## Data Flow

```
ForwardPlayground (state owner)
  │
  │  state: { inputText, visualTrace: VisualTrace | null, selectedStageId: string | null }
  │
  ├─ ForwardHeader              ← static, i18n
  ├─ InputPanel                 ← controlled input + Run button
  │     │  onChange → setInputText
  │     │  onRun   → ForwardVisualAdapter.enrich(text) → setVisualTrace
  │     │
  ├─ PipelineTimeline           ← receives visualTrace (Level 1, always visible when trace exists)
  │     │
  │     └─ StageNode[]          ← one per stage, clickable, shows summary stat
  │           onClick → setSelectedStageId
  │
  └─ DeepDivePanel              ← receives visualTrace + selectedStageId (Level 2, conditional)
        │
        └─ {TokenizerStage | EmbeddingStage | RoPEStage | TransformerStage | LMHeadStage}
              each receives ONLY its typed slice of VisualTrace
```

### Component Ownership Rules

| Component | Receives | Owns |
|-----------|----------|------|
| ForwardPlayground | nothing (root) | inputText, visualTrace, selectedStageId |
| InputPanel | value, onChange, onRun | nothing (controlled) |
| PipelineTimeline | visualTrace | nothing (pure render) |
| StageNode | stageId, label, summary, isSelected, onClick, status | nothing |
| DeepDivePanel | visualTrace, stageId | nothing (delegates to stage component) |
| TokenizerStage | VisualTrace["tokenizer"] | expanded token index |
| EmbeddingStage | VisualTrace["embedding"] | selected token position |
| RoPEStage | VisualTrace["rope"] | selected head index |
| TransformerStage | VisualTrace["transformer"] | selected layer index, selected head |

## VisualTrace Data Contracts

### Core Enriched Trace

```typescript
interface VisualTrace {
  raw: ModelTrace;
  tokenizer: TokenizerVisualData;
  embedding: EmbeddingVisualData;
  rope: RoPEVisualData;
  transformer: TransformerVisualData[];
  lmHead: LMHeadVisualData;
  capabilities: VisualizationCapabilities;
}
```

### Stage 1: Tokenizer

```typescript
interface TokenizerVisualData {
  tokens: string[];
  tokenIds: number[];
  inputText: string;
  tokenDetails: TokenDetail[];
  vocabSize: number;
}

interface TokenDetail {
  token: string;
  id: number;
  exists: boolean;        // false → <unk> fallback
  isSpecial: boolean;     // <pad>/<unk>/<bos>/<eos>
}
```

**Data sources:** `ModelTrace.tokens`, `ModelTrace.tokenIds`, `ModelTrace.inputText`, `model.getTokenizer().getVocabulary()`

### Stage 2: Embedding

```typescript
interface EmbeddingVisualData {
  vectors: number[][];           // [seqLen][dModel]
  dModel: number;
  vectorStats: VectorStat[];     // per-position statistics
  matrixInfo: { vocabSize: number; embeddingDim: number; totalParameters: number };
}

interface VectorStat {
  tokenIndex: number;
  token: string;
  min: number;
  max: number;
  mean: number;
  l2Norm: number;
}
```

**Data sources:** `ModelTrace.embeddings`, `ModelTrace.tokens`, `model.getEmbedding().getMatrixInfo()`

### Stage 3: RoPE

```typescript
interface RoPEVisualData {
  before: number[][];                                   // [seqLen][dModel]
  after: number[][];                                    // [seqLen][dModel]
  rotationTraces: RoPERotationTrace[][];                // [seqLen][numHeads]
  ropeConfig: { headDim: number; numHeads: number; theta: number; maxSeqLen: number };
}

interface RoPERotationTrace {
  position: number;
  headIndex: number;
  normBefore: number;
  normAfter: number;
  normPreserved: boolean;
  sampledPairs: DimPairTrace[];   // max 8 pairs for visualization
}

interface DimPairTrace {
  dimPairIndex: number;
  evenDim: number;
  oddDim: number;
  before: [number, number];
  after: [number, number];
  angle: number;                 // radians
  frequency: number;
}
```

**Data sources:** `ModelTrace.embeddings` (before), `ModelTrace.rotatedEmbeddings` (after), `model.getRoPE().rotate()` per headDim slice (rotation traces)

### Stage 4: Transformer

```typescript
interface TransformerVisualData {
  layerIndex: number;
  overview: TransformerOverviewData;
  attention: AttentionVisualData | null;   // null when AttentionTrace unavailable
  ffn: FFNVisualData | null;              // null when ActivationTrace unavailable
}

interface TransformerOverviewData {
  seqLen: number;
  dModel: number;
  attentionInputNorm: number;
  attentionOutputNorm: number;
  afterAttentionResidualNorm: number;
  ffnInputNorm: number;
  ffnOutputNorm: number;
  afterFFNResidualNorm: number;
  tokenDeltas: number[];           // L2 norm of per-token change in this layer
}

interface AttentionVisualData {
  seqLen: number;
  numHeads: number;
  headDim: number;
  attentionWeights: number[][][];  // [numHeads][seqLen][seqLen]
  rawScores: number[][][];
  causalMaskApplied: boolean;
  headEntropies: number[];         // per-head entropy
}

interface FFNVisualData {
  seqLen: number;
  dFF: number;
  gateActivations: number[][];     // [seqLen][dFF]
  gatedHidden: number[][];
  activationSparsity: number[];    // fraction of gate values near zero per token
}
```

**Data sources:** `ModelTrace.blockTraces[i]` (overview), `block.getAttention().getAttentionTrace()` (attention), `block.getFFN().getActivationTrace()` (FFN)

### Stage 5: LM Head

```typescript
interface LMHeadVisualData {
  logits: number[];
  probabilities: number[];           // adapter-computed softmax
  topPredictions: TokenPrediction[]; // top-K with token labels
  distribution: LogitsDistribution;
  lastHiddenState: number[];
}

interface TokenPrediction {
  rank: number;
  tokenId: number;
  token: string;
  logit: number;
  probability: number;
}

interface LogitsDistribution {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  entropy: number;
}
```

**Data sources:** `ModelTrace.logits`, `ModelTrace.hiddenStates[last]`, `model.getLMHead().getWeights()`, `model.getTokenizer().getVocabulary()`

### Visualization Capabilities

```typescript
interface VisualizationCapabilities {
  tokenizer:  { tokenList: boolean; vocabExplorer: boolean };
  embedding:  { vectorViewer: boolean; matrixHeatmap: boolean; statsPanel: boolean };
  rope:       { rotation2DView: boolean; normCheck: boolean; frequencyChart: boolean };
  transformer: { attentionHeatmap: boolean; attentionHeadDiversity: boolean;
                 ffnGateDistribution: boolean; residualFlowChart: boolean };
  lmHead:     { logitsHistogram: boolean; topKRanking: boolean; probabilityDistribution: boolean };
}
```

All fields default to `false`. The adapter sets each to `true` only when the corresponding trace data is successfully obtained.

## ModelTrace Coverage Analysis

### Data Already in ModelTrace (passthrough)

| Field | Used by stage |
|-------|--------------|
| `inputText` | Tokenizer |
| `tokens[]` | Tokenizer, Embedding, LM Head (labels) |
| `tokenIds[]` | Tokenizer, Embedding |
| `embeddings[][]` | Embedding, RoPE (before) |
| `rotatedEmbeddings[][]` | RoPE (after) |
| `blockTraces[]` | Transformer (overview: norms, residuals, deltas) |
| `hiddenStates[][]` | LM Head (last hidden) |
| `logits[]` | LM Head |

### Data Accessed via Existing Public APIs (adapter enrichment)

| Data | API call | Used by |
|------|----------|---------|
| Vocabulary map | `model.getTokenizer().getVocabulary()` | Tokenizer (token details), LM Head (token labels) |
| Embedding matrix info | `model.getEmbedding().getMatrixInfo()` | Embedding (param count, dimensions) |
| Per-head rotation traces | `model.getRoPE().rotate(headVec, pos)` | RoPE (2D rotation pairs, norm check) |
| Attention weights + scores | `block.getAttention().getAttentionTrace()` | Transformer (heatmap, head diversity) |
| FFN gate activations | `block.getFFN().getActivationTrace()` | Transformer (gate distribution, sparsity) |
| LM Head weights | `model.getLMHead().getWeights()` | LM Head (token prototype similarity) |

### Data Genuinely Missing (future extensions only)

| Missing data | When needed |
|-------------|-------------|
| Full vocab × dModel embedding matrix heatmap | Advanced embedding explorer (V2) |
| Cross-layer representation similarity matrix | Multi-layer analysis (V2) |
| Cross-head attention pattern clustering | Attention research mode (future) |
| Gradient flow visualization | Training phase (future) |

None of these require core module changes — all are either computable from existing traces or would be added as new optional trace fields in future phases.

## Component Specifications

### Level 1: PipelineTimeline

Vertical animated flow rendered when `visualTrace` is non-null.

- 5 `StageNode` cards connected by animated connectors
- Each node shows: stage icon, name, summary stat (from the actual run), status indicator
- Click a node → `selectedStageId` set → Level 2 expands
- Click selected node again → deselect
- Animation: staggered fade-in using Framer Motion `Variants`, matching existing patterns

**Summary stats per stage:**
| Stage | Stat |
|-------|------|
| Tokenizer | "N tokens" |
| Embedding | "D-dim vectors" |
| RoPE | "H heads, θ=10000" |
| Transformer | "N layer(s)" |
| LM Head | "V vocab logits" |

### Level 2: DeepDivePanel

Renders when `selectedStageId` is non-null. Slides in below the timeline via `AnimatePresence`. Contains exactly one stage viewer.

**TokenizerStage:**
- Token grid: interactive pills (brand = known, amber = `<unk>`)
- Click pill → expand detail (ID, exists, isSpecial)
- Vocab context line: "N tokens in vocabulary"

**EmbeddingStage:**
- Position selector (dropdown: "Token 0: Hello", "Token 1: HOU", ...)
- VectorBarChart: thin bars, height=magnitude, color=sign (brand+/slate-)
- StatRow: min, max, mean, L2 norm
- Matrix context: params count

**RoPEStage:**
- Head selector dropdown
- Before/After side-by-side vector comparison
- 2D rotation plot: sampled pairs on unit circle (before → after = arc)
- Norm invariance: green ✓ + numeric diff

**TransformerStage:**
- Layer selector (tabs or dropdown)
- Attention heatmap (if capability present): color-intensity grid, hover tooltip
- Head diversity bar chart (per-head entropy)
- Residual flow horizontal bars: norm at each sub-stage
- FFN gate histogram (if capability present)
- Token delta: which tokens changed most

**LMHeadStage:**
- Logits histogram (DistributionChart)
- Top-K table: rank | token | logit | probability
- Distribution stats: min, max, mean, stdDev, entropy
- Probability bars for top 10 predictions

### Shared Components

| Component | Purpose | Input |
|-----------|---------|-------|
| `StageCard` | Glass card with hover/active states | title, icon, summary, status, onClick |
| `VectorBarChart` | Vertical bar visualization for vectors | number[], config |
| `HeatmapGrid` | Color-intensity grid for matrices | number[][], colorScale, cellSize |
| `DistributionChart` | Histogram bars | number[], bins, color |
| `StatRow` | Horizontal stat pills | { label, value }[] |
| `CapabilityBadge` | Available/missing indicator | available: boolean, label: string |

### UI Patterns (consistent with existing codebase)

- **Glass cards:** `rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm`
- **Section headers:** vertical gradient accent bar + title
- **Animations:** Framer Motion `Variants`, `whileInView`, `viewport: { once: true }`, staggered children
- **Icons:** lucide-react (matching existing: Sparkles, Construction, etc.)
- **Typography:** font-mono for data/numbers, font-sans for labels
- **Dark/light:** `dark:` variants on all glass cards
- **Cosmic background:** inherited from AI Lab layout (no additional background needed)

## Capability Metadata Registry

**File:** `src/data/minimind/visualization-capabilities.ts`

Extends the existing module-registry pattern. Declares per-stage visualization features with metadata:

```typescript
interface StageCapability {
  stageId: string;          // "tokenizer" | "embedding" | "rope" | "transformer" | "lm-head"
  label: string;
  order: number;            // display order in timeline
  summaryStatKey: string;   // which stat to show in Level 1
  features: VisualizationFeature[];
}

interface VisualizationFeature {
  id: string;               // e.g. "attention-heatmap"
  label: string;
  description: string;
  stageId: string;
  requiresTrace: boolean;   // does it need extra trace beyond ModelTrace?
  traceSource?: string;     // which trace provides it (e.g. "AttentionTrace")
}
```

**Integration:** Two-level capability check = design-time (`StageCapability.features`) × runtime (`VisualTrace.capabilities`). UI reads both to determine which sub-panels to render.

## Constraints

1. Do NOT modify: Tokenizer, Embedding, RoPE, Attention, FFN, TransformerBlock, MiniMindModel, LM Head, existing playground, AI Lab pages
2. Do NOT duplicate computation — adapter calls existing public APIs only
3. Do NOT introduce a second state management library
4. Follow existing code patterns: JSDoc + educational comments + DI + registry
5. VisualTrace contracts use explicit types — no `any`, no `Record<string, unknown>`, no duck-typing
6. All user-facing strings via i18n
7. All components use function components + TypeScript strict mode

## Future Compatibility

The adapter architecture is designed for extension:

- **Training visualization:** `TrainingVisualAdapter` can follow the same pattern — consume training traces, produce `VisualTrace` superset
- **Inference visualization:** `InferenceVisualAdapter` wraps `model.forward()` in a generation loop, produces per-step `VisualTrace[]`
- **New module versions:** Adapter checks `getAttentionTrace() !== null` — if a future version stops producing traces, the adapter gracefully degrades (null fields, capabilities set to false)
- **New visualization stages:** Add to `VisualTrace`, add to `STAGE_CAPABILITIES`, add stage component — no ripple effects

## Verification

- `npm run build` — zero errors, zero warnings
- `npm run lint` — zero errors
- `npx tsc --noEmit` — zero errors
- Route `/ai-lab/playground/forward` renders without layout shift
- All 5 pipeline stages have Level 1 summary and Level 2 detail
- Adapter produces valid VisualTrace with all capability flags correctly set
- TypeScript strict mode: no `any` types in any new file
