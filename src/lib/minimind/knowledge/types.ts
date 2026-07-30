// ============================================================
// MiniMind Knowledge Graph — Adapter Types
// ============================================================
//
// These types bridge the pure data KnowledgeGraph to the UI.
// ForceNode adds position + dimension data; KnowledgeLayout
// captures the complete render-ready state.
//
// All types are pure data contracts — no runtime logic, no
// side effects, no rendering code. The adapter layer (Phase 22c)
// will produce these from the raw KnowledgeGraph.
// ============================================================

import type {
  KnowledgeNode,
  KnowledgeNodeType,
  KnowledgeEdge,
} from "@/data/minimind/knowledge-registry";

// ============================================================
// ForceNode — a KnowledgeNode with layout position
// ============================================================

/**
 * A knowledge node with computed layout position and dimensions.
 *
 * Unlike d3-force nodes, there are no velocity vectors — this is
 * a deterministic, stateless position derived from zone placement
 * + dependency hierarchy + grid packing + collision adjustment.
 */
export interface ForceNode extends KnowledgeNode {
  /** Computed x position (node center) */
  x: number;
  /** Computed y position (node center) */
  y: number;
  /** Node visual width in pixels */
  width: number;
  /** Node visual height in pixels */
  height: number;
  /** Zone anchor x — the center of this node's semantic zone */
  anchorX: number;
  /** Zone anchor y — the center of this node's semantic zone */
  anchorY: number;
}

// ============================================================
// Layout configuration
// ============================================================

/** Viewport dimensions for responsive layout */
export interface ViewportConfig {
  width: number;
  height: number;
  /** Padding around the full graph bounding box */
  padding: number;
}

/** Configuration for one semantic zone */
export interface ZoneConfig {
  /** Human-readable anchor name */
  anchor: string;
  /** Column in the 3×3 implicit grid (0, 1, or 2) */
  col: number;
  /** Row in the 3×3 implicit grid (0, 1, or 2) */
  row: number;
  /** Maximum columns before wrapping nodes within this zone */
  maxCols: number;
}

/** Computed layout for one zone */
export interface ZoneLayout {
  /** Which node type this zone contains */
  type: KnowledgeNodeType;
  /** Center x of the zone region */
  cx: number;
  /** Center y of the zone region */
  cy: number;
  /** Zone region width */
  width: number;
  /** Zone region height */
  height: number;
  /** Number of nodes assigned to this zone */
  nodeCount: number;
}

// ============================================================
// Complete layout
// ============================================================

/**
 * Complete render-ready knowledge layout.
 *
 * Produced by KnowledgeGraphAdapter.adaptKnowledgeGraph().
 * Contains all positioned nodes, edges, zone metadata, and
 * viewport configuration.
 */
export interface KnowledgeLayout {
  /** All nodes with computed positions */
  nodes: ForceNode[];
  /** All edges (unchanged from KnowledgeGraph) */
  edges: KnowledgeEdge[];
  /** Viewport used for this layout computation */
  viewport: ViewportConfig;
  /** Zone regions */
  zones: ZoneLayout[];
  /** Bounding box of the entire graph (for SVG viewBox) */
  bbox: { x: number; y: number; width: number; height: number };
}

// ============================================================
// UI enrichment
// ============================================================

/** Styling hints for rendering a node */
export interface NodeStyleHints {
  /** Tailwind border color class */
  borderClass: string;
  /** Tailwind background color class */
  bgClass: string;
  /** Tailwind shape class (rounded-xl, rounded-full, etc.) */
  shapeClass: string;
  /** lucide-react icon component name */
  icon: string;
  /** Node width */
  width: number;
  /** Node height */
  height: number;
}

// ============================================================
// Edge styling
// ============================================================

/** Styling hints for rendering an edge */
export interface EdgeStyleHints {
  /** Tailwind stroke color class */
  strokeClass: string;
  /** Stroke width in pixels */
  strokeWidth: number;
  /** Dash array string (e.g. "4 4") or undefined for solid */
  dashArray?: string;
}
