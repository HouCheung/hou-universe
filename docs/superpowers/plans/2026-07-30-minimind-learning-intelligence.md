# Learning Intelligence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Knowledge Graph into a Learning Intelligence Layer — guided learning paths, smart recommendations, and mastery tracking, all derived from existing SSOT registries.

**Architecture:** Three-layer SSOT pattern (data → adapter → UI). All intelligence is pure derivation from KNOWNEDGE_GRAPH, MINIMIND_MODULES, and MINIMIND_EXPERIMENTS. Zero new metadata authored. User progress persisted client-side via localStorage.

**Tech Stack:** TypeScript strict, Next.js 15 App Router, Tailwind CSS, Framer Motion, shadcn/ui, lucide-react, i18next.

## Global Constraints

- TypeScript strict mode, no `any` type
- Tailwind CSS only, no raw CSS files, no complex inline styles
- All user-visible strings via i18n (`minimind.learning.*` namespace)
- Follow existing 3-layer pattern: data → adapter → UI
- No modifications to existing SSOT registries
- Mobile responsive (sm/md/lg/xl breakpoints)
- All components default to server; only interactive/animated → `'use client'`
- Import order: third-party → internal components → types → styles
- `npm run build` must pass with zero warnings
- Follow existing glass-card, brand-color, Framer Motion conventions

---

### Task 1: Data Layer — Learning Types

**Files:**
- Create: `src/data/minimind/learning/types.ts`

**Interfaces:**
- Produces: `LearningStatus`, `LearningNode`, `LearningPath`, `Recommendation`, `RecommendationReason`, `MasteryConcept`, `MasteryTree`, `UserProgress`, `OverallProgress`, `LearningRegistry`

- [ ] **Step 1: Write the types file**

```typescript
// ============================================================
// MiniMind Learning Intelligence — Derived Data Types
// ============================================================
//
// These types define the learning layer structure. All data is
// COMPUTED from existing SSOT registries — zero new metadata.
// ============================================================

import type { KnowledgeNode } from "@/data/minimind/knowledge-registry";

// ============================================================
// Learning Status
// ============================================================

export type LearningStatus =
  | "locked"
  | "available"
  | "in_progress"
  | "completed"
  | "mastered";

// ============================================================
// Learning Node
// ============================================================

export interface LearningNode {
  /** References KnowledgeNode.id (e.g. "module:tokenizer") */
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

// ============================================================
// Learning Path
// ============================================================

export type PathType = "critical" | "breadth_first" | "experiment_first";

export interface LearningPath {
  id: string;
  label: string;
  description: string;
  /** Ordered list of learning nodes */
  nodes: LearningNode[];
  /** Total estimated time in minutes */
  totalMinutes: number;
  /** Total nodes */
  nodeCount: number;
  /** Path type */
  type: PathType;
}

// ============================================================
// Recommendations
// ============================================================

export type RecommendationReason =
  | "next_in_path"
  | "prerequisite_for"
  | "experiment"
  | "reinforce"
  | "explore";

export interface Recommendation {
  sourceId: string;
  reason: RecommendationReason;
  /** Priority 0-1, higher = more important */
  priority: number;
  /** Human-readable explanation */
  description: string;
  /** Call-to-action label */
  cta: string;
}

// ============================================================
// Mastery Tree
// ============================================================

export interface MasteryConcept {
  conceptId: string;
  conceptLabel: string;
  /** Which module teaches this concept */
  parentModuleId: string;
  /** Related experiment IDs for validation */
  experimentIds: string[];
  /** Cross-links to other concepts */
  relatedConceptIds: string[];
  /** Jaccard similarity scores to related concepts */
  relatesToScores: Record<string, number>;
  /** Category dimension for radar chart */
  dimension: MasteryDimension;
}

export type MasteryDimension =
  | "tokenization"
  | "embedding"
  | "position_encoding"
  | "attention_ffn"
  | "architecture_inference";

export interface MasteryTree {
  concepts: MasteryConcept[];
  /** moduleId → conceptIds */
  moduleConceptMap: Record<string, string[]>;
  /** conceptId → parentModuleId */
  conceptModuleMap: Record<string, string>;
}

// ============================================================
// User Progress (client-side only)
// ============================================================

export interface UserProgress {
  /** sourceId → status */
  nodeStatus: Record<string, LearningStatus>;
  /** conceptId → reviewed */
  conceptReviewed: Record<string, boolean>;
  /** experimentId → completed */
  experimentCompleted: Record<string, boolean>;
  /** ISO timestamp of last mutation */
  lastUpdated: string;
}

// ============================================================
// Aggregate Stats
// ============================================================

export interface OverallProgress {
  modulesCompleted: number;
  modulesTotal: number;
  conceptsReviewed: number;
  conceptsTotal: number;
  experimentsCompleted: number;
  experimentsTotal: number;
  percentComplete: number;
  estimatedRemainingMinutes: number;
}

// ============================================================
// Top-Level Registry
// ============================================================

export interface LearningRegistry {
  paths: LearningPath[];
  recommendations: Recommendation[];
  masteryTree: MasteryTree;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/data/minimind/learning/types.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/data/minimind/learning/types.ts
git commit -m "feat(learning): add LearningNode, LearningPath, Recommendation, MasteryTree types (Phase 23)"
```

---

### Task 2: Data Layer — Derive Learning Paths

**Files:**
- Create: `src/data/minimind/learning/derive-learning.ts`

**Interfaces:**
- Consumes: `KNOWLEDGE_GRAPH` from `@/data/minimind/knowledge-registry`, `MINIMIND_MODULES`, `computeDependencyLevels`, `getModuleExperiments` from `@/data/minimind/module-registry`, `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`, types from `./types`
- Produces: `deriveLearningPaths(): LearningPath[]`

- [ ] **Step 1: Write derive-learning.ts**

```typescript
// ============================================================
// MiniMind Learning Intelligence — Learning Path Derivation
// ============================================================
//
// Pure functions that derive LearningPaths from the Knowledge
// Graph and existing SSOT registries. 8 derivation rules.
// ============================================================

import { KNOWLEDGE_GRAPH } from "@/data/minimind/knowledge-registry";
import { MINIMIND_MODULES, computeDependencyLevels, getModuleExperiments } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import type { LearningNode, LearningPath, PathType } from "./types";

// ============================================================
// Rule L1: Learning Nodes from Module Nodes
// ============================================================

function deriveLearningNodes(): LearningNode[] {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter((n) => n.type === "module");
  const depLevels = computeDependencyLevels();
  const levelMap = new Map(depLevels.map((d) => [d.moduleId, d.level]));

  // Build dependency graph from module metadata
  const moduleMap = new Map(MINIMIND_MODULES.map((m) => [m.id, m]));
  const prereqMap = new Map<string, string[]>();
  const unlockMap = new Map<string, string[]>();

  for (const mod of MINIMIND_MODULES) {
    const deps = mod.metadata.dependencies ?? [];
    prereqMap.set(mod.id, deps);
    for (const depId of deps) {
      const existing = unlockMap.get(depId) ?? [];
      existing.push(mod.id);
      unlockMap.set(depId, existing);
    }
  }

  // Compute critical path
  const criticalIds = computeCriticalPath(moduleMap, prereqMap);

  const nodes: LearningNode[] = [];

  for (const node of moduleNodes) {
    const moduleId = node.sourceId;
    const depth = levelMap.get(moduleId) ?? 0;
    const mod = moduleMap.get(moduleId);

    // Concepts from explains edges
    const conceptIds = KNOWLEDGE_GRAPH.edges
      .filter((e) => e.source === node.id && e.type === "explains")
      .map((e) => e.target);

    // Experiments for this module
    const experiments = getModuleExperiments(moduleId);
    const experimentIds = experiments.map(
      (exp) => `experiment:${exp.id}`
    );

    // Estimated time: concepts × 15min + experiments × 30min, min 20min
    const estimatedMinutes = Math.max(
      20,
      conceptIds.length * 15 + experimentIds.length * 30
    );

    nodes.push({
      sourceId: node.id,
      knowledgeNode: node,
      depth,
      prerequisites: (prereqMap.get(moduleId) ?? []).map(
        (depId) => `module:${depId}`
      ),
      unlocks: (unlockMap.get(moduleId) ?? []).map(
        (unlockedId) => `module:${unlockedId}`
      ),
      criticalPath: criticalIds.has(moduleId),
      estimatedMinutes,
      conceptIds,
      experimentIds,
    });
  }

  return nodes;
}

// ============================================================
// Rule L3: Critical Path Computation
// ============================================================

function computeCriticalPath(
  moduleMap: Map<string, { metadata: { dependencies?: string[] } }>,
  prereqMap: Map<string, string[]>
): Set<string> {
  const critical = new Set<string>();

  // Find deepest nodes
  let maxDepth = 0;
  const depthCache = new Map<string, number>();

  function getDepth(id: string, visited: Set<string>): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const deps = prereqMap.get(id) ?? [];
    if (deps.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const maxDep = Math.max(...deps.map((d) => getDepth(d, new Set(visited))));
    const depth = maxDep + 1;
    depthCache.set(id, depth);
    return depth;
  }

  for (const id of prereqMap.keys()) {
    const d = getDepth(id, new Set());
    if (d > maxDepth) maxDepth = d;
  }

  // Walk back from deepest node through longest chain
  const deepest = Array.from(prereqMap.keys()).filter(
    (id) => getDepth(id, new Set()) === maxDepth
  );

  for (const startId of deepest) {
    let current = startId;
    while (current) {
      critical.add(current);
      const deps = prereqMap.get(current) ?? [];
      if (deps.length === 0) break;
      // Choose prerequisite with highest depth
      current = deps.reduce((a, b) =>
        getDepth(a, new Set()) >= getDepth(b, new Set()) ? a : b
      );
    }
  }

  return critical;
}

// ============================================================
// Rule L7: Primary Learning Path (critical, ordered by depth)
// ============================================================

function buildCriticalPath(nodes: LearningNode[]): LearningPath {
  // Sort by depth ascending, then by prerequisite count ascending
  const sorted = [...nodes].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.prerequisites.length - b.prerequisites.length;
  });

  return {
    id: "critical",
    label: "Recommended Path",
    description:
      "Follow the critical dependency chain — the most efficient route through all modules.",
    nodes: sorted,
    totalMinutes: sorted.reduce((sum, n) => sum + n.estimatedMinutes, 0),
    nodeCount: sorted.length,
    type: "critical",
  };
}

// ============================================================
// Rule L8: Alternative Paths
// ============================================================

function buildBreadthFirstPath(nodes: LearningNode[]): LearningPath {
  // Depth order only, no critical path priority
  const sorted = [...nodes].sort((a, b) => a.depth - b.depth);

  return {
    id: "breadth_first",
    label: "Breadth-First Path",
    description:
      "Complete all modules at each depth level before moving deeper.",
    nodes: sorted,
    totalMinutes: sorted.reduce((sum, n) => sum + n.estimatedMinutes, 0),
    nodeCount: sorted.length,
    type: "breadth_first",
  };
}

function buildExperimentFirstPath(nodes: LearningNode[]): LearningPath {
  // Nodes with experiments first, then by depth
  const sorted = [...nodes].sort((a, b) => {
    const aHasExp = a.experimentIds.length > 0 ? 0 : 1;
    const bHasExp = b.experimentIds.length > 0 ? 0 : 1;
    if (aHasExp !== bHasExp) return aHasExp - bHasExp;
    return a.depth - b.depth;
  });

  return {
    id: "experiment_first",
    label: "Experiment-First Path",
    description:
      "Prioritize hands-on learning — tackle modules with experiments first.",
    nodes: sorted,
    totalMinutes: sorted.reduce((sum, n) => sum + n.estimatedMinutes, 0),
    nodeCount: sorted.length,
    type: "experiment_first",
  };
}

// ============================================================
// Public API
// ============================================================

let _pathsCache: LearningPath[] | null = null;

export function deriveLearningPaths(): LearningPath[] {
  if (_pathsCache) return _pathsCache;

  const nodes = deriveLearningNodes();

  _pathsCache = [
    buildCriticalPath(nodes),
    buildBreadthFirstPath(nodes),
    buildExperimentFirstPath(nodes),
  ];

  return _pathsCache;
}

/** Get a specific path by type */
export function getPathByType(type: PathType): LearningPath | undefined {
  return deriveLearningPaths().find((p) => p.type === type);
}

/** Clear cache (for testing) */
export function clearLearningCache(): void {
  _pathsCache = null;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/data/minimind/learning/derive-learning.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/data/minimind/learning/derive-learning.ts
git commit -m "feat(learning): implement deriveLearningPaths with 8 derivation rules (Phase 23)"
```

