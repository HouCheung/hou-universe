// ============================================================
// MiniMind Knowledge Graph Adapter
// ============================================================
//
// Transforms the raw KnowledgeGraph into a render-ready
// KnowledgeLayout using custom deterministic layout:
//
// 1. Semantic zone placement (5 zones in a cross pattern)
// 2. Module dependency hierarchy (topological levels as rows)
// 3. Grid packing within non-module zones
// 4. Lightweight collision adjustment (≤5 passes)
//
// No d3-force. No randomness. Structured educational map.
// ============================================================

import type { KnowledgeGraph, KnowledgeNode, KnowledgeNodeType, KnowledgeEdgeType } from "@/data/minimind/knowledge-registry";
import { computeDependencyLevels } from "@/data/minimind/module-registry";
import type {
  ForceNode,
  KnowledgeLayout,
  ViewportConfig,
  ZoneConfig,
  ZoneLayout,
  NodeStyleHints,
  EdgeStyleHints,
} from "./types";

// ============================================================
// Zone configuration — 3×3 implicit grid, cross pattern
// ============================================================

/**
 * Fixed zone configuration.
 *
 * Zones are arranged in a 3×3 implicit grid:
 *
 *   Concepts (0,0)    [empty] (1,0)    Documents (2,0)
 *   [empty]  (0,1)    Modules (1,1)    [empty]   (2,1)
 *   Experiments (0,2) [empty] (1,2)    Implementations (2,2)
 */
export const ZONE_CONFIGS: Record<KnowledgeNodeType, ZoneConfig> = {
  module:         { anchor: "center",        col: 1, row: 1, maxCols: 3 },
  concept:        { anchor: "top-left",      col: 0, row: 0, maxCols: 4 },
  document:       { anchor: "top-right",     col: 2, row: 0, maxCols: 2 },
  experiment:     { anchor: "bottom-left",   col: 0, row: 2, maxCols: 2 },
  implementation: { anchor: "bottom-right",  col: 2, row: 2, maxCols: 2 },
};

// ============================================================
// Node dimensions by type
// ============================================================

interface NodeDimensions {
  width: number;
  height: number;
  gapX: number;
  gapY: number;
}

const NODE_DIMENSIONS: Record<KnowledgeNodeType, NodeDimensions> = {
  module:         { width: 130, height: 60, gapX: 24, gapY: 20 },
  concept:        { width: 110, height: 40, gapX: 16, gapY: 14 },
  experiment:     { width: 126, height: 48, gapX: 16, gapY: 14 },
  document:       { width: 120, height: 44, gapX: 16, gapY: 14 },
  implementation: { width: 110, height: 38, gapX: 14, gapY: 12 },
};

// ============================================================
// UI enrichment — styling hints per node/edge type
// ============================================================

/**
 * Return styling hints for rendering a node of the given type.
 */
export function enrichForUI(nodeType: KnowledgeNodeType): NodeStyleHints {
  switch (nodeType) {
    case "module":
      return {
        borderClass: "border-brand/25 dark:border-brand/30",
        bgClass: "bg-brand/[0.05] dark:bg-[rgba(var(--brand-rgb),0.06)]",
        shapeClass: "rounded-xl",
        icon: "Box",
        width: NODE_DIMENSIONS.module.width,
        height: NODE_DIMENSIONS.module.height,
      };
    case "concept":
      return {
        borderClass: "border-slate-500/20 dark:border-slate-500/25",
        bgClass: "bg-slate-500/[0.03] dark:bg-slate-500/[0.04]",
        shapeClass: "rounded-full",
        icon: "Lightbulb",
        width: NODE_DIMENSIONS.concept.width,
        height: NODE_DIMENSIONS.concept.height,
      };
    case "experiment":
      return {
        borderClass: "border-amber-500/25 dark:border-amber-500/30",
        bgClass: "bg-amber-500/[0.05] dark:bg-amber-500/[0.06]",
        shapeClass: "rounded-lg",
        icon: "FlaskConical",
        width: NODE_DIMENSIONS.experiment.width,
        height: NODE_DIMENSIONS.experiment.height,
      };
    case "document":
      return {
        borderClass: "border-dashed border-slate-500/15 dark:border-slate-500/20",
        bgClass: "bg-transparent",
        shapeClass: "rounded-lg",
        icon: "FileText",
        width: NODE_DIMENSIONS.document.width,
        height: NODE_DIMENSIONS.document.height,
      };
    case "implementation":
      return {
        borderClass: "border-slate-500/12 dark:border-slate-500/15",
        bgClass: "bg-slate-500/[0.02] dark:bg-slate-500/[0.03]",
        shapeClass: "rounded-md",
        icon: "Code",
        width: NODE_DIMENSIONS.implementation.width,
        height: NODE_DIMENSIONS.implementation.height,
      };
  }
}

