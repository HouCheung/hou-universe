# Phase 25: AI Lab Intelligence Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified intelligence layer that answers "What should I learn next?" — one localStorage read, one adapter call, props-driven dashboard components.

**Architecture:** Four new files under `src/components/ai-lab/intelligence/` sit between SSOT registries and dashboard. `AiLabDashboard` calls `adaptLearningState()` + `generateMission()` once in a `useEffect`, passes results as props. Every dashboard component becomes a pure render function — no internal localStorage reads.

**Tech Stack:** Next.js 14 App Router, TypeScript strict mode, Tailwind CSS, Framer Motion, shadcn/ui, lucide-react icons, react-i18next

---

## Global Constraints

- All files in `d:\123\HOU Universe\` root; no external temp files
- TypeScript strict, no `any` types
- Tailwind only, no raw CSS files, no complex inline `style`
- Framer Motion for animations
- i18n via `useTranslation()` from react-i18next
- Follow existing glass-card visual patterns (rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm)
- `npm run build` must pass with no errors or warnings
- Import order: third-party → internal components → types → styles
- Do NOT modify: `src/data/minimind/*`, `src/lib/minimind/*`, existing sub-page clients, existing page routes
- Do NOT delete `AiLabClient.tsx`

---

### Task 1: Create intelligence types (`types.ts`)

**Files:**
- Create: `src/components/ai-lab/intelligence/types.ts`

**Interfaces:**
- Consumes: `UserProgress`, `Recommendation`, `OverallProgress` from `@/data/minimind/learning-registry`
- Produces: `LearningState`, `EnrichedRecommendation`, `RecommendationContext`, `Mission`, `MissionAction`, `ModuleProgressEntry`, `ModuleStatus`, `ResumeData`, `ActionDomain` — all exported types consumed by Tasks 2-9

- [ ] **Step 1: Create the types file**

Write: `src/components/ai-lab/intelligence/types.ts`

```typescript
// ============================================================
// MiniMind AI Lab Intelligence — Unified Learning State Types
// ============================================================
//
// These types define the intelligence layer contract. All data
// is DERIVED from existing SSOT registries + localStorage.
// Zero new metadata.
// ============================================================

import type {
  UserProgress,
  Recommendation,
  OverallProgress,
} from "@/data/minimind/learning-registry";

// ============================================================
// ActionDomain — cross-system routing awareness
// ============================================================

export type ActionDomain =
  | "journey"
  | "knowledge"
  | "experiments"
  | "playground"
  | "inference";

// ============================================================
// LearningState — the single unified state object
// ============================================================

export interface LearningState {
  /** Raw progress from localStorage (null on first visit) */
  progress: UserProgress | null;
  /** Aggregate stats (zeros when no progress) */
  stats: OverallProgress;
  /** Per-module progress entries for ModuleProgressGrid */
  moduleProgress: ModuleProgressEntry[];
  /** KnowledgeNode.id[] of immediately-available modules */
  nextNodes: string[];
  /** Enriched recommendations with domain routing + context */
  recommendations: EnrichedRecommendation[];
  /** Resume data for ContinueLearning (null when no progress) */
  resume: ResumeData | null;
  /** true when no localStorage progress exists */
  isFirstVisit: boolean;
  /** true when every module is completed/mastered and no recommendations remain */
  isAllMastered: boolean;
}

// ============================================================
// EnrichedRecommendation — recommendation + cross-system routing
// ============================================================

export interface EnrichedRecommendation extends Recommendation {
  /** Which sub-page handles this recommendation */
  domain: ActionDomain;
  /** Full route path with query params */
  route: string;
  /** Rich context for rendering reasoning text */
  context: RecommendationContext;
}

export interface RecommendationContext {
  /** Human-readable trigger: what the user did that caused this */
  trigger: string;
  /** Labels of what this recommendation unlocks */
  unlocks: string[];
  /** Labels of related concepts the user has already reviewed */
  relatedMastered: string[];
}

// ============================================================
// Mission — the answer to "What should I learn next?"
// ============================================================

export interface Mission {
  /** The primary target (module, experiment, or concept) */
  target: {
    sourceId: string;
    title: string;
    description: string;
    domain: ActionDomain;
    route: string;
  };
  /** Ordered human-readable reasoning lines (completed → unlocked) */
  reasoning: string[];
  /** Ordered CTAs (primary first, then secondary) */
  actions: MissionAction[];
}

export interface MissionAction {
  label: string;
  domain: ActionDomain;
  route: string;
  /** lucide-react icon name (e.g. "BookOpen", "Brain") */
  icon: string;
  priority: "primary" | "secondary";
}

// ============================================================
// ModuleProgressEntry — per-module progress for the grid
// ============================================================

export type ModuleStatus =
  | "mastered"
  | "completed"
  | "in_progress"
  | "available"
  | "locked";

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

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — new file, not yet imported by anything.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/intelligence/types.ts
git commit -m "feat(intelligence): add unified LearningState and Mission types"
```

---

### Task 2: Create LearningStateAdapter

**Files:**
- Create: `src/components/ai-lab/intelligence/LearningStateAdapter.ts`

**Interfaces:**
- Consumes: `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`, `KNOWLEDGE_GRAPH` from `@/data/minimind/knowledge-registry`, `getOverallProgress`, `getNextNodes`, `getRecommendations` from `@/data/minimind/learning-registry`, `enrichRecommendation` from `./RecommendationEngine` (Task 3), types from `./types` (Task 1)
- Produces: `adaptLearningState(): LearningState`

- [ ] **Step 1: Create the adapter file**

Write: `src/components/ai-lab/intelligence/LearningStateAdapter.ts`

```typescript
// ============================================================
// LearningStateAdapter — unified learning state from SSOT + localStorage
// ============================================================
//
// MUST only be called client-side (inside useEffect / event handler).
// Accesses localStorage and window — will throw during SSR.
//
// This is the SINGLE entry point for all dashboard data. No other
// component reads localStorage("minimind-learning-progress").
// ============================================================

import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import { KNOWLEDGE_GRAPH } from "@/data/minimind/knowledge-registry";
import {
  getOverallProgress,
  getNextNodes,
  getRecommendations,
  type UserProgress,
  type LearningStatus,
  type OverallProgress,
} from "@/data/minimind/learning-registry";
import { enrichRecommendation } from "./RecommendationEngine";
import type {
  LearningState,
  ModuleProgressEntry,
  ModuleStatus,
  ResumeData,
} from "./types";

// ============================================================
// Stored progress shape (as persisted in localStorage)
// ============================================================

interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

// ============================================================
// Public API
// ============================================================

