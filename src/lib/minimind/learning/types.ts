// Adapter-layer types bridging data LearningPath to render-ready UI layouts.

import type { LearningNode, Recommendation } from "@/data/minimind/learning-registry";
import type { KnowledgeNode } from "@/data/minimind/knowledge-registry";
import type { NodeStyleHints } from "@/lib/minimind/knowledge";

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
