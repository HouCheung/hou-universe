# MiniMind Learning Intelligence Layer — Design Spec

**Phase 23** | 2026-07-30
**Status:** Approved
**Goal:** Upgrade Knowledge Graph into a Learning Intelligence Layer — guided paths, recommendations, and mastery tracking, all derived from existing SSOT registries.

---

## 1. Motivation

The Knowledge Graph (Phase 22) already computes a rich dependency DAG: 8 modules with `depends_on` edges, 30+ concepts linked via `explains`, experiments tied to modules, and cross-concept `relates_to` edges. This is a complete curriculum graph — but it's only surfaced as an explorable map. Phase 23 makes it teach.

Three capabilities are delivered as one unified system:
- **Path Navigator** — guided, dependency-ordered learning journey with progress tracking
- **Recommendation Engine** — topological ranking, prerequisite analysis, next-best-action
- **Mastery System** — concept-level tracking, experiment validation, progress analytics

All intelligence is derived. Zero new metadata is authored.

---

## 2. Architecture

### 2.1 Layer Diagram

```
┌─────────────────────────────────────────────────────┐
│  UI LAYER                                            │
│  src/components/minimind/learning/                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ LearningJourneyPageClient (state owner)        │  │
│  │   ├─ LearningPathTimeline (vertical journey)   │  │
│  │   │    └─ PathNodeCard × N                     │  │
│  │   ├─ RecommendationBar (horizontal next-steps) │  │
│  │   ├─ ProgressDashboard (stats + mastery grid)  │  │
│  │   └─ MasteryRadar (spider chart)               │  │
│  └───────────────────────────────────────────────┘  │
│  Route: /ai-lab/journey ← replaces placeholder       │
├─────────────────────────────────────────────────────┤
│  ADAPTER LAYER                                       │
│  src/lib/minimind/learning/                          │
│  ┌───────────────────────────────────────────────┐  │
│  │ LearningPathAdapter                            │  │
│  │   adaptLearningPath() → TimelineLayout         │  │
│  │   adaptRecommendations() → RecommendationCard[]│  │
│  │   adaptMasteryGrid() → MasteryCell[][]         │  │
│  └───────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  DATA LAYER                                          │
│  src/data/minimind/learning/                         │
│  ┌───────────────────────────────────────────────┐  │
│  │ derive-learning.ts  (8 path rules)             │  │
│  │ derive-mastery.ts   (recommendation + mastery) │  │
│  │ types.ts  (LearningNode, LearningPath, etc.)   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  PUBLIC API: src/data/minimind/learning-registry.ts  │
│  ┌───────────────────────────────────────────────┐  │
│  │ LEARNING_PATHS   (eagerly computed)            │  │
│  │ MASTERY_TREE     (concept→module hierarchy)    │  │
│  │ getLearningPath(), getRecommendations(), ...   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  SSOT INPUTS (read, never written)                   │
│  ┌───────────────────────────────────────────────┐  │
│  │ KNOWLEDGE_GRAPH  ← knowledge-registry.ts       │  │
│  │ MINIMIND_MODULES ← module-registry.ts          │  │
│  │ MINIMIND_EXPERIMENTS ← experiment-registry.ts  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.2 Key Design Principles

1. **SSOT Preservation** — All intelligence derived from `KNOWLEDGE_GRAPH`, `MINIMIND_MODULES`, `MINIMIND_EXPERIMENTS`. Zero new metadata in existing registries.
2. **Pure Derivation** — Every function in `derive-learning.ts` and `derive-mastery.ts` is pure, deterministic, and parameterless (reads from eagerly-computed constants).
3. **No Duplicated Knowledge** — Learning nodes, paths, and mastery trees are typed wrappers referencing source IDs (`module:tokenizer`, `concept:bpe-encoding`) back to the Knowledge Graph.
4. **Client-Side Progress** — `UserProgress` is persisted in localStorage only. No backend, no server state. Progress is a local concern.
5. **Educational UX** — Matches existing HOU Universe glass-morphism + Framer Motion style. Color-coded statuses. Encouraging microcopy.

---

## 3. Data Layer Design

### 3.1 Types (`src/data/minimind/learning/types.ts`)

```typescript
// ── Learning Status ──
type LearningStatus = "locked" | "available" | "in_progress" | "completed" | "mastered";