export function adaptLearningState(): LearningState {
  const progress = loadProgress();

  const stats: OverallProgress = progress
    ? getOverallProgress(progress)
    : emptyStats();

  const nextNodes: string[] = progress ? getNextNodes(progress) : [];

  const rawRecs = progress ? getRecommendations(progress) : [];

  const recommendations = rawRecs.map((rec) =>
    enrichRecommendation(rec, progress)
  );

  const moduleProgress: ModuleProgressEntry[] =
    buildModuleProgress(progress);

  const resume: ResumeData | null = buildResumeData(progress);

  const isFirstVisit = progress === null;
  const isAllMastered =
    progress !== null &&
    nextNodes.length === 0 &&
    rawRecs.length === 0;

  return {
    progress,
    stats,
    moduleProgress,
    nextNodes,
    recommendations,
    resume,
    isFirstVisit,
    isAllMastered,
  };
}

// ============================================================
// localStorage helpers
// ============================================================

function loadProgress(): UserProgress | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return null;

    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;

    return {
      nodeStatus: (parsed.nodeStatus ?? {}) as Record<
        string,
        LearningStatus
      >,
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================
// Empty stats (first visit / no progress)
// ============================================================

function emptyStats(): OverallProgress {
  return {
    modulesCompleted: 0,
    modulesTotal: MINIMIND_MODULES.length,
    conceptsReviewed: 0,
    conceptsTotal: KNOWLEDGE_GRAPH.nodes.filter(
      (n) => n.type === "concept"
    ).length,
    experimentsCompleted: 0,
    experimentsTotal: MINIMIND_EXPERIMENTS.filter(
      (e) => e.status === "active"
    ).length,
    percentComplete: 0,
    estimatedRemainingMinutes: 0,
  };
}

// ============================================================
// Module progress builder
// ============================================================

function buildModuleProgress(
  progress: UserProgress | null
): ModuleProgressEntry[] {
  return MINIMIND_MODULES.map((mod) => {
    const sourceId = `module:${mod.id}`;
    const rawStatus = progress?.nodeStatus[sourceId];
    const status: ModuleStatus = mapStatus(rawStatus ?? null);

    let percent = 0;
    switch (status) {
      case "mastered":
        percent = 100;
        break;
      case "completed":
        percent = 85;
        break;
      case "in_progress":
        percent = 45;
        break;
      case "available":
        percent = 0;
        break;
      case "locked":
        percent = 0;
        break;
    }

    const conceptIds =
      KNOWLEDGE_GRAPH.edges
        .filter(
          (e) =>
            e.source === sourceId && e.type === "explains"
        )
        .map((e) => e.target) ?? [];

    const experimentIds =
      KNOWLEDGE_GRAPH.edges
        .filter(
          (e) =>
            e.target === sourceId && e.type === "experiments"
        )
        .map((e) => e.source) ?? [];

    const conceptsReviewed = progress
      ? conceptIds.filter((cid) => progress.conceptReviewed[cid])
          .length
      : 0;

    const experimentsCompleted = progress
      ? experimentIds.filter(
          (eid) => progress.experimentCompleted[eid]
        ).length
      : 0;

    return {
      moduleId: mod.id,
      title: mod.title,
      description: mod.description,
      status,
      percent,
      conceptTotal: conceptIds.length,
      conceptsReviewed,
      experimentTotal: experimentIds.length,
      experimentsCompleted,
    };
  });
}

function mapStatus(raw: string | null): ModuleStatus {
  if (raw === "mastered") return "mastered";
  if (raw === "completed") return "completed";
  if (raw === "in_progress") return "in_progress";
  if (raw === "available") return "available";
  return "locked";
}

// ============================================================
// Resume data builder
// ============================================================

function buildResumeData(
  progress: UserProgress | null
): ResumeData | null {
  if (!progress) return null;

  // Must have at least one non-locked node
  const hasAnyProgress = Object.values(progress.nodeStatus).some(
    (s) => s !== "locked"
  );
  if (!hasAnyProgress) return null;

  // Find in_progress node, or fall back to last completed/mastered
  let activeSourceId = "";
  for (const [id, status] of Object.entries(progress.nodeStatus)) {
    if (status === "in_progress") {
      activeSourceId = id;
      break;
    }
  }
  if (!activeSourceId) {
    for (const [id, status] of Object.entries(progress.nodeStatus)) {
      if (status === "completed" || status === "mastered") {
        activeSourceId = id;
      }
    }
  }
  if (!activeSourceId) return null;

  const moduleId = activeSourceId.replace(/^module:/, "");
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);
  const stats = getOverallProgress(progress);

  return {
    moduleId,
    moduleTitle: mod?.title ?? moduleId,
    percentComplete: stats.percentComplete,
    modulesCompleted: stats.modulesCompleted,
    modulesTotal: stats.modulesTotal,
    lastUpdated: progress.lastUpdated,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: May fail with "Cannot find module './RecommendationEngine'" — expected, fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/intelligence/LearningStateAdapter.ts
git commit -m "feat(intelligence): add LearningStateAdapter — single localStorage→LearningState pipeline"
```

---

### Task 3: Create RecommendationEngine

**Files:**
- Create: `src/components/ai-lab/intelligence/RecommendationEngine.ts`

**Interfaces:**
- Consumes: `Recommendation`, `UserProgress` from `@/data/minimind/learning-registry`, `KNOWLEDGE_GRAPH`, `getNodeById` from `@/data/minimind/knowledge-registry`, `MASTERY_TREE`, `getUnlockChain` from `@/data/minimind/learning-registry`, types from `./types` (Task 1)
- Produces: `enrichRecommendation(rec: Recommendation, progress: UserProgress): EnrichedRecommendation`

- [ ] **Step 1: Create the engine file**

Write: `src/components/ai-lab/intelligence/RecommendationEngine.ts`

```typescript
// ============================================================
// RecommendationEngine — enrich raw recommendations with
// cross-system routing + human-readable context
// ============================================================
//
// Takes the 5 recommendation rules from derive-mastery.ts and
// adds three capabilities the data layer doesn't provide:
//   1. Domain routing — which sub-page to link to
//   2. Rich context — trigger, unlocks, related mastered concepts
//   3. Human-readable strings for UI rendering
//
// Pure functions. Zero side effects. Does NOT modify derive-mastery.ts.
// ============================================================

import { KNOWLEDGE_GRAPH, getNodeById } from "@/data/minimind/knowledge-registry";
import {
  MASTERY_TREE,
  getUnlockChain,
  type UserProgress,
  type Recommendation,
} from "@/data/minimind/learning-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import type {
  EnrichedRecommendation,
  RecommendationContext,
  ActionDomain,
} from "./types";

// ============================================================
// Domain routing map
// ============================================================

const REASON_DOMAIN_MAP: Record<
  string,
  { domain: ActionDomain; routePrefix: string; idParam: string }
> = {
  next_in_path: {
    domain: "journey",
    routePrefix: "/ai-lab/journey",
    idParam: "module",
  },
  prerequisite_for: {
    domain: "journey",
    routePrefix: "/ai-lab/journey",
    idParam: "module",
  },
  experiment: {
    domain: "experiments",
    routePrefix: "/ai-lab/experiments",
    idParam: "experiment",
  },
  reinforce: {
    domain: "knowledge",
    routePrefix: "/ai-lab/knowledge",
    idParam: "concept",
  },
  explore: {
    domain: "knowledge",
    routePrefix: "/ai-lab/knowledge",
    idParam: "concept",
  },
};

// ============================================================
// Public API
// ============================================================

export function enrichRecommendation(
  rec: Recommendation,
  progress: UserProgress
): EnrichedRecommendation {
  const routing = REASON_DOMAIN_MAP[rec.reason] ?? {
    domain: "journey" as ActionDomain,
    routePrefix: "/ai-lab/journey",
    idParam: "module",
  };

  const cleanId = rec.sourceId.replace(/^(module|experiment|concept):/, "");

  const route = `${routing.routePrefix}?${routing.idParam}=${encodeURIComponent(cleanId)}`;

  const context = buildContext(rec, progress);

  return {
    ...rec,
    domain: routing.domain,
    route,
    context,
  };
}

// ============================================================
// Context building
// ============================================================

function buildContext(
  rec: Recommendation,
  progress: UserProgress
): RecommendationContext {
  const trigger = buildTrigger(rec, progress);
  const unlocks = buildUnlocks(rec);
  const relatedMastered = buildRelatedMastered(progress);

  return { trigger, unlocks, relatedMastered };
}

/** List prerequisite labels that are completed/mastered */
function buildTrigger(
  rec: Recommendation,
  progress: UserProgress
): string {
  // Find the knowledge node and its prerequisite edges
  const node = getNodeById(rec.sourceId);
  if (!node) return "";

  const prereqEdges = KNOWLEDGE_GRAPH.edges.filter(
    (e) => e.source === rec.sourceId && e.type === "depends_on"
  );

  if (prereqEdges.length === 0) return "";

  const completedPrereqs = prereqEdges
    .filter((e) => {
      const s = progress.nodeStatus[e.target] ?? "locked";
      return s === "completed" || s === "mastered";
    })
    .map((e) => {
      const prereqNode = getNodeById(e.target);
      return prereqNode?.label ?? e.target;
    });

  if (completedPrereqs.length === 0) return "";

  return completedPrereqs.join(", ") + " completed";
}

/** List what this recommendation unlocks (transitively) */
function buildUnlocks(rec: Recommendation): string[] {
  // getUnlockChain works for module sourceIds
  if (!rec.sourceId.startsWith("module:")) return [];

  try {
    const chain = getUnlockChain(rec.sourceId);
    return chain
      .map((n) => n.knowledgeNode.label)
      .filter(Boolean)
      .slice(0, 5); // top 5, avoid bloat
  } catch {
    return [];
  }
}

/** List mastered concepts related to any concept the user reviewed */
function buildRelatedMastered(progress: UserProgress): string[] {
  const reviewedIds = Object.entries(progress.conceptReviewed)
    .filter(([, reviewed]) => reviewed)
    .map(([id]) => id);

  if (reviewedIds.length === 0) return [];

  const related: string[] = [];

  for (const concept of MASTERY_TREE.concepts) {
    if (progress.conceptReviewed[concept.conceptId]) continue;

    // Check if any reviewed concept relates to this one
    const hasRelation = reviewedIds.some(
      (rid) =>
        concept.relatesToScores[rid] !== undefined &&
        concept.relatesToScores[rid] > 0
    );

    if (hasRelation) {
      related.push(concept.conceptLabel);
    }
  }

  return related.slice(0, 5);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — Task 2's import of `./RecommendationEngine` now resolves.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/intelligence/RecommendationEngine.ts
git commit -m "feat(intelligence): add RecommendationEngine with cross-system routing"
```

---

### Task 4: Create MissionGenerator

**Files:**
- Create: `src/components/ai-lab/intelligence/MissionGenerator.ts`

**Interfaces:**
- Consumes: `LearningState`, `Mission`, `MissionAction`, `ActionDomain`, `EnrichedRecommendation` from `./types` (Task 1), `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`, `getNodeById` from `@/data/minimind/knowledge-registry`
- Produces: `generateMission(state: LearningState): Mission`

- [ ] **Step 1: Create the mission generator file**

Write: `src/components/ai-lab/intelligence/MissionGenerator.ts`

```typescript
// ============================================================
// MissionGenerator — LearningState → Mission
// ============================================================
//
// Implements 5 mission rules (M1-M5) in priority order to
// produce the single answer to "What should I learn next?"
// ============================================================

import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import { getNodeById } from "@/data/minimind/knowledge-registry";
import type {
  LearningState,
  Mission,
  MissionAction,
  ActionDomain,
  EnrichedRecommendation,
} from "./types";

// ============================================================
// Public API
// ============================================================

export function generateMission(state: LearningState): Mission {
  if (state.isFirstVisit) return firstVisitMission();
  if (state.isAllMastered) return allMasteredMission();

  const recs = state.recommendations;

  // M1: next_in_path
  const nextInPath = recs.find((r) => r.reason === "next_in_path");
  if (nextInPath) return nextInPathMission(nextInPath);

  // M2: experiment
  const experiment = recs.find((r) => r.reason === "experiment");
  if (experiment) return experimentMission(experiment);

  // M3: reinforce or explore
  const reinforce = recs.find(
    (r) => r.reason === "reinforce" || r.reason === "explore"
  );
  if (reinforce) return reinforceMission(reinforce);

  // Fallback — shouldn't reach here, but safe
  return firstVisitMission();
}

// ============================================================
// Rule M1: Next in Path
// ============================================================

function nextInPathMission(rec: EnrichedRecommendation): Mission {
  const moduleId = rec.sourceId.replace(/^module:/, "");
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);
  const title = mod?.title ?? moduleId;
  const description = mod?.description ?? "";

  const reasoning: string[] = [];
  if (rec.context.trigger) {
    reasoning.push(rec.context.trigger);
  }
  for (const unlock of rec.context.unlocks) {
    reasoning.push(`Unlocks: ${unlock}`);
  }

  // Check if this module has experiments
  const expCount = MINIMIND_EXPERIMENTS.filter(
    (e) => e.relatedModule === moduleId && e.status === "active"
  ).length;

  const actions: MissionAction[] = [
    {
      label: "Continue Learning",
      domain: "journey" as ActionDomain,
      route: rec.route,
      icon: "BookOpen",
      priority: "primary",
    },
    {
      label: "Explore Knowledge",
      domain: "knowledge" as ActionDomain,
      route: "/ai-lab/knowledge",
      icon: "Brain",
      priority: "secondary",
    },
  ];

  if (expCount > 0) {
    const firstExp = MINIMIND_EXPERIMENTS.find(
      (e) => e.relatedModule === moduleId && e.status === "active"
    );
    if (firstExp) {
      actions.push({
        label: "Run Experiment",
        domain: "experiments" as ActionDomain,
        route: `/ai-lab/experiments?experiment=${encodeURIComponent(firstExp.id)}`,
        icon: "FlaskConical",
        priority: "secondary",
      });
    }
  }

  return {
    target: {
      sourceId: rec.sourceId,
      title,
      description,
      domain: "journey",
      route: rec.route,
    },
    reasoning,
    actions,
  };
}

// ============================================================
// Rule M2: Experiment Validation
// ============================================================

function experimentMission(rec: EnrichedRecommendation): Mission {
  const expId = rec.sourceId.replace(/^experiment:/, "");
  const exp = MINIMIND_EXPERIMENTS.find((e) => e.id === expId);

  const moduleId = exp?.relatedModule ?? "";
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);

  const reasoning: string[] = [
    `Module "${mod?.title ?? moduleId}" learned — experiment not yet done.`,
    "Hands-on practice reinforces understanding.",
  ];

  const actions: MissionAction[] = [
    {
      label: "Run Experiment",
      domain: "experiments" as ActionDomain,
      route: rec.route,
      icon: "FlaskConical",
      priority: "primary",
    },
    {
      label: "Explore Knowledge",
      domain: "knowledge" as ActionDomain,
      route: "/ai-lab/knowledge",
      icon: "Brain",
      priority: "secondary",
    },
  ];

  return {
    target: {
      sourceId: rec.sourceId,
      title: exp?.title ?? expId,
      description: exp?.description ?? "",
      domain: "experiments",
      route: rec.route,
    },
    reasoning,
    actions,
  };
}

