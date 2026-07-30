# MiniMind Knowledge Graph Layer — Design Spec

**Date:** 2026-07-30
**Phase:** 22
**Route:** `/ai-lab/knowledge`
**Status:** design-approved

## Purpose

Build a derived Knowledge Graph Layer that exposes existing knowledge relationships visually. All nodes and edges are computed from existing registries — zero manual data entry. The graph shows how modules, concepts, experiments, documents, and implementations connect to form the MiniMind learning system.

## Architecture

### Derivation Boundary (existing registries remain SSOT)

```
┌─────────────────────────────────────────────────────────────┐
│ EXISTING SSOT REGISTRIES (unchanged)                        │
│                                                             │
│ module-registry.ts    experiment-registry.ts                │
│ model-registry.ts    transformer-registry.ts                │
│ attention-registry.ts  ffn-registry.ts  rope-registry.ts    │
│ embedding-registry.ts  tokenizer-registry.ts                │
│ docs/minimind/*.md    src/lib/minimind/*/                   │
└──────────────────────────┬──────────────────────────────────┘
                           │ read-only consumption
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ DERIVED KNOWLEDGE GRAPH LAYER (new — computed, not authored)│
│                                                             │
│ src/data/minimind/knowledge/types.ts                        │
│ src/data/minimind/knowledge/derive-graph.ts                 │
│ src/data/minimind/knowledge-registry.ts  ← public API       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ ADAPTER LAYER (new)                                         │
│                                                             │
│ src/lib/minimind/knowledge/types.ts                         │
│ src/lib/minimind/knowledge/KnowledgeGraphAdapter.ts         │
│   ┌─ computeKnowledgeLayout()  ← custom layered layout      │
│   │    ├─ semantic zone assignment                          │
│   │    ├─ dependency hierarchy (topological levels)          │
│   │    ├─ grid packing within zones                         │
│   │    └─ lightweight collision adjustment (≤5 passes)      │
│   └─ enrichForUI()                                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ UI LAYER (new)                                              │
│                                                             │
│ src/components/minimind/knowledge/                          │
│ src/app/ai-lab/knowledge/page.tsx                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Existing registries are the only SSOT.** `knowledge-registry.ts` is a derived layer — it declares no new facts, only computes relationships from existing data.
2. **Zero duplicate metadata.** Every field on a `KnowledgeNode` traces back to exactly one field in one existing registry.
3. **Graph is fully derived.** `deriveKnowledgeGraph()` is a pure function — no side effects, no manual node lists, no authoring required.
4. **No manual node maintenance.** Adding a module to `MINIMIND_MODULES` automatically creates its graph nodes + edges.
5. **Custom layered layout — no d3-force.** Deterministic zone placement + dependency hierarchy + lightweight collision gives a structured educational map. Framer Motion handles animation.
6. **HOU Universe visual identity.** Cosmic glass cards, structured map, exploration over randomness.
7. **Preserve existing work.** `ModuleDependencyGraph`, experience page, and all modules remain untouched.

## Directory Structure

```
NEW FILES (13 files across 5 directories):

src/data/minimind/knowledge/           (3 files — derivation internals)
├── types.ts                           # KnowledgeNode, KnowledgeEdge, KnowledgeGraph,
│                                        KnowledgeNodeType, KnowledgeEdgeType, KnowledgeGraphMeta
├── derive-graph.ts                    # deriveKnowledgeGraph() — pure derivation function
│                                        (12 derivation rules, concept dedup, document dedup)
└── index.ts                           # Internal barrel

src/data/minimind/
└── knowledge-registry.ts              # Public API — thin layer
                                         re-exports types, KNOWLEDGE_GRAPH constant,
                                         getNodeById(), getEdgesForNode(), getRelatedNodes()

src/lib/minimind/knowledge/            (3 files — adapter layer)
├── types.ts                           # ForceNode, KnowledgeLayout, ViewportConfig,
│                                        ZoneAnchor, ZoneLayout
├── KnowledgeGraphAdapter.ts           # KnowledgeGraph → KnowledgeLayout
│                                        computeKnowledgeLayout(): zone placement +
│                                        dependency hierarchy + grid packing + collision
│                                        enrichForUI(): node styling hints
└── index.ts                           # Barrel export

