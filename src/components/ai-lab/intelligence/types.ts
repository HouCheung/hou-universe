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