// ============================================================
// Rule M3: Concept Reinforcement / Explore
// ============================================================

function reinforceMission(rec: EnrichedRecommendation): Mission {
  const conceptId = rec.sourceId.replace(/^concept:/, "");
  const conceptNode = getNodeById(rec.sourceId);
  const title = conceptNode?.label ?? conceptId;
  const description =
    conceptNode?.metadata?.description ?? "";

  const reasoning: string[] = [
    `"${title}" connects to concepts you've already reviewed.`,
  ];
  for (const related of rec.context.relatedMastered) {
    reasoning.push(`Related: ${related}`);
  }

  const actions: MissionAction[] = [
    {
      label: "Explore Knowledge",
      domain: "knowledge" as ActionDomain,
      route: rec.route,
      icon: "Brain",
      priority: "primary",
    },
    {
      label: "Continue Journey",
      domain: "journey" as ActionDomain,
      route: "/ai-lab/journey",
      icon: "BookOpen",
      priority: "secondary",
    },
  ];

  return {
    target: {
      sourceId: rec.sourceId,
      title,
      description,
      domain: "knowledge",
      route: rec.route,
    },
    reasoning,
    actions,
  };
}

// ============================================================
// Rule M4: All Mastered
// ============================================================

function allMasteredMission(): Mission {
  const reasoning: string[] = [
    "All modules mastered.",
    "Deepen understanding with experiments.",
  ];

  const actions: MissionAction[] = [
    {
      label: "Run Experiment",
      domain: "experiments" as ActionDomain,
      route: "/ai-lab/experiments",
      icon: "FlaskConical",
      priority: "primary",
    },
    {
      label: "Try Playground",
      domain: "playground" as ActionDomain,
      route: "/ai-lab/playground",
      icon: "Gamepad2",
      priority: "secondary",
    },
  ];

  return {
    target: {
      sourceId: "",
      title: "All Modules Mastered",
      description: "",
      domain: "experiments",
      route: "/ai-lab/experiments",
    },
    reasoning,
    actions,
  };
}

