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
