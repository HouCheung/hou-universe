"use client";

// ============================================================
// GenerationShowcase — Before/after training generation display
// ============================================================
// Phase 54: Shows how model generation improves through training
// by displaying before-training and after-training text output
// for the same prompt side by side.
//
// Data sources:
//   - trainingVisualizationAdapter (generation comparison)
//   - trainingAdapter (hasTrainingHistory gate)
//
// Design: glass UI + Framer Motion + cosmic theme
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import {
  MessageSquare,
  Sparkles,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  getGenerationComparison,
  hasObservatoryData,
  type GenerationComparisonData,
} from "@/lib/ai-lab/adapters/trainingVisualizationAdapter";
import { hasTrainingHistory } from "@/lib/ai-lab/adapters/trainingAdapter";
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
    transition: { duration: 0.5, delay: 0.3 + i * 0.15, ease: "easeOut" },
  }),
};

const textVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, delay: 0.6, ease: "easeOut" },
  },
};

// ============================================================
// Generation Panel (single prompt comparison)
// ============================================================

function GenerationPanel({
  data,
  index,
}: {
  data: GenerationComparisonData;
  index: number;
}) {
  const improved = data.changed && data.logProbDelta > 0;

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={cardVariants}
      className="rounded-xl border border-brand/10 bg-brand/[0.015] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)]"
    >
      {/* Prompt header */}
      <div className="border-b border-brand/5 px-5 py-3 dark:border-white/[0.05]">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-3.5 text-brand/50" />
          <span className="text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Prompt
          </span>
        </div>
        <p className="mt-1 text-sm font-medium text-foreground">
          &ldquo;{data.prompt}&rdquo;
        </p>
      </div>

      {/* Before / After grid */}
      <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-brand/5 dark:sm:divide-white/[0.05]">
        {/* Before training */}
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex size-5 items-center justify-center rounded-full bg-red-500/[0.1]">
              <TrendingDown className="size-3 text-red-500/60" />
            </div>
            <span className="text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
              Before Training
            </span>
          </div>
          <motion.p
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-[0.75rem] leading-relaxed text-slate-500/60 dark:text-slate-400/50"
          >
            {data.before || (
              <span className="italic text-slate-400/40">
                No generation data available
              </span>
            )}
          </motion.p>
        </div>

        {/* After training */}
        <div className="px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/[0.1]">
              <TrendingUp className="size-3 text-emerald-500/60" />
            </div>
            <span className="text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
              After Training
            </span>
          </div>
          <motion.p
            variants={textVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-[0.75rem] leading-relaxed text-foreground/80"
          >
            {data.after || (
              <span className="italic text-slate-400/40">
                No generation data available
              </span>
            )}
          </motion.p>
        </div>
      </div>

      {/* Metrics footer */}
      {data.changed && (
        <div className="flex items-center gap-4 border-t border-brand/5 px-5 py-2.5 dark:border-white/[0.05]">
          <div className="flex items-center gap-1 text-[0.65rem]">
            <RefreshCw className="size-3 text-slate-400/50" />
            <span
              className={cn(
                "font-medium",
                improved ? "text-emerald-600/80 dark:text-emerald-400/70" : "text-slate-500/60"
              )}
            >
              {improved ? "Improved" : "Changed"}
            </span>
          </div>
          {Number.isFinite(data.logProbDelta) && (
            <div className="flex items-center gap-1 text-[0.65rem]">
              <Sparkles className="size-3 text-slate-400/50" />
              <span className="text-slate-500/60 dark:text-slate-400/50">
                LogProb Δ
              </span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  data.logProbDelta > 0
                    ? "text-emerald-600/80 dark:text-emerald-400/70"
                    : "text-red-500/70"
                )}
              >
                {data.logProbDelta > 0 ? "+" : ""}
                {data.logProbDelta.toFixed(3)}
              </span>
            </div>
          )}
          {Number.isFinite(data.perplexityDelta) && (
            <div className="flex items-center gap-1 text-[0.65rem]">
              <span className="text-slate-500/60 dark:text-slate-400/50">
                PPL Δ
              </span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  data.perplexityDelta < 0
                    ? "text-emerald-600/80 dark:text-emerald-400/70"
                    : "text-red-500/70"
                )}
              >
                {data.perplexityDelta > 0 ? "+" : ""}
                {data.perplexityDelta.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ============================================================
// Empty state — no training data
// ============================================================

function EmptyNoTraining() {
  return (
    <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-14 text-center backdrop-blur-sm">
      <MessageSquare className="mx-auto size-10 text-slate-400/30" />
      <p className="mt-4 text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        No generation data yet
      </p>
      <p className="mt-1 text-[0.7rem] text-slate-500/50 dark:text-slate-400/40">
        Train a model to see before/after generation comparisons
      </p>
      <Link
        href="/ai-lab/training"
        className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-4 py-2 text-[0.7rem] font-medium text-brand transition-all hover:border-brand/30 hover:bg-brand/[0.08] dark:hover:border-brand/35"
      >
        Go to Training
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

// ============================================================
// Empty state — has training but no generation comparison
// ============================================================

function EmptyNoComparison() {
  return (
    <div className="rounded-xl border border-dashed border-slate-500/20 bg-slate-500/[0.02] px-6 py-12 text-center backdrop-blur-sm">
      <AlertTriangle className="mx-auto size-9 text-slate-400/30" />
      <p className="mt-3 text-sm font-medium text-slate-500/70 dark:text-slate-400/60">
        Generation comparison not yet available
      </p>
      <p className="mt-1 text-[0.7rem] text-slate-500/50 dark:text-slate-400/40">
        Run a complete training experiment to generate before/after text comparisons
      </p>
    </div>
  );
}

// ============================================================
// GenerationShowcase — composition root
// ============================================================

export function GenerationShowcase() {
  const [state, setState] = useState<"loading" | "empty-training" | "empty-comparison" | "ready">("loading");
  const [comparisons, setComparisons] = useState<GenerationComparisonData[]>([]);

  useEffect(() => {
    if (!hasTrainingHistory()) {
      setState("empty-training");
      return;
    }

    if (!hasObservatoryData()) {
      setState("empty-comparison");
      return;
    }

    const data = getGenerationComparison();
    if (data.length === 0) {
      setState("empty-comparison");
      return;
    }

    setComparisons(data);
    setState("ready");
  }, []);

  if (state === "empty-training") {
    return (
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <SectionHeader titleKey="aiLab.dashboard.generationShowcaseLabel" />
        <EmptyNoTraining />
      </motion.section>
    );
  }

  if (state === "empty-comparison") {
    return (
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={sectionVariants}
        className="mt-20 sm:mt-28"
      >
        <SectionHeader titleKey="aiLab.dashboard.generationShowcaseLabel" />
        <EmptyNoComparison />
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
      <SectionHeader titleKey="aiLab.dashboard.generationShowcaseLabel" />

      {/* Intro */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-6 text-center"
      >
        <p className="text-[0.75rem] text-slate-500/60 dark:text-slate-400/50">
          See how the model&apos;s text generation improves through training —
          from random noise to coherent output
        </p>
      </motion.div>

      {/* Comparison cards */}
      <div className="space-y-5">
        {comparisons.map((comp, i) => (
          <GenerationPanel key={comp.prompt} data={comp} index={i} />
        ))}
      </div>
    </motion.section>
  );
}