// ============================================================
// Rule M5: First Visit
// ============================================================

function firstVisitMission(): Mission {
  const firstModule = MINIMIND_MODULES[0];
  const moduleId = firstModule?.id ?? "tokenizer";

  const reasoning: string[] = [
    "Start here — the foundation of all language models.",
    "Tokenizer converts raw text into numbers the model can process.",
  ];

  const actions: MissionAction[] = [
    {
      label: "Start Learning",
      domain: "journey" as ActionDomain,
      route: `/ai-lab/journey?module=${encodeURIComponent(moduleId)}`,
      icon: "BookOpen",
      priority: "primary",
    },
    {
      label: "Explore Knowledge",
      domain: "knowledge" as ActionDomain,
      route: "/ai-lab/knowledge",
      icon: "Brain",
      priority: "secondary",
    },
  ];

  return {
    target: {
      sourceId: `module:${moduleId}`,
      title: firstModule?.title ?? "Tokenizer",
      description: firstModule?.description ?? "",
      domain: "journey",
      route: `/ai-lab/journey?module=${encodeURIComponent(moduleId)}`,
    },
    reasoning,
    actions,
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — all four intelligence files compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/intelligence/MissionGenerator.ts
git commit -m "feat(intelligence): add MissionGenerator with 5 priority rules"
```

---

### Task 5: Rewire AiLabDashboard composition root

**Files:**
- Modify: `src/components/ai-lab/dashboard/AiLabDashboard.tsx`

**Interfaces:**
- Consumes: `adaptLearningState` from `../intelligence/LearningStateAdapter` (Task 2), `generateMission` from `../intelligence/MissionGenerator` (Task 4), `LearningState`, `Mission` from `../intelligence/types` (Task 1), `LEARNING_PATHS` from `@/data/minimind/learning-registry`, `DashboardHero`, `CurrentMission`, `ContinueLearning`, `ExplorationLinks`, `ModuleProgressGrid`
- Produces: `AiLabDashboard` — default-exported function component, no props. Now manages state internally and passes props to children.

- [ ] **Step 1: Read the current file**

Read `src/components/ai-lab/dashboard/AiLabDashboard.tsx`. The current content is:

```tsx
"use client";

import { DashboardHero } from "./DashboardHero";
import { CurrentMission } from "./CurrentMission";
import { ContinueLearning } from "./ContinueLearning";
import { ExplorationLinks } from "./ExplorationLinks";
import { ModuleProgressGrid } from "../ModuleProgressGrid";

export function AiLabDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <DashboardHero />
      <CurrentMission />
      <ContinueLearning />
      <ModuleProgressGrid />
      <ExplorationLinks />
    </div>
  );
}
```

- [ ] **Step 2: Rewrite with state management and props**

Replace the entire file content:

```tsx
"use client";

// ============================================================
// AiLabDashboard — AI Lab Dashboard composition root
// ============================================================
//
// Phase 25: Single state owner. Reads localStorage + registries
// once via adaptLearningState(), produces a unified LearningState,
// generates a Mission, and passes results as props to children.
//
//   1. DashboardHero    — stats + phaseLabel props
//   2. CurrentMission   — mission prop
//   3. ContinueLearning — resume prop
//   4. ModuleProgressGrid — modules prop
//   5. ExplorationLinks  — unchanged (registry-only)
//
// All data comes from SSOT registries. Zero new metadata.
// One localStorage read per page load (down from 4 in Phase 24-B).
// ============================================================