src/components/minimind/knowledge/      (5 files — UI layer)
├── KnowledgePageClient.tsx            # State owner — selectedNode, filters,
│                                        searchQuery, viewport, layout
├── KnowledgeGraphCanvas.tsx           # SVG canvas — custom zoom/pan via
│                                        Framer Motion, node/edge rendering,
│                                        filter + search visual states
├── KnowledgeDetailPanel.tsx           # Slide-in sidebar — node metadata,
│                                        related nodes clickable, links
├── KnowledgeToolbar.tsx               # Search input, type filter toggles, stats, reset
└── index.ts                           # Barrel export

src/app/ai-lab/knowledge/
└── page.tsx                           # Route entry — server component, metadata export

EXISTING FILES — UNCHANGED:
src/data/minimind/module-registry.ts
src/data/minimind/experiment-registry.ts
src/data/minimind/model-registry.ts
src/data/minimind/transformer-registry.ts
src/data/minimind/attention-registry.ts
src/data/minimind/ffn-registry.ts
src/data/minimind/rope-registry.ts
src/data/minimind/embedding-registry.ts
src/data/minimind/tokenizer-registry.ts
src/components/minimind/experience/ModuleDependencyGraph.tsx
src/components/minimind/experience/ExperiencePageClient.tsx
src/app/ai-lab/experience/page.tsx
All src/lib/minimind/*/                                              # Unchanged
All docs/minimind/*.md                                               # Unchanged
```

## Data Model

### Node Types

```typescript
type KnowledgeNodeType =
  | "module"          // MiniMind module (from MINIMIND_MODULES)
  | "concept"         // Educational concept (from module metadata.concepts[])
  | "experiment"      // Interactive experiment (from MINIMIND_EXPERIMENTS)
  | "document"        // Theory documentation (from module.theoryDocPath)
  | "implementation"; // Source code (from module.sourcePath)

interface KnowledgeNode {
  /** Unique — prefixed by type for O(1) lookup: "module:tokenizer" */
  id: string;
  /** Category for visual grouping and filtering */
  type: KnowledgeNodeType;
  /** Display name */
  label: string;
  /** ID in the source registry — cross-reference to SSOT */
  sourceId: string;
  /** Visual grouping zone — matches type by default */
  group: KnowledgeNodeType;
  /** Enriched metadata — all derived from SSOT */
  metadata: {
    description?: string;
    /** Lifecycle status — derived from module status / experiment status */
    status?: "completed" | "in-progress" | "upcoming" | "active" | "planned" | "legacy";
    /** App route (e.g. /ai-lab/playground) — derived from module.metadata.playgroundPath */
    route?: string;
    /** Filesystem path (e.g. docs/minimind/01-tokenizer.md) */
    filePath?: string;
    /** lucide-react icon name */
    icon?: string;
  };
}
```

### Edge Types

```typescript
type KnowledgeEdgeType =
  | "depends_on"      // Module → Module (learning prerequisite)
  | "explains"        // Module → Concept (teaches this concept)
  | "implements"      // Implementation → Module (source code realizes)
  | "experiments"     // Experiment → Module (validates through interaction)
  | "documents"       // Document → Module (theory doc covers)
  | "relates_to";     // Concept → Concept (cross-cutting semantic link)

interface KnowledgeEdge {
  /** Unique — "edge:{sourceId}--{type}-->{targetId}" */
  id: string;
  source: string;     // KnowledgeNode.id
  target: string;     // KnowledgeNode.id
  type: KnowledgeEdgeType;
  metadata?: {
    /** Visual stroke weight (0.5–3, default 1) */
    weight?: number;
    /** Whether the edge is bidirectional for rendering */
    bidirectional?: boolean;
  };
}
```

### Graph Container

```typescript
interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  meta: KnowledgeGraphMeta;
}

