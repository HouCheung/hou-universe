"use client";

// ============================================================
// TrainingSummarySection — Latest training run KPI dashboard
// ============================================================
// Phase 64: Premium training summary with KPI stat tiles
// showing the latest experiment metrics at a glance.
//
// Features:
//   - 5 KPI stat tiles (Loss, Loss ↓%, Perplexity, Tok/s, Duration)
//   - Status badge + experiment name
//   - Empty state with CTA when no training data
//   - Glass card with emerald accent
//
// Data sourced exclusively through studioAdapter.
// ============================================================

import { useState, useEffect } from "react";
import { motion, type Variants } from "framer-motion";
import {
  TrendingDown,
  BarChart3,
  Zap,
  Clock,
  Activity,
  FlaskConical,
  ArrowRight,
  Target,
} from "lucide-react";
import Link from "next/link";
import {
  getStudioTrainingSummary,
} from "@/lib/ai-lab/adapters/studioAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Animation variants
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const statVariants: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, delay: 0.2 + i * 0.08, ease: "easeOut" },
  }),
};

// ============================================================
// Formatting helpers (presentation logic, not business logic)
// ============================================================

function fmtLoss(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "↓" : "↑"}${Math.abs(n).toFixed(1)}%`;
}

function fmtPPL(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(2);
}

function fmtTokPerSec(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `${Math.round(n).toLocaleString()}/s`;
}

function fmtDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ============================================================
// Stat Tile (internal sub-component)
// ============================================================

interface StatTileProps {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  index: number;
  accent?: "default" | "emerald" | "amber" | "brand";
}

const accentClasses: Record<string, { border: string; bg: string; iconColor: string }> = {
  default: {
    border: "border-slate-500/10 dark:border-white/[0.05]",
    bg: "bg-slate-500/[0.03] dark:bg-white/[0.02]",
    iconColor: "text-brand/60",
  },
  emerald: {
    border: "border-emerald-500/15 dark:border-emerald-500/20",
    bg: "bg-emerald-500/[0.03] dark:bg-emerald-500/[0.04]",
    iconColor: "text-emerald-500/70",
  },
  amber: {
    border: "border-amber-500/15 dark:border-amber-500/20",
    bg: "bg-amber-500/[0.03] dark:bg-amber-500/[0.04]",
    iconColor: "text-amber-500/70",
  },
  brand: {
    border: "border-brand/15 dark:border-brand/20",
    bg: "bg-brand/[0.03] dark:bg-brand/[0.04]",
    iconColor: "text-brand/70",
  },
};

function StatTile({ label, value, sublabel, icon, index, accent = "default" }: StatTileProps) {
  const ac = accentClasses[accent];

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={statVariants}
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-4 backdrop-blur-sm",
        ac.border,
        ac.bg
      )}
    >
      <div className={cn("mt-0.5", ac.iconColor)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-500/70 dark:text-slate-400/60">
          {label}
        </p>
        <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
          {value}
        </p>
        {sublabel && (
          <p className="mt-0.5 truncate text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
            {sublabel}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-12 text-center backdrop-blur-sm">
      <Activity className="mx-auto mb-3 size-8 text-slate-400/40" />
      <p className="text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        No training data yet
      </p>
      <p className="mt-1 text-xs text-slate-400/60 dark:text-slate-500/50">
        Run a training experiment to see performance metrics here.
      </p>
      <Link
        href="/ai-lab/training"
        className={cn(
          "mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 px-4 py-1.5 text-xs font-medium text-brand/80 transition-all duration-300",
          "hover:border-brand/30 hover:bg-brand/[0.04] hover:text-brand"
        )}
      >
        Start Training
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

// ============================================================
// TrainingSummarySection
// ============================================================

export function TrainingSummarySection() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const data = mounted ? getStudioTrainingSummary() : ({ hasData: false } as ReturnType<typeof getStudioTrainingSummary>);

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={cardVariants}
    >
      {/* ── Section header ── */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] dark:border-emerald-500/25 dark:bg-emerald-500/[0.08]">
            <TrendingDown className="size-4 text-emerald-500/70" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Training Summary
            </h2>
            <p className="text-xs text-slate-500/60 dark:text-slate-400/50">
              {data.hasData
                ? `Latest: ${data.experimentName || "Experiment"}`
                : "Performance metrics & progress"}
            </p>
          </div>
        </div>

        {data.hasData && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium",
              "border-brand/20 bg-brand/[0.06] text-brand dark:border-brand/30 dark:bg-brand/[0.08] dark:text-brand-light"
            )}
          >
            <FlaskConical className="size-2.5" />
            {data.completedRuns}/{data.totalRuns} runs
          </span>
        )}
      </div>

      {/* ── Content ── */}
      {!data.hasData ? (
        <EmptyState />
      ) : (
        <div
          className={cn(
            "rounded-2xl border border-emerald-500/10 bg-brand/[0.02] px-4 py-5 backdrop-blur-sm",
            "dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)]",
            "sm:px-6 sm:py-6"
          )}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatTile
              label="Final Loss"
              value={fmtLoss(data.finalLoss)}
              sublabel={`Best: ${fmtLoss(data.bestLoss)}`}
              icon={<Target className="size-4" />}
              index={0}
              accent="brand"
            />
            <StatTile
              label="Loss Reduction"
              value={fmtPct(data.lossReductionPercent)}
              sublabel={`Initial: ${fmtLoss(data.initialLoss)}`}
              icon={<TrendingDown className="size-4" />}
              index={1}
              accent="emerald"
            />
            <StatTile
              label="Perplexity"
              value={fmtPPL(data.perplexity)}
              sublabel={`${data.totalSteps.toLocaleString()} steps`}
              icon={<BarChart3 className="size-4" />}
              index={2}
              accent="amber"
            />
            <StatTile
              label="Throughput"
              value={fmtTokPerSec(data.tokensPerSecond)}
              sublabel={data.modelLabel || "—"}
              icon={<Zap className="size-4" />}
              index={3}
            />
            <StatTile
              label="Duration"
              value={fmtDuration(data.durationSeconds)}
              sublabel={data.status}
              icon={<Clock className="size-4" />}
              index={4}
            />
          </div>

          {/* Footer link */}
          <div className="mt-5 flex justify-end">
            <Link
              href="/ai-lab/training"
              className={cn(
                "inline-flex items-center gap-1 text-[0.7rem] font-medium text-slate-500/70 transition-colors",
                "hover:text-brand dark:text-slate-400/60 dark:hover:text-brand-light"
              )}
            >
              View training details
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </motion.section>
  );
}