// ── Learning Node ──
interface LearningNode {
  /** References KnowledgeNode.id (e.g., "module:tokenizer") */
  sourceId: string;
  /** The KnowledgeNode this wraps */
  knowledgeNode: KnowledgeNode;
  /** Topological depth in the dependency DAG */
  depth: number;
  /** IDs of LearningNodes that must be completed first */
  prerequisites: string[];
  /** IDs of LearningNodes this node unlocks */
  unlocks: string[];
  /** Is this on the critical path? */
  criticalPath: boolean;
  /** Estimated time in minutes */
  estimatedMinutes: number;
  /** Concepts this node teaches (from explains edges) */
  conceptIds: string[];
  /** Experiments that validate this node */
  experimentIds: string[];
}

// ── Learning Path ──
interface LearningPath {
  id: string;
  label: string;
  description: string;
  /** Ordered list of learning nodes */
  nodes: LearningNode[];
  /** Total estimated time */
  totalMinutes: number;
  /** Total nodes */
  nodeCount: number;
  /** Path type */
  type: "critical" | "breadth_first" | "experiment_first";
}

// ── Recommendation ──
interface Recommendation {
  sourceId: string;
  reason: "next_in_path" | "prerequisite_for" | "experiment" | "reinforce" | "explore";
  priority: number; // 0-1, higher = more important
  description: string; // "Unlocks 3 more modules"
  cta: string; // "Start Learning"
}

// ── Mastery Concept ──
interface MasteryConcept {
  conceptId: string;
  conceptLabel: string;
  /** Which module teaches this concept */
  parentModuleId: string;
  /** Related experiment IDs for validation */
  experimentIds: string[];
  /** Cross-links to other concepts */
  relatedConceptIds: string[];
  /** Jaccard similarity scores */
  relatesToScores: Record<string, number>;
}

// ── Mastery Tree ──
interface MasteryTree {
  concepts: MasteryConcept[];
  /** moduleId → conceptIds */
  moduleConceptMap: Record<string, string[]>;
  /** conceptId → moduleIds that list it */
  conceptModuleMap: Record<string, string[]>;
}

// ── User Progress (client-side only) ──
interface UserProgress {
  /** sourceId → status */
  nodeStatus: Record<string, LearningStatus>;
  /** conceptId → reviewed (boolean) */
  conceptReviewed: Record<string, boolean>;
  /** experimentId → completed (boolean) */
  experimentCompleted: Record<string, boolean>;
  /** ISO timestamp */
  lastUpdated: string;
}