interface KnowledgeGraphMeta {
  generatedAt: string;
  totalNodes: number;
  totalEdges: number;
  nodeCounts: Record<KnowledgeNodeType, number>;
  edgeCounts: Record<KnowledgeEdgeType, number>;
}
```

### ID Scheme

All node IDs are prefixed by type to prevent collisions and support O(1) lookup:

| Prefix | Example | Source field |
|--------|---------|-------------|
| `module:` | `module:tokenizer` | `MiniMindModule.id` |
| `concept:` | `concept:self-attention` | Slugified concept string (lowercase, hyphenated) |
| `experiment:` | `experiment:tokenizer-comparison-lab` | `MiniMindExperiment.id` |
| `document:` | `document:01-tokenizer` | Doc filename stem from `module.theoryDocPath` |
| `implementation:` | `implementation:tokenizer-src` | Directory name from `module.sourcePath` |

## Derivation Rules — `deriveKnowledgeGraph()`

A single pure function with zero parameters. Reads the three primary registries directly. Returns `KnowledgeGraph`.

```
function deriveKnowledgeGraph(): KnowledgeGraph
```

### Rule table (12 rules)

| # | Output | Source | Logic |
|---|--------|--------|-------|
| 1 | `module:*` nodes | `MINIMIND_MODULES` | One node per module entry. `label = module.title`, `metadata.description = module.description`, `metadata.status = module.status`, `metadata.route = module.metadata.playgroundPath`, `metadata.filePath = module.theoryDocPath` |
| 2 | `concept:*` nodes | `module.metadata.concepts[]` | For each module, iterate its `concepts[]`. Slugify each concept string to create `concept:<slug>`. Deduplicate by slug across all modules. `metadata.description` = empty (no source has concept descriptions yet) |
| 3 | `explains` edges | Same as rule 2 | `module:<moduleId> → concept:<slug>` for each concept in that module's list. If a concept appears in multiple modules, it gets multiple incoming edges — this is correct and meaningful. |
| 4 | `depends_on` edges | `module.metadata.dependencies[]` | `module:<moduleId> → module:<depId>` for each dependency. Weight = 2 (strong visual emphasis). |
| 5 | `experiment:*` nodes | `MINIMIND_EXPERIMENTS` | One node per experiment entry. `label = experiment.title`, `metadata.description = experiment.description`, `metadata.status = experiment.status` |
| 6 | `experiments` edges | `experiment.relatedModule` | `experiment:<experimentId> → module:<relatedModule>`. The experiment "validates" or "demonstrates" the module. |
| 7 | `document:*` nodes | `module.theoryDocPath` | Extract unique doc paths across all modules. Path like `docs/minimind/01-tokenizer.md` → `document:01-tokenizer`. Deduplicate by path (multiple modules may reference the same doc). `label` = extracted title (e.g. "01. Tokenizer"). `metadata.filePath` = the doc path. |
| 8 | `documents` edges | Same as rule 7 | `document:<docId> → module:<moduleId>` for each module that references that doc. Weight = 1.5. |
| 9 | `implementation:*` nodes | `module.sourcePath` | Extract unique source directory paths. Path like `src/lib/minimind/tokenizer/` → `implementation:tokenizer-src`. Deduplicate by path. `label` = directory name (e.g. "tokenizer/"). `metadata.filePath` = the source path. |
| 10 | `implements` edges | Same as rule 9 | `implementation:<implId> → module:<moduleId>` for each module with that source. Weight = 1.5. |
| 11 | Additional concept nodes + `explains` edges | `MODEL_MODULES` active entry | If an active model version exists (`getActiveModelModule()`), extract its `concepts[]`. Dedup against concepts already created in rule 2. For each genuinely new concept, create a `concept:*` node and an `explains` edge from `module:model`. In practice, MODEL_MODULES concepts overlap heavily with MINIMIND_MODULES concepts — rule 11 is the safety net for any concepts unique to the model evolution path. |
| 12 | `relates_to` edges | Cross-concept analysis | Compare all concept labels. Concepts sharing ≥2 significant words (length > 3 chars, not stopwords) → weak `relates_to` edge (weight = 0.5). Example: "Self-Attention" ↔ "Multi-Head Attention" share "Attention" + "Head" or "Self" alone, only "Attention" qualifies → check threshold. |

### Deduplication strategy

- **Concepts:** Slugified. `"Self-Attention"` → `"self-attention"`. If any two modules list the same concept string (case-insensitive match), it produces a single `concept:*` node with multiple incoming `explains` edges.
- **Documents:** Deduped by normalized path (strip `docs/minimind/` prefix, compare stem).
- **Implementations:** Deduped by normalized source path (strip `src/lib/minimind/` prefix).

### Concept cross-linking heuristic (rule 12)

```
1. Split each concept label into words, lowercase
2. Filter: remove words ≤ 3 chars, remove common stopwords
   ("the", "and", "for", "via", "over", "from", "with", "per")
