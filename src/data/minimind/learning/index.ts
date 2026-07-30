// ============================================================
// MiniMind Learning Intelligence — Internal Barrel
// ============================================================
//
// Re-exports types and derivation functions for internal
// consumers (learning-registry.ts and adapter layer).
// ============================================================

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

export {
  deriveLearningPaths,
  getPathByType,
  clearLearningCache,
} from "./derive-learning";

export {
  deriveMasteryTree,
  deriveRecommendations,
  clearMasteryCache,
} from "./derive-mastery";
