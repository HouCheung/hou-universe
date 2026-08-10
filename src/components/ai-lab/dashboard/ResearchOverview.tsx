"use client";

// ============================================================
// ResearchOverview — Research platform status overview
// ============================================================
// Phase 54: Aggregated research dashboard showing model status,
// training status, and recent experiment summaries.
//
// Sections:
//   1. Model Status — current model, params, architecture
//   2. Training Status — latest experiment metrics
//   3. Experiment Summary — recent experiments with loss/PPL
//
// All data sourced through the adapter layer:
//   - ModelRegistry (model configs)
//   - trainingAdapter (training metrics)
//   - historyAdapter (experiment summaries)
//
// Design: glass UI + Framer Motion + cosmic theme
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import {
  Cpu,
  Layers,
  Brain,
  Hash,
  TrendingDown,
  Zap,
  Activity,
  FlaskConical,
  Clock,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { listModels, type ModelConfigEntry } from "@/lib/minimind/experiments/ModelRegistry";
import {
  getTrainingMetrics,
  getTrainingStats,
  hasTrainingHistory,
} from "@/lib/ai-lab/adapters/trainingAdapter";
import {
  getExperimentSummaryCards,
  hasHistory,
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
    transition: { duration: 0.5, delay: 0.2 + i * 0.1, ease: "easeOut" },
  }),
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.4 + i * 0.08, ease: "easeOut" },
  }),
};

// ============================================================
// Stat Pill
// ============================================================

