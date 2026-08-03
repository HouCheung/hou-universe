# Phase 25: AI Lab Intelligence Layer — Design Spec

> **Status:** Approved · **Date:** 2026-08-03 · **Scope:** Dashboard-first, adapter interface for sub-pages in Phase 26+

---

## Goal

Transform the AI Lab Dashboard from 4 components independently reading localStorage and registries into a unified intelligence layer that answers **"What should I learn next?"** based on completed modules, current mastery, unlocked experiments, learning path, and knowledge graph relationships.

---

## Architecture Decision

**Independent Adapter Layer** — new files under `src/components/ai-lab/intelligence/` that sit between the SSOT registries and the dashboard components. The adapter reads localStorage once, calls learning-registry once, and produces a unified `LearningState` passed down as props.

**Why not embedded in learning-registry?** Cross-system routing (Journey vs Knowledge vs Experiments) is a UI concern. The `data/` layer stays pure derivation.

**Why not dashboard-only?** Would perpetuate duplicated localStorage parsing. The adapter interface is designed for sub-page reuse in Phase 26+.

---

## File Structure

### New Files

```
src/components/ai-lab/intelligence/
├── types.ts                    # LearningState, Mission, EnrichedRecommendation, etc.
├── LearningStateAdapter.ts     # Reads registries + localStorage → unified LearningState
├── RecommendationEngine.ts     # Extends derive-mastery.ts rules with cross-system routing
└── MissionGenerator.ts         # LearningState → Mission (what + why + CTAs)
```

### Modified Files (light touch, no rewrites)

```
src/components/ai-lab/dashboard/
├── AiLabDashboard.tsx          # +useEffect for adaptLearningState(), passes props down
├── DashboardHero.tsx           # Internal localStorage reads → props: stats, phaseLabel
├── CurrentMission.tsx          # Internal deriveMission() → props: mission: Mission
├── ContinueLearning.tsx        # Internal loadResumeData() → props: resume: ResumeData | null
├── ModuleProgressGrid.tsx      # Internal loadNodeStatus() → props: modules: ModuleProgressEntry[]
└── ExplorationLinks.tsx        # No change (already registry-only)
```

### Preserved (untouched)

- All 12 files under `src/data/minimind/`
- All files under `src/lib/minimind/`
- All sub-page clients: `LearningJourneyPageClient`, `KnowledgePageClient`, `ExperimentsPageClient`, `ExperiencePageClient`
- All page routes: `/ai-lab/journey`, `/ai-lab/knowledge`, `/ai-lab/experiments`, `/ai-lab/experience`, `/ai-lab/playground`
- `AiLabClient.tsx` — preserved on disk (Phase 24-B constraint)

---

## Core Types (`types.ts`)

```typescript
import type {
  UserProgress,
  Recommendation,
  RecommendationReason,
  OverallProgress,
  LearningStatus,
} from "@/data/minimind/learning-registry";

// ============================================================
// ActionDomain — cross-system routing awareness
// ============================================================

export type ActionDomain = "journey" | "knowledge" | "experiments" | "playground" | "inference";

// ============================================================
// LearningState — the single unified state object
// ============================================================

export interface LearningState {
  progress: UserProgress | null;
  stats: OverallProgress;
  moduleProgress: ModuleProgressEntry[];
  nextNodes: string[];
  recommendations: EnrichedRecommendation[];
  resume: ResumeData | null;
  isFirstVisit: boolean;
  isAllMastered: boolean;
}

// ============================================================
// EnrichedRecommendation — recommendation + cross-system routing
// ============================================================

export interface EnrichedRecommendation extends Recommendation {
  domain: ActionDomain;
  route: string;
  context: RecommendationContext;
}

export interface RecommendationContext {
  trigger: string;
  unlocks: string[];
  relatedMastered: string[];
}

// ============================================================
// Mission — the answer to "What should I learn next?"
// ============================================================

export interface Mission {
  target: {
    sourceId: string;
    title: string;
    description: string;
    domain: ActionDomain;
    route: string;
  };
  reasoning: string[];
  actions: MissionAction[];
}

export interface MissionAction {
  label: string;
  domain: ActionDomain;
  route: string;
  icon: string;
  priority: "primary" | "secondary";
}

// ============================================================
// ModuleProgressEntry — per-module progress for the grid
// ============================================================

export interface ModuleProgressEntry {
  moduleId: string;
  title: string;
  description: string;
  status: ModuleStatus;
  percent: number;
  conceptTotal: number;
  conceptsReviewed: number;
  experimentTotal: number;
  experimentsCompleted: number;
}

export type ModuleStatus = "mastered" | "completed" | "in_progress" | "available" | "locked";

// ============================================================
// ResumeData — for ContinueLearning card
// ============================================================

export interface ResumeData {
  moduleId: string;
  moduleTitle: string;
  percentComplete: number;
  modulesCompleted: number;
  modulesTotal: number;
  lastUpdated: string;
}
```