// ── Aggregates ──
interface LearningRegistry {
  paths: LearningPath[];
  recommendations: Recommendation[];
  masteryTree: MasteryTree;
}
```

### 3.2 Derivation Rules — Learning Paths (`derive-learning.ts`)

**Rule L1 — Learning Nodes from Modules**
- Extract all `type: "module"` nodes from `KNOWLEDGE_GRAPH`
- Map to `LearningNode` with `sourceId`, `knowledgeNode`
- Assign `depth = topologicalLevel(sourceId)` from `computeDependencyLevels()`

**Rule L2 — Prerequisite Mapping**
- For each `depends_on` edge `(target→source)`: add `source` to `target.prerequisites`, add `target` to `source.unlocks`
- Depth-0 nodes have empty `prerequisites[]`

**Rule L3 — Critical Path**
- Start from the deepest node (highest depth)
- Walk backward through prerequisites, always choosing the longest remaining chain
- Mark all nodes on this path with `criticalPath: true`
- The critical path is the minimum set of nodes that must be completed to reach the deepest module

**Rule L4 — Parallel-Ready Groups**
- Group nodes by depth level
- Same-depth nodes with no cross-dependencies can be learned in parallel
- Tag each node with its parallel group index

**Rule L5 — Mastery Criteria**
- For each learning node, collect `conceptIds` from `explains` edges
- Collect `experimentIds` from `experiments` edges
- Mastery = all concepts reviewed + at least one experiment completed

**Rule L6 — Time Estimation**
- `estimatedMinutes = concepts.length × 15 + experiments.length × 30`
- Module-only (no concepts) = 20 min default
- Experiment-only = 30 min

**Rule L7 — Primary Learning Path**
- `type: "critical"` — follows the critical path
- Ordered by depth ascending, within same depth by dependency count ascending
- This is the recommended-first path for new learners

**Rule L8 — Alternative Paths**
- `type: "breadth_first"` — depth-order only, no critical-path priority
- `type: "experiment_first"` — nodes with experiments first, then by depth

### 3.3 Derivation Rules — Recommendations (`derive-mastery.ts`)

**Rule R1 — Next in Path**
- Find the first node where all prerequisites are `completed` but the node itself is `available` or `in_progress`
- Priority: 0.9
- CTA: "Continue Learning"

**Rule R2 — Prerequisite Gateway**
- For each locked node, count how many other locked nodes it unlocks (transitive closure)
- Recommend the available prerequisite that unlocks the most locked nodes
- Priority: `unlocks / maxUnlocks`
- CTA: "Unlocks N more modules"

**Rule R3 — Experiment Validation**
- For recently completed modules, find linked experiments not yet completed
- Priority: 0.7
- CTA: "Validate your knowledge"

**Rule R4 — Concept Reinforcement**
- For each completed concept, find `relates_to` concepts not yet reviewed
- Recommend the concept with the highest sum of Jaccard similarities to completed concepts
- Priority: `(sum of relatesTo scores) / maxPossible`
- CTA: "Reinforce related concept"

**Rule R5 — Explore**
- Find the concept with highest betweenness centrality in the concept subgraph that hasn't been reviewed
- Priority: 0.5
- CTA: "Explore key concept"

**Recommendation Filtering:**
- Always return top 5, deduplicated by `sourceId`
- Sorted by priority descending
- If fewer than 5, return what's available

### 3.4 Public API (`learning-registry.ts`)

```typescript
// Eagerly computed constants
export const LEARNING_REGISTRY: LearningRegistry;
export const CRITICAL_PATH_NODE_IDS: string[];

// Lookup helpers
export function getLearningPath(type?: "critical" | "breadth_first" | "experiment_first"): LearningPath;
export function getLearningNode(sourceId: string): LearningNode | undefined;
export function getPrerequisiteChain(sourceId: string): LearningNode[]; // ordered from root→target
export function getUnlockChain(sourceId: string): LearningNode[]; // transitive what this unlocks
export function getRecommendations(progress: UserProgress): Recommendation[];
export function getNextNodes(progress: UserProgress): LearningNode[]; // immediately available
export function getMasteryTree(): MasteryTree;
export function getConceptReadiness(conceptId: string, progress: UserProgress): number; // 0-1
export function getOverallProgress(progress: UserProgress): {
  modulesCompleted: number;
  modulesTotal: number;
  conceptsReviewed: number;
  conceptsTotal: number;
  experimentsCompleted: number;
  experimentsTotal: number;
  percentComplete: number;
};
```

---

## 4. Adapter Layer Design

### 4.1 Types (`src/lib/minimind/learning/types.ts`)

```typescript
interface TimelineLayout {
  segments: PathSegment[];
  totalHeight: number;
}

interface PathSegment {
  learningNode: LearningNode;
  depth: number;
  isAlternating: boolean; // left or right in alternating layout
  connectionFrom: string | null; // sourceId of the prerequisite that connects to this
  connectionType: "direct" | "parallel" | "none"; // visual connection style
}

interface RecommendationCardData {
  recommendation: Recommendation;
  node: KnowledgeNode;
  nodeStyle: NodeStyleHints;
  actionLabel: string;
  actionHref: string;
}

interface MasteryGridData {
  rows: MasteryGridRow[];
}

interface MasteryGridRow {
  moduleLabel: string;
  moduleSourceId: string;
  concepts: MasteryCell[];
}