import { useState, useEffect, type ReactElement } from "react";
import { DashboardHero } from "./DashboardHero";
import { CurrentMission } from "./CurrentMission";
import { ContinueLearning } from "./ContinueLearning";
import { ExplorationLinks } from "./ExplorationLinks";
import { ModuleProgressGrid } from "../ModuleProgressGrid";
import { adaptLearningState } from "../intelligence/LearningStateAdapter";
import { generateMission } from "../intelligence/MissionGenerator";
import { LEARNING_PATHS } from "@/data/minimind/learning-registry";
import type { LearningState } from "../intelligence/types";
import type { Mission } from "../intelligence/types";

// ============================================================
// Skeleton — renders during SSR gap, matches existing patterns
// ============================================================

function DashboardSkeleton(): ReactElement {
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
      {[1, 2, 3].map((i) => (
        <div key={i} className="mt-20 sm:mt-28">
          <div className="mb-6 h-5 w-40 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
          <div className="h-24 animate-pulse rounded-xl border border-brand/10 bg-brand/[0.03]" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// AiLabDashboard
// ============================================================

export function AiLabDashboard(): ReactElement {
  const [learningState, setLearningState] =
    useState<LearningState | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<string>("Foundation");

  useEffect(() => {
    const state = adaptLearningState();
    setLearningState(state);
    setMission(generateMission(state));

    const criticalPath = LEARNING_PATHS.find(
      (p) => p.type === "critical"
    );
    setPhaseLabel(criticalPath?.label ?? "Foundation");
  }, []);

  if (!learningState || !mission) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <DashboardHero
        stats={learningState.stats}
        phaseLabel={phaseLabel}
      />
      <CurrentMission mission={mission} />
      <ContinueLearning resume={learningState.resume} />
      <ModuleProgressGrid modules={learningState.moduleProgress} />
      <ExplorationLinks />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Will fail with type errors — DashboardHero, CurrentMission, ContinueLearning, ModuleProgressGrid still expect no props. This is expected; fixed in Tasks 6-9 sequentially.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/dashboard/AiLabDashboard.tsx
git commit -m "feat(dashboard): add state management — adaptLearningState + generateMission in useEffect"
```

---

### Task 6: Rewire DashboardHero to accept props

**Files:**
- Modify: `src/components/ai-lab/dashboard/DashboardHero.tsx`

**Interfaces:**
- Consumes: `OverallProgress` from `@/data/minimind/learning-registry`
- Produces: `DashboardHero` — accepts `stats: OverallProgress` and `phaseLabel: string` props. Removes all internal localStorage reading and MINIMIND_MODULES/LEARNING_PATHS imports.

- [ ] **Step 1: Read the current file**

Read `src/components/ai-lab/dashboard/DashboardHero.tsx`.

- [ ] **Step 2: Rewrite with props**

Replace the entire file content:

```tsx
"use client";

// ============================================================
// DashboardHero — AI Lab identity + live MiniMind stats
// ============================================================
//
// Phase 25: Pure render component. Receives stats and phaseLabel
// as props from AiLabDashboard. No localStorage, no registry reads.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles, Rocket, Box, Layers, TrendingUp } from "lucide-react";
import type { OverallProgress } from "@/data/minimind/learning-registry";

// ============================================================
// Props
// ============================================================

interface DashboardHeroProps {
  stats: OverallProgress;
  phaseLabel: string;
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.4 + i * 0.12, ease: "easeOut" },
  }),
};

// ============================================================
// DashboardHero
// ============================================================

export function DashboardHero({ stats, phaseLabel }: DashboardHeroProps) {
  const { t } = useTranslation();

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={variants}
      className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
    >
      {/* Glow accent */}
      <span
        className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center gap-4">
        {/* Subhead pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <Rocket className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("aiLab.subhead")}
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("aiLab.heading")}
        </h1>

        {/* Intro */}
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("aiLab.intro")}
        </p>

        {/* Mission */}
        <div className="flex items-center gap-1.5 text-xs text-brand/60 dark:text-brand-light/60">
          <Sparkles className="size-3" />
          <span className="font-mono italic">
            {t("aiLab.missionStatement")}
          </span>
        </div>

        {/* ── Live stat row ── */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
          {/* Modules */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <Box className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {stats.modulesCompleted}/{stats.modulesTotal}
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.modulesStat")}
            </span>
          </motion.div>

          {/* Phase */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <Layers className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground">
              {phaseLabel}
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.phaseStat")}
            </span>
          </motion.div>

          {/* Progress */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <TrendingUp className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {stats.percentComplete}%
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.progressStat")}
            </span>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: DashboardHero type error resolved. Other prop mismatches remain for CurrentMission, ContinueLearning, ModuleProgressGrid.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/DashboardHero.tsx
git commit -m "refactor(dashboard): DashboardHero accepts stats + phaseLabel props, removes localStorage reads"
```

---

### Task 7: Rewire CurrentMission with mission prop + reasoning + multi-CTA

**Files:**
- Modify: `src/components/ai-lab/dashboard/CurrentMission.tsx`

**Interfaces:**
- Consumes: `Mission`, `MissionAction` from `../intelligence/types` (Task 1), `SectionHeader` from `@/components/home/SectionHeader`, `aiLab.dashboard.*` i18n keys
- Produces: `CurrentMission` — accepts `mission: Mission` prop. Removes all localStorage reading, `deriveMission()`, `getNextNodes()`, `getRecommendations()`. Adds reasoning list rendering and multi-CTA buttons.

- [ ] **Step 1: Read the current file**

Read `src/components/ai-lab/dashboard/CurrentMission.tsx`. Reference: the Phase 24-B version at lines 1-235 (already read in this session).

- [ ] **Step 2: Rewrite with mission prop + reasoning + multi-CTA**

Replace the entire file content:

```tsx
"use client";

// ============================================================
// CurrentMission — mission card with reasoning + multi-CTA
// ============================================================
//
// Phase 25: Pure render component. Receives a Mission from
// AiLabDashboard. Renders:
//   - Target module/experiment/concept title + description
//   - Reasoning list (completed prereqs → unlocks)
//   - 2-3 domain-aware CTA buttons
//
// States:
//   - Active mission: target card + reasoning + CTAs
//   - All mastered: congratulation state with experiment CTA
//   - First visit: Tokenizer mission with "Start here" reasoning
//
// Data: all from mission prop. Zero localStorage access.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Target,
  CheckCircle2,
  BookOpen,
  Brain,
  FlaskConical,
  Gamepad2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { cn } from "@/lib/utils";
import type { Mission, MissionAction } from "../intelligence/types";

// ============================================================
// Props
// ============================================================

interface CurrentMissionProps {
  mission: Mission;
}

// ============================================================
// Icon map (icon name string → LucideIcon)
// ============================================================

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  Brain,
  FlaskConical,
  Gamepad2,
};

// ============================================================
// CTA color map by domain
// ============================================================

interface CtaStyle {
  borderClass: string;
  bgClass: string;
  textClass: string;
}

const CTA_STYLE_MAP: Record<string, CtaStyle> = {
  journey: {
    borderClass:
      "border-brand/15 dark:border-brand/20",
    bgClass:
      "bg-brand/[0.04] hover:bg-brand/[0.08] dark:hover:bg-brand/[0.06]",
    textClass:
      "text-brand/80 hover:text-brand dark:text-brand/70 dark:hover:text-brand/90",
  },
  knowledge: {
    borderClass:
      "border-brand/10 dark:border-white/[0.08]",
    bgClass:
      "bg-brand/[0.02] hover:bg-brand/[0.05] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]",
    textClass:
      "text-slate-600/80 hover:text-brand dark:text-slate-400/70 dark:hover:text-brand/70",
  },
  experiments: {
    borderClass:
      "border-amber-500/15 dark:border-amber-500/20",
    bgClass:
      "bg-amber-500/[0.03] hover:bg-amber-500/[0.06] dark:hover:bg-amber-500/[0.05]",
    textClass:
      "text-amber-600/80 hover:text-amber-600 dark:text-amber-500/60 dark:hover:text-amber-500/80",
  },
  playground: {
    borderClass:
      "border-sky-500/15 dark:border-sky-500/20",
    bgClass:
      "bg-sky-500/[0.03] hover:bg-sky-500/[0.06]",
    textClass:
      "text-sky-600/80 hover:text-sky-600 dark:text-sky-500/60 dark:hover:text-sky-500/80",
  },
};

function getCtaStyle(domain: string): CtaStyle {
  return (
    CTA_STYLE_MAP[domain] ?? CTA_STYLE_MAP["journey"]
  );
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// CurrentMission
// ============================================================

export function CurrentMission({ mission }: CurrentMissionProps) {
  const { t } = useTranslation();

  // All mastered state
  if (mission.target.sourceId === "") {
    return (
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={variants}
        className="mt-20 sm:mt-28"
      >
        <SectionHeader titleKey="aiLab.dashboard.currentMission" />

        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] px-6 py-8 text-center backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]">
          <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-500/70" />
          <p className="text-base font-semibold text-foreground">
            {t("aiLab.dashboard.allMastered")}
          </p>

          {/* CTAs */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {mission.actions.map((action) => {
              const Icon = ICON_MAP[action.icon] ?? ArrowRight;
              const style = getCtaStyle(action.domain);
              return (
                <Link
                  key={action.label}
                  href={action.route}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300",
                    style.borderClass,
                    style.bgClass,
                    style.textClass,
                    "hover:border-brand/30"
                  )}
                >
                  <Icon className="size-3.5" />
                  {action.label}
                </Link>
              );
            })}
          </div>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.currentMission" />

      {/* ── Mission card ── */}
      <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
        {/* Target header */}
        <div className="flex items-center gap-5 px-6 py-5 sm:px-8 sm:py-6">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] dark:border-brand/25 dark:bg-brand/[0.08]">
            <Target className="size-5.5 text-brand/70" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-brand/60 dark:text-brand/50">
              {t("aiLab.dashboard.currentMission")}
            </span>
            <h3 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
              {mission.target.title}
            </h3>
            {mission.target.description && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500/80 dark:text-slate-400/70 sm:text-sm">
                {mission.target.description}
              </p>
            )}
          </div>
        </div>

        {/* Reasoning list */}
        {mission.reasoning.length > 0 && (
          <div className="border-t border-brand/5 px-6 py-4 sm:px-8 dark:border-white/[0.04]">
            <h4 className="mb-2.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400/80 dark:text-slate-500/80">
              {t("aiLab.dashboard.whyHeader")}
            </h4>
            <ul className="space-y-1.5">
              {mission.reasoning.map((line, i) => {
                const isUnlock = line.startsWith("Unlocks:");
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400"
                  >
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 text-[0.6rem]",
                        isUnlock
                          ? "text-brand/60"
                          : "text-emerald-500/60"
                      )}
                    >
                      {isUnlock
                        ? t("aiLab.dashboard.unlocksPrefix")
                        : t("aiLab.dashboard.completedPrefix")}
                    </span>
                    <span>{line}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex flex-wrap items-center gap-2.5 border-t border-brand/5 px-6 py-4 sm:px-8 dark:border-white/[0.04]">
          {mission.actions.map((action) => {
            const Icon = ICON_MAP[action.icon] ?? ArrowRight;
            const style = getCtaStyle(action.domain);
            return (
              <Link
                key={action.label}
                href={action.route}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-300",
                  style.borderClass,
                  style.bgClass,
                  style.textClass,
                  "hover:border-brand/30"
                )}
              >
                <Icon className="size-3.5" />
                {action.label}
                <ArrowRight className="size-3" />
              </Link>
            );
          })}
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: CurrentMission type error resolved. ContinueLearning and ModuleProgressGrid type errors remain.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/CurrentMission.tsx
git commit -m "feat(dashboard): CurrentMission renders mission prop with reasoning list + multi-CTA"
```

---

### Task 8: Rewire ContinueLearning to accept resume prop

**Files:**
- Modify: `src/components/ai-lab/dashboard/ContinueLearning.tsx`

**Interfaces:**
- Consumes: `ResumeData` from `../intelligence/types` (Task 1), `SectionHeader` from `@/components/home/SectionHeader`, `aiLab.dashboard.*` i18n keys
- Produces: `ContinueLearning` — accepts `resume: ResumeData | null` prop. Removes all localStorage reading, `loadResumeData()`, `getOverallProgress()`, `MINIMIND_MODULES` import.

- [ ] **Step 1: Read the current file**

Read `src/components/ai-lab/dashboard/ContinueLearning.tsx`.

- [ ] **Step 2: Rewrite with resume prop**

Replace the entire file content:

```tsx
"use client";

// ============================================================
// ContinueLearning — resume card driven by resume prop
// ============================================================
//
// Phase 25: Pure render component. Receives resume data as a
// prop from AiLabDashboard. Returns null when no progress exists.
//
// States:
//   - resume: ResumeData — shows resume card with 3 action buttons
//   - resume: null — renders nothing (return null)
//
// Data: all from resume prop. Zero localStorage access.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  BookOpen,
  Brain,
  FlaskConical,
  ArrowRight,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import type { ResumeData } from "../intelligence/types";

// ============================================================
// Props
// ============================================================

interface ContinueLearningProps {
  resume: ResumeData | null;
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// Time ago formatter
// ============================================================

function formatTimeAgo(isoString: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return "";
  }
}

// ============================================================
// ContinueLearning
// ============================================================

export function ContinueLearning({
  resume,
}: ContinueLearningProps) {
  const { t } = useTranslation();

  // ── Hidden when no progress ──
  if (!resume) return null;

  const timeAgo = formatTimeAgo(resume.lastUpdated);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.continueLearning" />

      <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-6 py-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-8 sm:py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: resume info */}
          <div className="flex items-center gap-4">
            {/* Progress ring */}
            <div className="relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-brand/20 bg-brand/[0.04] dark:border-brand/25 dark:bg-brand/[0.06]">
              <span className="text-sm font-bold tabular-nums text-brand dark:text-brand-light">
                {resume.percentComplete}%
              </span>
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {resume.moduleTitle}
              </p>
              <p className="mt-0.5 text-xs text-slate-500/80 dark:text-slate-400/70">
                {resume.modulesCompleted}/{resume.modulesTotal}{" "}
                {t("aiLab.dashboard.modulesStat")}
                {" · "}
                {resume.percentComplete}%{" "}
                {t("aiLab.dashboard.progressStat")}
              </p>
              {timeAgo && (
                <p className="mt-1.5 flex items-center gap-1 text-[0.65rem] text-slate-400/80 dark:text-slate-500/70">
                  <Clock className="size-3" />
                  {t("aiLab.dashboard.lastActive")}: {timeAgo}
                </p>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Continue Journey */}
            <Link
              href={`/ai-lab/journey?module=${encodeURIComponent(resume.moduleId)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-3.5 py-2 text-xs font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
            >
              <BookOpen className="size-3.5" />
              {t("aiLab.dashboard.resumeJourney")}
              <ArrowRight className="size-3" />
            </Link>

            {/* Open Knowledge Graph */}
            <Link
              href="/ai-lab/knowledge"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.02] px-3.5 py-2 text-xs font-medium text-slate-600/80 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400/70 dark:hover:border-brand/25 dark:hover:text-brand/70"
            >
              <Brain className="size-3.5" />
              {t("aiLab.dashboard.openKnowledgeGraph")}
            </Link>

            {/* Run Experiment */}
            <Link
              href="/ai-lab/experiments"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/[0.03] px-3.5 py-2 text-xs font-medium text-amber-600/80 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-600 dark:border-amber-500/20 dark:text-amber-500/60 dark:hover:border-amber-500/35 dark:hover:text-amber-500/80"
            >
              <FlaskConical className="size-3.5" />
              {t("aiLab.dashboard.runExperiment")}
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: ContinueLearning type error resolved. ModuleProgressGrid type error remains.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/dashboard/ContinueLearning.tsx
git commit -m "refactor(dashboard): ContinueLearning accepts resume prop, removes localStorage reads"
```

---

### Task 9: Rewire ModuleProgressGrid to accept modules prop

**Files:**
- Modify: `src/components/ai-lab/ModuleProgressGrid.tsx`

**Interfaces:**
- Consumes: `ModuleProgressEntry`, `ModuleStatus` from `@/components/ai-lab/intelligence/types` (Task 1), `SectionHeader` from `@/components/home/SectionHeader`
- Produces: `ModuleProgressGrid` — accepts `modules: ModuleProgressEntry[]` prop. Removes all localStorage reading, `loadNodeStatus()`, `deriveModuleStatus()`, `MINIMIND_MODULES` import.

- [ ] **Step 1: Read the current file**

Read `src/components/ai-lab/ModuleProgressGrid.tsx`.

- [ ] **Step 2: Rewrite with modules prop**

Replace the entire file content:

```tsx
"use client";

// ============================================================
// ModuleProgressGrid — 8-module mastery overview grid
// ============================================================
//
// Phase 25: Pure render component. Receives module progress
// entries as a prop from AiLabDashboard. Identical visual
// output to Phase 24-B, but zero localStorage access.
//
// Each card:
//   - Status dot (color-coded by mastery level)
//   - Module name
//   - Concept count
//   - Animated progress bar
//   - Click → /ai-lab/journey?module=<id>
//
// Visual pattern: glass-card border-Token/10 bg-brand/[0.03]
// ============================================================

import { useMemo, type ReactElement } from "react";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Play,
  Lock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import type {
  ModuleProgressEntry,
  ModuleStatus,
} from "@/components/ai-lab/intelligence/types";

// ============================================================
// Props
// ============================================================

interface ModuleProgressGridProps {
  modules: ModuleProgressEntry[];
}

// ============================================================
// Status mapping
// ============================================================

interface StatusConfig {
  icon: LucideIcon;
  colorClass: string;
  dotClass: string;
}

const STATUS_MAP: Record<ModuleStatus, StatusConfig> = {
  mastered: {
    icon: CheckCircle2,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    dotClass: "bg-emerald-500/60",
  },
  completed: {
    icon: CheckCircle2,
    colorClass: "text-emerald-500/80 dark:text-emerald-400/80",
    dotClass: "bg-emerald-500/40",
  },
  in_progress: {
    icon: Play,
    colorClass: "text-brand dark:text-brand-light",
    dotClass: "bg-brand/60",
  },
  available: {
    icon: Play,
    colorClass: "text-amber-500/80 dark:text-amber-400/80",
    dotClass: "bg-amber-500/40",
  },
  locked: {
    icon: Lock,
    colorClass: "text-slate-400 dark:text-slate-500",
    dotClass: "bg-slate-400/40",
  },
};

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// ModuleProgressGrid
// ============================================================

export function ModuleProgressGrid({
  modules,
}: ModuleProgressGridProps): ReactElement {
  // ── Stats ──
  const stats = useMemo(() => {
    const mastered = modules.filter(
      (m) => m.status === "mastered" || m.status === "completed"
    ).length;
    const inProgress = modules.filter(
      (m) => m.status === "in_progress"
    ).length;
    return { mastered, inProgress, total: modules.length };
  }, [modules]);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.moduleProgress" />

      {/* Summary row */}
      <div className="mb-8 flex flex-wrap items-center gap-4 text-sm">
        <span className="text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {stats.mastered}
          </span>
          {" / "}
          {stats.total}
          {" modules completed"}
        </span>
        {stats.inProgress > 0 && (
          <span className="text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-brand">
              {stats.inProgress}
            </span>
            {" in progress"}
          </span>
        )}
      </div>

      {/* Module grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {modules.map((mod, i) => {
          const cfg = STATUS_MAP[mod.status];
          const Icon = cfg.icon;

          return (
            <Link
              key={mod.moduleId}
              href={`/ai-lab/journey?module=${encodeURIComponent(mod.moduleId)}`}
              className={cn(
                "group rounded-xl border border-brand/10 bg-brand/[0.03] px-4 py-4 backdrop-blur-sm transition-all duration-300",
                "hover:scale-[1.02] hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)]",
                "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.07)]"
              )}
            >
              {/* Status dot + name */}
              <div className="mb-3 flex items-center gap-2.5">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    cfg.dotClass
                  )}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                  {mod.title}
                </span>
              </div>

              {/* Concept count */}
              <p className="mb-3 text-[0.65rem] text-slate-500/70 dark:text-slate-500/60">
                {mod.conceptTotal > 0
                  ? `${mod.conceptTotal} concepts`
                  : mod.description.slice(0, 60) + "…"}
              </p>

              {/* Progress bar */}
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-slate-200/50 dark:bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${mod.percent}%` }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 1.0,
                    delay: i * 0.06,
                    ease: "easeOut",
                  }}
                />
              </div>

              {/* Status label + arrow */}
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[0.6rem] font-medium",
                    cfg.colorClass
                  )}
                >
                  <Icon className="size-2.5" />
                  {mod.status === "mastered"
                    ? "Mastered"
                    : mod.status === "completed"
                      ? "Completed"
                      : mod.status === "in_progress"
                        ? "In Progress"
                        : mod.status === "available"
                          ? "Start"
                          : "Locked"}
                </span>
                <ArrowRight className="size-3 text-slate-400/60 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
              </div>
            </Link>
          );
        })}
      </div>
    </motion.section>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — all prop type mismatches resolved. Zero errors, zero warnings.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai-lab/ModuleProgressGrid.tsx
