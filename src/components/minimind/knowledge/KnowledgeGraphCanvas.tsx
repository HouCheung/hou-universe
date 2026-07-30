"use client";

// ============================================================
// KnowledgeGraphCanvas — SVG-based interactive graph canvas
// ============================================================
//
// Renders the knowledge graph as an SVG with Framer Motion
// zoom/pan controls. Nodes render as foreignObject glass cards.
// Edges render as typed SVG lines.
//
// State owned by parent (KnowledgePageClient).
// This component owns only zoom, pan, and hover state.
// ============================================================

import { useRef, useState, useCallback, type WheelEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Box,
  Lightbulb,
  FlaskConical,
  FileText,
  Code,
  type LucideIcon,
} from "lucide-react";
import type {
  KnowledgeLayout,
  ForceNode,
} from "@/lib/minimind/knowledge";
import { getEdgeStyle, enrichForUI } from "@/lib/minimind/knowledge";
import type {
  KnowledgeNodeType,
  KnowledgeEdge,
} from "@/data/minimind/knowledge-registry";

// ============================================================
// Icon map
// ============================================================

const ICON_MAP: Record<KnowledgeNodeType, LucideIcon> = {
  module: Box,
  concept: Lightbulb,
  experiment: FlaskConical,
  document: FileText,
  implementation: Code,
};

// ============================================================
// Props
// ============================================================

interface KnowledgeGraphCanvasProps {
  /** Render-ready layout with positioned nodes */
  layout: KnowledgeLayout | null;
  /** Currently selected node ID */
  selectedNode: string | null;
  /** Active type filters */
  filters: Set<KnowledgeNodeType>;
  /** Current search query string */
  searchQuery: string;
  /** Callback when a node is clicked */
  onNodeClick: (nodeId: string) => void;
}

// ============================================================
// Helper: check if a node matches the search query
// ============================================================

function matchesSearch(node: ForceNode, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.toLowerCase();
  return (
    node.label.toLowerCase().includes(q) ||
    (node.metadata.description ?? "").toLowerCase().includes(q)
  );
}

// ============================================================
// KnowledgeGraphCanvas
// ============================================================

