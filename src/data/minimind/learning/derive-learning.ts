// ============================================================
// MiniMind Learning Intelligence — Learning Path Derivation
// ============================================================
//
// Pure functions that derive LearningPaths from the Knowledge
// Graph and existing SSOT registries. 8 derivation rules.
// ============================================================

import { KNOWLEDGE_GRAPH } from "@/data/minimind/knowledge-registry";
import {
  MINIMIND_MODULES,
  computeDependencyLevels,
  getModuleExperiments,
} from "@/data/minimind/module-registry";
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
    const experimentIds = experiments.map((exp) => `experiment:${exp.id}`);

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

  const depthCache = new Map<string, number>();

  function getDepth(id: string, visited: Set<string>): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const deps: string[] = prereqMap.get(id) ?? [];
    if (deps.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const maxDep = Math.max(
      ...deps.map((d) => getDepth(d, new Set(visited)))
    );
    const depth = maxDep + 1;
    depthCache.set(id, depth);
    return depth;
  }

  let maxDepth = 0;
  for (const id of prereqMap.keys()) {
    const d = getDepth(id, new Set());
    if (d > maxDepth) maxDepth = d;
  }

  // Walk back from deepest node through longest chain
  const deepest = Array.from(prereqMap.keys()).filter(
    (id) => getDepth(id, new Set()) === maxDepth
  );

  for (const startId of deepest) {
    let current: string | undefined = startId;
    while (current) {
      critical.add(current);
      const deps: string[] = prereqMap.get(current) ?? [];
      if (deps.length === 0) break;
      // Choose prerequisite with highest depth
      current = deps.reduce((a: string, b: string) =>
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
