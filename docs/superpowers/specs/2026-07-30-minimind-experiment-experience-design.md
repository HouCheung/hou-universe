# MiniMind Experiment Experience Layer — Design Spec

**Date:** 2026-07-30
**Phase:** 20
**Route:** `/ai-lab/experiments`
**Status:** design-approved

## Purpose

Build the Experiment Experience Layer — the UI surface that exposes the Phase 19 Experiment Runtime to users. This is the final layer in the MiniMind architecture stack:

```
Theory → Registry → Implementation → Trace → Visualization → Experiment Runtime → Experiment Experience
```

Users discover experiments from the registry, provide input, run them, and explore results — all within a Hub + Workspace single-route architecture.

## Design Decisions (from brainstorming)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Routing | Single route `/ai-lab/experiments` | Registry is SSOT; experiments are dynamically discovered, not route-bound |
| Renderer dispatch | Discriminated union switch | Keeps `lib/` React-free; matches ForwardPlayground pattern; only 4 experiments today |
| Shared viz reuse | Import directly from `forward/shared/` | Zero-risk; avoids touching working playground code |
| Spatial layout | Hub → full-screen Workspace transition | Results need full width (heatmaps, side-by-side tables); matches existing back-button pattern |

## Architecture

### Full Stack

```
                        ┌──────────────────────┐
                        │  experiment-registry  │  SSOT (Phase 18)
                        │  MINIMIND_EXPERIMENTS │
                        └──────────┬───────────┘
                                   │ reads
                        ┌──────────▼───────────┐
                        │  ExperimentsPageClient │  State owner
                        │  view: hub | workspace │
                        │  selectedExperimentId  │
                        │  result                 │
                        └──────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼────────┐  ┌────────▼───────────┐
     │  ExperimentHub   │  │ ExperimentWorkspace│  │ ExperimentResult   │
     │  (card grid)     │  │ (input + run +    │  │ Renderer            │
     │                  │  │  result area)     │  │ (switch dispatch)   │
     └─────────────────┘  └──────────────────┘  └────────────────────┘
                                                          │
                                   ┌──────────────────────┼──────────────────────┐
                                   │                      │                      │
                          ┌────────▼────────┐  ┌─────────▼────────┐  ┌──────────▼──────────┐
                          │ TokenizerCompare │  │ EmbeddingExplorer│  │ AttentionHeatmap    │
                          │ Result           │  │ Result           │  │ Result              │
                          └─────────────────┘  └──────────────────┘  └─────────────────────┘
```

### Data Flow

1. **Page mount** → `ExperimentsPageClient` reads `MINIMIND_EXPERIMENTS` from registry
2. **Hub view** → renders `ExperimentHub` (card grid filtered by status)
3. **User clicks card** → `selectedExperimentId` set → transitions to Workspace view
4. **Workspace view** → reads experiment definition, renders `ExperimentInputPanel`
5. **User fills input + clicks Run** →
   - `createExperimentContext(experiment)` → `ExperimentContext`
   - `runExperiment(experimentId, context, input)` → `ExperimentResult<TData>`
6. **Result arrives** → `ExperimentResultRenderer` switch-dispatches to correct renderer
7. **Renderer** receives typed `data`, renders using shared visualization primitives

### Runtime Independence Boundary

```
UI Layer (React)                    Runtime Layer (Pure TS)
─────────────────                   ──────────────────────
ExperimentsPageClient ──reads──▶    MINIMIND_EXPERIMENTS
       │                                  │
       │                           createExperimentContext()
       │                                  │
       └──calls──▶                runExperiment()
                                          │
       ◀──returns──              ExperimentResult<TData>
       │
ExperimentResultRenderer
```

No React import in `lib/minimind/experiments/`. The boundary is `ExperimentResult<TData>` — a plain value object crossing from runtime into UI.

## Directory Structure

