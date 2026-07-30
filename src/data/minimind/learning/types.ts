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