/**
 * Return styling hints for rendering an edge of the given type.
 */
export function getEdgeStyle(edgeType: KnowledgeEdgeType): EdgeStyleHints {
  switch (edgeType) {
    case "depends_on":
      return {
        strokeClass: "stroke-brand/40 dark:stroke-brand/45",
        strokeWidth: 2,
        dashArray: undefined,
      };
    case "explains":
      return {
        strokeClass: "stroke-slate-500/25 dark:stroke-slate-500/30",
        strokeWidth: 1,
        dashArray: undefined,
      };
    case "implements":
      return {
        strokeClass: "stroke-slate-500/20 dark:stroke-slate-500/25",
        strokeWidth: 1,
        dashArray: "4 4",
      };
    case "experiments":
      return {
        strokeClass: "stroke-amber-500/30 dark:stroke-amber-500/35",
        strokeWidth: 1.5,
        dashArray: undefined,
      };
    case "documents":
      return {
        strokeClass: "stroke-slate-500/20 dark:stroke-slate-500/25",
        strokeWidth: 1,
        dashArray: "2 4",
      };
    case "relates_to":
      return {
        strokeClass: "stroke-slate-500/15 dark:stroke-slate-500/18",
        strokeWidth: 0.5,
        dashArray: "1 3",
      };
  }
}

// ============================================================
// Zone anchor computation
// ============================================================

/**
 * Compute zone regions from viewport dimensions.
 *
 * The viewport is divided into a 3×3 grid. Each zone occupies
 * one cell. Cell size is 1/3 of the available viewport.
 */
function computeZones(
  viewport: ViewportConfig,
  nodeCounts: Record<KnowledgeNodeType, number>
): ZoneLayout[] {
  const cellW = (viewport.width - viewport.padding * 2) / 3;
  const cellH = (viewport.height - viewport.padding * 2) / 3;

  const zones: ZoneLayout[] = [];

  for (const [type, config] of Object.entries(ZONE_CONFIGS) as [KnowledgeNodeType, ZoneConfig][]) {
    const cx = viewport.padding + config.col * cellW + cellW / 2;
    const cy = viewport.padding + config.row * cellH + cellH / 2;

    zones.push({
      type,
      cx,
      cy,
      width: cellW,
      height: cellH,
      nodeCount: nodeCounts[type] ?? 0,
    });
  }

  return zones;
}

// ============================================================
// Module zone: dependency hierarchy rows
// ============================================================

/**
 * Place module nodes in rows by topological dependency level.
 *
 * Level 0 (root modules, no deps) at top, increasing levels
 * downward. Nodes at the same level are placed side-by-side.
 */
function placeModuleNodes(
  nodes: KnowledgeNode[],
  zone: ZoneLayout
): ForceNode[] {
  const moduleNodes = nodes.filter((n) => n.type === "module");
  if (moduleNodes.length === 0) return [];

  const depLevels = computeDependencyLevels();
  const dims = NODE_DIMENSIONS.module;

  // Group modules by dependency level
  const levelMap = new Map<number, KnowledgeNode[]>();
  for (const dl of depLevels) {
    const node = moduleNodes.find((n) => n.sourceId === dl.moduleId);
    if (node) {
      const existing = levelMap.get(dl.level) ?? [];
      existing.push(node);
      levelMap.set(dl.level, existing);
    }
  }

  const sortedLevels = Array.from(levelMap.entries()).sort(([a], [b]) => a - b);
  const zoneStartY = zone.cy - (zone.height / 2) + dims.height + 20;

  const result: ForceNode[] = [];

  for (let li = 0; li < sortedLevels.length; li++) {
    const [, levelNodes] = sortedLevels[li];
    const y = zoneStartY + li * (dims.height + dims.gapY);
    const totalRowWidth =
      levelNodes.length * dims.width +
      (levelNodes.length - 1) * dims.gapX;
    const startX = zone.cx - totalRowWidth / 2 + dims.width / 2;

    for (let ni = 0; ni < levelNodes.length; ni++) {
      const node = levelNodes[ni];
      result.push({
        ...node,
        x: startX + ni * (dims.width + dims.gapX),
        y,
        width: dims.width,
        height: dims.height,
        anchorX: zone.cx,
        anchorY: zone.cy,
      });
    }
  }

  return result;
}

// ============================================================
// Non-module zones: grid packing
// ============================================================

/**
 * Place non-module nodes in a grid within their zone.
 *
 * Default: single column, stacked vertically.
 * If node count exceeds vertical capacity, wrap to 2 columns.
 */