---

### Task 3: Data Layer — Derive Mastery & Recommendations

**Files:**
- Create: `src/data/minimind/learning/derive-mastery.ts`

**Interfaces:**
- Consumes: `KNOWLEDGE_GRAPH` from `@/data/minimind/knowledge-registry`, `MINIMIND_MODULES` from `@/data/minimind/module-registry`, `MINIMIND_EXPERIMENTS` from `@/data/minimind/experiment-registry`, types from `./types`
- Produces: `deriveMasteryTree(): MasteryTree`, `deriveRecommendations(progress: UserProgress): Recommendation[]`

- [ ] **Step 1: Write derive-mastery.ts**

```typescript
// ============================================================
// MiniMind Learning Intelligence — Mastery & Recommendation Derivation
// ============================================================
//
// Pure functions that derive MasteryTree and Recommendations
// from the Knowledge Graph and existing SSOT registries.
// 5 recommendation rules + concept-to-dimension mapping.
// ============================================================

import { KNOWLEDGE_GRAPH } from "@/data/minimind/knowledge-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { MINIMIND_EXPERIMENTS } from "@/data/minimind/experiment-registry";
import type {
  MasteryConcept,
  MasteryTree,
  MasteryDimension,
  Recommendation,
  UserProgress,
} from "./types";

// ============================================================
// Dimension Mapping — concept → radar axis
// ============================================================

const CONCEPT_DIMENSION_MAP: Record<string, MasteryDimension> = {
  // Tokenization
  "Token": "tokenization",
  "Vocabulary": "tokenization",
  "Encoding": "tokenization",
  "Decoding": "tokenization",
  "BPE": "tokenization",
  "Word Tokenization": "tokenization",
  "Character Tokenization": "tokenization",
  "Vocabulary Coverage": "tokenization",
  "Unknown Token Rate": "tokenization",
  "Sequence Length Trade-off": "tokenization",
  "Subword Tokenization": "tokenization",

  // Embedding
  "Embedding Matrix": "embedding",
  "Lookup Table": "embedding",
  "Dense Vector": "embedding",
  "One-Hot Encoding": "embedding",
  "Trainable Parameters": "embedding",
  "Embedding Vector": "embedding",
  "Cosine Similarity": "embedding",
  "Semantic Space": "embedding",
  "Vector Arithmetic": "embedding",
  "Nearest Neighbor Search": "embedding",

  // Position Encoding
  "Rotary Embedding": "position_encoding",
  "Positional Encoding": "position_encoding",
  "Frequency Bands": "position_encoding",
  "Relative Position": "position_encoding",
  "Complex Numbers": "position_encoding",
  "2D Rotation Matrix": "position_encoding",
  "Vector Norm Invariance": "position_encoding",
  "Orthogonal Transformation": "position_encoding",
  "Precomputed Cache": "position_encoding",

  // Attention / FFN
  "Self-Attention": "attention_ffn",
  "Multi-Head": "attention_ffn",
  "Scaled Dot-Product": "attention_ffn",
  "QKV Projection": "attention_ffn",
  "Causal Masking": "attention_ffn",
  "Attention Weights": "attention_ffn",
  "Attention Matrix": "attention_ffn",
  "Numerical Stability (Softmax)": "attention_ffn",
  "Head Split / Merge": "attention_ffn",
  "Output Projection (W_O)": "attention_ffn",
  "Feed-Forward Network": "attention_ffn",
  "Position-wise Transformation": "attention_ffn",
  "SwiGLU": "attention_ffn",
  "SiLU Activation (Swish)": "attention_ffn",
  "Gated Linear Unit": "attention_ffn",
  "Gate / Up / Down Projection": "attention_ffn",
  "Element-wise Multiply": "attention_ffn",
  "Expansion-Compression (Bottleneck)": "attention_ffn",
  "Non-linearity in Transformers": "attention_ffn",
  "Head Diversity": "attention_ffn",
  "Softmax Temperature": "attention_ffn",
  "Attention Entropy": "attention_ffn",

  // Architecture / Inference
  "Transformer Block": "architecture_inference",
  "Decoder-only Architecture": "architecture_inference",
  "RMSNorm (Root Mean Square Normalization)": "architecture_inference",
  "Pre-Norm Architecture": "architecture_inference",
  "Residual Connection": "architecture_inference",
  "Attention + FFN Composition": "architecture_inference",
  "Gradient Highway": "architecture_inference",
  "Block Stacking": "architecture_inference",
  "LLaMA Architecture": "architecture_inference",
  "LLM Forward Pass": "architecture_inference",
  "Hidden State Flow": "architecture_inference",
  "LM Head": "architecture_inference",
  "Logits": "architecture_inference",
  "Softmax Probability": "architecture_inference",
  "Composition Root": "architecture_inference",
  "Dependency Injection": "architecture_inference",
  "Model Orchestration": "architecture_inference",
  "Pipeline Trace": "architecture_inference",
  "Autoregressive Generation": "architecture_inference",
  "Temperature Sampling": "architecture_inference",
  "Top-K Filtering": "architecture_inference",
  "Top-P Filtering": "architecture_inference",
  "KV Cache": "architecture_inference",
  "Beam Search": "architecture_inference",
  "Softmax Sharpening": "architecture_inference",
  "Probability Distribution": "architecture_inference",
  "Exploration vs Exploitation": "architecture_inference",
};

function getDimension(conceptLabel: string): MasteryDimension {
  return CONCEPT_DIMENSION_MAP[conceptLabel] ?? "architecture_inference";
}

// ============================================================
// Mastery Tree Derivation
// ============================================================

let _masteryTreeCache: MasteryTree | null = null;

export function deriveMasteryTree(): MasteryTree {
  if (_masteryTreeCache) return _masteryTreeCache;

  const conceptNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "concept"
  );

  const moduleConceptMap: Record<string, string[]> = {};
  const conceptModuleMap: Record<string, string> = {};

  // Build module→concepts from explains edges
  for (const edge of KNOWLEDGE_GRAPH.edges) {
    if (edge.type !== "explains") continue;
    const moduleSourceId = KNOWLEDGE_GRAPH.nodes.find(
      (n) => n.id === edge.source
    )?.sourceId;
    if (!moduleSourceId) continue;

    const existing = moduleConceptMap[moduleSourceId] ?? [];
    existing.push(edge.target);
    moduleConceptMap[moduleSourceId] = existing;
    conceptModuleMap[edge.target] = moduleSourceId;
  }

  // Build relates_to scores
  const relatesToScoresMap = new Map<string, Record<string, number>>();
  for (const edge of KNOWLEDGE_GRAPH.edges) {
    if (edge.type !== "relates_to") continue;
    // Jaccard weight stored in edge metadata
    const weight = edge.metadata?.weight ?? 0.3;
    const sourceScores = relatesToScoresMap.get(edge.source) ?? {};
    sourceScores[edge.target] = weight;
    relatesToScoresMap.set(edge.source, sourceScores);
    const targetScores = relatesToScoresMap.get(edge.target) ?? {};
    targetScores[edge.source] = weight;
    relatesToScoresMap.set(edge.target, targetScores);
  }

  // Build experiment→concept mapping
  const conceptExperimentMap = new Map<string, string[]>();
  for (const exp of MINIMIND_EXPERIMENTS) {
    for (const conceptLabel of exp.concepts) {
      // Find the concept node with this label
      const conceptNode = conceptNodes.find((n) => n.label === conceptLabel);
      if (!conceptNode) continue;
      const existing = conceptExperimentMap.get(conceptNode.id) ?? [];
      existing.push(`experiment:${exp.id}`);
      conceptExperimentMap.set(conceptNode.id, existing);
    }
  }

  const concepts: MasteryConcept[] = conceptNodes.map((cn) => ({
    conceptId: cn.id,
    conceptLabel: cn.label,
    parentModuleId: conceptModuleMap[cn.id] ?? "unknown",
    experimentIds: conceptExperimentMap.get(cn.id) ?? [],
    relatedConceptIds: Object.keys(relatesToScoresMap.get(cn.id) ?? {}),
    relatesToScores: relatesToScoresMap.get(cn.id) ?? {},
    dimension: getDimension(cn.label),
  }));

  _masteryTreeCache = {
    concepts,
    moduleConceptMap,
    conceptModuleMap,
  };

  return _masteryTreeCache;
}

// ============================================================
// Recommendation Derivation (5 Rules)
// ============================================================

const REASON_LABELS: Record<string, { cta: string }> = {
  next_in_path: { cta: "Continue Learning" },
  prerequisite_for: { cta: "Unlocks More" },
  experiment: { cta: "Validate Knowledge" },
  reinforce: { cta: "Reinforce Concept" },
  explore: { cta: "Explore Key Concept" },
};

export function deriveRecommendations(
  progress: UserProgress
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  // Rule R1: Next in Path
  const nextNode = findNextInPath(progress);
  if (nextNode) {
    recommendations.push({
      sourceId: nextNode,
      reason: "next_in_path",
      priority: 0.9,
      description: "Your next step on the recommended learning path.",
      cta: "Continue Learning",
    });
  }

  // Rule R2: Prerequisite Gateway
  const gatewayNode = findGatewayNode(progress);
  if (gatewayNode) {
    recommendations.push({
      sourceId: gatewayNode.sourceId,
      reason: "prerequisite_for",
      priority: gatewayNode.priority,
      description: `Unlocks ${gatewayNode.unlockCount} more module${gatewayNode.unlockCount > 1 ? "s" : ""}.`,
      cta: "Unlocks More",
    });
  }

  // Rule R3: Experiment Validation
  const expRec = findExperimentRecommendation(progress);
  if (expRec) {
    recommendations.push({
      sourceId: expRec.sourceId,
      reason: "experiment",
      priority: 0.7,
      description: "Validate your knowledge with a hands-on experiment.",
      cta: "Run Experiment",
    });
  }

  // Rule R4: Concept Reinforcement
  const reinforceRec = findReinforceRecommendation(progress);
  if (reinforceRec) {
    recommendations.push({
      sourceId: reinforceRec.sourceId,
      reason: "reinforce",
      priority: reinforceRec.priority,
      description: "Reinforce a concept related to what you've learned.",
      cta: "Reinforce Concept",
    });
  }

  // Rule R5: Explore Key Concept
  const exploreRec = findExploreRecommendation(progress);
  if (exploreRec) {
    recommendations.push({
      sourceId: exploreRec.sourceId,
      reason: "explore",
      priority: 0.5,
      description: "Discover a central concept that connects many topics.",
      cta: "Explore Key Concept",
    });
  }

  // Deduplicate by sourceId, sort by priority descending, take top 5
  return deduplicateAndRank(recommendations);
}

// ============================================================
// Rule R1: Next in Path
// ============================================================

function findNextInPath(progress: UserProgress): string | null {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );

  // Find first available node whose prerequisites are all completed
  for (const node of moduleNodes) {
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status === "completed" || status === "mastered") continue;

    // Check prerequisites
    const prereqEdges = KNOWLEDGE_GRAPH.edges.filter(
      (e) => e.target === node.id && e.type === "depends_on"
    );
    const allPrereqsDone = prereqEdges.every((e) => {
      const ps = progress.nodeStatus[e.source] ?? "locked";
      return ps === "completed" || ps === "mastered";
    });

    if (allPrereqsDone) return node.id;
  }

  return null;
}

// ============================================================
// Rule R2: Prerequisite Gateway
// ============================================================

function findGatewayNode(progress: UserProgress): {
  sourceId: string;
  unlockCount: number;
  priority: number;
} | null {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );

  let bestGateway: { sourceId: string; unlockCount: number } | null = null;
  let maxUnlocks = 0;

  for (const node of moduleNodes) {
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status === "completed" || status === "mastered") continue;

    // Count how many locked nodes this unlocks (transitively)
    const unlockedIds = new Set<string>();
    collectTransitiveUnlocks(node.id, new Set(), unlockedIds, progress);

    if (unlockedIds.size > maxUnlocks) {
      maxUnlocks = unlockedIds.size;
      bestGateway = { sourceId: node.id, unlockCount: unlockedIds.size };
    }
  }

  if (!bestGateway || bestGateway.unlockCount === 0) return null;

  return {
    ...bestGateway,
    priority: Math.min(1, bestGateway.unlockCount / 8),
  };
}

function collectTransitiveUnlocks(
  nodeId: string,
  visited: Set<string>,
  result: Set<string>,
  progress: UserProgress
): void {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  const unlockEdges = KNOWLEDGE_GRAPH.edges.filter(
    (e) => e.source === nodeId && e.type === "depends_on"
  );

  for (const edge of unlockEdges) {
    const targetStatus = progress.nodeStatus[edge.target] ?? "locked";
    if (targetStatus === "completed" || targetStatus === "mastered") continue;
    result.add(edge.target);
    collectTransitiveUnlocks(edge.target, visited, result, progress);
  }
}

// ============================================================
// Rule R3: Experiment Validation
// ============================================================

function findExperimentRecommendation(
  progress: UserProgress
): { sourceId: string } | null {
  // Find completed modules that have uncompleted experiments
  for (const node of KNOWLEDGE_GRAPH.nodes) {
    if (node.type !== "module") continue;
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status !== "completed" && status !== "mastered") continue;

    const expEdges = KNOWLEDGE_GRAPH.edges.filter(
      (e) => e.target === node.id && e.type === "experiments"
    );

    for (const edge of expEdges) {
      if (!progress.experimentCompleted[edge.source]) {
        return { sourceId: edge.source };
      }
    }
  }

  return null;
}

// ============================================================
// Rule R4: Concept Reinforcement
// ============================================================

function findReinforceRecommendation(
  progress: UserProgress
): { sourceId: string; priority: number } | null {
  const tree = deriveMasteryTree();

  // Find completed concepts
  const completedConceptIds = Object.entries(progress.conceptReviewed)
    .filter(([, reviewed]) => reviewed)
    .map(([id]) => id);

  if (completedConceptIds.length === 0) return null;

  let bestConcept: string | null = null;
  let bestScore = 0;

  for (const concept of tree.concepts) {
    if (progress.conceptReviewed[concept.conceptId]) continue;

    // Sum relates_to scores from completed concepts
    let score = 0;
    for (const completedId of completedConceptIds) {
      score += concept.relatesToScores[completedId] ?? 0;
    }

    if (score > bestScore) {
      bestScore = score;
      bestConcept = concept.conceptId;
    }
  }

  if (!bestConcept) return null;

  return {
    sourceId: bestConcept,
    priority: Math.min(1, bestScore / 3),
  };
}

// ============================================================
// Rule R5: Explore Key Concept
// ============================================================

function findExploreRecommendation(
  progress: UserProgress
): { sourceId: string } | null {
  const tree = deriveMasteryTree();

  // Find concept with highest betweenness centrality (most edges)
  let bestConcept: string | null = null;
  let bestDegree = 0;

  for (const concept of tree.concepts) {
    if (progress.conceptReviewed[concept.conceptId]) continue;

    const degree =
      concept.relatedConceptIds.length +
      (tree.moduleConceptMap[concept.parentModuleId]?.length ?? 0);

    if (degree > bestDegree) {
      bestDegree = degree;
      bestConcept = concept.conceptId;
    }
  }

  return bestConcept ? { sourceId: bestConcept } : null;
}

// ============================================================
// Helpers
// ============================================================

function deduplicateAndRank(recommendations: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  const unique: Recommendation[] = [];

  for (const rec of recommendations) {
    if (seen.has(rec.sourceId)) continue;
    seen.add(rec.sourceId);
    unique.push(rec);
  }

  unique.sort((a, b) => b.priority - a.priority);
  return unique.slice(0, 5);
}

/** Clear cache (for testing) */
export function clearMasteryCache(): void {
  _masteryTreeCache = null;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/data/minimind/learning/derive-mastery.ts 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/data/minimind/learning/derive-mastery.ts
git commit -m "feat(learning): implement deriveMasteryTree and deriveRecommendations (Phase 23)"
```