function StatPill({
  icon: Icon,
  label,
  value,
  index,
}: {
  icon: React.ComponentType<{ className?: string }>;
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
      className={cn(
        "flex items-center gap-3 rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 backdrop-blur-sm",
        "dark:border-white/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)]"
      )}
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-brand/10 bg-brand/[0.04] dark:border-white/[0.06] dark:bg-white/[0.02]">
        <Icon className="size-4 text-brand/60" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
          {label}
        </div>
        <div className="text-sm font-semibold text-foreground tabular-nums">
          {value}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// Formatting helpers
// ============================================================

function formatParams(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatLoss(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

function formatPPL(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n.toFixed(2);
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// ============================================================
// Model Status Section
// ============================================================

function ModelStatusSection() {
  const models = useMemo(() => listModels(), []);
  const defaultModel = useMemo(
    () => (models.length > 0 ? models[models.length - 1] : null),
    [models]
  );

  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-10 text-center backdrop-blur-sm">
        <Cpu className="mx-auto size-8 text-slate-400/40" />
        <p className="mt-3 text-sm text-slate-500/60 dark:text-slate-400/50">
          No models registered yet
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Cpu className="size-4 text-brand/60" />
        Model Status
      </h3>

      {/* Model selector pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {models.map((m) => (
          <span
            key={m.name}
            className={cn(
              "rounded-full border px-3 py-1 text-[0.65rem] font-medium backdrop-blur-sm transition-colors",
              m === defaultModel
                ? "border-brand/30 bg-brand/[0.06] text-brand dark:border-brand/40 dark:bg-brand/[0.08] dark:text-brand-light"
                : "border-slate-500/15 bg-slate-500/[0.02] text-slate-500 dark:border-white/[0.06] dark:text-slate-400"
            )}
          >
            {m.label}
          </span>
        ))}
      </div>

      {/* Default model stats */}
      {defaultModel && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatPill
            icon={Brain}
            label="Parameters"
            value={formatParams(defaultModel.estimatedParams)}
            index={0}
          />
          <StatPill
            icon={Layers}
            label="Layers"
            value={String(defaultModel.numLayers)}
            index={1}
          />
          <StatPill
            icon={Hash}
            label="Attention Heads"
            value={String(defaultModel.numHeads)}
            index={2}
          />
          <StatPill
            icon={Hash}
            label="Vocab Size"
            value={formatParams(defaultModel.vocabSize)}
            index={3}
          />
          <StatPill
            icon={Cpu}
            label="Hidden Dim (dModel)"
            value={String(defaultModel.dModel)}
            index={4}
          />
          <StatPill
            icon={Cpu}
            label="FFN Dim (dFF)"
            value={formatParams(defaultModel.dFF)}
            index={5}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Training Status Section
// ============================================================

function TrainingStatusSection() {
  const [hasData, setHasData] = useState(false);
  const [metrics, setMetrics] = useState<ReturnType<typeof getTrainingMetrics>>(null);
  const [stats, setStats] = useState<ReturnType<typeof getTrainingStats> | null>(null);

  useEffect(() => {
    setHasData(hasTrainingHistory());
    if (hasTrainingHistory()) {
      setMetrics(getTrainingMetrics());
      setStats(getTrainingStats());
    }
  }, []);

  if (!hasData || !metrics || !stats) {
    return (
      <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-10 text-center backdrop-blur-sm">
        <Activity className="mx-auto size-8 text-slate-400/40" />
        <p className="mt-3 text-sm text-slate-500/60 dark:text-slate-400/50">
          No training data yet — run an experiment to see metrics
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Activity className="size-4 text-brand/60" />
        Training Status
      </h3>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatPill
          icon={TrendingDown}
          label="Current Loss"
          value={formatLoss(metrics.finalLoss)}
          index={0}
        />
        <StatPill
          icon={TrendingDown}
          label="Best Loss"
          value={formatLoss(metrics.bestLoss)}
          index={1}
        />
        <StatPill
          icon={BarChart3}
          label="Perplexity"
          value={formatPPL(metrics.perplexity)}
          index={2}
        />
        <StatPill
          icon={Zap}
          label="Tokens/sec"
          value={
            metrics.tokensPerSecond > 0
              ? metrics.tokensPerSecond.toFixed(1)
              : "—"
          }
          index={3}
        />
        <StatPill
          icon={Clock}
          label="Completed Runs"
          value={String(stats.completedRuns)}
          index={4}
        />
        <StatPill
          icon={Activity}
          label="Total Runs"
          value={String(stats.totalRuns)}
          index={5}
        />
      </div>
    </div>
  );
}

// ============================================================
// Experiment Summary Section
// ============================================================

function ExperimentSummarySection() {
  const [hasData, setHasData] = useState(false);
  const [cards, setCards] = useState<ExperimentSummaryCard[]>([]);

  useEffect(() => {
    setHasData(hasHistory());
    if (hasHistory()) {
      setCards(getExperimentSummaryCards(3));
    }
  }, []);

  if (!hasData || cards.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-10 text-center backdrop-blur-sm">
        <FlaskConical className="mx-auto size-8 text-slate-400/40" />
        <p className="mt-3 text-sm text-slate-500/60 dark:text-slate-400/50">
          No experiments completed yet — start training to see results
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <FlaskConical className="size-4 text-brand/60" />
        Recent Experiments
      </h3>

      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
        {cards.map((card, i) => (
          <motion.div
            key={card.id}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={cardVariants}
          >
            <Link
              href={`/ai-lab/experiments?id=${encodeURIComponent(card.id)}`}
              className={cn(
                "group flex flex-col rounded-xl border border-brand/10 bg-brand/[0.02] px-5 py-4 backdrop-blur-sm transition-all duration-300",
                "hover:scale-[1.02] hover:border-brand/25 hover:bg-brand/[0.05] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.08)]",
                "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:border-brand/30 dark:hover:bg-[rgba(var(--brand-rgb),0.06)]"
              )}
            >
              {/* Header */}
              <div className="mb-3 flex items-center justify-between">
                <h4 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand dark:group-hover:text-brand-light">
                  {card.name}
                </h4>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[0.6rem] font-medium",
                    card.status === "completed"
                      ? "border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600/80 dark:text-emerald-400/70"
                      : card.status === "running"
                        ? "border border-brand/20 bg-brand/[0.06] text-brand dark:text-brand-light"
                        : "border border-red-500/20 bg-red-500/[0.06] text-red-600/80 dark:text-red-400/70"
                  )}
                >
                  {card.status}
                </span>
              </div>

              {/* Model label */}
              <p className="mb-3 text-[0.7rem] text-slate-500/60 dark:text-slate-400/50">
                {card.modelLabel}
              </p>

              {/* Metrics row */}
              <div className="mb-2 flex items-center gap-4 text-[0.7rem]">
                <div className="flex items-center gap-1">
                  <TrendingDown className="size-3 text-slate-400/50" />
                  <span className="text-slate-500/80 dark:text-slate-400/60">
                    Loss
                  </span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatLoss(card.bestLoss)}
                  </span>
                </div>
                {card.perplexity !== null && (
                  <div className="flex items-center gap-1">
                    <BarChart3 className="size-3 text-slate-400/50" />
                    <span className="text-slate-500/80 dark:text-slate-400/60">
                      PPL
                    </span>
                    <span className="font-medium tabular-nums text-foreground">
                      {formatPPL(card.perplexity)}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[0.65rem]">
                <span className="text-slate-500/50 dark:text-slate-400/40">
                  {card.timeAgo}
                </span>
                <ArrowRight className="size-3 text-slate-400/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ResearchOverview — composition root
// ============================================================

export function ResearchOverview() {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.researchOverviewLabel" />

      <div className="space-y-10">
        <ModelStatusSection />
        <TrainingStatusSection />
        <ExperimentSummarySection />
      </div>
    </motion.section>
  );
}