function placeNonModuleNodes(
  nodes: KnowledgeNode[],
  nodeType: KnowledgeNodeType,
  zone: ZoneLayout
): ForceNode[] {
  const typeNodes = nodes.filter((n) => n.type === nodeType);
  if (typeNodes.length === 0) return [];

  const config = ZONE_CONFIGS[nodeType];
  const dims = NODE_DIMENSIONS[nodeType];
  const maxCols = config.maxCols;

  // Determine how many columns we need
  const maxRowsPerCol = Math.floor(zone.height / (dims.height + dims.gapY));
  const colsNeeded = Math.min(
    maxCols,
    Math.ceil(typeNodes.length / Math.max(1, maxRowsPerCol))
  );
  const rowsPerCol = Math.ceil(typeNodes.length / colsNeeded);

  const result: ForceNode[] = [];
  const totalColWidth =
    colsNeeded * dims.width + (colsNeeded - 1) * dims.gapX;
  const startX = zone.cx - totalColWidth / 2 + dims.width / 2;
  const totalColHeight =
    rowsPerCol * dims.height + (rowsPerCol - 1) * dims.gapY;
  const startY = zone.cy - totalColHeight / 2 + dims.height / 2;

  for (let i = 0; i < typeNodes.length; i++) {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const node = typeNodes[i];

    result.push({
      ...node,
      x: startX + col * (dims.width + dims.gapX),
      y: startY + row * (dims.height + dims.gapY),
      width: dims.width,
      height: dims.height,
      anchorX: zone.cx,
      anchorY: zone.cy,
    });
  }

  return result;
}

// ============================================================
// Collision resolution
// ============================================================

/**
 * Lightweight overlap detection and resolution.
 *
 * For each pair of overlapping nodes, push them apart along
 * the shortest escape axis. Runs at most `maxPasses` iterations.
 *
 * O(n² × passes) — for 100 nodes and 5 passes, ~50K checks.
 */
function resolveCollisions(nodes: ForceNode[], maxPasses: number = 5): void {
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const halfW = (a.width + b.width) / 2 + 12;
        const halfH = (a.height + b.height) / 2 + 12;

        const overlapX = halfW - Math.abs(dx);
        const overlapY = halfH - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) continue; // No overlap

        if (dist < 0.01) {
          // Overlapping centers — nudge apart
          a.x -= 10;
          b.x += 10;
          moved = true;
          continue;
        }

        // Push apart along the shortest escape direction
        const nx = dx / dist;
        const ny = dy / dist;
        const pushAmount = Math.min(overlapX, overlapY) * 0.6;

        a.x -= nx * pushAmount;
        a.y -= ny * pushAmount;
        b.x += nx * pushAmount;
        b.y += ny * pushAmount;
        moved = true;
      }
    }

    if (!moved) break;
  }
}

// ============================================================
// Bounding box computation
// ============================================================

function computeBbox(
  nodes: ForceNode[],
  padding: number
): { x: number; y: number; width: number; height: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: padding * 2, height: padding * 2 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x - node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

// ============================================================
// Main adapter function
// ============================================================

/**
 * Adapt a raw KnowledgeGraph into a render-ready KnowledgeLayout.
 *
 * Runs the full custom layout pipeline:
 * 1. Compute zone regions from viewport
 * 2. Place module nodes by dependency hierarchy
 * 3. Place non-module nodes by grid packing
 * 4. Resolve collisions
 * 5. Compute bounding box
 *
 * @param graph - The derived knowledge graph
 * @param viewport - Current viewport dimensions
 * @returns Complete KnowledgeLayout ready for rendering
 */
export function adaptKnowledgeGraph(
  graph: KnowledgeGraph,
  viewport: ViewportConfig
): KnowledgeLayout {
  const zones = computeZones(viewport, graph.meta.nodeCounts);

  // Place nodes by zone
  const moduleZone = zones.find((z) => z.type === "module")!;
  const placedNodes: ForceNode[] = [
    ...placeModuleNodes(graph.nodes, moduleZone),
  ];

  for (const nodeType of ["concept", "experiment", "document", "implementation"] as const) {
    const zone = zones.find((z) => z.type === nodeType);
    if (!zone || zone.nodeCount === 0) continue;
    placedNodes.push(...placeNonModuleNodes(graph.nodes, nodeType, zone));
  }

  // Resolve collisions
  resolveCollisions(placedNodes);

  // Compute bounding box
  const bbox = computeBbox(placedNodes, viewport.padding);

  return {
    nodes: placedNodes,
    edges: graph.edges,
    viewport,
    zones,
    bbox,
  };
}