3. Compute pairwise Jaccard similarity: |A ∩ B| / |A ∪ B|
4. If Jaccard ≥ 0.25 AND shared words ≥ 2 → create "relates_to" edge
5. Weight = Jaccard * 2 (clamped to [0.5, 2.0])
```

Example:
- `"Self-Attention"` = {self, attention}
- `"Multi-Head Attention"` = {multi, head, attention}
- Intersection = {attention}, Union = {self, attention, multi, head}
- Jaccard = 1/4 = 0.25 → borderline. Shared words = 1 < 2 → NO edge.
- `"Scaled Dot-Product"` = {scaled, dot, product}
- `"Dot-Product Attention"` = {dot, product, attention}
- Intersection = {dot, product}, Union = {scaled, dot, product, attention}
- Jaccard = 2/4 = 0.5 ≥ 0.25 AND shared ≥ 2 → YES edge, weight = 1.0

Edge direction: source = alphabetically first concept ID.

## Custom Layered Layout — `computeKnowledgeLayout()`

No d3-force. Deterministic, structured, educational.

### Zone Definition

Five semantic zones arranged in a cross pattern with Module at center:

```
        Concepts                Documents
        (top-left)              (top-right)

                Modules
                (center)

        Experiments             Implementations
        (bottom-left)           (bottom-right)
```

Each zone has a fixed anchor `(cx, cy)` computed from viewport dimensions:

```
const ZONE_LAYOUT: Record<KnowledgeNodeType, ZoneConfig> = {
  module:          { anchor: "center",        col: 1, row: 1, maxCols: 3 },
  concept:         { anchor: "top-left",       col: 0, row: 0, maxCols: 4 },
  document:        { anchor: "top-right",      col: 2, row: 0, maxCols: 2 },
  experiment:      { anchor: "bottom-left",    col: 0, row: 2, maxCols: 2 },
  implementation:  { anchor: "bottom-right",   col: 2, row: 2, maxCols: 2 },
};
```

The viewport is divided into a 3×3 implicit grid. Each zone gets a sub-region.

### Module Zone: Dependency Hierarchy

Within the center module zone, modules are NOT randomly placed. They follow topological dependency levels (already computed by `computeDependencyLevels()` in module-registry):

```
Level 0 (foundation, no deps):  [Tokenizer]
Level 1:                        [Embedding]
Level 2:                        [RoPE]
Level 3:                        [Attention]
Level 4:                        [FFN]
Level 5:                        [Transformer]
Level 6:                        [Forward Model]
Level 7:                        [Inference]
```

Modules at the same level are placed side-by-side. Each level is a row within the module zone. This creates a natural top-to-bottom learning progression at the graph's center.

### Non-Module Zones: Grid Packing

Within each of the 4 surrounding zones, nodes are arranged in a column or grid:
- Column layout by default (nodes stacked vertically within the zone)
- If node count exceeds zone height capacity, wrap to 2 columns
- Each node occupies a cell of at least 140×60px (concept), 160×72px (document), 144×64px (experiment), 120×52px (implementation)

### Collision Adjustment

After initial placement, run a lightweight overlap check:

```
function resolveCollisions(nodes: ForceNode[], maxPasses: number = 5): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (boundingBoxesOverlap(nodes[i], nodes[j])) {
          // Push apart along the shortest escape axis
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 0.01) {
            nodes[i].x -= 10;
            nodes[j].x += 10;
          } else {
            const overlap = (nodes[i].width / 2 + nodes[j].width / 2 + 12) - dist / 2;
            if (overlap > 0) {
              const nx = dx / dist;
              const ny = dy / dist;
              nodes[i].x -= nx * overlap * 0.6;
              nodes[i].y -= ny * overlap * 0.6;
              nodes[j].x += nx * overlap * 0.6;
              nodes[j].y += ny * overlap * 0.6;
              moved = true;
            }
          }
        }
      }
    }
    if (!moved) break;
  }
}
```

This is O(n² × passes) — for 100 nodes and 5 passes, ~50K bounding-box checks, negligible at runtime.

### Responsive Re-layout

On viewport resize (debounced 200ms), re-compute zone anchors and re-run grid packing + collision. Zone anchors scale proportionally to viewport. Node positions are stored as fractions of zone dimensions, so a wide viewport naturally spreads zones horizontally.

### Framer Motion Integration

Nodes use `layout` prop for automatic position transitions:

```tsx
<motion.g
  layout
  transition={{ type: "spring", stiffness: 200, damping: 25 }}