### Design notes

- `EnrichedRecommendation` **extends** `Recommendation` from the data layer — additive, not breaking
- `ActionDomain` is the cross-system awareness — each value maps to a specific sub-page route
- `Mission` separates **target** (what), **reasoning** (why), **actions** (how) — three distinct concerns
- `ModuleProgressEntry` adds `conceptsReviewed` and `experimentsCompleted` beyond status — enabling richer tooltips in the grid

---

## LearningStateAdapter (`LearningStateAdapter.ts`)

### Purpose

Single entry point. Reads localStorage once, calls learning-registry once, produces a unified `LearningState`. Every dashboard component consumes this — no component ever calls `localStorage.getItem("minimind-learning-progress")` directly.

### Contract

```typescript
// MUST only be called client-side (inside useEffect / event handler).
// Accesses localStorage and window — will throw during SSR.
export function adaptLearningState(): LearningState
```

### Internal pipeline

1. `loadProgress()` — the ONE localStorage read; returns `null` if `typeof window === "undefined"`
2. `progress ? getOverallProgress(progress) : emptyStats()` — stats or zeros
3. `progress ? getNextNodes(progress) : []` — available module sourceIds
4. `progress ? getRecommendations(progress) : []` — raw recommendations from 5 rules
5. `rawRecs.map(r => enrichRecommendation(r, progress))` — domain routing + context
6. `buildModuleProgress(progress)` — per-module status, percent, concept/experiment counts
7. `buildResumeData(progress)` — in-progress or last-completed module info
8. `isFirstVisit` = no progress object; `isAllMastered` = no next nodes and no recommendations

### Empty state handling

```typescript
function emptyStats(): OverallProgress {
  return {
    modulesCompleted: 0,
    modulesTotal: MINIMIND_MODULES.length,
    conceptsReviewed: 0,
    conceptsTotal: KNOWLEDGE_GRAPH.nodes.filter(n => n.type === "concept").length,
    experimentsCompleted: 0,
    experimentsTotal: MINIMIND_EXPERIMENTS.filter(e => e.status === "active").length,
    percentComplete: 0,
    estimatedRemainingMinutes: 0,
  };
}
```

### Duplication eliminated

Before Phase 25, 4 components each contain their own `StoredProgress` interface and `loadProgress()` helper. After Phase 25, only `LearningStateAdapter.ts` reads localStorage.

---

## RecommendationEngine (`RecommendationEngine.ts`)

### Purpose

Extends the 5 existing recommendation rules from `derive-mastery.ts` with three capabilities the data layer doesn't provide:
1. **Domain routing** — which sub-page handles this recommendation
2. **Rich context** — what triggered it, what it unlocks, related mastered concepts
3. **Human-readable strings** — for UI rendering

### Contract

```typescript
export function enrichRecommendation(rec: Recommendation, progress: UserProgress): EnrichedRecommendation
```

### Domain Routing Map

| Reason | Domain | Route Pattern |
|--------|--------|---------------|
| `next_in_path` | `journey` | `/ai-lab/journey?module=<id>` |
| `prerequisite_for` | `journey` | `/ai-lab/journey?module=<id>` |
| `experiment` | `experiments` | `/ai-lab/experiments?experiment=<id>` |
| `reinforce` | `knowledge` | `/ai-lab/knowledge?concept=<id>` |
| `explore` | `knowledge` | `/ai-lab/knowledge?concept=<id>` |

### Context Building

- **trigger** — find prerequisite nodes marked `completed`/`mastered` in `progress.nodeStatus`, list their labels from the knowledge graph
- **unlocks** — call `getUnlockChain(sourceId)` from learning-registry, list labels of what becomes available
- **relatedMastered** — cross-reference `MASTERY_TREE.conceptModuleMap` with `progress.conceptReviewed`, list labels of mastered concepts related via `relates_to` edges

### No changes to derive-mastery.ts

The 5 rules (R1-R5) in `derive-mastery.ts` remain the SSOT for recommendation logic. `RecommendationEngine` is a **consumer-side enrichment layer** — it takes what the rules produce and adds routing + context without modifying the rules themselves.

---

## MissionGenerator (`MissionGenerator.ts`)