```
NEW FILES (8 files across 3 directories):

src/components/minimind/experiments/
├── ExperimentsPageClient.tsx        # State owner + view switcher (Hub ↔ Workspace)
├── ExperimentHub.tsx                # Grid of ExperimentCards, reads registry
├── ExperimentCard.tsx               # Single experiment card (icon, title, concepts, status badge)
├── ExperimentWorkspace.tsx          # Input + Run + Result container + Back button
├── ExperimentInputPanel.tsx         # Dynamic input form (text, mode selector, sequence input)
├── ExperimentResultRenderer.tsx     # Switch dispatcher → correct result component
├── results/
│   ├── TokenizerComparisonResult.tsx  # Side-by-side token table + metrics
│   ├── EmbeddingExplorerResult.tsx    # Vector bars + similarity card
│   └── AttentionHeatmapResult.tsx     # Per-head heatmap grid + diversity chart
└── index.ts                         # Barrel export

MODIFIED FILES (2 files):

src/app/ai-lab/experiments/page.tsx          # Replace SubRoutePlaceholder → ExperimentsPageClient
src/data/minimind/experiment-registry.ts     # Update experiment.status "planned" → "active"
                                             # + set componentPath for 3 experiments

EXISTING FILES — UNCHANGED:

src/lib/minimind/experiments/               # Zero changes — runtime stays React-free
src/lib/minimind/experiments/types.ts
src/lib/minimind/experiments/ExperimentContext.ts
src/lib/minimind/experiments/ExperimentRunner.ts
src/lib/minimind/experiments/runners/*
src/components/minimind/playground/          # Zero changes — playground untouched
src/components/minimind/playground/forward/shared/*  # Imported as-is
src/components/minimind/experience/          # Zero changes
src/app/ai-lab/playground/                   # Zero changes
src/app/ai-lab/experience/                   # Zero changes
```

### Design Notes

- **No new lib/ files.** UI consumes the existing runtime layer. Zero runtime code changes needed.
- **`ExperimentInputPanel`** is a single component that reads `experiment.requiredCapabilities.dataRequirements` and renders the appropriate input fields. No per-experiment input components needed — inputs are simple enough.
- **Barrel file** exports all public components, matching `forward/index.ts` and `experience/` patterns.
- **Registry update** is minimal: flip 3 experiments from `"planned"` → `"active"` and set their `componentPath`.

## Component Specifications

### ExperimentsPageClient

State owner. Root component rendered by the page.

```
State:
  view: "hub" | "workspace"
  selectedExperimentId: string | null

Props: none (root component)

Renders:
  view === "hub"       → ExperimentHub
  view === "workspace" → ExperimentWorkspace (onBack → setView("hub"))
```

Single `useState` for view, single `useState` for selectedExperimentId. No router, no context, no external state library. Matches ForwardPlayground's simplicity.

### ExperimentHub

```
Reads: MINIMIND_EXPERIMENTS from experiment-registry
Filters: status === "active" (default tab)

Renders: responsive grid of ExperimentCards
  - 1 column mobile
  - 2 columns tablet
  - 3 columns desktop

Animation: staggered fade-in on mount (Framer Motion variants, matching forward pattern)
Empty state: if no active experiments, show a "coming soon" message with the count of planned experiments
```

### ExperimentCard

```
Props: MiniMindExperiment (the full registry object)

Renders:
  - Icon: mapped by relatedModule
      tokenizer  → Split
      embedding  → Layers
      attention  → Eye
      inference  → Thermometer
      (fallback  → FlaskConical)
  - Title
  - Description (2-line clamp with line-clamp-2)
  - Concept tags (max 3 shown, "+N more" overflow badge)
  - Status badge (active = brand gradient chip, planned = slate chip)

Interaction:
  Click → setSelectedExperimentId + setView("workspace") (via callback)
  Hover → glass-card-hover class (existing), slight scale-up (scale-[1.02])

States:
  - active: full interactive card
  - planned: muted, lower opacity, non-clickable, "Coming Soon" badge
```

### ExperimentWorkspace

```
Props:
  experimentId: string
  onBack: () => void

Sections (vertical stack, max-w-4xl centered):
  1. Header bar: Back button (← arrow) + experiment title + description
  2. ExperimentInputPanel (dynamic input form)
  3. "Run Experiment" button (brand variant, full width on mobile)
  4. Result area (conditionally rendered when result exists)

State:
  input: Record<string, unknown>  (loose form state before typed cast)
  result: ExperimentResult<unknown> | null
  runStatus: "idle" | "running" | "done"

On Run:
  1. Find experiment definition from registry by experimentId
  2. createExperimentContext(experiment) → context
  3. runExperiment(experimentId, context, input) → result
  4. setResult(result), setRunStatus("done")

Error handling:
  - If getExperimentById returns undefined → show error card
  - If runExperiment returns status "failed" → show error card with errors[]
  - Each step is wrapped in try/catch → user-facing error message
```

### ExperimentInputPanel