interface MasteryCell {
  conceptId: string;
  conceptLabel: string;
  isReviewed: boolean;
  relatedCount: number;
}
```

### 4.2 Adapter Functions (`LearningPathAdapter.ts`)

- `adaptTimeline(path: LearningPath, viewport: number): TimelineLayout` — converts LearningPath nodes into alternating left/right vertical timeline segments with connection metadata
- `adaptRecommendations(recs: Recommendation[]): RecommendationCardData[]` — enriches recommendations with KnowledgeNode data and styling hints
- `adaptMasteryGrid(tree: MasteryTree, progress: UserProgress): MasteryGridData` — groups concepts by parent module into rows for the progress dashboard grid
- `enrichPathNode(node: LearningNode): PathNodeCardData` — enriches a single learning node for card rendering

---

## 5. UI Layer Design

### 5.1 Route: `/ai-lab/journey` (`src/app/ai-lab/journey/page.tsx`)

Server component. Thin: exports metadata + renders `<LearningJourneyPageClient />`.

Replaces the current `SubRoutePlaceholder`.

### 5.2 LearningJourneyPageClient (`src/components/minimind/learning/LearningJourneyPageClient.tsx`)

**"use client"** — State owner for the entire journey page.

**State:**
- `progress: UserProgress` — loaded from localStorage, saved on every mutation
- `activePathType: "critical" | "breadth_first" | "experiment_first"` — defaults to `"critical"`
- `selectedNodeId: string | null` — which node's detail panel is open

**Derived state (useMemo):**
- `path = getLearningPath(activePathType)`
- `recommendations = getRecommendations(progress)`
- `nextNodes = getNextNodes(progress)`
- `overallProgress = getOverallProgress(progress)`
- `timeline = useMemo(() => adaptTimeline(path, viewportWidth), [path, viewportWidth])`
- `recommendationCards = useMemo(() => adaptRecommendations(recommendations), [recommendations])`
- `masteryGrid = useMemo(() => adaptMasteryGrid(MASTERY_TREE, progress), [progress])`

**Handlers:**
- `handleStartNode(sourceId)` — sets status to `in_progress`, saves progress
- `handleCompleteNode(sourceId)` — sets status to `completed`, checks if mastery criteria met → `mastered`
- `handleReviewConcept(conceptId)` — toggles `conceptReviewed`
- `handleCompleteExperiment(experimentId)` — toggles `experimentCompleted`
- `handleSelectNode(sourceId)` — opens detail panel
- `handleChangePath(type)` — switches active path type

**Layout:**
```
┌──────────────────────────────────────────────┐
│  Page Header (glass card, glow accent bar)    │
│  <Sparkles icon> Learning Journey / 学习旅程  │
│  Intro text (i18n)                           │
├──────────────────────────────────────────────┤
│  RecommendationBar                           │
│  [Card1] [Card2] [Card3] [Card4] [Card5]     │
│  horizontal scroll, snap-to-card             │
├──────────────────────────────────────────────┤
│  ┌──────────────┬────────────────────────┐   │
│  │ Path Timeline │   Progress Dashboard   │   │
│  │ (vertical)    │   - Overall stats       │   │
│  │               │   - MasteryRadar        │   │
│  │ [Node Card]   │   - Mastery Grid        │   │
│  │   ↕ animated  │   - Time remaining      │   │
│  │ [Node Card]   │                        │   │
│  │   ↕ edge      │                        │   │
│  │ [Node Card]   │                        │   │
│  └──────────────┴────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### 5.3 LearningPathTimeline (`LearningPathTimeline.tsx`)

Vertical alternating timeline:
- Center vertical line (1px, brand-muted)
- Nodes alternate left/right of the line
- Completed nodes: green glow border, checkmark badge
- In-progress node: amber pulse animation, spinner icon
- Available nodes: brand border, clickable with hover lift
- Locked nodes: slate/dimmed, lock icon, not clickable
- Connection edges: animated SVG paths from prerequisite to dependent
- Each node is a `PathNodeCard`

Staggered entrance: nodes animate in order (depth 0 → depth N), each delayed by 100ms.

### 5.4 PathNodeCard (`PathNodeCard.tsx`)

Reusable card for the timeline:
- Glass card (matches KnowledgeGraphCard style)
- Type icon (Lucide: `BookOpen` for module, `FlaskConical` for experiment)
- Node label + depth badge ("Step 3")
- Status badge (colored pill: green/amber/brand/slate)
- Estimated time label
- Concept count + experiment count chips
- "Start" / "Continue" / "Review" CTA button
- On click → opens detail side panel

### 5.5 RecommendationBar (`RecommendationBar.tsx`)

Horizontal scrolling row of recommendation cards:
- Each card: compact (200px wide × 120px tall), glass style
- Reason badge: "Next Step" / "Gateway" / "Validate" / "Reinforce" / "Explore"
- Node icon + label
- Priority indicator (subtle gradient bar at top, width = priority %)
- Click → navigates to that node in the timeline

