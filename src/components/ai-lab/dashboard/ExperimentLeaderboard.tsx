"use client";

// ============================================================
// ExperimentLeaderboard — Ranked training experiment results
// ============================================================
// Phase 54: Leaderboard showing experiment rankings by
// selectable metrics: lowest loss, lowest perplexity,
// fastest training (tokens/sec), and more.
//
// Uses the historyAdapter.getLeaderboard() function for all
// ranking logic — this component only handles presentation.
//
// Design: glass UI + Framer Motion + cosmic theme
// ============================================================

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Trophy,
  Medal,
  TrendingDown,
  BarChart3,
  Zap,
  ArrowRight,
  SlidersHorizontal,
  Star,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  getLeaderboard,
  hasHistory,
  type LeaderboardEntry,
} from "@/lib/ai-lab/adapters/historyAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

type LeaderboardMetric = "bestLoss" | "perplexity" | "tokensPerSecond";

interface MetricOption {
  value: LeaderboardMetric;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  format: (value: number) => string;
}

// ============================================================
// Metric options
// ============================================================

const METRIC_OPTIONS: MetricOption[] = [
  {
    value: "bestLoss",
    label: "Lowest Loss",
    icon: TrendingDown,
    format: (v: number) => v.toFixed(4),
  },
  {
    value: "perplexity",
    label: "Lowest Perplexity",
    icon: BarChart3,
    format: (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—"),
  },
  {
    value: "tokensPerSecond",
    label: "Fastest Training",
    icon: Zap,
    format: (v: number) => `${v.toFixed(1)} tok/s`,
  },
];

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

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, delay: 0.3 + i * 0.08, ease: "easeOut" },
  }),
};

// ============================================================
// Rank badge
// ============================================================

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
        <Trophy className="size-3.5" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-slate-400/15 text-slate-500 dark:bg-slate-400/20 dark:text-slate-400">
        <Medal className="size-3.5" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex size-7 items-center justify-center rounded-full bg-amber-700/15 text-amber-700 dark:bg-amber-700/20 dark:text-amber-600">
        <Medal className="size-3.5" />
      </div>
    );
  }
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-slate-500/[0.06] text-xs font-medium text-slate-500/70 dark:bg-white/[0.04] dark:text-slate-400/60">
      {rank}
    </span>
  );
}

// ============================================================
// Metric selector
// ============================================================

function MetricSelector({
  selected,
  onChange,
}: {
  selected: LeaderboardMetric;
  onChange: (m: LeaderboardMetric) => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <SlidersHorizontal className="size-3.5 text-slate-400/50" />
      {METRIC_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isActive = selected === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.65rem] font-medium backdrop-blur-sm transition-all duration-200",
              isActive
                ? "border-brand/30 bg-brand/[0.08] text-brand shadow-[0_0_12px_rgba(var(--brand-rgb),0.1)] dark:border-brand/40 dark:bg-brand/[0.1] dark:text-brand-light"
                : "border-slate-500/15 bg-slate-500/[0.02] text-slate-500/70 hover:border-brand/15 hover:text-slate-600 dark:border-white/[0.06] dark:text-slate-400/60 dark:hover:border-brand/20 dark:hover:text-slate-300"
            )}
          >
            <Icon className="size-3" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Leaderboard table
// ============================================================

function LeaderboardTable({
  entries,
  metric,
}: {
  entries: LeaderboardEntry[];
  metric: LeaderboardMetric;
}) {
  const metricOpt = METRIC_OPTIONS.find((m) => m.value === metric)!;

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-10 text-center backdrop-blur-sm">
        <Star className="mx-auto size-8 text-slate-400/40" />
        <p className="mt-3 text-sm text-slate-500/60 dark:text-slate-400/50">
          No completed experiments to rank yet
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-brand/10 bg-brand/[0.015] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.02)]">
      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 border-b border-brand/5 px-5 py-3 text-[0.65rem] font-medium uppercase tracking-wider text-slate-500/60 dark:border-white/[0.05] dark:text-slate-400/50">
        <span className="w-7 text-center">#</span>
        <span>Experiment</span>
        <span>Model</span>
        <span className="text-right">{metricOpt.label}</span>
      </div>

      {/* Table body */}
      <div className="divide-y divide-brand/[0.03] dark:divide-white/[0.03]">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={rowVariants}
          >
            <Link
              href={`/ai-lab/experiments?id=${encodeURIComponent(entry.id)}`}
              className={cn(
                "group grid grid-cols-[auto_1fr_1fr_auto] items-center gap-3 px-5 py-3 transition-colors",
                "hover:bg-brand/[0.04] dark:hover:bg-[rgba(var(--brand-rgb),0.05)]"
              )}
            >
              {/* Rank */}
              <div className="flex w-7 justify-center">
                <RankBadge rank={entry.rank} />
              </div>

              {/* Name */}
              <div className="min-w-0">
                <span className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-brand dark:group-hover:text-brand-light">
                  {entry.name}
                </span>
              </div>

              {/* Model */}
              <span className="truncate text-[0.7rem] text-slate-500/60 dark:text-slate-400/50">
                {entry.modelLabel}
              </span>

              {/* Value + arrow */}
              <div className="flex items-center gap-2 text-right">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {metricOpt.format(entry.value)}
                </span>
                <ArrowRight className="size-3 shrink-0 text-slate-400/30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/50" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Empty state
// ============================================================

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-14 text-center backdrop-blur-sm">
      <Trophy className="mx-auto size-10 text-slate-400/30" />
      <p className="mt-4 text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        No experiments yet
      </p>
      <p className="mt-1 text-[0.7rem] text-slate-500/50 dark:text-slate-400/40">
        Complete training runs will appear on the leaderboard
      </p>
      <Link
        href="/ai-lab/experiments"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-4 py-2 text-[0.7rem] font-medium text-brand transition-all hover:border-brand/30 hover:bg-brand/[0.08] dark:hover:border-brand/35"
      >
        Run an Experiment
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

// ============================================================
// ExperimentLeaderboard — composition root
// ============================================================

export function ExperimentLeaderboard() {
  const [hasData, setHasData] = useState(false);
  const [metric, setMetric] = useState<LeaderboardMetric>("bestLoss");

  const entries = useMemo(() => {
    if (!hasData) return [];
    return getLeaderboard(metric, 8);
  }, [metric, hasData]);

  useEffect(() => {
    setHasData(hasHistory());
  }, []);

  const handleMetricChange = useCallback((m: LeaderboardMetric) => {
    setMetric(m);
  }, []);

  if (!hasData) {
    return (
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <SectionHeader titleKey="aiLab.dashboard.leaderboardLabel" />
        <EmptyState />
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
      <SectionHeader titleKey="aiLab.dashboard.leaderboardLabel" />

      <MetricSelector selected={metric} onChange={handleMetricChange} />

      <LeaderboardTable entries={entries} metric={metric} />
    </motion.section>
  );
}
