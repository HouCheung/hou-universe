"use client";

// ============================================================
// KnowledgePageClient — state owner and orchestrator
// ============================================================
//
// Derives the knowledge graph, computes layout, manages all
// UI state (selection, filters, search, viewport).
//
// This is the root component for the /ai-lab/knowledge page.
// ============================================================

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles } from "lucide-react";
import {
  KNOWLEDGE_GRAPH,
  getNodeById,
  type KnowledgeNodeType,
} from "@/data/minimind/knowledge-registry";
import {
  adaptKnowledgeGraph,
  type KnowledgeLayout,
} from "@/lib/minimind/knowledge";
import { KnowledgeGraphCanvas } from "./KnowledgeGraphCanvas";
import { KnowledgeToolbar } from "./KnowledgeToolbar";
import { KnowledgeDetailPanel } from "./KnowledgeDetailPanel";

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const DEFAULT_VIEWPORT = { width: 1200, height: 800, padding: 60 };

// ============================================================
// KnowledgePageClient
// ============================================================

export function KnowledgePageClient() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── State ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Set<KnowledgeNodeType>>(
    new Set([
      "module",
      "concept",
      "experiment",
      "document",
      "implementation",
    ])
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);

  // ── Resize observer ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout>;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      // Debounce 200ms
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { width, height } = entry.contentRect;
        setViewport({
          width: Math.max(width, 600),
          height: Math.max(height - 80, 400), // Account for toolbar
          padding: 60,
        });
      }, 200);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // ── Derive graph (once) ──
  const graph = useMemo(() => KNOWLEDGE_GRAPH, []);

  // ── Compute layout ──
  const layout: KnowledgeLayout | null = useMemo(
    () => adaptKnowledgeGraph(graph, viewport),
    [graph, viewport]
  );

  // ── Selected node object ──
  const selectedNode = useMemo(
    () => (selectedNodeId ? getNodeById(selectedNodeId) ?? null : null),
    [selectedNodeId]
  );

  // ── Handlers ──
  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const handleNavigate = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  // ── Stats for toolbar ──
  const stats = useMemo(
    () => ({ nodes: graph.meta.totalNodes, edges: graph.meta.totalEdges }),
    [graph]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ================================================================ */}
      {/* Page Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("minimind.knowledge.subhead")}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("minimind.knowledge.heading")}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {t("minimind.knowledge.intro")}
          </p>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Toolbar */}
      {/* ================================================================ */}
      <div className="mt-8">
        <KnowledgeToolbar
          filters={filters}
          onFiltersChange={setFilters}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          stats={stats}
          onResetView={() => {
            // Reset viewport to trigger re-layout
            setViewport({ ...viewport });
          }}
        />
      </div>

      {/* ================================================================ */}
      {/* Graph Canvas + Detail Panel */}
      {/* ================================================================ */}
      <div ref={containerRef} className="relative mt-4">
        <div className="relative">
          <KnowledgeGraphCanvas
            layout={layout}
            selectedNode={selectedNodeId}
            filters={filters}
            searchQuery={searchQuery}
            onNodeClick={handleNodeClick}
          />

          <KnowledgeDetailPanel
            node={selectedNode}
            onClose={handleClosePanel}
            onNavigate={handleNavigate}
          />
        </div>
      </div>
    </div>
  );
}