---

### Task 4: Data Layer — Internal Barrel + Public Registry

**Files:**
- Create: `src/data/minimind/learning/index.ts`
- Create: `src/data/minimind/learning-registry.ts`

**Interfaces:**
- Consumes: types from `./learning/types`, derivation functions from `./learning/derive-learning` and `./learning/derive-mastery`
- Produces: `LEARNING_REGISTRY`, `CRITICAL_PATH_NODE_IDS`, `getLearningPath()`, `getLearningNode()`, `getPrerequisiteChain()`, `getUnlockChain()`, `getRecommendations()`, `getNextNodes()`, `getOverallProgress()`, `clearLearningRegistryCache()`

- [ ] **Step 1: Write internal barrel**

```typescript
// src/data/minimind/learning/index.ts
// Internal barrel — re-exports types and derivation functions.

export type {
  LearningStatus,
  LearningNode,
  LearningPath,
  PathType,
  Recommendation,
  RecommendationReason,
  MasteryConcept,
  MasteryTree,
  MasteryDimension,
  UserProgress,
  OverallProgress,
  LearningRegistry,
} from "./types";

export { deriveLearningPaths, getPathByType, clearLearningCache } from "./derive-learning";
export { deriveMasteryTree, deriveRecommendations, clearMasteryCache } from "./derive-mastery";
```