### Purpose

Takes the full `LearningState` and produces a single `Mission` — the primary answer to "What should I learn next?" Implements 5 mission rules (M1-M5) in priority order.

### Contract

```typescript
export function generateMission(state: LearningState): Mission
```

### Mission Rules (Priority Order)

**Rule M1: Next in Path** — a `next_in_path` recommendation exists
- Target: the recommended module
- Reasoning: "Previous module [X] completed" + "[N] experiments unlocked for this module"
- Primary CTA: `Continue Learning` → `/ai-lab/journey?module=<id>`
- Secondary CTA: `Explore Knowledge` → `/ai-lab/knowledge`
- Tertiary CTA (if experiments exist): `Run Experiment` → `/ai-lab/experiments?experiment=<id>`

**Rule M2: Experiment Validation** — module learned but experiment undone
- Target: the uncompleted experiment
- Reasoning: "Module [X] learned but experiment not done" + "Hands-on practice reinforces understanding"
- Primary CTA: `Run Experiment` → `/ai-lab/experiments?experiment=<id>`
- Secondary CTA: `Explore Knowledge` → `/ai-lab/knowledge`

**Rule M3: Concept Reinforcement or Explore** — reinforce or explore recommendation exists
- Target: the recommended concept
- Reasoning: "Concept [X] connects to what you've already learned" + related mastered concepts
- Primary CTA: `Explore Knowledge` → `/ai-lab/knowledge?concept=<id>`
- Secondary CTA: `Continue Journey` → `/ai-lab/journey`

**Rule M4: All Mastered** — every module completed/mastered
- Target: none (congratulation state)
- Reasoning: "All modules mastered" + "Deepen understanding with experiments"
- Primary CTA: `Run Experiment` → `/ai-lab/experiments`
- Secondary CTA: `Try Playground` → `/ai-lab/playground`

**Rule M5: First Visit** — no progress at all
- Target: Tokenizer (MINIMIND_MODULES[0])
- Reasoning: "Start here — the foundation of all language models"
- Primary CTA: `Start Learning` → `/ai-lab/journey?module=tokenizer`
- Secondary CTA: `Explore Knowledge` → `/ai-lab/knowledge`

---

## Dashboard Rewiring

### AiLabDashboard.tsx

Becomes the single state owner:

```typescript
export function AiLabDashboard() {
  const [learningState, setLearningState] = useState<LearningState | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<string>("Foundation");

  useEffect(() => {
    const state = adaptLearningState();
    setLearningState(state);
    setMission(generateMission(state));

    const criticalPath = LEARNING_PATHS.find(p => p.type === "critical");
    setPhaseLabel(criticalPath?.label ?? "Foundation");
  }, []);

  if (!learningState || !mission) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <DashboardHero stats={learningState.stats} phaseLabel={phaseLabel} />
      <CurrentMission mission={mission} />
      <ContinueLearning resume={learningState.resume} />
      <ModuleProgressGrid modules={learningState.moduleProgress} />
      <ExplorationLinks />
    </div>
  );
}
```

### Component Prop Changes

| Component | Phase 24-B Props | Phase 25 Props |
|-----------|-----------------|----------------|
| DashboardHero | None | `stats: OverallProgress`, `phaseLabel: string` |
| CurrentMission | None | `mission: Mission` |
| ContinueLearning | None | `resume: ResumeData \| null` |
| ModuleProgressGrid | None | `modules: ModuleProgressEntry[]` |
| ExplorationLinks | None | None (unchanged) |

### What gets removed from each component

- **DashboardHero:** `StoredProgress` interface, `loadProgressPercent()` helper, `MINIMIND_MODULES` filtering, `LEARNING_PATHS` lookup, `useEffect` for localStorage
- **CurrentMission:** `StoredProgress` interface, `loadProgress()` helper, `MissionData` interface, `deriveMission()` function, `getNextNodes()` call, `getRecommendations()` call, `MINIMIND_MODULES` lookup
- **ContinueLearning:** `StoredProgress` interface, `ResumeData` interface, `loadResumeData()` helper, `getOverallProgress()` call, `MINIMIND_MODULES` lookup
- **ModuleProgressGrid:** `StoredProgress` interface, `loadNodeStatus()` helper, `deriveModuleStatus()` function

### DashboardSkeleton