```
Props:
  experiment: MiniMindExperiment
  onChange: (input: Record<string, unknown>) => void

Reads experiment.requiredCapabilities.dataRequirements to determine input shape.
Single component with conditional sections.

module "tokenizer" present:
  → Textarea for input text
  → Placeholder: "Enter text to tokenize..."

module "embedding" present:
  → Mode radio: "Lookup" | "Similarity"
  → Lookup mode: number input for token ID(s)
  → Similarity mode: two text inputs for token pair (Token A, Token B)

module "attention" present:
  → Textarea for sequence vectors (JSON array format)
  → Checkbox: "Apply causal mask" (default: true)
  → Optional: head indices input

module "model" present (future: sampling-temperature):
  → Textarea for input text
  → Slider: temperature (0.1 - 2.0)

Input state is keyed by field name. onChange fires on every change.
The workspace casts the loose input to the typed experiment input before calling runExperiment.
```

### ExperimentResultRenderer

```
Props:
  experimentId: string
  result: ExperimentResult<unknown>

Switch dispatch by experimentId:
  "tokenizer-comparison-lab"   → <TokenizerComparisonResult data={result.data as TokenizerComparisonData}
                                   errors={result.errors} timing={result.timing} />
  "embedding-explorer"         → <EmbeddingExplorerResult data={result.data as EmbeddingExplorerData}
                                   errors={result.errors} timing={result.timing} />
  "attention-heatmap-explorer" → <AttentionHeatmapResult data={result.data as AttentionHeatmapData}
                                   errors={result.errors} timing={result.timing} />

Default: renders nothing for unknown IDs (with console warning in dev).

Shared props every renderer receives:
  - data: typed experiment data
  - errors: ExperimentError[] (rendered as warning card when non-empty)
  - timing: ExperimentTiming (rendered as small mono text: "Completed in Xms")
```

### Result Renderers

#### TokenizerComparisonResult

```
Props: data: TokenizerComparisonData, errors: ExperimentError[], timing: ExperimentTiming

Reuses: StatRow, StageCard (from forward/shared)

Layout:
  Top: timing + error banner (if errors present)
  Two-column comparison (stacks vertically on mobile):
    Left column (StageCard): "MiniTokenizer (Word-level)"
      - Token count, vocab size, unknown count (StatRow)
      - Token table: token | ID | isUnknown (scrollable, max-height)
    Right column (StageCard): "CharacterTokenizer (Character-level)"
      - Same format
  Bottom card (StageCard): "Comparison Metrics"
    - Token count ratio (color-coded: green ≤ 2x, amber 2-4x, red > 4x)
    - Unknown rate comparison (side-by-side StatRow)
    - Token count: mini N vs char M

Edge cases:
  - Empty input text → "No tokens produced" message
  - charTokenizer data null → "CharacterTokenizer unavailable" card
```

#### EmbeddingExplorerResult

```
Props: data: EmbeddingExplorerData, errors: ExperimentError[], timing: ExperimentTiming

Reuses: VectorBarChart, StatRow, StageCard (from forward/shared)

Layout:
  Top: timing + error banner
  Matrix info card (StageCard):
    - vocabSize, embeddingDim, totalParameters (StatRow)

  If mode === "lookup":
    - Vector cards per token (StageCard per token):
      - Token label (e.g., "Token 42: hello")
      - VectorBarChart (thin bars, height=magnitude, color=sign: brand+/slate-)
      - Stats: min, max, mean, l2Norm (StatRow)

  If mode === "similarity":
    - Similarity card (StageCard):
      - Token A vs Token B display
      - Cosine similarity score (large number, color-coded bar):
        green ≥ 0.7, amber 0.3-0.7, red < 0.3, gray when vectors not found
      - Interpretation hint text

Edge cases:
  - Token ID not in vocabulary → "Token not found" message
  - vectors array empty → "No vectors to display"
```

#### AttentionHeatmapResult

```
Props: data: AttentionHeatmapData, errors: ExperimentError[], timing: ExperimentTiming

Reuses: HeatmapGrid, DistributionChart, StatRow, StageCard (from forward/shared)

Layout:
  Top: timing + error banner
  Context card (StageCard):
    - seqLen, numHeads, headDim, causalMaskApplied (StatRow)

  Head selector:
    - Horizontal tab row: "Head 0", "Head 1", ... "Head N-1"
    - Selected tab = brand highlight
    - Default: Head 0 selected

  Heatmap card (StageCard, full width):
    - View toggle: "Attention Weights" | "Raw Scores"
    - HeatmapGrid: seqLen × seqLen grid
      - Cell color = attention weight (0=transparent, 1=brand-saturated)
      - Hover tooltip: "Token i → Token j: 0.XX"
    - Below grid: mini color scale legend

  Head diversity card (StageCard):
    - Horizontal bar chart: one bar per head (DistributionChart)
    - Bar height = entropy value
    - Higher entropy = more diffuse attention (annotated)

  Optional: headDiversity section (if data.headDiversity present):
    - Pairwise similarity matrix (small HeatmapGrid)
    - Caption: "Head diversity: lower = heads attend to different patterns"

Edge cases:
  - heads array empty → "No attention data" message
  - headDiversity absent → skip section (graceful degradation)
  - Single head → hide head selector, show "Only 1 head"

Null-safe design mirrors capabilities pattern from forward visualization:
if a sub-feature's data is absent, skip that section rather than showing an error.
```