- [ ] **Step 2: Write public learning-registry**

```typescript
// ============================================================
// MiniMind Learning Intelligence — Public API
// ============================================================
//
// This is a DERIVED LAYER. It computes learning paths, recommendations,
// and mastery trees from existing SSOT registries — it does NOT
// author new metadata.
//
// The primary SSOT registries are:
//   - src/data/minimind/module-registry.ts
//   - src/data/minimind/experiment-registry.ts
//   - src/data/minimind/knowledge-registry.ts
//
// This file computes learning intelligence from those sources.
// Consumers import from HERE.
// ============================================================

import { KNOWLEDGE_GRAPH } from "./knowledge-registry";
import type { KnowledgeNode } from "./knowledge/types";
import {
  deriveLearningPaths,
  deriveMasteryTree,
  deriveRecommendations,
} from "./learning/derive-learning";
import type {
  LearningPath,
  LearningNode,
  PathType,
  MasteryTree,
  Recommendation,
  UserProgress,
  OverallProgress,
} from "./learning/types";

// Re-export types for convenience
export type {
  LearningStatus,
  LearningNode,
  LearningPath,
  PathType,
  Recommendation,
  RecommendationReason,
  MasteryConcept,
  MasteryTree,
  MasteryDimension,
  UserProgress,
  OverallProgress,
} from "./learning/types";

// ============================================================
// Eagerly-computed constants
// ============================================================

export const LEARNING_PATHS: LearningPath[] = deriveLearningPaths();

export const MASTERY_TREE: MasteryTree = deriveMasteryTree();

export const CRITICAL_PATH_NODE_IDS: string[] =
  LEARNING_PATHS.find((p) => p.type === "critical")?.nodes.map(
    (n) => n.sourceId
  ) ?? [];

// ============================================================
// Lookup helpers
// ============================================================

/** Get a specific learning path by type */
export function getLearningPath(
  type: PathType = "critical"
): LearningPath | undefined {
  return LEARNING_PATHS.find((p) => p.type === type);
}

/** Find a learning node by its sourceId (KnowledgeNode.id) */
export function getLearningNode(
  sourceId: string
): LearningNode | undefined {
  for (const path of LEARNING_PATHS) {
    const node = path.nodes.find((n) => n.sourceId === sourceId);
    if (node) return node;
  }
  return undefined;
}

/** Get the full prerequisite chain from root to target (ordered) */
export function getPrerequisiteChain(sourceId: string): LearningNode[] {
  const node = getLearningNode(sourceId);
  if (!node) return [];

  const chain: LearningNode[] = [];
  const visited = new Set<string>();

  function walk(currentId: string): void {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const current = getLearningNode(currentId);
    if (!current) return;
    for (const prereqId of current.prerequisites) {
      walk(prereqId);
    }
    chain.push(current);
  }

  walk(sourceId);
  return chain;
}

/** Get all nodes transitively unlocked by completing this node */
export function getUnlockChain(sourceId: string): LearningNode[] {
  const node = getLearningNode(sourceId);
  if (!node) return [];

  const result: LearningNode[] = [];
  const visited = new Set<string>();

  function walk(currentId: string): void {
    if (visited.has(currentId)) return;
    visited.add(currentId);
    const current = getLearningNode(currentId);
    if (!current) return;
    if (currentId !== sourceId) {
      result.push(current);
    }
    for (const unlockId of current.unlocks) {
      walk(unlockId);
    }
  }

  walk(sourceId);
  return result;
}

/** Get node IDs that are immediately available (all prerequisites completed) */
export function getNextNodes(progress: UserProgress): string[] {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );
  const available: string[] = [];

  for (const node of moduleNodes) {
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status === "completed" || status === "mastered") continue;

    const prereqEdges = KNOWLEDGE_GRAPH.edges.filter(
      (e) => e.target === node.id && e.type === "depends_on"
    );

    const allPrereqsDone = prereqEdges.every((e) => {
      const ps = progress.nodeStatus[e.source] ?? "locked";
      return ps === "completed" || ps === "mastered";
    });

    if (allPrereqsDone) available.push(node.id);
  }

  return available;
}

/** Get overall progress statistics */
export function getOverallProgress(
  progress: UserProgress
): OverallProgress {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );
  const experimentNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "experiment"
  );
  const conceptNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "concept"
  );

  const modulesCompleted = moduleNodes.filter(
    (n) =>
      progress.nodeStatus[n.id] === "completed" ||
      progress.nodeStatus[n.id] === "mastered"
  ).length;

  const conceptsReviewed = conceptNodes.filter(
    (n) => progress.conceptReviewed[n.id]
  ).length;

  const experimentsCompleted = experimentNodes.filter(
    (n) => progress.experimentCompleted[n.id]
  ).length;

  // Estimate remaining minutes from incomplete nodes in critical path
  const criticalPath = LEARNING_PATHS.find((p) => p.type === "critical");
  const estimatedRemainingMinutes = criticalPath
    ? criticalPath.nodes
        .filter((n) => {
          const s = progress.nodeStatus[n.sourceId] ?? "locked";
          return s !== "completed" && s !== "mastered";
        })
        .reduce((sum, n) => sum + n.estimatedMinutes, 0)
    : 0;

  return {
    modulesCompleted,
    modulesTotal: moduleNodes.length,
    conceptsReviewed,
    conceptsTotal: conceptNodes.length,
    experimentsCompleted,
    experimentsTotal: experimentNodes.length,
    percentComplete:
      moduleNodes.length > 0
        ? Math.round((modulesCompleted / moduleNodes.length) * 100)
        : 0,
    estimatedRemainingMinutes,
  };
}

/** Get recommendations based on current progress */
export { deriveRecommendations as getRecommendations } from "./learning/derive-mastery";

/** Clear all caches (for testing) */
export function clearLearningRegistryCache(): void {
  const { clearLearningCache } = require("./learning/derive-learning");
  const { clearMasteryCache } = require("./learning/derive-mastery");
  clearLearningCache();
  clearMasteryCache();
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/data/minimind/learning-registry.ts 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/data/minimind/learning/index.ts src/data/minimind/learning-registry.ts
git commit -m "feat(learning): add learning-registry public API with lookup helpers (Phase 23)"
```

---

### Task 5: Adapter Layer — Types + Adapter

**Files:**
- Create: `src/lib/minimind/learning/types.ts`
- Create: `src/lib/minimind/learning/LearningPathAdapter.ts`
- Create: `src/lib/minimind/learning/index.ts`

**Interfaces:**
- Consumes: types from `@/data/minimind/learning-registry`, styling from `@/lib/minimind/knowledge`
- Produces: `TimelineLayout`, `PathSegment`, `RecommendationCardData`, `MasteryGridData`, `MasteryGridRow`, `MasteryCell`, `adaptTimeline()`, `adaptRecommendations()`, `adaptMasteryGrid()`, `enrichPathNode()`

- [ ] **Step 1: Write adapter types**

```typescript
// src/lib/minimind/learning/types.ts
// Adapter-layer types bridging data LearningPath to render-ready UI layouts.

import type { LearningNode, Recommendation } from "@/data/minimind/learning-registry";
import type { KnowledgeNode, NodeStyleHints } from "@/lib/minimind/knowledge";

export interface PathSegment {
  learningNode: LearningNode;
  depth: number;
  /** Whether this node appears on the left (true) or right (false) side of the timeline */
  isLeft: boolean;
  /** sourceId of the prerequisite that connects to this node */
  connectionFrom: string | null;
  /** Visual connection style from prerequisite */
  connectionType: "direct" | "parallel" | "none";
}

export interface TimelineLayout {
  segments: PathSegment[];
  totalHeight: number;
}

export interface RecommendationCardData {
  recommendation: Recommendation;
  node: KnowledgeNode | null;
  nodeStyle: NodeStyleHints | null;
  actionLabel: string;
  actionHref: string;
  priorityPercent: number;
}

export interface MasteryCell {
  conceptId: string;
  conceptLabel: string;
  isReviewed: boolean;
  relatedCount: number;
  dimension: string;
}

export interface MasteryGridRow {
  moduleLabel: string;
  moduleSourceId: string;
  concepts: MasteryCell[];
}

export interface MasteryGridData {
  rows: MasteryGridRow[];
}
```

- [ ] **Step 2: Write adapter**

