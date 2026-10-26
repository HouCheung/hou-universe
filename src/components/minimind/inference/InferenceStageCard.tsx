"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// InferenceStageCard — Reusable glass card for pipeline stages
// ============================================================
//
// A thin wrapper around the glass-card pattern used across
// AI Lab. Each stage in the pipeline visualization uses this
// card to display its label and summary data.
//
// Reuses the visual language from forward/StageCard but adds
// an optional status indicator and index badge for pipeline
// ordering.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface InferenceStageCardProps {
  /** Stage label (e.g. "Tokenizer", "Embedding") */
  label: string;
  /** Summary data displayed in mono font below the label */
  summary: string;
  /** Optional status — green check or neutral */
  status?: "active" | "inactive" | "processing";
  /** Index in the pipeline (0-based) */
  index: number;
  /** Optional icon element */
  icon?: ReactNode;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function InferenceStageCard({
  label,
  summary,
  status = "inactive",
  index,
  icon,
  className,
}: InferenceStageCardProps) {
  const isActive = status === "active" || status === "processing";

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: index * 0.08,
        duration: 0.35,
        ease: "easeOut",
      }}
      className={cn(
        "relative flex items-center gap-3 rounded-xl border px-4 py-3",
        isActive
          ? "border-brand/40 bg-brand/[0.08] shadow-[0_0_12px_rgba(var(--brand-rgb),0.06)] dark:border-brand/30 dark:bg-brand/[0.10]"
          : "border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02]",
        className
      )}
    >
      {/* Stage index badge */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-[0.65rem] font-semibold",
          isActive
            ? "bg-brand/[0.15] text-brand dark:bg-brand/[0.20] dark:text-brand/90"
            : "bg-slate-100 text-slate-400 dark:bg-white/[0.04] dark:text-slate-500"
        )}
      >
        {icon ?? index + 1}
      </div>

      {/* Label + summary */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">
          {label}
        </div>
        <div className="mt-0.5 font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60 truncate">
          {summary}
        </div>
      </div>

      {/* Status dot */}
      <div className="shrink-0">
        {status === "processing" && (
          <div className="size-2 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
        )}
        {status === "active" && (
          <div className="size-2 rounded-full bg-emerald-400 dark:bg-emerald-500" />
        )}
        {status === "inactive" && (
          <div className="size-2 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
        )}
      </div>

      {/* Glow ring when active */}
      {isActive && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-brand/25 dark:ring-brand/20" />
      )}
    </motion.div>
  );
}