### Shared Visualization Reuse

All three renderers import from `@/components/minimind/playground/forward/shared/`:

| Shared Component | Used By | Purpose |
|-----------------|---------|---------|
| `HeatmapGrid` | AttentionHeatmapResult | Attention weight matrix, head diversity matrix |
| `VectorBarChart` | EmbeddingExplorerResult | Per-token embedding vector bars |
| `DistributionChart` | AttentionHeatmapResult | Per-head entropy bars |
| `StatRow` | All three renderers | Label-value stats in every result |
| `StageCard` | All three renderers | Glass card wrapper for result sections |

No new visualization primitives needed in Phase 20.

## Registry Update

Update `src/data/minimind/experiment-registry.ts`:

```typescript
// For tokenizer-comparison-lab:
//   status: "planned" → "active"
//   componentPath: null → "src/components/minimind/experiments/results/TokenizerComparisonResult"

// For embedding-explorer:
//   status: "planned" → "active"
//   componentPath: null → "src/components/minimind/experiments/results/EmbeddingExplorerResult"

// For attention-heatmap-explorer:
//   status: "planned" → "active"
//   componentPath: null → "src/components/minimind/experiments/results/AttentionHeatmapResult"

// sampling-temperature-lab remains "planned" (no runner yet)
```

## UI Patterns (consistent with existing codebase)

- **Glass cards:** `rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm`
- **Section headers:** vertical gradient accent bar + title
- **Animations:** Framer Motion `Variants`, staggered children, `whileInView` with `viewport: { once: true }`
- **Icons:** lucide-react (matching existing: Sparkles, Split, Layers, Eye, Thermometer, FlaskConical)
- **Typography:** font-mono for data/numbers, font-sans for labels
- **Dark/light:** `dark:` variants on all glass cards
- **Cosmic background:** inherited from AI Lab layout (no additional background needed)
- **Page pattern:** Thin server component → `"use client"` PageClient, matching ExperiencePageClient

## Constraints

1. Do NOT modify: playground components, forward visualization, experience page, core modules, experiment runtime
2. Do NOT duplicate computation — `ExperimentRunner.run()` is the sole execution path
3. Do NOT introduce a second state management library
4. Registry remains SSOT — UI reads from `MINIMIND_EXPERIMENTS`, never maintains its own experiment list
5. Experiment Runtime independent from React — no JSX imports in `lib/minimind/experiments/`
6. Follow existing code patterns: JSDoc + educational comments + DI + registry
7. All user-facing strings via i18n
8. All components use function components + TypeScript strict mode

## Verification

- `npm run build` — zero errors, zero warnings
- `npm run lint` — zero errors
- `npx tsc --noEmit` — zero errors
- Route `/ai-lab/experiments` renders experiment hub with active experiment cards
- Click card → transition to workspace → back button returns to hub
- All 3 active experiments: fill input → run → result renders correctly
- Shared visualization components render correctly in experiment context
- Experiment failures (bad input, missing modules) show error cards, not blank screens
- TypeScript strict mode: no `any` types in any new file
- Mobile responsive: hub grid reflows, workspace stacks vertically, heatmaps remain scrollable

## Future Compatibility

- **New experiments:** Add to `MINIMIND_EXPERIMENTS` + create runner + create result renderer + add case to `ExperimentResultRenderer` switch
- **sampling-temperature-lab:** Already in registry. When `SamplingTemperatureRunner` is implemented, add result renderer + flip status to "active"
- **Experiment deep-linking:** If needed later, add URL search param `?experiment=tokenizer-comparison-lab` — page reads `searchParams` and initializes `selectedExperimentId` from it. No route changes needed.
- **Shared viz promotion:** If `forward/shared/` imports from experiments feel awkward, promote the 6 files to `components/minimind/shared/` — a mechanical refactor with no logic changes.
