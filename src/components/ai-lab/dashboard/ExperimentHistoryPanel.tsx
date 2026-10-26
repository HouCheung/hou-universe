"use client";

// ============================================================
// ExperimentHistoryPanel — MiniMind experiment run history
// ============================================================
//
// Phase 51: Dashboard section showing experiment run history,
// metrics overview, recent activity, and links to comparison
// and leaderboard views.
//
// All data is sourced exclusively through the adapter layer:
//   src/lib/ai-lab/adapters/historyAdapter.ts
//
// Sub-sections:
//   1. HistoryOverview — stat pills (total runs, completed, best ppl, latest)
//   2. RecentRunsTable — compact table of recent experiment runs
//   3. QuickActions — links to comparison, leaderboard, full history
//
// Zero direct registry/store imports.
// ============================================================

import { useState, useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import {
  History,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Trophy,
  ArrowRight,
  BarChart3,
  Clock,
  Zap,
} from "lucide-react";
import Link from "next/link";
import {
  getHistoryOverview,
  getRecentActivity,
  hasHistory,
  type HistoryOverview,
  type ExperimentSummaryCard,
} from "@/lib/ai-lab/adapters/historyAdapter";
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

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.3 + i * 0.1, ease: "easeOut" },
  }),
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, delay: 0.5 + i * 0.07, ease: "easeOut" },
  }),
};

// ============================================================
// Helpers
// ============================================================

/** Status badge color mapping */
const statusConfig: Record<
  string,
  {
    icon: typeof CheckCircle2;
    color: string;
    bg: string;
    border: string;
  }
> = {
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    bg: "bg-emerald-500/[0.06]",
    border: "border-emerald-500/20",
  },
  running: {
    icon: Loader2,
    color: "text-amber-500",
    bg: "bg-amber-500/[0.06]",
    border: "border-amber-500/20",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/[0.06]",
    border: "border-red-500/20",
  },
};

/** Format a number for display */
function fmt(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

/** Format a percentage */
function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-slate-500/15 bg-slate-500/[0.04] dark:border-white/[0.04] dark:bg-white/[0.02]">
        <History className="size-5 text-slate-400/60" />
      </div>
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400/70">
        No experiment runs yet
      </p>
      <p className="mt-1 text-xs text-slate-400/60 dark:text-slate-500/50">
        Run a training experiment or interactive benchmark to see history here.
      </p>
      <Link
        href="/ai-lab/experiments"
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 px-4 py-1.5 text-xs font-medium text-brand/80 transition-all duration-300",
          "hover:border-brand/30 hover:bg-brand/[0.04] hover:text-brand"
        )}
      >
        Go to Experiments
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

// ============================================================
// Stat Pill
// ============================================================

function StatPill({
  icon: Icon,
  label,
  value,
  index,
}: {
  icon: typeof History;
  label: string;
  value: string;
  index: number;
}) {
  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={statVariants}
      className="flex items-center gap-2"
    >
      <Icon className="size-4 text-brand/60" />
      <span className="text-sm font-semibold text-foreground tabular-nums">
        {value}
      </span>
      <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
        {label}
      </span>
    </motion.div>
  );
}

// ============================================================
// Recent Run Row
// ============================================================

function RunRow({
  run,
  index,
}: {
  run: ExperimentSummaryCard;
  index: number;
}) {
  const sc = statusConfig[run.status] ?? statusConfig.failed;
  const StatusIcon = sc.icon;

  return (
    <motion.tr
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={rowVariants}
      className="group border-b border-slate-500/[0.06] transition-colors hover:bg-brand/[0.02] dark:border-white/[0.03] dark:hover:bg-white/[0.02]"
    >
      {/* Name */}
      <td className="py-2.5 pl-4 pr-3">
        <span className="text-sm font-medium text-foreground/90 group-hover:text-brand/80 transition-colors">
          {run.name}
        </span>
      </td>

      {/* Model */}
      <td className="px-3 py-2.5">
        <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
          {run.modelLabel}
        </span>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.65rem] font-medium",
            sc.border,
            sc.bg,
            sc.color
          )}
        >
          <StatusIcon
            className={cn("size-2.5", run.status === "running" && "animate-spin")}
          />
          {run.status}
        </span>
      </td>

      {/* Best Loss */}
      <td className="px-3 py-2.5 text-right">
        <span className="text-sm tabular-nums text-foreground/80">
          {fmt(run.bestLoss)}
        </span>
      </td>

      {/* Perplexity */}
      <td className="px-3 py-2.5 text-right">
        <span className="text-sm tabular-nums text-foreground/80">
          {run.perplexity !== null ? run.perplexity.toFixed(2) : "—"}
        </span>
      </td>

      {/* Loss ↓% */}
      <td className="px-3 py-2.5 text-right">
        <span
          className={cn(
            "text-sm tabular-nums",
            run.lossReduction > 0.5
              ? "text-emerald-600/80 dark:text-emerald-400/70"
              : "text-foreground/70"
          )}
        >
          {fmtPct(run.lossReduction)}
        </span>
      </td>

      {/* Tok/s */}
      <td className="px-3 py-2.5 text-right">
        <span className="text-sm tabular-nums text-foreground/70">
          {fmt(run.tokensPerSecond, 0)}
        </span>
      </td>

      {/* Time */}
      <td className="py-2.5 pl-3 pr-4">
        <span className="text-xs text-slate-500/50 dark:text-slate-400/40">
          {run.timeAgo}
        </span>
      </td>
    </motion.tr>
  );
}

