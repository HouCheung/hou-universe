"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// TrainingStageCard — Reusable glass card for training pipeline stages
// ============================================================
//
// A thin wrapper around the glass-card pattern used across
// AI Lab. Each stage in the training pipeline uses this
// card to display its label and summary data.
//
// Follows the exact visual language from InferenceStageCard
// but adapted for the training pipeline context.
//
// Status variants:
//   - "active"     → green dot — stage executed successfully
//   - "processing" → amber pulsing dot — stage in progress
//   - "inactive"   → gray dot — stage not yet reached
//   - "blocked"    → amber static dot — stage intentionally blocked (gradient boundary)
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface TrainingStageCardProps {
  /** Stage label (e.g. "Dataset", "Forward Pass") */
  label: string;
  /** Summary data displayed in mono font below the label */
  summary: string;
  /** Optional status */
  status?: "active" | "inactive" | "processing" | "blocked";
  /** Index in the pipeline (0-based) */
  index: number;
  /** Optional icon element */
  icon?: ReactNode;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function TrainingStageCard({
  label,
  summary,
  status = "inactive",
  index,
  icon,
  className,
}: TrainingStageCardProps) {
  const isActive = status === "active" || status === "processing";
  const isBlocked = status === "blocked";

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
        isActive &&
          "border-brand/40 bg-brand/[0.08] shadow-[0_0_12px_rgba(var(--brand-rgb),0.06)] dark:border-brand/30 dark:bg-brand/[0.10]",
        isBlocked &&
          "border-amber-500/30 bg-amber-500/[0.04] dark:border-amber-500/20 dark:bg-amber-500/[0.05]",
        !isActive &&
          !isBlocked &&
          "border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02]",
        className
      )}
    >
      {/* Stage index badge */}
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-[0.65rem] font-semibold",
          isActive
            ? "bg-brand/[0.15] text-brand dark:bg-brand/[0.20] dark:text-brand/90"
            : isBlocked
              ? "bg-amber-500/[0.12] text-amber-600 dark:bg-amber-500/[0.15] dark:text-amber-500"
              : "bg-slate-100 text-slate-400 dark:bg-white/[0.04] dark:text-slate-500"
        )}
      >
        {icon ?? index + 1}
      </div>

      {/* Label + summary */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground truncate">
            {label}
          </span>
          {isBlocked && (
            <span className="shrink-0 rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-1.5 py-px font-mono text-[0.55rem] text-amber-600/80 dark:border-amber-500/15 dark:text-amber-500/70">
              Planned
            </span>
          )}
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
        {status === "blocked" && (
          <div className="size-2 rounded-full bg-amber-400 dark:bg-amber-500" />
        )}
        {status === "inactive" && (
          <div className="size-2 rounded-full bg-slate-200 dark:bg-white/[0.08]" />
        )}
      </div>

      {/* Glow ring when active */}
      {isActive && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-brand/25 dark:ring-brand/20" />
      )}
      {isBlocked && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-amber-500/15 dark:ring-amber-500/10" />
      )}
    </motion.div>
  );
}