```typescript
// src/lib/minimind/learning/LearningPathAdapter.ts
// Transforms LearningPath data into render-ready UI layouts.

import type { LearningPath, LearningNode, Recommendation, MasteryTree, UserProgress } from "@/data/minimind/learning-registry";
import { KNOWLEDGE_GRAPH, getNodeById } from "@/data/minimind/knowledge-registry";
import { enrichForUI } from "@/lib/minimind/knowledge";
import type { TimelineLayout, PathSegment, RecommendationCardData, MasteryGridData, MasteryGridRow, MasteryCell } from "./types";

// ============================================================
// Timeline Adaptation
// ============================================================

const SEGMENT_HEIGHT = 120;

export function adaptTimeline(
  path: LearningPath,
  viewportWidth: number
): TimelineLayout {
  const isMobile = viewportWidth < 640;

  const segments: PathSegment[] = path.nodes.map((node, index) => ({
    learningNode: node,
    depth: node.depth,
    isLeft: isMobile ? false : index % 2 === 0,
    connectionFrom:
      index > 0 ? path.nodes[index - 1].sourceId : null,
    connectionType:
      index > 0 &&
      path.nodes[index].depth === path.nodes[index - 1].depth
        ? "parallel"
        : index > 0
          ? "direct"
          : "none",
  }));

  return {
    segments,
    totalHeight: segments.length * SEGMENT_HEIGHT + 60,
  };
}

// ============================================================
// Recommendation Card Adaptation
// ============================================================

const REASON_ACTION_LABELS: Record<string, string> = {
  next_in_path: "Continue Learning",
  prerequisite_for: "Unlocks More",
  experiment: "Run Experiment",
  reinforce: "Reinforce Concept",
  explore: "Explore Concept",
};

const REASON_ACTION_HREFS: Record<string, (sourceId: string) => string> = {
  next_in_path: () => "/ai-lab/journey",
  prerequisite_for: () => "/ai-lab/journey",
  experiment: (id) => `/ai-lab/experiments?experiment=${id.replace("experiment:", "")}`,
  reinforce: () => "/ai-lab/journey",
  explore: () => "/ai-lab/knowledge",
};

export function adaptRecommendations(
  recommendations: Recommendation[]
): RecommendationCardData[] {
  return recommendations.map((rec) => {
    const node = getNodeById(rec.sourceId) ?? null;
    const nodeStyle = node ? enrichForUI(node.type) : null;

    return {
      recommendation: rec,
      node,
      nodeStyle,
      actionLabel: REASON_ACTION_LABELS[rec.reason] ?? "Explore",
      actionHref: REASON_ACTION_HREFS[rec.reason]?.(rec.sourceId) ?? "/ai-lab/journey",
      priorityPercent: Math.round(rec.priority * 100),
    };
  });
}

// ============================================================
// Mastery Grid Adaptation
// ============================================================

const MODULE_ORDER = [
  "tokenizer",
  "embedding",
  "rope",
  "attention",
  "ffn",
  "transformer",
  "model",
  "inference",
];

export function adaptMasteryGrid(
  tree: MasteryTree,
  progress: UserProgress
): MasteryGridData {
  const rows: MasteryGridRow[] = [];

  for (const moduleId of MODULE_ORDER) {
    const conceptIds = tree.moduleConceptMap[moduleId];
    if (!conceptIds || conceptIds.length === 0) continue;

    const moduleNode = KNOWLEDGE_GRAPH.nodes.find(
      (n) => n.sourceId === moduleId && n.type === "module"
    );

    const cells: MasteryCell[] = conceptIds.map((cid) => {
      const concept = tree.concepts.find((c) => c.conceptId === cid);
      return {
        conceptId: cid,
        conceptLabel: concept?.conceptLabel ?? cid.replace("concept:", ""),
        isReviewed: progress.conceptReviewed[cid] ?? false,
        relatedCount: concept?.relatedConceptIds.length ?? 0,
        dimension: concept?.dimension ?? "architecture_inference",
      };
    });

    rows.push({
      moduleLabel: moduleNode?.label ?? moduleId,
      moduleSourceId: `module:${moduleId}`,
      concepts: cells,
    });
  }

  return { rows };
}

// ============================================================
// Path Node Enrichment
// ============================================================

export interface PathNodeCardData {
  learningNode: LearningNode;
  nodeStyle: ReturnType<typeof enrichForUI>;
  statusColor: string;
  statusIcon: string;
  isClickable: boolean;
}

export function enrichPathNode(
  node: LearningNode,
  status: string
): PathNodeCardData {
  const nodeStyle = enrichForUI("module");

  const statusColors: Record<string, string> = {
    completed: "emerald",
    mastered: "emerald",
    in_progress: "amber",
    available: "brand",
    locked: "slate",
  };

  const statusIcons: Record<string, string> = {
    completed: "CheckCircle",
    mastered: "Trophy",
    in_progress: "Loader",
    available: "Play",
    locked: "Lock",
  };

  return {
    learningNode: node,
    nodeStyle,
    statusColor: statusColors[status] ?? "slate",
    statusIcon: statusIcons[status] ?? "Circle",
    isClickable: status !== "locked",
  };
}
```

- [ ] **Step 3: Write adapter barrel**

```typescript
// src/lib/minimind/learning/index.ts
// Adapter barrel — re-exports types and adapter functions.

export type {
  TimelineLayout,
  PathSegment,
  RecommendationCardData,
  MasteryCell,
  MasteryGridRow,
  MasteryGridData,
} from "./types";

export {
  adaptTimeline,
  adaptRecommendations,
  adaptMasteryGrid,
  enrichPathNode,
} from "./LearningPathAdapter";

export type { PathNodeCardData } from "./LearningPathAdapter";
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd "d:/123/HOU Universe" && npx tsc --noEmit src/lib/minimind/learning/index.ts 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/minimind/learning/types.ts src/lib/minimind/learning/LearningPathAdapter.ts src/lib/minimind/learning/index.ts
git commit -m "feat(learning): add adapter layer with timeline, recommendation, mastery grid adapters (Phase 23)"
```

---

### Task 6: UI — PathNodeCard Component

**Files:**
- Create: `src/components/minimind/learning/PathNodeCard.tsx`

**Interfaces:**
- Consumes: `PathNodeCardData` from `@/lib/minimind/learning`
- Produces: `<PathNodeCard>` component

- [ ] **Step 1: Write PathNodeCard**

```typescript
"use client";

// ============================================================
// PathNodeCard — individual learning node card on the timeline
// ============================================================

import { motion } from "framer-motion";
import {
  CheckCircle,
  Trophy,
  Loader,
  Play,
  Lock,
  BookOpen,
  FlaskConical,
  Clock,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PathNodeCardData } from "@/lib/minimind/learning";

// ============================================================
// Icon resolver
// ============================================================

const StatusIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckCircle,
  Trophy,
  Loader,
  Play,
  Lock,
};

function StatusIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = StatusIconMap[icon] ?? Lock;
  return <Icon className={className} />;
}

// ============================================================
// Status color mapping
// ============================================================

const StatusStyles: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  completed: {
    border: "border-emerald-500/30 dark:border-emerald-500/40",
    bg: "bg-emerald-500/[0.05] dark:bg-emerald-500/[0.06]",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  mastered: {
    border: "border-emerald-500/40 dark:border-emerald-500/50",
    bg: "bg-emerald-500/[0.08] dark:bg-emerald-500/[0.10]",
    text: "text-emerald-700 dark:text-emerald-300",
    badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  in_progress: {
    border: "border-amber-500/30 dark:border-amber-500/40",
    bg: "bg-amber-500/[0.05] dark:bg-amber-500/[0.06]",
    text: "text-amber-600 dark:text-amber-400",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  available: {
    border: "border-brand/25 dark:border-brand/30",
    bg: "bg-brand/[0.04] dark:bg-brand/[0.05]",
    text: "text-brand",
    badge: "border-brand/20 bg-brand/10 text-brand",
  },
  locked: {
    border: "border-slate-500/12 dark:border-slate-500/15",
    bg: "bg-slate-500/[0.02] dark:bg-slate-500/[0.03]",
    text: "text-slate-400 dark:text-slate-500",
    badge: "border-slate-500/10 bg-slate-500/5 text-slate-400 dark:text-slate-500",
  },
};

// ============================================================
// PathNodeCard
// ============================================================

interface PathNodeCardProps {
  data: PathNodeCardData;
  index: number;
  onSelect: (sourceId: string) => void;
}

export function PathNodeCard({ data, index, onSelect }: PathNodeCardProps) {
  const { learningNode, statusColor, statusIcon, isClickable } = data;
  const styles = StatusStyles[statusColor] ?? StatusStyles.locked;
  const node = learningNode.knowledgeNode;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: "easeOut",
      }}
      onClick={() => isClickable && onSelect(learningNode.sourceId)}
      disabled={!isClickable}
      className={cn(
        "group relative w-full rounded-xl border p-4 text-left transition-all duration-300 backdrop-blur-sm",
        styles.border,
        styles.bg,
        isClickable &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/5",
        !isClickable && "cursor-not-allowed opacity-60"
      )}
    >
      {/* Glow accent bar for available/in-progress */}
      {statusColor === "brand" && (
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />
      )}
      {statusColor === "in_progress" && (
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent animate-pulse"
          aria-hidden="true"
        />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            styles.border,
            styles.bg
          )}
        >
          {node.type === "experiment" ? (
            <FlaskConical className={cn("size-4", styles.text)} />
          ) : (
            <BookOpen className={cn("size-4", styles.text)} />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {node.label}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider",
                styles.badge
              )}
            >
              <StatusIcon icon={statusIcon} className="size-2.5" />
              {statusColor === "mastered"
                ? "Mastered"
                : statusColor === "completed"
                  ? "Done"
                  : statusColor === "in_progress"
                    ? "Active"
                    : statusColor === "available"
                      ? "Ready"
                      : "Locked"}
            </span>

            {/* Depth badge */}
            <span className="text-[0.6rem] font-mono text-slate-400 dark:text-slate-500">
              Step {learningNode.depth + 1}
            </span>
          </div>

          {node.metadata.description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
              {node.metadata.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 text-[0.65rem] text-slate-400 dark:text-slate-500">
            {/* Est. time */}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {learningNode.estimatedMinutes} min
            </span>

            {/* Concept count */}
            {learningNode.conceptIds.length > 0 && (
              <span>
                {learningNode.conceptIds.length} concept
                {learningNode.conceptIds.length > 1 ? "s" : ""}
              </span>
            )}

            {/* Experiment count */}
            {learningNode.experimentIds.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FlaskConical className="size-3" />
                {learningNode.experimentIds.length}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        {isClickable && (
          <ChevronRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
        )}
      </div>
    </motion.button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/learning/PathNodeCard.tsx
git commit -m "feat(learning): add PathNodeCard component with status styling (Phase 23)"
```

