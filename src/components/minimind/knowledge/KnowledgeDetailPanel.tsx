"use client";

// ============================================================
// KnowledgeDetailPanel — slide-in sidebar for node details
// ============================================================
//
// Renders when a node is selected. Slides in from the right
// edge. Shows node metadata, status, route/file links, and
// related nodes (clickable to navigate).
//
// Matches the DeepDivePanel pattern from forward visualization.
// ============================================================

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  X,
  ExternalLink,
  Box,
  Lightbulb,
  FlaskConical,
  FileText,
  Code,
  type LucideIcon,
} from "lucide-react";
import type {
  KnowledgeNode,
  KnowledgeNodeType,
} from "@/data/minimind/knowledge-registry";
import { getRelatedNodes } from "@/data/minimind/knowledge-registry";
import { enrichForUI } from "@/lib/minimind/knowledge";
import Link from "next/link";

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
// Status badge colors
// ============================================================

const STATUS_CLASS: Record<string, string> = {
  completed: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
  "in-progress": "border-brand/25 bg-brand/[0.06] text-brand",
  upcoming: "border-slate-500/20 bg-slate-500/[0.04] text-slate-500",
  active: "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
  planned: "border-amber-500/25 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
  legacy: "border-slate-500/15 bg-slate-500/[0.03] text-slate-500/60",
};

// ============================================================
// Edge type display labels
// ============================================================

const EDGE_LABELS: Record<string, string> = {
  depends_on: "Depends on",
  explains: "Explains",
  implements: "Implements",
  experiments: "Validated by",
  documents: "Documented by",
  relates_to: "Related to",
};

// ============================================================
// Props
// ============================================================

interface KnowledgeDetailPanelProps {
  /** The selected node (from getNodeById) */
  node: KnowledgeNode | null;
  /** Callback to close the panel */
  onClose: () => void;
  /** Callback to navigate to a related node */
  onNavigate: (nodeId: string) => void;
}

// ============================================================
// KnowledgeDetailPanel
// ============================================================

export function KnowledgeDetailPanel({
  node,
  onClose,
  onNavigate,
}: KnowledgeDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!node) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [node, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!node) return;

    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }

    // Delay to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [node, onClose]);

  if (!node) return null;

  const style = enrichForUI(node.type);
  const Icon = ICON_MAP[node.type];
  const related = getRelatedNodes(node.id);

  // Group incoming edges by edge type
  const groupedIncoming = new Map<string, KnowledgeNode[]>();
  for (const rel of related.incoming) {
    const key = EDGE_LABELS[rel.edgeType] ?? rel.edgeType;
    const existing = groupedIncoming.get(key) ?? [];
    existing.push(rel.node);
    groupedIncoming.set(key, existing);
  }

  // Group outgoing edges by edge type
  const groupedOutgoing = new Map<string, KnowledgeNode[]>();
  for (const rel of related.outgoing) {
    const key = EDGE_LABELS[rel.edgeType] ?? rel.edgeType;
    const existing = groupedOutgoing.get(key) ?? [];
    existing.push(rel.node);
    groupedOutgoing.set(key, existing);
  }

  const hasRelated =
    groupedIncoming.size > 0 || groupedOutgoing.size > 0;

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          ref={panelRef}
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "absolute right-0 top-0 z-20 h-full w-full max-w-[380px] overflow-y-auto border-l p-6 shadow-2xl",
            "border-brand/15 bg-white/95 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0a0a0a]/95",
            "rounded-r-2xl"
          )}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full border border-slate-500/15 p-1.5 text-slate-500/60 transition-colors hover:border-slate-500/30 hover:text-slate-500/90 dark:border-white/[0.06] dark:hover:text-slate-300"
            aria-label="Close detail panel"
          >
            <X className="size-3.5" />
          </button>

          {/* Node type badge */}
          <div className="mb-4 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.6rem] font-medium tracking-wide uppercase",
                style.borderClass,
                style.bgClass
              )}
            >
              <Icon className="size-3" />
              {node.type}
            </span>
          </div>

          {/* Node label */}
          <h2 className="mb-2 text-xl font-bold tracking-tight text-foreground">
            {node.label}
          </h2>

          {/* Description */}
          {node.metadata.description && (
            <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              {node.metadata.description}
            </p>
          )}

          {/* Status badge */}
          {node.metadata.status && (
            <span
              className={cn(
                "mb-4 inline-block rounded-full border px-3 py-0.5 text-[0.65rem] font-medium",
                STATUS_CLASS[node.metadata.status] ??
                  "border-slate-500/15 text-slate-500/60"
              )}
            >
              {node.metadata.status}
            </span>
          )}

          {/* Route link */}
          {node.metadata.route && (
            <div className="mb-3">
              <Link
                href={node.metadata.route}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand/70 transition-colors hover:text-brand dark:text-brand/60 dark:hover:text-brand/80"
              >
                <ExternalLink className="size-3" />
                Open{" "}
                {node.type === "experiment" ? "Experiment" : "Playground"}
              </Link>
            </div>
          )}

          {/* File path */}
          {node.metadata.filePath && (
            <div className="mb-6">
              <code className="block rounded-lg border border-slate-500/10 bg-slate-500/[0.03] px-3 py-2 font-mono text-[0.6rem] text-slate-500/70 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-400/50">
                {node.metadata.filePath}
              </code>
            </div>
          )}

          {/* Related nodes */}
          {hasRelated && (
            <div className="border-t border-slate-500/10 pt-5 dark:border-white/[0.04]">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500/70 dark:text-slate-400/50">
                Related Nodes
              </h3>

              {/* Incoming (sources → this node) */}
              {Array.from(groupedIncoming.entries()).map(
                ([groupLabel, nodes]) => (
                  <div key={`in-${groupLabel}`} className="mb-4">
                    <span className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-wide text-slate-500/50 dark:text-slate-400/40">
                      {groupLabel}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {nodes.map((relNode) => (
                        <button
                          key={relNode.id}
                          onClick={() => onNavigate(relNode.id)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-all duration-200 hover:border-brand/30 hover:text-brand dark:hover:text-brand/80",
                            style.borderClass,
                            "text-slate-500 dark:text-slate-400"
                          )}
                        >
                          {relNode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* Outgoing (this node → targets) */}
              {Array.from(groupedOutgoing.entries()).map(
                ([groupLabel, nodes]) => (
                  <div key={`out-${groupLabel}`} className="mb-4">
                    <span className="mb-1.5 block text-[0.6rem] font-medium uppercase tracking-wide text-slate-500/50 dark:text-slate-400/40">
                      {groupLabel}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {nodes.map((relNode) => (
                        <button
                          key={relNode.id}
                          onClick={() => onNavigate(relNode.id)}
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-all duration-200 hover:border-brand/30 hover:text-brand dark:hover:text-brand/80",
                            style.borderClass,
                            "text-slate-500 dark:text-slate-400"
                          )}
                        >
                          {relNode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
