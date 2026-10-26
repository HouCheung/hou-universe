"use client";

// ============================================================
// RecentExperimentsSection — Recent experiment history cards
// ============================================================
// Phase 64: Compact experiment history section showing the
// 3 most recent training runs with key metrics.
//
// Features:
//   - 3-card responsive grid
//   - Status badge + model label
//   - Loss / PPL / Tok/s metrics
//   - Time-ago indicator
//   - Empty state with CTA when no history
//   - Click-through to experiment detail
//
// Data sourced exclusively through studioAdapter.
// ============================================================

import { useState, useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import {
  FlaskConical,
  TrendingDown,
  BarChart3,
  ArrowRight,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import {
  getRecentExperiments,
  type RecentExperimentData,
} from "@/lib/ai-lab/adapters/studioAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.2 + i * 0.08, ease: "easeOut" },
  }),
};

// ============================================================
// Status badge config
// ============================================================

const statusConfig: Record<string, {
  icon: typeof CheckCircle2;
  border: string;
  bg: string;
  text: string;
}> = {
  completed: {
    icon: CheckCircle2,
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.06]",
    text: "text-emerald-600/80 dark:text-emerald-400/70",
  },
  running: {
    icon: Loader2,
    border: "border-brand/20",
    bg: "bg-brand/[0.06]",
    text: "text-brand dark:text-brand-light",
  },
  failed: {
    icon: XCircle,
    border: "border-red-500/20",
    bg: "bg-red-500/[0.06]",
    text: "text-red-600/80 dark:text-red-400/70",
  },
};

// ============================================================
// Helpers
// ============================================================

function fmtLoss(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

function fmtPPL(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(2);
}

// ============================================================
// Experiment Card (internal sub-component)
// ============================================================

function ExperimentCard({ exp, index }: { exp: RecentExperimentData; index: number }) {
  const sc = statusConfig[exp.status] ?? statusConfig.failed;
  const StatusIcon = sc.icon;
  const isRunning = exp.status === "running";

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={cardVariants}
    >
      <Link
        href={`/ai-lab/experiments?id=${encodeURIComponent(exp.id)}`}
        className={cn(
          "group flex flex-col rounded-xl border border-brand/10 bg-brand/[0.02] px-5 py-4 backdrop-blur-sm transition-all duration-300",
          "hover:scale-[1.02] hover:border-brand/25 hover:bg-brand/[0.05] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.08)]",
          "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:border-brand/30 dark:hover:bg-[rgba(var(--brand-rgb),0.06)]"
        )}
      >
        {/* Header: name + status */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand dark:group-hover:text-brand-light">
            {exp.name}
          </h4>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-medium",
              sc.border,
              sc.bg,
              sc.text
            )}
          >
            <StatusIcon className={cn("size-2.5", isRunning && "animate-spin")} />
            {exp.status}
          </span>
        </div>

        {/* Model label */}
        <p className="mb-3 text-[0.7rem] text-slate-500/60 dark:text-slate-400/50">
          {exp.modelLabel}
        </p>

        {/* Metrics row */}
        <div className="mb-2 flex items-center gap-4 text-[0.7rem]">
          <div className="flex items-center gap-1">
            <TrendingDown className="size-3 text-slate-400/50" />
            <span className="text-slate-500/70 dark:text-slate-400/60">Loss</span>
            <span className="font-medium tabular-nums text-foreground">
              {fmtLoss(exp.bestLoss)}
            </span>
          </div>
          {exp.perplexity !== null && (
            <div className="flex items-center gap-1">
              <BarChart3 className="size-3 text-slate-400/50" />
              <span className="text-slate-500/70 dark:text-slate-400/60">PPL</span>
              <span className="font-medium tabular-nums text-foreground">
                {fmtPPL(exp.perplexity)}
              </span>
            </div>
          )}
        </div>

        {/* Loss reduction chip */}
        {exp.lossReduction > 0 && (
          <div className="mb-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-emerald-500/15 bg-emerald-500/[0.04] px-2 py-0.5 text-[0.6rem] font-medium",
                "text-emerald-600/80 dark:text-emerald-400/70"
              )}
            >
              <TrendingDown className="size-2.5" />
              {exp.lossReductionFormatted}
            </span>
          </div>
        )}

        {/* Footer: time ago + arrow */}
        <div className="flex items-center justify-between text-[0.65rem]">
          <span className="text-slate-500/50 dark:text-slate-400/40">
            {exp.timeAgo}
          </span>
          <ArrowRight className="size-3 text-slate-400/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
        </div>
      </Link>
    </motion.div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-12 text-center backdrop-blur-sm">
      <FlaskConical className="mx-auto mb-3 size-8 text-slate-400/40" />
      <p className="text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        No experiments completed yet
      </p>
      <p className="mt-1 text-xs text-slate-400/60 dark:text-slate-500/50">
        Start training to see experiment results here.
      </p>
      <Link
        href="/ai-lab/experiments"
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 px-4 py-1.5 text-xs font-medium text-brand/80 transition-all duration-300",
          "hover:border-brand/30 hover:bg-brand/[0.04] hover:text-brand"
        )}
      >
        Run an Experiment
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

// ============================================================
// RecentExperimentsSection
// ============================================================

export function RecentExperimentsSection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const experiments = mounted ? getRecentExperiments(3) : [];

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
    >
      {/* ── Section header ── */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/[0.06] dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
            <FlaskConical className="size-4 text-amber-500/70" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Recent Experiments
            </h2>
            <p className="text-xs text-slate-500/60 dark:text-slate-400/50">
              {experiments.length > 0
                ? `Latest ${experiments.length} training runs`
                : "Training history & results"}
            </p>
          </div>
        </div>

        {experiments.length > 0 && (
          <Link
            href="/ai-lab/experiments"
            className={cn(
              "inline-flex items-center gap-1 text-[0.7rem] font-medium text-slate-500/70 transition-colors",
              "hover:text-brand dark:text-slate-400/60 dark:hover:text-brand-light"
            )}
          >
            View all
            <ArrowRight className="size-3" />
          </Link>
        )}
      </div>

      {/* ── Content ── */}
      {experiments.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
          {experiments.map((exp, i) => (
            <ExperimentCard key={exp.id} exp={exp} index={i} />
          ))}
        </div>
      )}
    </motion.section>
  );
}