---

### Task 7: UI — LearningPathTimeline Component

**Files:**
- Create: `src/components/minimind/learning/LearningPathTimeline.tsx`

**Interfaces:**
- Consumes: `TimelineLayout` from `@/lib/minimind/learning`, `LearningPath`, `LearningNode`, `UserProgress` from `@/data/minimind/learning-registry`, `PathNodeCard` from `./PathNodeCard`, `enrichPathNode` from `@/lib/minimind/learning`
- Produces: `<LearningPathTimeline>` component

- [ ] **Step 1: Write LearningPathTimeline**

```typescript
"use client";

// ============================================================
// LearningPathTimeline — vertical alternating timeline
// ============================================================

import { useMemo } from "react";
import { motion } from "framer-motion";
import type {
  LearningPath,
  UserProgress,
} from "@/data/minimind/learning-registry";
import { adaptTimeline, enrichPathNode } from "@/lib/minimind/learning";
import type { TimelineLayout } from "@/lib/minimind/learning";
import { PathNodeCard } from "./PathNodeCard";

// ============================================================
// Props
// ============================================================

interface LearningPathTimelineProps {
  path: LearningPath | undefined;
  progress: UserProgress;
  viewportWidth: number;
  onSelectNode: (sourceId: string) => void;
}

// ============================================================
// LearningPathTimeline
// ============================================================

export function LearningPathTimeline({
  path,
  progress,
  viewportWidth,
  onSelectNode,
}: LearningPathTimelineProps) {
  const timeline: TimelineLayout | null = useMemo(
    () => (path ? adaptTimeline(path, viewportWidth) : null),
    [path, viewportWidth]
  );

  if (!path || !timeline || timeline.segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">
          No learning path available.
        </p>
      </div>
    );
  }

  const isMobile = viewportWidth < 640;

  return (
    <div className="relative py-8">
      {/* Center timeline line */}
      {!isMobile && (
        <div
          className="absolute left-1/2 top-0 h-full w-px -translate-x-px bg-gradient-to-b from-transparent via-brand/15 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Mobile: left-aligned line */}
      {isMobile && (
        <div
          className="absolute left-5 top-0 h-full w-px bg-gradient-to-b from-transparent via-brand/15 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Segments */}
      <div className="relative flex flex-col gap-6">
        {timeline.segments.map((segment, index) => {
          const status =
            progress.nodeStatus[segment.learningNode.sourceId] ?? "locked";
          const cardData = enrichPathNode(segment.learningNode, status);

          return (
            <motion.div
              key={segment.learningNode.sourceId}
              initial={{ opacity: 0, x: segment.isLeft ? -30 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.6,
                delay: index * 0.08,
                ease: "easeOut",
              }}
              className={`flex ${
                isMobile
                  ? "ml-10 justify-start"
                  : segment.isLeft
                    ? "justify-start pr-[calc(50%+2rem)]"
                    : "justify-end pl-[calc(50%+2rem)]"
              }`}
            >
              <div
                className={`w-full ${
                  isMobile ? "max-w-full" : "max-w-[280px]"
                }`}
              >
                {/* Connection dot on timeline */}
                {!isMobile && (
                  <div className="relative">
                    <div
                      className={`absolute top-6 ${
                        segment.isLeft
                          ? "-right-[calc(2rem+4px)]"
                          : "-left-[calc(2rem+4px)]"
                      } size-2 rounded-full border-2 border-brand/30 bg-background`}
                      aria-hidden="true"
                    />
                  </div>
                )}

                <PathNodeCard
                  data={cardData}
                  index={index}
                  onSelect={onSelectNode}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/learning/LearningPathTimeline.tsx
git commit -m "feat(learning): add LearningPathTimeline with alternating layout (Phase 23)"
```

---

### Task 8: UI — RecommendationBar + ProgressDashboard

**Files:**
- Create: `src/components/minimind/learning/RecommendationBar.tsx`
- Create: `src/components/minimind/learning/ProgressDashboard.tsx`

**Interfaces:**
- Consumes: `RecommendationCardData`, `MasteryGridData` from `@/lib/minimind/learning`, `OverallProgress` from `@/data/minimind/learning-registry`
- Produces: `<RecommendationBar>`, `<ProgressDashboard>` components

- [ ] **Step 1: Write RecommendationBar**

```typescript
"use client";

// ============================================================
// RecommendationBar — horizontal scroll of next-step cards
// ============================================================

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Lightbulb,
  FlaskConical,
  BookOpen,
  Code,
  FileText,
  ArrowRight,
  TrendingUp,
  Compass,
  Beaker,
  Sparkles,
} from "lucide-react";
import type { Recommendation } from "@/data/minimind/learning-registry";
import { adaptRecommendations } from "@/lib/minimind/learning";
import { cn } from "@/lib/utils";

// ============================================================
// Icon resolver per recommendation reason
// ============================================================

const ReasonIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  next_in_path: ArrowRight,
  prerequisite_for: TrendingUp,
  experiment: Beaker,
  reinforce: Sparkles,
  explore: Compass,
};

const ReasonBadges: Record<string, string> = {
  next_in_path: "Next Step",
  prerequisite_for: "Gateway",
  experiment: "Validate",
  reinforce: "Reinforce",
  explore: "Explore",
};

const ReasonColors: Record<string, string> = {
  next_in_path: "border-brand/20 bg-brand/10 text-brand",
  prerequisite_for: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  experiment: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  reinforce: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  explore: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

// ============================================================
// RecommendationBar
// ============================================================

interface RecommendationBarProps {
  recommendations: Recommendation[];
}

export function RecommendationBar({ recommendations }: RecommendationBarProps) {
  const cards = useMemo(
    () => adaptRecommendations(recommendations),
    [recommendations]
  );

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Recommended Next Steps
      </h3>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
        {cards.map((card, i) => {
          const ReasonIcon =
            ReasonIcons[card.recommendation.reason] ?? Compass;
          const reasonColor =
            ReasonColors[card.recommendation.reason] ??
            "border-slate-500/20 bg-slate-500/10 text-slate-500";

          return (
            <motion.div
              key={card.recommendation.sourceId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="shrink-0 snap-start"
            >
              <Link
                href={card.actionHref}
                className="group flex w-[200px] flex-col gap-2 rounded-xl border border-brand/10 bg-brand/[0.02] p-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand/25 hover:bg-brand/[0.05] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/5 dark:border-white/[0.06] dark:bg-white/[0.02]"
              >
                {/* Priority bar */}
                <div className="h-0.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-brand/60 transition-all duration-500"
                    style={{ width: `${card.priorityPercent}%` }}
                  />
                </div>

                {/* Reason badge */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 self-start rounded-full border px-2 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider",
                    reasonColor
                  )}
                >
                  <ReasonIcon className="size-2.5" />
                  {ReasonBadges[card.recommendation.reason] ?? "Explore"}
                </span>

                {/* Node label */}
                <p className="text-sm font-semibold text-foreground line-clamp-2">
                  {card.node?.label ??
                    card.recommendation.sourceId.replace(/^(module|concept|experiment):/, "")}
                </p>

                {/* Description */}
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                  {card.recommendation.description}
                </p>

                {/* CTA */}
                <span className="mt-auto inline-flex items-center gap-1 text-[0.65rem] font-medium text-brand transition-colors group-hover:text-brand/80">
                  {card.actionLabel}
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ProgressDashboard**

```typescript
"use client";

// ============================================================
// ProgressDashboard — stats, mastery grid, time remaining
// ============================================================

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Lightbulb,
  FlaskConical,
  Clock,
  Target,
} from "lucide-react";
import type {
  OverallProgress,
  UserProgress,
  MasteryTree,
} from "@/data/minimind/learning-registry";
import { adaptMasteryGrid } from "@/lib/minimind/learning";
import { cn } from "@/lib/utils";

// ============================================================
// Progress Ring
// ============================================================

