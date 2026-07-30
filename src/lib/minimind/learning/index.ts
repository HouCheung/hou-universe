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