export function KnowledgeGraphCanvas({
  layout,
  selectedNode,
  filters,
  searchQuery,
  onNodeClick,
}: KnowledgeGraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Filter nodes by type toggle and search query
  const visibleNodeIds = new Set<string>();
  const visibleNodes: ForceNode[] = [];
  if (layout) {
    for (const node of layout.nodes) {
      if (filters.has(node.type) && matchesSearch(node, searchQuery)) {
        visibleNodeIds.add(node.id);
        visibleNodes.push(node);
      }
    }
  }

  // Filter edges: both endpoints must be visible
  const visibleEdges: KnowledgeEdge[] = [];
  if (layout) {
    for (const edge of layout.edges) {
      if (
        visibleNodeIds.has(edge.source) &&
        visibleNodeIds.has(edge.target)
      ) {
        visibleEdges.push(edge);
      }
    }
  }

  // Zoom handler
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((prev) => Math.max(0.3, Math.min(3.0, prev + delta)));
  }, []);

  // Get connected node IDs for hover highlighting
  const connectedNodeIds = new Set<string>();
  if (hoveredNode && layout) {
    connectedNodeIds.add(hoveredNode);
    for (const edge of layout.edges) {
      if (edge.source === hoveredNode) connectedNodeIds.add(edge.target);
      if (edge.target === hoveredNode) connectedNodeIds.add(edge.source);
    }
  }

  // Edge label on hover
  const edgeTypeLabel: Record<string, string> = {
    depends_on: "depends on",
    explains: "explains",
    implements: "implements",
    experiments: "experiments",
    documents: "documents",
    relates_to: "relates to",
  };

  if (!layout) {
    return (
      <div
        ref={containerRef}
        className="flex h-[600px] items-center justify-center rounded-2xl border border-dashed border-slate-500/15 dark:border-white/[0.06]"
      >
        <p className="text-sm text-slate-500/60">Loading knowledge graph...</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-brand/10 bg-brand/[0.01] dark:border-white/[0.04] dark:bg-transparent"
      style={{ height: "600px", touchAction: "none" }}
      onWheel={handleWheel}
    >
      <svg
        className="absolute inset-0 size-full"
        viewBox={`${layout.bbox.x} ${layout.bbox.y} ${layout.bbox.width} ${layout.bbox.height}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Edge layer */}
        <g>
          {visibleEdges.map((edge) => {
            const sourceNode = layout.nodes.find(
              (n) => n.id === edge.source
            );
            const targetNode = layout.nodes.find(
              (n) => n.id === edge.target
            );
            if (!sourceNode || !targetNode) return null;

            const style = getEdgeStyle(edge.type);
            const isHighlighted =
              hoveredNode === edge.source || hoveredNode === edge.target;
            const isDimmed =
              hoveredNode !== null && !isHighlighted;

            return (
              <g key={edge.id}>
                <line
                  x1={sourceNode.x}
                  y1={sourceNode.y}
                  x2={targetNode.x}
                  y2={targetNode.y}
                  className={cn(
                    style.strokeClass,
                    isHighlighted && "!stroke-brand/60 dark:!stroke-brand/65",
                    isDimmed && "opacity-[0.06]",
                    "transition-opacity duration-300"
                  )}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.dashArray}
                />
                {/* Edge label on hover */}
                {isHighlighted && (
                  <text
                    x={(sourceNode.x + targetNode.x) / 2}
                    y={(sourceNode.y + targetNode.y) / 2 - 6}
                    textAnchor="middle"
                    className="fill-slate-500/60 dark:fill-slate-400/50 font-mono text-[8px]"
                  >
                    {edgeTypeLabel[edge.type] ?? edge.type}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Node layer */}
        {layout.nodes.map((node, index) => {
          const isVisible = visibleNodeIds.has(node.id);
          const isSelected = selectedNode === node.id;
          const isHovered = hoveredNode === node.id;
          const isConnected =
            hoveredNode !== null && connectedNodeIds.has(node.id);
          const isDimmed =
            hoveredNode !== null && !isConnected && !isHovered;
          const isSearchMatch =
            searchQuery.trim() !== "" && matchesSearch(node, searchQuery);

          const style = enrichForUI(node.type);
          const Icon = ICON_MAP[node.type];

          return (
            <g
              key={node.id}
              transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
            >
              <motion.g
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{
                  opacity: isVisible ? 1 : 0,
                  scale: isVisible ? 1 : 0.8,
                }}
                transition={{
                  type: "spring",
                  stiffness: 200,
                  damping: 25,
                  delay: isVisible ? index * 0.03 : 0,
                }}
                style={{
                  transformOrigin: `${node.width / 2}px ${node.height / 2}px`,
                }}
              >
                <foreignObject
                  width={node.width}
                  height={node.height}
                  className={cn(
                    "overflow-visible",
                    isDimmed && "opacity-[0.08] transition-opacity duration-300",
                    !isDimmed && !isSelected && isConnected && "opacity-80",
                    isSearchMatch && !isSelected && "animate-pulse"
                  )}
                  onClick={() => onNodeClick(node.id)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                >
                  <div
                    className={cn(
                      "flex h-full items-center gap-2 border backdrop-blur-sm transition-all duration-300 cursor-pointer select-none",
                      style.shapeClass,
                      style.borderClass,
                      style.bgClass,
                      isSelected && "!border-brand/60 shadow-[0_0_20px_rgba(var(--brand-rgb),0.15)] scale-105",
                      isHovered && "!border-brand/40 shadow-[0_0_12px_rgba(var(--brand-rgb),0.08)]"
                    )}
                  >
                    <Icon className="ml-2 size-3 shrink-0 text-brand/50 dark:text-brand/60" />
                    <span
                      className={cn(
                        "truncate pr-2 text-[10px] leading-tight font-medium text-foreground/80 dark:text-foreground/70",
                        node.type === "concept" && "text-[9px]"
                      )}
                    >
                      {node.label}
                    </span>
                  </div>
                </foreignObject>
              </motion.g>
            </g>
          );
        })}
      </svg>

      {/* Zoom indicator */}
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-slate-500/15 bg-white/[0.6] px-3 py-1 font-mono text-[0.6rem] text-slate-500/60 backdrop-blur-sm dark:bg-black/[0.4] dark:text-slate-400/50">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