function ProgressRing({
  percent,
  size = 80,
  strokeWidth = 6,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-slate-200 dark:text-slate-800"
        />
        {/* Progress circle */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-brand"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-lg font-bold text-foreground">
        {percent}%
      </span>
    </div>
  );
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-500/10 bg-slate-500/[0.02] px-3 py-2.5 dark:border-white/[0.05] dark:bg-white/[0.01]">
      <Icon className={cn("size-4 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-[0.65rem] text-slate-400 dark:text-slate-500">
          {label}
        </p>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {value}
          <span className="text-xs font-normal text-slate-400">
            /{total}
          </span>
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Mastery Grid Mini
// ============================================================

function MasteryGridMini({
  tree,
  progress,
}: {
  tree: MasteryTree;
  progress: UserProgress;
}) {
  const grid = useMemo(
    () => adaptMasteryGrid(tree, progress),
    [tree, progress]
  );

  return (
    <div className="space-y-3">
      <h4 className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Concept Mastery
      </h4>
      <div className="space-y-2">
        {grid.rows.map((row) => (
          <div key={row.moduleSourceId} className="space-y-1">
            <span className="text-[0.6rem] font-medium text-slate-500 dark:text-slate-400">
              {row.moduleLabel}
            </span>
            <div className="flex flex-wrap gap-1">
              {row.concepts.map((cell) => (
                <div
                  key={cell.conceptId}
                  className={cn(
                    "size-2.5 rounded-sm border transition-colors",
                    cell.isReviewed
                      ? "border-emerald-500/40 bg-emerald-500/30"
                      : "border-slate-500/15 bg-transparent dark:border-slate-500/20"
                  )}
                  title={cell.conceptLabel}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ProgressDashboard
// ============================================================

interface ProgressDashboardProps {
  overall: OverallProgress;
  tree: MasteryTree;
  progress: UserProgress;
}

export function ProgressDashboard({
  overall,
  tree,
  progress,
}: ProgressDashboardProps) {
  const hours = Math.floor(overall.estimatedRemainingMinutes / 60);
  const mins = overall.estimatedRemainingMinutes % 60;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="space-y-5 rounded-2xl border border-brand/10 bg-brand/[0.02] p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] lg:sticky lg:top-24"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Target className="size-4 text-brand/70" />
        <h3 className="text-sm font-semibold text-foreground">
          Your Progress
        </h3>
      </div>

      {/* Progress Ring */}
      <div className="flex flex-col items-center gap-2">
        <ProgressRing percent={overall.percentComplete} />
        <p className="text-[0.6rem] text-slate-400 dark:text-slate-500">
          Overall Completion
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard
          icon={BookOpen}
          label="Modules"
          value={overall.modulesCompleted}
          total={overall.modulesTotal}
          color="text-brand"
        />
        <StatCard
          icon={Lightbulb}
          label="Concepts"
          value={overall.conceptsReviewed}
          total={overall.conceptsTotal}
          color="text-amber-500"
        />
        <StatCard
          icon={FlaskConical}
          label="Experiments"
          value={overall.experimentsCompleted}
          total={overall.experimentsTotal}
          color="text-emerald-500"
        />
        <StatCard
          icon={Clock}
          label="Remaining"
          value={hours > 0 ? hours : mins}
          total={0}
          color="text-slate-500"
        />
      </div>

      {/* Time remaining detail */}
      {overall.estimatedRemainingMinutes > 0 && (
        <p className="text-center text-[0.65rem] text-slate-400 dark:text-slate-500">
          Est. {hours > 0 ? `${hours}h ` : ""}
          {mins > 0 ? `${mins}m` : ""} remaining
        </p>
      )}

      {/* All complete */}
      {overall.percentComplete >= 100 && (
        <p className="text-center text-[0.65rem] font-medium text-emerald-600 dark:text-emerald-400">
          🎉 All modules mastered!
        </p>
      )}

      {/* Mastery Grid */}
      <MasteryGridMini tree={tree} progress={progress} />
    </motion.div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/minimind/learning/RecommendationBar.tsx src/components/minimind/learning/ProgressDashboard.tsx
git commit -m "feat(learning): add RecommendationBar and ProgressDashboard components (Phase 23)"
```

---

### Task 9: UI — LearningJourneyPageClient (State Owner)

**Files:**
- Create: `src/components/minimind/learning/LearningJourneyPageClient.tsx`

**Interfaces:**
- Consumes: `LEARNING_PATHS`, `MASTERY_TREE`, `getLearningPath`, `getLearningNode`, `getRecommendations`, `getNextNodes`, `getOverallProgress`, `getPrerequisiteChain`, `UserProgress`, `OverallProgress` from `@/data/minimind/learning-registry`, `KNOWLEDGE_GRAPH`, `getNodeById` from `@/data/minimind/knowledge-registry`, all child UI components
- Produces: `<LearningJourneyPageClient>` — full orchestrator

- [ ] **Step 1: Write LearningJourneyPageClient**

```typescript
"use client";

// ============================================================
// LearningJourneyPageClient — state owner for /ai-lab/journey
// ============================================================

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import { Sparkles, Route, X, ExternalLink, ChevronRight } from "lucide-react";
import {
  LEARNING_PATHS,
  MASTERY_TREE,
  getLearningPath,
  getLearningNode,
  getRecommendations,
  getNextNodes,
  getOverallProgress,
  getPrerequisiteChain,
  getNodeById as getKnowledgeNodeById,
  type UserProgress,
  type OverallProgress,
  type PathType,
} from "@/data/minimind/learning-registry";
import { LearningPathTimeline } from "./LearningPathTimeline";
import { RecommendationBar } from "./RecommendationBar";
import { ProgressDashboard } from "./ProgressDashboard";
import { cn } from "@/lib/utils";

// ============================================================
// localStorage helpers
// ============================================================

const STORAGE_KEY = "minimind-learning-progress";

function createInitialProgress(): UserProgress {
  return {
    nodeStatus: {},
    conceptReviewed: {},
    experimentCompleted: {},
    lastUpdated: new Date().toISOString(),
  };
}

function loadProgress(): UserProgress {
  if (typeof window === "undefined") return createInitialProgress();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialProgress();
    const parsed = JSON.parse(raw);
    if (parsed.v === 1) {
      return {
        nodeStatus: parsed.nodeStatus ?? {},
        conceptReviewed: parsed.conceptReviewed ?? {},
        experimentCompleted: parsed.experimentCompleted ?? {},
        lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
      };
    }
    return createInitialProgress();
  } catch {
    return createInitialProgress();
  }
}

function saveProgress(progress: UserProgress): void {
  if (typeof window === "undefined") return;
  try {
    const data = {
      v: 1,
      nodeStatus: progress.nodeStatus,
      conceptReviewed: progress.conceptReviewed,
      experimentCompleted: progress.experimentCompleted,
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable — silently degrade
  }
}

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

// ============================================================
// Detail Panel
// ============================================================

function NodeDetailPanel({
  sourceId,
  progress,
  onClose,
  onToggleConcept,
  onToggleExperiment,
  onStartNode,
  onCompleteNode,
}: {
  sourceId: string;
  progress: UserProgress;
  onClose: () => void;
  onToggleConcept: (conceptId: string) => void;
  onToggleExperiment: (experimentId: string) => void;
  onStartNode: (sourceId: string) => void;
  onCompleteNode: (sourceId: string) => void;
}) {
  const learningNode = getLearningNode(sourceId);
  const knowledgeNode = getKnowledgeNodeById(sourceId);
  const chain = getPrerequisiteChain(sourceId);
  const status = progress.nodeStatus[sourceId] ?? "locked";

  if (!learningNode || !knowledgeNode) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        Node not found.
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 30, stiffness: 300 }}
      className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-brand/10 bg-background/95 p-6 shadow-2xl backdrop-blur-md dark:border-white/[0.06]"
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/[0.05] dark:hover:text-slate-300"
      >
        <X className="size-5" />
      </button>

      <div className="space-y-6">
        {/* Header */}
        <div>
          <span className="inline-flex items-center gap-1 rounded-full border border-brand/15 bg-brand/[0.04] px-2.5 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider text-brand">
            {knowledgeNode.type}
          </span>
          <h2 className="mt-2 text-xl font-bold text-foreground">
            {knowledgeNode.label}
          </h2>
          {knowledgeNode.metadata.description && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {knowledgeNode.metadata.description}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium",
              status === "completed" || status === "mastered"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                : status === "in_progress"
                  ? "border-amber-500/20 bg-amber-500/10 text-amber-600"
                  : status === "available"
                    ? "border-brand/20 bg-brand/10 text-brand"
                    : "border-slate-500/10 bg-slate-500/5 text-slate-400"
            )}
          >
            {status === "mastered"
              ? "Mastered"
              : status === "completed"
                ? "Completed"
                : status === "in_progress"
                  ? "In Progress"
                  : status === "available"
                    ? "Available"
                    : "Locked"}
          </span>
          <span className="text-[0.65rem] text-slate-400">
            ~{learningNode.estimatedMinutes} min
          </span>
        </div>

        {/* Prerequisite Chain */}
        {chain.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Prerequisite Chain
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {chain.map((n, i) => (
                <span key={n.sourceId} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[0.65rem]",
                      n.sourceId === sourceId
                        ? "border-brand/20 bg-brand/10 font-medium text-brand"
                        : "border-slate-500/10 text-slate-500"
                    )}
                  >
                    {n.knowledgeNode.label}
                  </span>
                  {i < chain.length - 1 && (
                    <ChevronRight className="size-3 text-slate-300" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Concepts */}
        {learningNode.conceptIds.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Concepts
            </h4>
            <div className="space-y-1.5">
              {learningNode.conceptIds.map((cid) => {
                const concept = getKnowledgeNodeById(cid);
                const reviewed = progress.conceptReviewed[cid] ?? false;
                return (
                  <button
                    key={cid}
                    onClick={() => onToggleConcept(cid)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      reviewed
                        ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300"
                        : "border-slate-500/10 bg-slate-500/[0.02] text-slate-600 dark:text-slate-400 hover:border-brand/15 hover:bg-brand/[0.02]"
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 rounded border transition-colors",
                        reviewed
                          ? "border-emerald-500/40 bg-emerald-500/30"
                          : "border-slate-500/20"
                      )}
                    />
                    {concept?.label ?? cid}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Experiments */}
        {learningNode.experimentIds.length > 0 && (
          <div>
            <h4 className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-400">
              Experiments
            </h4>
            <div className="space-y-1.5">
              {learningNode.experimentIds.map((eid) => {
                const exp = getKnowledgeNodeById(eid);
                const completed = progress.experimentCompleted[eid] ?? false;
                return (
                  <button
                    key={eid}
                    onClick={() => onToggleExperiment(eid)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      completed
                        ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-700 dark:text-emerald-300"
                        : "border-slate-500/10 bg-slate-500/[0.02] text-slate-600 dark:text-slate-400 hover:border-amber-500/15 hover:bg-amber-500/[0.02]"
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 rounded border transition-colors",
                        completed
                          ? "border-emerald-500/40 bg-emerald-500/30"
                          : "border-slate-500/20"
                      )}
                    />
                    {exp?.label ?? eid}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-slate-500/10 pt-4 dark:border-white/[0.05]">
          {status === "available" && (
            <button
              onClick={() => onStartNode(sourceId)}
              className="flex-1 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              Start Learning
            </button>
          )}
          {status === "in_progress" && (
            <button
              onClick={() => onCompleteNode(sourceId)}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Mark Complete
            </button>
          )}
          {status === "completed" && (
            <button
              onClick={() => onCompleteNode(sourceId)}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              Mark Mastered
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// LearningJourneyPageClient
// ============================================================

export function LearningJourneyPageClient() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── State ──
  const [progress, setProgress] = useState<UserProgress>(createInitialProgress);
  const [activePathType, setActivePathType] = useState<PathType>("critical");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(1024);

  // ── Load progress on mount ──
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        setViewportWidth(entry.contentRect.width);
      }, 150);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // ── Persist progress on every change ──
  useEffect(() => {
    if (progress.lastUpdated) {
      saveProgress(progress);
    }
  }, [progress]);

  // ── Derived data ──
  const path = useMemo(
    () => getLearningPath(activePathType),
    [activePathType]
  );

  const recommendations = useMemo(
    () => getRecommendations(progress),
    [progress]
  );

  const nextNodeIds = useMemo(
    () => getNextNodes(progress),
    [progress]
  );

  const overall = useMemo(
    (): OverallProgress => getOverallProgress(progress),
    [progress]
  );

  // ── Handlers ──
  const handleSelectNode = useCallback((sourceId: string) => {
    setSelectedNodeId(sourceId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleStartNode = useCallback(
    (sourceId: string) => {
      setProgress((prev) => {
        // Mark all prerequisites as completed first
        const nodeStatus = { ...prev.nodeStatus };
        const node = getLearningNode(sourceId);
        if (node) {
          for (const prereqId of node.prerequisites) {
            if (nodeStatus[prereqId] !== "mastered") {
              nodeStatus[prereqId] = "completed";
            }
          }
        }
        nodeStatus[sourceId] = "in_progress";
        return {
          ...prev,
          nodeStatus,
          lastUpdated: new Date().toISOString(),
        };
      });
    },
    []
  );

  const handleCompleteNode = useCallback(
    (sourceId: string) => {
      setProgress((prev) => {
        const currentStatus = prev.nodeStatus[sourceId] ?? "locked";
        const newStatus =
          currentStatus === "completed" ? "mastered" : "completed";

        // If mastering, check for concept and experiment completion
        const updated = {
          ...prev,
          nodeStatus: { ...prev.nodeStatus, [sourceId]: newStatus },
          lastUpdated: new Date().toISOString(),
        };

        return updated;
      });
      setSelectedNodeId(null);
    },
    []
  );

  const handleToggleConcept = useCallback(
    (conceptId: string) => {
      setProgress((prev) => ({
        ...prev,
        conceptReviewed: {
          ...prev.conceptReviewed,
          [conceptId]: !prev.conceptReviewed[conceptId],
        },
        lastUpdated: new Date().toISOString(),
      }));
    },
    []
  );

  const handleToggleExperiment = useCallback(
    (experimentId: string) => {
      setProgress((prev) => ({
        ...prev,
        experimentCompleted: {
          ...prev.experimentCompleted,
          [experimentId]: !prev.experimentCompleted[experimentId],
        },
        lastUpdated: new Date().toISOString(),
      }));
    },
    []
  );

  // ── Path type tab labels ──
  const pathTypeLabels: Record<PathType, string> = {
    critical: "Recommended",
    breadth_first: "Breadth-First",
    experiment_first: "Hands-On",
  };

  return (
    <div
      ref={containerRef}
      className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20"
    >
      {/* ================================================================ */}
      {/* Page Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("minimind.learning.subhead")}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("minimind.learning.heading")}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {t("minimind.learning.intro")}
          </p>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Recommendations Bar */}
      {/* ================================================================ */}
      {recommendations.length > 0 && (
        <div className="mt-8">
          <RecommendationBar recommendations={recommendations} />
        </div>
      )}

      {/* ================================================================ */}
      {/* Path Type Tabs */}
      {/* ================================================================ */}
      <div className="mt-8 flex items-center gap-1">
        <Route className="mr-2 size-4 text-brand/60" />
        {(Object.keys(pathTypeLabels) as PathType[]).map((type) => (
          <button
            key={type}
            onClick={() => setActivePathType(type)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              activePathType === type
                ? "border-brand/20 bg-brand/10 text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            )}
          >
            {pathTypeLabels[type]}
          </button>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Timeline + Dashboard */}
      {/* ================================================================ */}
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <div>
          <LearningPathTimeline
            path={path}
            progress={progress}
            viewportWidth={viewportWidth}
            onSelectNode={handleSelectNode}
          />
        </div>

        {/* Dashboard sidebar — on mobile, hidden or below */}
        <div className="hidden lg:block">
          <ProgressDashboard
            overall={overall}
            tree={MASTERY_TREE}
            progress={progress}
          />
        </div>
      </div>

      {/* Mobile dashboard */}
      <div className="mt-8 lg:hidden">
        <ProgressDashboard
          overall={overall}
          tree={MASTERY_TREE}
          progress={progress}
        />
      </div>

      {/* ================================================================ */}
      {/* Detail Slide-Out Panel */}
      {/* ================================================================ */}
      <AnimatePresence>
        {selectedNodeId && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
              onClick={handleClosePanel}
            />
            <NodeDetailPanel
              sourceId={selectedNodeId}
              progress={progress}
              onClose={handleClosePanel}
              onToggleConcept={handleToggleConcept}
              onToggleExperiment={handleToggleExperiment}
              onStartNode={handleStartNode}
              onCompleteNode={handleCompleteNode}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/minimind/learning/LearningJourneyPageClient.tsx
git commit -m "feat(learning): add LearningJourneyPageClient state owner (Phase 23)"
```

---

### Task 10: Component Barrel + Route + i18n + Integration

**Files:**
- Create: `src/components/minimind/learning/index.ts`
- Modify: `src/app/ai-lab/journey/page.tsx`
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/zh-CN.json`

- [ ] **Step 1: Write component barrel**

```typescript
// src/components/minimind/learning/index.ts
// Component barrel — re-exports all learning UI components.

export { LearningJourneyPageClient } from "./LearningJourneyPageClient";
export { LearningPathTimeline } from "./LearningPathTimeline";
export { PathNodeCard } from "./PathNodeCard";
export { RecommendationBar } from "./RecommendationBar";
export { ProgressDashboard } from "./ProgressDashboard";
```

- [ ] **Step 2: Replace journey page placeholder**

Replace the entire content of `src/app/ai-lab/journey/page.tsx`:

```typescript
import type { Metadata } from "next";
import { LearningJourneyPageClient } from "@/components/minimind/learning";

export const metadata: Metadata = {
  title: "Learning Journey — MiniMind",
  description:
    "Follow the guided learning path through MiniMind modules — from tokenization to inference, with concept tracking and experiment validation.",
};

export default function JourneyPage() {
  return <LearningJourneyPageClient />;
}
```

- [ ] **Step 3: Add i18n keys to en.json**

Add this block under `"minimind"` in `src/lib/i18n/locales/en.json`, alongside existing `"knowledge"` keys:

```json
"learning": {
  "subhead": "Learning Journey",
  "heading": "Your Path Through MiniMind",
  "intro": "Follow a guided, dependency-ordered learning path through all MiniMind modules. Track concept mastery, validate knowledge with experiments, and get smart recommendations for what to learn next."
}
```

- [ ] **Step 4: Add i18n keys to zh-CN.json**

Add this block under `"minimind"` in `src/lib/i18n/locales/zh-CN.json`, alongside existing `"knowledge"` keys:

```json
"learning": {
  "subhead": "学习旅程",
  "heading": "MiniMind 学习路径",
  "intro": "沿着依赖关系排序的引导式学习路径，逐步掌握所有 MiniMind 模块。追踪概念掌握、通过实验验证知识、获取智能推荐指引下一步学习方向。"
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/minimind/learning/index.ts src/app/ai-lab/journey/page.tsx src/lib/i18n/locales/en.json src/lib/i18n/locales/zh-CN.json
git commit -m "feat(learning): add barrel, replace journey placeholder, add i18n keys (Phase 23)"
```

---

### Task 11: Build Verification

- [ ] **Step 1: Run full build**

```bash
cd "d:/123/HOU Universe" && npm run build 2>&1
```

Expected: zero errors, zero warnings.

- [ ] **Step 2: Fix any build issues**

If warnings or errors appear, identify the file and fix. Common potential issues:
- Missing imports in index.ts barrels
- Type mismatches — ensure `getNodeById` is imported from the right registry
- i18n JSON syntax errors — validate with a JSON linter
- `node.type === "module"` narrowing — may need type assertion

- [ ] **Step 3: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix(learning): resolve build warnings (Phase 23)"
```

---

## Self-Review

1. **Spec coverage:**
   - ✅ LearningNode, LearningPath types (Task 1)
   - ✅ 8 path derivation rules (Task 2)
   - ✅ 5 recommendation rules + mastery tree (Task 3)
   - ✅ Public learning-registry API (Task 4)
   - ✅ Adapter layer (Task 5)
   - ✅ PathNodeCard (Task 6)
   - ✅ LearningPathTimeline (Task 7)
   - ✅ RecommendationBar + ProgressDashboard (Task 8)
   - ✅ LearningJourneyPageClient state owner (Task 9)
   - ✅ Route replacement + i18n (Task 10)
   - ✅ Build verification (Task 11)

2. **Placeholder scan:** No TODOs, TBDs, or incomplete sections. All code is concrete.

3. **Type consistency:** Interface names, function signatures, and property names are consistent across all tasks. `sourceId` refers to `KnowledgeNode.id` in all files. Adapter functions match data layer exports.