A simple loading skeleton rendered during SSR gap — matches the existing pattern from [CurrentMission.tsx:160-167](src/components/ai-lab/dashboard/CurrentMission.tsx#L160-L167):

```typescript
function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* Hero skeleton */}
      <div className="rounded-2xl border border-brand/10 bg-brand/[0.03] px-8 py-14 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="h-5 w-36 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
          <div className="h-10 w-64 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
          <div className="h-4 w-96 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
        </div>
      </div>
      {/* Section skeletons */}
      {[1, 2, 3].map(i => (
        <div key={i} className="mt-20 sm:mt-28">
          <div className="mb-6 h-5 w-40 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
          <div className="h-24 animate-pulse rounded-xl border border-brand/10 bg-brand/[0.03]" />
        </div>
      ))}
    </div>
  );
}
```

---

## CurrentMission Visual Evolution

### Phase 24-B (current — single module name + one CTA)

```
┌─────────────────────────────────────────────┐
│ 🎯  NEXT IN PATH                            │
│                                             │
│ Attention                                   │
│ Multi-head self-attention mechanism...      │
│                                    Resume → │
└─────────────────────────────────────────────┘
```

### Phase 25 (new — reasoning list + multi-CTA)

```
┌─────────────────────────────────────────────┐
│ 🎯  CURRENT MISSION                         │
│                                             │
│ Learn Attention Mechanism                   │
│ Multi-head self-attention mechanism with    │
│ causal masking and QKV projection.          │
│                                             │
│ 💡 Why this mission:                        │
│   ✓ Embedding completed                     │
│   ✓ RoPE completed                          │
│   → Attention Heatmap experiment unlocked   │
│   → Unlocks FFN and Transformer modules     │
│                                             │
│ [▶ Continue Learning]  [🧠 Knowledge Graph] │
│         [🔬 Run Experiment]                  │
└─────────────────────────────────────────────┘
```

CTAs use the existing color palette:
- Primary CTA (brand): `Continue Learning` / `Start Learning`
- Knowledge CTA (brand-light / slate): `Explore Knowledge`
- Experiment CTA (amber): `Run Experiment`

Mobile: CTAs stack vertically in a single column.

---

## Visual DNA Preservation

All components continue using:

**Glass morphism:**
```
rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm
dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]
```

**Hover enhancement:**
```
hover:border-brand/20 hover:bg-brand/[0.06]
hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)]
```

**Glow accent bar:**
```
absolute inset-x-0 top-0 h-px rounded-full
bg-gradient-to-r from-transparent via-brand/30 to-transparent
```

**Framer Motion patterns:**
- Section entrance: `opacity: 0, y: 40` → `opacity: 1, y: 0` with `duration: 0.7`, `whileInView`, `viewport: { once: true, margin: "-80px" }`
- Staggered children: `custom={i}` with `delay: i * 0.06`
- Spring transitions for panels: `{ type: "spring", stiffness: 300, damping: 30 }`

**Section spacing:** `mt-20 sm:mt-28`

**SectionHeader:** Imported from `@/components/home/SectionHeader`, used with `titleKey` i18n keys.

---

## i18n Keys (Phase 25-C)

New keys added to the existing `aiLab.dashboard` object (extends Phase 24-B Task 1 keys — `currentMission`, `continueLearning`, `explorationHub`, `resumeJourney`, `openKnowledgeGraph`, `runExperiment`, `lastActive`, `noProgressYet`, `allMastered`, `modulesStat`, `phaseStat`, `progressStat`, and the ExplorationLinks description keys — which remain unchanged):

### en.json additions (insert into existing `aiLab.dashboard`)

```json
"dashboard": {
  "currentMission": "Current Mission",
  "whyHeader": "Why this mission",
  "completedPrefix": "✓",
  "unlocksPrefix": "→",
  "continueLearning": "Continue Learning",
  "exploreKnowledge": "Explore Knowledge",
  "runExperiment": "Run Experiment",
  "tryPlayground": "Try Playground",
  "startLearning": "Start Learning"
}
```

### zh-CN.json additions

```json
"dashboard": {
  "currentMission": "当前任务",
  "whyHeader": "任务依据",
  "completedPrefix": "✓",
  "unlocksPrefix": "→",
  "continueLearning": "继续学习",
  "exploreKnowledge": "探索知识",
  "runExperiment": "运行实验",
  "tryPlayground": "尝试演练",
  "startLearning": "开始学习"
}
```

These extend the existing keys from Phase 24-B Task 1 (already committed).

---

## Data Flow Diagram

```
                         ┌─────────────────────────┐
                         │   SSOT Registries        │
                         │   (module, experiment,   │
                         │    knowledge, learning)   │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │   localStorage           │
                         │   (minimind-learning-    │
                         │    progress)             │
                         └────────────┬────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │  AiLabDashboard (composition root)            │
              │                                               │
              │  useEffect → adaptLearningState()             │
              │            → generateMission(state)           │
              │                                               │
              │  state: LearningState                         │
              │  mission: Mission                             │
              └───────────────────────┬───────────────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
  ┌──────▼──────┐  ┌──────────▼──────┐  ┌──────────▼──────┐
  │ DashboardHero│  │ CurrentMission  │  │ ContinueLearning │
  │  stats       │  │  mission        │  │  resume          │
  │  phaseLabel  │  │                 │  │                  │
  └──────────────┘  └────────────────┘  └──────────────────┘
         │
  ┌──────▼──────┐
  │ ModuleGrid  │
  │  modules[]  │
  └─────────────┘
```

---

## Implementation Phases

### Phase 25-A: Intelligence Layer (4 new files)

| Step | File | Action |
|------|------|--------|
| 1 | `intelligence/types.ts` | Create — all type definitions |
| 2 | `intelligence/LearningStateAdapter.ts` | Create — localStorage → LearningState |
| 3 | `intelligence/RecommendationEngine.ts` | Create — enrich recommendations with domain routing |
| 4 | `intelligence/MissionGenerator.ts` | Create — LearningState → Mission |

**Commit:** `feat(intelligence): add LearningState adapter, recommendation engine, mission generator`

**Build check:** Passes — new files only, nothing imports them yet.

### Phase 25-B: Dashboard Rewiring (5 modified files)

| Step | File | Action |
|------|------|--------|
| 5 | `AiLabDashboard.tsx` | Add `useEffect` + `adaptLearningState()` + `generateMission()`, pass props |
| 6 | `DashboardHero.tsx` | Replace internal localStorage/registry reads with props |
| 7 | `CurrentMission.tsx` | Replace `deriveMission()` with `mission: Mission` prop, add reasoning + multi-CTA |
| 8 | `ContinueLearning.tsx` | Replace `loadResumeData()` with `resume` prop |
| 9 | `ModuleProgressGrid.tsx` | Replace `loadNodeStatus()` with `modules` prop |

**Commit:** `feat(dashboard): rewire dashboard to consume intelligence layer`

**Build check:** Must pass — dashboard reads localStorage once instead of 4 times.

### Phase 25-C: i18n & Polish (2 modified files)

| Step | File | Action |
|------|------|--------|
| 10 | `en.json` / `zh-CN.json` | Add mission reasoning + multi-CTA i18n keys |
| 11 | `CurrentMission.tsx` | Visual polish — reasoning list icons, mobile multi-CTA layout |

**Commit:** `feat(i18n): add intelligence layer UI strings`

---

## Verification Checklist

- [ ] Dashboard renders all 5 sections on `/ai-lab`
- [ ] `localStorage.getItem("minimind-learning-progress")` called exactly once per page load
- [ ] First visit shows Tokenizer mission with "Start here" reasoning and 2 CTAs
- [ ] After completing a module in Journey, returning to Dashboard shows the next module as mission
- [ ] CurrentMission shows reasoning list with checkmarks for completed prerequisites and arrows for unlocks
- [ ] CurrentMission shows 2-3 domain-aware CTA buttons with correct routing
- [ ] Reasoning text references actual completed prerequisite names (not hardcoded)
- [ ] ContinueLearning resume card behavior identical to Phase 24-B
- [ ] ModuleProgressGrid behavior identical to Phase 24-B
- [ ] ExplorationLinks unchanged from Phase 24-B
- [ ] All glass-card visual patterns preserved
- [ ] All Framer Motion animations preserved
- [ ] Mobile responsive — CTAs stack vertically, reasoning list readable
- [ ] Dashboard skeleton renders during SSR gap (no layout shift)
- [ ] `npm run build` passes with zero errors and warnings
- [ ] All existing sub-pages (`/ai-lab/journey`, `/ai-lab/knowledge`, `/ai-lab/experiments`, `/ai-lab/experience`, `/ai-lab/playground`) function unchanged
- [ ] `AiLabClient.tsx` still exists on disk (Phase 24-B constraint)

---

## Phase 26+ Future Path

The `intelligence/` adapter is designed for sub-page consumption:

- `LearningStateAdapter.adaptLearningState()` → can be called by Journey page to get progress
- `RecommendationEngine.enrichRecommendation()` → can enrich the RecommendationBar on Journey page
- `ActionDomain` routing → sub-pages can use the same domain-to-route mapping for cross-linking

No refactoring needed — sub-pages import the same functions the dashboard uses.