>
```

- Initial mount: staggered `opacity` + `scale` (0 → 1, delay = index × 30ms)
- Filter toggle: `AnimatePresence` handles enter/exit, remaining nodes animate to new positions via `layout`
- Selection: selected node scales to 1.05, gets glow shadow, connected edges highlight

## Adapter Types

```typescript
// src/lib/minimind/knowledge/types.ts

interface ForceNode extends KnowledgeNode {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Zone anchor — node is pulled to stay near this point */
  anchorX: number;
  anchorY: number;
}

interface KnowledgeLayout {
  nodes: ForceNode[];
  edges: KnowledgeEdge[];
  viewport: ViewportConfig;
  zones: ZoneLayout[];
}

interface ViewportConfig {
  width: number;
  height: number;
  padding: number;
}

interface ZoneLayout {
  type: KnowledgeNodeType;
  cx: number;
  cy: number;
  width: number;
  height: number;
  nodeCount: number;
}

interface ZoneConfig {
  anchor: string;
  col: number;
  row: number;
  maxCols: number;
}
```

## Data Flow

```
KnowledgePageClient (state owner)
  │
  │  state: {
  │    graph: KnowledgeGraph | null,       // useMemo → deriveKnowledgeGraph()
  │    layout: KnowledgeLayout | null,     // useMemo → adaptKnowledgeGraph(graph, viewport)
  │    selectedNode: string | null,
  │    filters: Set<KnowledgeNodeType>,
  │    searchQuery: string,
  │    viewport: { width, height }
  │  }
  │
  ├─ KnowledgeToolbar
  │     │  receives: filters, onFiltersChange, searchQuery, onSearchChange, graph.meta.stats
  │     │  owns: nothing (controlled)
  │     │
  ├─ KnowledgeGraphCanvas
  │     │  receives: layout, selectedNode, filters, searchQuery, onNodeClick
  │     │  owns: panOffset (x/y), zoomScale, hoveredNodeId
  │     │
  │     ├─ ForceEdge[]              ← filtered by: type visibility, search match
  │     │     opacity fades when source or target is filtered/hidden
  │     │
  │     └─ ForceNode[]              ← filtered by: type toggle, search match
  │           │  onClick → setSelectedNode(id)
  │           │  click-on-selected → setSelectedNode(null)
  │           │  hover → highlight connected edges, dim unconnected
  │           │  search-match → animate pulse, non-match → opacity 0.15
  │           │
  │           └─ NodeCard           ← typed glass card (shape/color by type)
  │
  └─ KnowledgeDetailPanel           ← renders when selectedNode !== null
        │  receives: selectedNode (KnowledgeNode), graph (for related nodes), onClose
        │  owns: nothing
        │  slides in from right via AnimatePresence
        │  closes on: X click, Escape key, click-outside