git commit -m "refactor(dashboard): ModuleProgressGrid accepts modules prop, removes localStorage reads"
```

---

### Task 10: Add i18n keys for mission reasoning + multi-CTA

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/zh-CN.json`

**Interfaces:**
- Consumes: Existing `aiLab.dashboard` object (Phase 24-B)
- Produces: Extended `aiLab.dashboard` with 5 new keys: `whyHeader`, `completedPrefix`, `unlocksPrefix`, `exploreKnowledge`, `tryPlayground`, `startLearning`

- [ ] **Step 1: Add en.json keys**

Read lines 793-795 of `en.json` to confirm current end of `dashboard` object:

```json
      "inferenceLabel": "Inference",
      "inferenceDesc": "Watch MiniMind generate text token by token — explore temperature, top-k, top-p sampling, and KV-cache behavior."
    }
```

Change the closing `}` of `dashboard` by inserting 5 new keys before it. Replace the two lines:

```
      "inferenceDesc": "Watch MiniMind generate text token by token — explore temperature, top-k, top-p sampling, and KV-cache behavior."
    }
```

with:

```
      "inferenceDesc": "Watch MiniMind generate text token by token — explore temperature, top-k, top-p sampling, and KV-cache behavior.",
      "whyHeader": "Why this mission",
      "completedPrefix": "✓",
      "unlocksPrefix": "→",
      "exploreKnowledge": "Explore Knowledge",
      "tryPlayground": "Try Playground",
      "startLearning": "Start Learning"
    }
```