// ============================================================
// ExperimentHistoryPanel
// ============================================================

export function ExperimentHistoryPanel() {
  const [overview, setOverview] = useState<HistoryOverview | null>(null);
  const [recent, setRecent] = useState<ExperimentSummaryCard[]>([]);
  const [showSection, setShowSection] = useState(false);

  useEffect(() => {
    // Check if there's any history before rendering
    if (hasHistory()) {
      setOverview(getHistoryOverview());
      setRecent(getRecentActivity(5));
      setShowSection(true);
    }
  }, []);

  if (!showSection) {
    return (
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-500/[0.08] bg-brand/[0.02] px-6 py-8 backdrop-blur-sm dark:border-white/[0.04] dark:bg-[rgba(var(--brand-rgb),0.02)] sm:px-8">
          <EmptyState />
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <div className="mx-auto max-w-4xl rounded-2xl border border-brand/10 bg-brand/[0.03] px-6 py-8 backdrop-blur-sm dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)] sm:px-10 sm:py-10">
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent"
          aria-hidden="true"
        />

        {/* ── Header ── */}
        <div className="mb-7 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]">
              <History className="size-4 text-emerald-500/70" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Experiment History
              </h2>
              <p className="text-xs text-slate-500/60 dark:text-slate-400/50">
                Training runs, benchmarks, and comparisons
              </p>
            </div>
          </div>
        </div>

        {/* ── Overview Stat Pills ── */}
        <div className="mb-7 flex flex-wrap items-center justify-center gap-6 rounded-xl border border-slate-500/[0.06] bg-slate-500/[0.02] px-5 py-4 dark:border-white/[0.03] dark:bg-white/[0.01]">
          <StatPill
            icon={History}
            label="total runs"
            value={String(overview?.totalRuns ?? 0)}
            index={0}
          />
          <StatPill
            icon={CheckCircle2}
            label="completed"
            value={String(overview?.completedRuns ?? 0)}
            index={1}
          />
          <StatPill
            icon={Trophy}
            label="best perplexity"
            value={
              overview?.bestPerplexity !== null && overview?.bestPerplexity !== undefined
                ? overview.bestPerplexity.toFixed(2)
                : "—"
            }
            index={2}
          />
          <StatPill
            icon={Clock}
            label="latest run"
            value={overview?.latestRun ?? "—"}
            index={3}
          />
        </div>

        {/* ── Recent Runs Table ── */}
        {recent.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <TrendingUp className="size-3.5 text-brand/60" />
              Recent Runs
            </h3>

            <div className="overflow-x-auto rounded-xl border border-slate-500/[0.08] dark:border-white/[0.04]">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-500/[0.08] bg-slate-500/[0.02] dark:border-white/[0.04] dark:bg-white/[0.01]">
                    <th className="py-2 pl-4 pr-3 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      Model
                    </th>
                    <th className="px-3 py-2 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      Status
                    </th>
                    <th className="px-3 py-2 text-right text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      Best Loss
                    </th>
                    <th className="px-3 py-2 text-right text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      PPL
                    </th>
                    <th className="px-3 py-2 text-right text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      Loss ↓
                    </th>
                    <th className="px-3 py-2 text-right text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      Tok/s
                    </th>
                    <th className="py-2 pl-3 pr-4 text-right text-[0.7rem] font-semibold uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((run, i) => (
                    <RunRow key={run.id} run={run} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Quick Actions ── */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/ai-lab/experiments"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-brand/15 px-4 py-1.5 text-xs font-medium text-brand/80 transition-all duration-300",
              "hover:border-brand/30 hover:bg-brand/[0.04] hover:text-brand"
            )}
          >
            <BarChart3 className="size-3" />
            Run New Experiment
          </Link>
          <Link
            href="/ai-lab/training"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-slate-500/15 px-4 py-1.5 text-xs font-medium text-slate-500/80 transition-all duration-300",
              "hover:border-brand/20 hover:bg-brand/[0.03] hover:text-brand/80",
              "dark:border-white/[0.06] dark:text-slate-400/70 dark:hover:border-brand/25 dark:hover:text-brand-light/80"
            )}
          >
            <Zap className="size-3" />
            Start Training
          </Link>
        </div>
      </div>
    </motion.section>
  );
}