```

## Component Specifications

### KnowledgePageClient (state owner)

| State | Type | Default |
|-------|------|---------|
| `selectedNode` | `string \| null` | `null` |
| `filters` | `Set<KnowledgeNodeType>` | all 5 types enabled |
| `searchQuery` | `string` | `""` |
| `viewport` | `{ width, height }` | from ResizeObserver on container |

Derivation chain (all memoized):
1. `graph = useMemo(() => deriveKnowledgeGraph(), [])`
2. `layout = useMemo(() => adaptKnowledgeGraph(graph, viewport), [graph, viewport])`
3. `visibleNodes = useMemo(() => applyFiltersAndSearch(layout.nodes, filters, searchQuery), [layout, filters, searchQuery])`
4. `visibleEdges = useMemo(() => filterEdgesByVisibleNodes(layout.edges, visibleNodes, filters), [layout, visibleNodes, filters])`

### KnowledgeGraphCanvas

Renders an SVG element filling its container. The SVG `viewBox` is set to the full layout bounding box with padding.

**Zoom/Pan:**
- Container `<div>` listens to `onWheel` → adjusts internal `scale` state (clamped [0.3, 3.0])
- Container `<div>` uses Framer Motion `useDrag` for pan offset
- A single `<motion.g transform="translate(panX, panY) scale(scale)">` wraps all nodes + edges
- "Reset view" button resets pan to (0,0) and scale to fit-viewport

**Node rendering:**
- SVG `<g>` wrapper per node, positioned at `(node.x, node.y)`
- SVG `<foreignObject>` contains an HTML `<div>` with the glass card styling
- This enables proper text wrapping, CSS styling, and Tailwind classes inside the SVG

**Edge rendering:**
- SVG `<line>` per visible edge, from `(sourceNode.x, sourceNode.y)` to `(targetNode.x, targetNode.y)`
- Type-dependent stroke colors:
  - `depends_on` → brand/40, solid, width 2
  - `explains` → slate-500/25, solid, width 1
  - `implements` → slate-500/20, dashed (4 4), width 1
  - `experiments` → amber-500/30, solid, width 1.5
  - `documents` → slate-500/20, dashed (2 4), width 1
  - `relates_to` → slate-500/15, dotted (1 3), width 0.5

**Node type visual differentiation:**

| Type | Shape | Border | Background | Size | Icon |
|------|-------|--------|------------|------|------|
| module | rounded-xl | border-brand/25 | bg-brand/[0.05] | 130×60px | Box |
| concept | rounded-full | border-slate-500/20 | bg-slate-500/[0.03] | 110×40px | Lightbulb |
| experiment | rounded-lg | border-amber-500/25 | bg-amber-500/[0.05] | 126×48px | FlaskConical |
| document | rounded-lg | border-dashed border-slate-500/15 | bg-transparent | 120×44px | FileText |
| implementation | rounded-md | border-slate-500/12 | bg-slate-500/[0.02] | 110×38px | Code |

### KnowledgeToolbar

Horizontal bar at the top of the knowledge page:

```
[🔍 Search concepts, modules...          ]  [Modules ✓] [Concepts ✓] [Experiments ✓] [Docs ✓] [Code ✓]  [Reset]
```

- Search input: debounced 200ms, matches against `node.label` and `node.metadata.description`
- Filter toggles: pill buttons, active = filled brand, inactive = outline slate
- Stats pill: "N nodes · M edges" in mono text
- Reset button: icon-only, re-centers + resets zoom

### KnowledgeDetailPanel

Slides in from the right edge when a node is selected. Uses `AnimatePresence` for enter/exit (matches DeepDivePanel pattern in forward visualization).

**Content:**
1. Node type badge (colored pill matching node type)
2. Node label (h2)
3. Description (from metadata)
4. Status badge (if applicable)
5. Route link (if applicable — clickable, navigates to playground/experiment)
6. File path (if applicable — mono text)
7. "Related nodes" section:
   - "Depends on:" — list of module nodes (clickable → selects that node)
   - "Explains:" — list of concept nodes
   - "Validated by:" — list of experiment nodes
   - "Documented by:" — list of document nodes
   - "Implemented by:" — list of implementation nodes

**Close triggers:**
- X button in panel header
- Escape key (`useEffect` with `keydown` listener on `document`)
- Click outside the panel (click handler on backdrop overlay)
- Click the selected node again in the canvas (toggle off)

### Visual Style (consistent with HOU Universe)

All components follow the established HOU Universe visual patterns:

- **Glass cards:** `rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm`
- **Section headers:** vertical gradient accent bar + title
- **Animations:** Framer Motion `Variants`, `AnimatePresence`, staggered children
- **Icons:** lucide-react
- **Typography:** `font-mono` for data/numbers, `font-sans` for labels
- **Dark/light:** `dark:` variants on all glass cards
- **Cosmic background:** inherited from AI Lab layout (no additional background needed)

## Component Ownership Rules

| Component | Receives | Owns |
|-----------|----------|------|
| KnowledgePageClient | nothing (root) | selectedNode, filters, searchQuery, viewport, graph, layout |
| KnowledgeToolbar | filters, onFiltersChange, searchQuery, onSearchChange, stats | nothing (controlled) |
| KnowledgeGraphCanvas | layout, selectedNode, filters, searchQuery, onNodeClick | panOffset, zoomScale, hoveredNodeId |
| ForceNode (internal) | node, isSelected, isFiltered, isSearchMatch, onClick | nothing (pure render) |
| ForceEdge (internal) | edge, sourceNode, targetNode, isVisible | nothing (pure render) |
| KnowledgeDetailPanel | selectedNode, graph, onClose | nothing |

## Filtering Modes (future-ready)

The current implementation supports:

1. **Type toggle filter** — show/hide entire node types. Toggling a type off removes its nodes and any edges connected exclusively to hidden nodes. Edges between visible nodes of different types remain.

2. **Search filter** — substring match against `label` and `metadata.description`. Matched nodes animate (pulse glow), non-matched dim to opacity 0.15.

3. **Focus mode** — clicking a node already selected enters focus mode (future Phase 22e enhancement):
   - Only the selected node and its 1-hop neighbors are fully visible
   - Everything else dims to opacity 0.08
   - A "Show all" button appears to exit focus mode

Future filtering modes designed but not built in Phase 22:
- **Dependency chain** — select two modules, highlight all paths between them
- **Concept clustering** — group concept nodes by shared word count threshold
- **Learning path** — extract a linear path from root modules to a target module

## Learning Path Generation (future — prepared, not built)

The dependency graph structure (`depends_on` edges between modules) naturally forms a DAG. In a future phase, this can be consumed to generate personalized learning paths:

```typescript
// Future: src/lib/minimind/knowledge/learning-path.ts

