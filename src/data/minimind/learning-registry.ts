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
import { deriveLearningPaths, clearLearningCache } from "./learning/derive-learning";
import {
  deriveMasteryTree,
  clearMasteryCache,
} from "./learning/derive-mastery";
import type {
  LearningPath,
  LearningNode,
  PathType,
  MasteryTree,
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

/**
 * Get node IDs that are immediately available (all prerequisites completed).
 *
 * Edge convention: source --depends_on--> target means "source depends on target"
 * (the target is the prerequisite). Therefore, to find prerequisites of a node,
 * we look for edges where the node is the SOURCE and check the TARGET's status.
 */
export function getNextNodes(progress: UserProgress): string[] {
  const moduleNodes = KNOWLEDGE_GRAPH.nodes.filter(
    (n) => n.type === "module"
  );
  const available: string[] = [];

  for (const node of moduleNodes) {
    const status = progress.nodeStatus[node.id] ?? "locked";
    if (status === "completed" || status === "mastered") continue;

    // Find edges where this node is the SOURCE (this node depends on target)
    // Target is the prerequisite — check if all targets are completed
    const prereqEdges = KNOWLEDGE_GRAPH.edges.filter(
      (e) => e.source === node.id && e.type === "depends_on"
    );

    const allPrereqsDone = prereqEdges.every((e) => {
      const ps = progress.nodeStatus[e.target] ?? "locked";
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
  clearLearningCache();
  clearMasteryCache();
}