Supports horizontal scroll with mouse wheel (native overflow-x-auto with snap-x).

### 5.6 ProgressDashboard (`ProgressDashboard.tsx`)

Right sidebar (sticky, ~320px wide on desktop, full-width below on mobile):
- **Overall Stats**: "X/Y modules completed", "X/Y concepts mastered", "X/Y experiments run"
- **Progress ring**: SVG donut chart showing overall % (Framer Motion animated number)
- **Estimated remaining**: total remaining minutes across incomplete nodes
- **MasteryRadar**: Spider chart of 5 dimension scores (Tokenization, Embedding, Attention, Architecture, Inference)
- **Mastery Grid**: compact table — rows = modules, columns = concepts, cells colored by review status

### 5.7 MasteryRadar (`MasteryRadar.tsx`)

Spider/radar chart showing concept mastery across 5 category dimensions:
- Axes: Tokenization, Embedding, Position Encoding, Attention/FFN, Architecture/Inference
- Each axis: 0-100% (concepts reviewed / total concepts in that category)
- Filled polygon with brand color at 30% opacity + brand stroke
- Animated on progress change (spring-based morph)
- SVG implementation (no chart library needed)

### 5.8 Detail Slide-Out Panel (inline in PageClient)

When a node is selected:
- Slide-in from right, matching `KnowledgeDetailPanel` and `DeepDivePanel` pattern
- Shows: node label, status, description, prerequisite chain (mini horizontal flow), concept checklist (toggleable), linked experiments (with "Run Experiment" links to `/ai-lab/experiments`), "Mark Complete" / "Mark Mastered" CTA buttons
- Close on X, Escape, or click outside

---

## 6. LocalStorage Schema

Key: `minimind-learning-progress`

```json
{
  "v": 1,
  "nodeStatus": {
    "module:tokenizer": "completed",
    "module:embedding": "in_progress",
    "module:attention": "available",
    "module:ffn": "locked"
  },
  "conceptReviewed": {
    "concept:bpe-encoding": true,
    "concept:tokenization-pipeline": true,
    "concept:subword-tokenization": false
  },
  "experimentCompleted": {
    "experiment:tokenizer-comparison-lab": true
  },
  "lastUpdated": "2026-07-30T12:00:00.000Z"
}
```

- Read on mount, write on every mutation
- If no stored progress: initial state = all depth-0 nodes `available`, all others `locked`
- No migration layer needed for v1 → future

---

## 7. Integration Points

### 7.1 AI Lab Hub Page Update

**File:** `src/components/ai-lab/AiLabClient.tsx` (or similar orchestrator)

The hub page already has a `KnowledgeMap` component linking to `/ai-lab/knowledge`. The equivalent Journey entry card should be updated/replaced:
- Change the "Learning Journey" section from placeholder to a live card
- Link points to `/ai-lab/journey` instead of being disabled
- Show mini progress stat (e.g., "3/8 modules completed")

**File:** `src/data/roadmap.ts` — if it tracks journey status, update the phase node for Journey

### 7.2 Knowledge Graph Integration

- All `sourceId` values match `KnowledgeNode.id` format (`module:tokenizer`, `concept:bpe-encoding`, etc.)
- Learning node detail panel shows a "View in Knowledge Graph" link → `/ai-lab/knowledge?node=<sourceId>`
- Knowledge detail panel could optionally show "Add to Learning Path" — deferred to Phase 23+ if needed

### 7.3 Experiments Integration

- Mastery criteria include experiment completion
- "Run Experiment" links go to `/ai-lab/experiments?experiment=<id>`
- Experiment completion in the experiments page could write to the same localStorage key — deferred to future phase

### 7.4 i18n

New namespace: `minimind.learning.*` (or reuse `minimind.journey.*`)

All user-visible strings go through `t()` with entries in `en.json` and `zh-CN.json`.

---

## 8. File Manifest