- [ ] **Step 2: Add zh-CN.json keys**

Same insertion point (lines 793-795 of zh-CN.json). Replace:

```
      "inferenceDesc": "观察 MiniMind 逐 token 生成文本——探索温度采样、Top-K、Top-P 和 KV-Cache 行为。"
    }
```

with:

```
      "inferenceDesc": "观察 MiniMind 逐 token 生成文本——探索温度采样、Top-K、Top-P 和 KV-Cache 行为。",
      "whyHeader": "任务依据",
      "completedPrefix": "✓",
      "unlocksPrefix": "→",
      "exploreKnowledge": "探索知识",
      "tryPlayground": "尝试演练",
      "startLearning": "开始学习"
    }
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS — i18n keys added, no warnings about missing keys.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(i18n): add intelligence layer mission reasoning + multi-CTA keys"
```

---

### Task 11: Final visual polish — CurrentMission mobile + edge cases

**Files:**
- Modify: `src/components/ai-lab/dashboard/CurrentMission.tsx`

**Interfaces:**
- Consumes: Already has all props from Task 7. This is a visual refinement pass.
- Produces: Polished CurrentMission with improved mobile layout for CTAs and reasoning.

- [ ] **Step 1: Review the existing mobile behavior**

The component from Task 7 uses `flex-wrap` for CTAs which works on mobile but could be improved — ensure CTAs are full-width and stacked on small screens.