interface LearningPath {
  modules: string[];        // Ordered module IDs
  concepts: string[];       // All concepts covered
  experiments: string[];    // Suggested experiments along the way
  estimatedSteps: number;
}

function generateLearningPath(targetModuleId: string): LearningPath {
  // 1. Start from target module
  // 2. Walk depends_on edges backward to root modules
  // 3. Topological sort → linear order
  // 4. Collect all concepts from traversed modules
  // 5. Map experiments to modules in path
}
```

No implementation in Phase 22 — this is documented here only as a design constraint: the data model MUST support this future use case. Specifically, `depends_on` edges must form a traversable graph, and concept→module relationships must be bi-directional.

## Constraints

1. **Do NOT modify:** any existing registry, any lib module, any existing UI component, any existing page
2. **Do NOT duplicate metadata.** Every `KnowledgeNode` field traces to exactly one existing registry field
3. **Do NOT introduce d3-force or ReactFlow** — custom layout only
4. **Follow existing code patterns:** JSDoc + educational comments + DI + registry + barrel exports
5. **KnowledgeNode/KnowledgeEdge types use explicit fields** — no `any`, no `Record<string, unknown>`
6. **All user-facing strings via i18n** — `minimind.knowledge.*` namespace
7. **All components use function components + TypeScript strict mode**
8. **Zero console.log in production code**

## Verification

- `npm run build` — zero errors, zero warnings
- `npm run lint` — zero errors
- `npx tsc --noEmit` — zero errors
- Route `/ai-lab/knowledge` renders without layout shift
- All 5 node types visible with correct styling
- All 6 edge types rendered with correct stroke patterns
- Derivation produces correct node counts: 8 modules + ~70 concepts + 4 experiments + ~10 documents + ~8 implementations ≈ 100 nodes
- Search filters nodes correctly
- Type toggles show/hide correct node types
- Click node → detail panel slides in
- Escape/deselect → detail panel slides out
- `ModuleDependencyGraph` on `/ai-lab/experience` unchanged
- Mobile responsive: canvas shrinks, detail panel goes full-width below `md`

## Implementation Phases

### Phase 22a: Data Layer

**Files:**
- `src/data/minimind/knowledge/types.ts` — all type definitions
- `src/data/minimind/knowledge/derive-graph.ts` — `deriveKnowledgeGraph()`
- `src/data/minimind/knowledge/index.ts` — internal barrel
- `src/data/minimind/knowledge-registry.ts` — public API

**Deliverables:**
- `KnowledgeNode`, `KnowledgeEdge`, `KnowledgeGraph` types
- All 12 derivation rules implemented
- Concept dedup by slug
- Document/implementation dedup by path
- Concept cross-linking heuristic (Jaccard ≥ 0.25 + shared words ≥ 2)
- `KNOWLEDGE_GRAPH` constant (eagerly computed)
- Helpers: `getNodeById()`, `getEdgesForNode()`, `getRelatedNodes()`, `getGraphStats()`

### Phase 22b: Adapter Layer

**Files:**
- `src/lib/minimind/knowledge/types.ts` — `ForceNode`, `KnowledgeLayout`, etc.
- `src/lib/minimind/knowledge/KnowledgeGraphAdapter.ts` — layout computation
- `src/lib/minimind/knowledge/index.ts` — barrel

**Deliverables:**
- Zone anchor computation from viewport
- Dependency hierarchy row placement for module zone
- Grid packing for non-module zones
- Lightweight collision adjustment (≤5 passes)
- `adaptKnowledgeGraph(graph, viewport): KnowledgeLayout`
- `enrichForUI(node): { colorClass, icon, shapeClass }`

### Phase 22c: UI — Canvas + Toolbar

**Files:**
- `src/components/minimind/knowledge/KnowledgeGraphCanvas.tsx`
- `src/components/minimind/knowledge/KnowledgeToolbar.tsx`
- `src/components/minimind/knowledge/index.ts`

**Deliverables:**
- SVG canvas with viewBox + padding
- Framer Motion zoom (onWheel) + pan (useDrag)
- ForceEdge rendering with type-dependent stroke
- ForceNode rendering with type-dependent glass cards (via foreignObject)
- Search highlight/dim
- Filter toggle visibility
- Staggered enter animation
- Toolbar: search input, 5 type toggle pills, stats, reset button

### Phase 22d: UI — Detail Panel + Page

**Files:**
- `src/components/minimind/knowledge/KnowledgeDetailPanel.tsx`
- `src/components/minimind/knowledge/KnowledgePageClient.tsx`
- `src/app/ai-lab/knowledge/page.tsx`

**Deliverables:**
- Detail panel with slide-in animation
- Node metadata display
- Related nodes section (clickable)
- Close on X / Escape / click-outside / toggle-off
- Page client orchestrator with state management
- Server component page with metadata export

### Phase 22e: Polish + Integration

**Deliverables:**
- i18n keys: `minimind.knowledge.*` in `en.json` and `zh-CN.json`
- Link from AI Lab hub page to `/ai-lab/knowledge`
- Link from `ModuleDependencyGraph` bottom: "Explore full knowledge graph →"
- Edge label rendering on hover (shows edge type name)
- Final `npm run build` verification
- TypeScript strict mode verification