### New Files (14)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/data/minimind/learning/types.ts` | LearningNode, LearningPath, Recommendation, MasteryTree, UserProgress types |
| 2 | `src/data/minimind/learning/derive-learning.ts` | 8 rules for path derivation |
| 3 | `src/data/minimind/learning/derive-mastery.ts` | 5 rules for recommendations + mastery tree |
| 4 | `src/data/minimind/learning/index.ts` | Internal barrel |
| 5 | `src/data/minimind/learning-registry.ts` | Public API: constants + lookup helpers |
| 6 | `src/lib/minimind/learning/types.ts` | TimelineLayout, RecommendationCardData, MasteryGridData, etc. |
| 7 | `src/lib/minimind/learning/LearningPathAdapter.ts` | adaptTimeline, adaptRecommendations, adaptMasteryGrid |
| 8 | `src/lib/minimind/learning/index.ts` | Adapter barrel |
| 9 | `src/components/minimind/learning/LearningJourneyPageClient.tsx` | State owner + orchestrator |
| 10 | `src/components/minimind/learning/LearningPathTimeline.tsx` | Vertical alternating timeline |
| 11 | `src/components/minimind/learning/PathNodeCard.tsx` | Individual node card on timeline |
| 12 | `src/components/minimind/learning/RecommendationBar.tsx` | Horizontal next-steps recommendations |
| 13 | `src/components/minimind/learning/ProgressDashboard.tsx` | Stats, mastery grid, radar |
| 14 | `src/components/minimind/learning/index.ts` | Component barrel |

### Modified Files (3-4)

| # | File | Change |
|---|------|--------|
| 1 | `src/app/ai-lab/journey/page.tsx` | Replace `SubRoutePlaceholder` with `LearningJourneyPageClient` |
| 2 | `src/components/ai-lab/AiLabClient.tsx` | Update Journey section card to show live data + link |
| 3 | `src/lib/i18n/locales/en.json` | Add `minimind.learning.*` keys |
| 4 | `src/lib/i18n/locales/zh-CN.json` | Add `minimind.learning.*` keys |

### Existing Files — Read-Only (zero changes)

- `src/data/minimind/knowledge-registry.ts`
- `src/data/minimind/module-registry.ts`
- `src/data/minimind/experiment-registry.ts`
- `src/data/minimind/model-registry.ts`
- All other registries

---

## 9. States & Edge Cases

| State | Behavior |
|-------|----------|
| **Empty progress** (first visit) | All depth-0 nodes `available`, others `locked`. Recommendations show "Start Here" cards for depth-0 nodes. |
| **All modules mastered** | Celebration state: completion animation, "You've mastered all modules!" message. Recommendations switch to `explore` + `reinforce` only. |
| **localStorage unavailable** | Graceful degradation: progress works in-memory for the session. Warning toast ("Progress won't be saved"). |
| **Corrupt localStorage data** | Catch parse error, reset to empty progress, show toast "Progress data was reset". |
| **Graph data changes** (new module added) | New nodes appear as `locked` or `available` based on their depth/prerequisites. Existing progress preserved for unchanged nodes. |
| **Mobile viewport** (< 640px) | PathTimeline switches to single-column (no alternating). ProgressDashboard moves below timeline. RecommendationBar becomes vertical stack. |
| **Loading** | Skeleton cards with shimmer animation while computing layout (should be near-instant since computations are pure + memoized). |
| **Empty state** | Should never occur (registries are static), but if paths somehow empty: "No learning paths available." |

---

## 10. Performance

- All derivations are O(n) or O(n²) with n ≤ 50 nodes — negligible
- `KNOWLEDGE_GRAPH`, `LEARNING_REGISTRY` eagerly computed at module load — no runtime cost
- Adapter functions memoized with `useMemo` in PageClient
- localStorage read/write on every mutation — JSON.stringify over <5KB object — negligible
- No server-side work beyond static page serve

---

## 11. Self-Review Checklist

- ✅ No "TODOs" or placeholders in spec
- ✅ All types defined explicitly (no `any`, no `Record<string, unknown>`)
- ✅ SSOT registries not modified
- ✅ No duplicated knowledge — all derived from existing data
- ✅ Architecture follows 3-layer pattern (data → adapter → UI)
- ✅ Scope is single-feature (Learning Intelligence Layer)
- ✅ All user strings are i18n-keyed
- ✅ Edge cases enumerated
- ✅ Mobile responsive specified
- ✅ Follows project conventions (glass cards, Framer Motion, server-component page → client-content delegation)