- [ ] **Step 2: Enhance CTA container for mobile stacking + full-width**

Read the CTA section of `CurrentMission.tsx` from Task 7. The current CTA wrapper:

```tsx
<div className="flex flex-wrap items-center gap-2.5 border-t border-brand/5 px-6 py-4 sm:px-8 dark:border-white/[0.04]">
```

Replace with responsive layout that stacks full-width on mobile:

```tsx
<div className="flex flex-col gap-2 border-t border-brand/5 px-6 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5 sm:px-8 dark:border-white/[0.04]">
```

And update each `Link` to be full-width on mobile:

From:
```tsx
<Link
  key={action.label}
  href={action.route}
  className={cn(
    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-300",
```

To:
```tsx
<Link
  key={action.label}
  href={action.route}
  className={cn(
    "inline-flex items-center justify-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-medium transition-all duration-300 max-sm:w-full",
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS — final build with all changes. Zero errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/dashboard/CurrentMission.tsx
git commit -m "style(dashboard): polish CurrentMission mobile layout — full-width stacked CTAs"
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: PASS — final build with all changes. Zero errors, zero warnings.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai-lab/dashboard/CurrentMission.tsx
git commit -m "style(dashboard): polish CurrentMission mobile layout — full-width stacked CTAs"
```

---

### Integration Verification

After all 11 tasks, verify the complete Phase 25:

- [ ] `npm run build` passes with zero errors and warnings
- [ ] `/ai-lab` renders all 5 sections: DashboardHero, CurrentMission, ContinueLearning, ModuleProgressGrid, ExplorationLinks
- [ ] `localStorage.getItem("minimind-learning-progress")` called exactly once per page load
- [ ] First visit (clear localStorage): shows Tokenizer mission with "Start here" reasoning and 2 CTAs
- [ ] After marking a module in-progress in Journey, returning to Dashboard shows it as CurrentMission
- [ ] CurrentMission shows reasoning list: checkmarks for completed prereqs, arrows for unlocks
- [ ] CurrentMission shows 2-3 domain-aware CTA buttons with correct routing
- [ ] Reasoning text references actual completed prerequisite module names
- [ ] ContinueLearning resume card: identical visual appearance to Phase 24-B
- [ ] ModuleProgressGrid: identical visual appearance to Phase 24-B
- [ ] ExplorationLinks: unchanged
- [ ] All glass-card visual patterns preserved
- [ ] All Framer Motion animations preserved
- [ ] Mobile responsive: CTAs stack full-width, reasoning list readable, grid collapses correctly
- [ ] Dashboard skeleton renders during SSR hydration (no layout shift)
- [ ] All sub-pages function unchanged: journey, knowledge, experiments, experience, playground
- [ ] `AiLabClient.tsx` still exists on disk
- [ ] `src/data/minimind/*` files untouched
- [ ] `src/lib/minimind/*` files untouched
