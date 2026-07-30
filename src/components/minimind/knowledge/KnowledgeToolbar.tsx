"use client";

// ============================================================
// KnowledgeToolbar — search, filter toggles, stats, reset
// ============================================================

import { useCallback, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, RotateCcw, X } from "lucide-react";
import type { KnowledgeNodeType } from "@/data/minimind/knowledge-registry";

// ============================================================
// Filter toggle config
// ============================================================

interface FilterOption {
  type: KnowledgeNodeType;
  label: string;
  colorClass: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { type: "module", label: "Modules", colorClass: "border-brand/25 bg-brand/[0.05]" },
  { type: "concept", label: "Concepts", colorClass: "border-slate-500/20 bg-slate-500/[0.03]" },
  { type: "experiment", label: "Experiments", colorClass: "border-amber-500/25 bg-amber-500/[0.05]" },
  { type: "document", label: "Docs", colorClass: "border-dashed border-slate-500/15" },
  { type: "implementation", label: "Code", colorClass: "border-slate-500/12 bg-slate-500/[0.02]" },
];

// ============================================================
// Props
// ============================================================

interface KnowledgeToolbarProps {
  /** Active type filters */
  filters: Set<KnowledgeNodeType>;
  /** Toggle a filter type on/off */
  onFiltersChange: (filters: Set<KnowledgeNodeType>) => void;
  /** Current search query */
  searchQuery: string;
  /** Search query change handler */
  onSearchChange: (query: string) => void;
  /** Node and edge counts for stats display */
  stats: { nodes: number; edges: number };
  /** Reset view (re-center + reset zoom) */
  onResetView: () => void;
}

// ============================================================
// KnowledgeToolbar
// ============================================================

export function KnowledgeToolbar({
  filters,
  onFiltersChange,
  searchQuery,
  onSearchChange,
  stats,
  onResetView,
}: KnowledgeToolbarProps) {
  const handleToggle = useCallback(
    (type: KnowledgeNodeType) => {
      const next = new Set(filters);
      if (next.has(type)) {
        // Don't allow deselecting all filters
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      onFiltersChange(next);
    },
    [filters, onFiltersChange]
  );

  const handleClearSearch = useCallback(() => {
    onSearchChange("");
  }, [onSearchChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/10 bg-brand/[0.02] px-4 py-3 backdrop-blur-sm dark:border-white/[0.05] dark:bg-transparent"
    >
      {/* Search input */}
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-500/40 dark:text-slate-400/30" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            onSearchChange(e.target.value)
          }
          placeholder="Search nodes..."
          className="w-full rounded-lg border border-slate-500/15 bg-transparent py-1.5 pl-9 pr-8 text-xs text-foreground placeholder:text-slate-500/40 focus:border-brand/30 focus:outline-none dark:border-white/[0.06] dark:placeholder:text-slate-400/30"
        />
        {searchQuery && (
          <button
            onClick={handleClearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500/40 hover:text-slate-500/70 dark:hover:text-slate-400/60"
            aria-label="Clear search"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Filter toggles */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_OPTIONS.map((opt) => {
          const active = filters.has(opt.type);
          return (
            <button
              key={opt.type}
              onClick={() => handleToggle(opt.type)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[0.6rem] font-medium tracking-wide uppercase transition-all duration-200",
                active
                  ? `${opt.colorClass} text-foreground/80`
                  : "border-slate-500/10 bg-transparent text-slate-500/40 hover:border-slate-500/20 dark:border-white/[0.04] dark:text-slate-400/30"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Stats */}
      <span className="font-mono text-[0.6rem] text-slate-500/50 dark:text-slate-400/40 whitespace-nowrap">
        {stats.nodes} nodes · {stats.edges} edges
      </span>

      {/* Reset view */}
      <button
        onClick={onResetView}
        className="rounded-full border border-slate-500/15 p-1.5 text-slate-500/50 transition-colors hover:border-brand/25 hover:text-brand/70 dark:border-white/[0.06] dark:text-slate-400/40 dark:hover:text-brand/60"
        aria-label="Reset view"
      >
        <RotateCcw className="size-3" />
      </button>
    </motion.div>
  );
}
