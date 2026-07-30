// ============================================================
// MiniMind Knowledge Graph — Adapter Barrel
// ============================================================

export type {
  ForceNode,
  KnowledgeLayout,
  ViewportConfig,
  ZoneConfig,
  ZoneLayout,
  NodeStyleHints,
  EdgeStyleHints,
} from "./types";

export {
  adaptKnowledgeGraph,
  enrichForUI,
  getEdgeStyle,
  ZONE_CONFIGS,
} from "./KnowledgeGraphAdapter";
