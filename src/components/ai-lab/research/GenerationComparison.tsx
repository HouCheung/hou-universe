"use client";

// ============================================================
// GenerationComparison — Before/After generation comparison
// ============================================================
// Phase 67: Side-by-side comparison of baseline (untrained)
// vs trained checkpoint generation output.
//
// Layout:
//   ┌──────────────────────┬──────────────────────┐
//   │ BEFORE TRAINING      │ AFTER TRAINING       │
//   │ baseline model       │ trained checkpoint   │
//   │ generated text       │ generated text       │
//   │ metrics              │ metrics              │
//   └──────────────────────┴──────────────────────┘
//
// Design: professional research comparison
// ============================================================

import { motion, type Variants } from "framer-motion";
import {
  TrendingDown,
  TrendingUp,
  Sparkles,
  BarChart3,
  ArrowRight,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComparisonUIData } from "@/lib/ai-lab/adapters/generationAdapter";

// ============================================================
// Animation variants
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
};

// ============================================================
// Sub-components
// ============================================================

function MetricRow({
  label,
  baseline,
  trained,
  delta,
  higherIsBetter,
  unit,
  format = (v: number) => v.toFixed(2),
}: {
  label: string;
  baseline: number;
  trained: number;
  delta: number;
  higherIsBetter: boolean;
  unit?: string;
  format?: (v: number) => string;
}) {
  const improved =
    delta !== 0 && ((higherIsBetter && delta > 0) || (!higherIsBetter && delta < 0));

  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] py-2 text-xs">
      <span className="w-24 text-slate-500">{label}</span>

      {/* Baseline value */}
      <span className="w-20 text-right tabular-nums text-slate-500">
        {format(baseline)}
        {unit && <span className="ml-0.5 text-slate-600">{unit}</span>}
      </span>

      {/* Arrow */}
      <ArrowRight className="size-3 text-slate-600" />

      {/* Trained value */}
      <span className="w-20 text-right tabular-nums text-slate-300">
        {format(trained)}
        {unit && <span className="ml-0.5 text-slate-600">{unit}</span>}
      </span>

      {/* Delta */}
      <span
        className={cn(
          "w-24 text-right tabular-nums",
          improved
            ? "text-emerald-400"
            : delta === 0
              ? "text-slate-500"
              : "text-amber-400"
        )}
      >
        {delta > 0 ? "+" : ""}
        {format(delta)}
        {unit && <span className="ml-0.5 opacity-70">{unit}</span>}
      </span>
    </div>
  );
}

// ============================================================
// GenerationComparison
// ============================================================

export function GenerationComparison({
  data,
}: {
  data: ComparisonUIData;
}) {
  const { baseline, trained } = data;

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-brand" />
          <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            Before / After Comparison
          </h3>
        </div>
        {data.changed ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase text-emerald-400">
            <Sparkles className="size-2.5" />
            Changed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-400/10 px-2.5 py-0.5 text-[0.6rem] font-semibold uppercase text-slate-500">
            Unchanged
          </span>
        )}
      </div>

      {/* Prompt */}
      <div className="mb-4 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2">
        <span className="text-[0.65rem] text-slate-500">Prompt: </span>
        <span className="text-xs text-slate-300">&ldquo;{data.prompt}&rdquo;</span>
      </div>

      {/* Side-by-side text comparison */}
      <div className="mb-4 grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-white/[0.05]">
        {/* Baseline */}
        <div className="px-1 py-3 sm:pr-4 sm:pt-0">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex size-5 items-center justify-center rounded-full bg-slate-500/[0.12]">
              <TrendingDown className="size-3 text-slate-400" />
            </div>
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-500">
              Before Training
            </span>
            <span className="ml-auto rounded bg-blue-400/10 px-1.5 py-0.5 text-[0.55rem] text-blue-400">
              Baseline
            </span>
          </div>
          <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
            <p className="whitespace-pre-wrap text-[0.75rem] leading-relaxed text-slate-400">
              {baseline.generatedText || (
                <span className="italic text-slate-600">No output</span>
              )}
            </p>
          </div>
        </div>

        {/* Trained */}
        <div className="px-1 py-3 sm:pl-4 sm:pt-0">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="flex size-5 items-center justify-center rounded-full bg-emerald-500/[0.12]">
              <TrendingUp className="size-3 text-emerald-400" />
            </div>
            <span className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-500">
              After Training
            </span>
            <span className="ml-auto rounded bg-emerald-400/10 px-1.5 py-0.5 text-[0.55rem] text-emerald-400">
              Trained
            </span>
          </div>
          <div className="rounded-lg border border-emerald-400/10 bg-emerald-500/[0.02] p-3">
            <p className="whitespace-pre-wrap text-[0.75rem] leading-relaxed text-slate-200">
              {trained.generatedText || (
                <span className="italic text-slate-600">No output</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics comparison table */}
      <div className="rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <BarChart3 className="size-3 text-slate-500" />
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
            Metric Comparison
          </span>
          <span className="ml-auto text-[0.6rem] text-slate-600">
            Baseline → Trained → Δ
          </span>
        </div>

        <div className="space-y-0">
          <MetricRow
            label="Avg Log-Prob"
            baseline={baseline.avgLogProb}
            trained={trained.avgLogProb}
            delta={data.logProbDelta}
            higherIsBetter
            format={(v) => v.toFixed(4)}
          />
          <MetricRow
            label="Perplexity"
            baseline={baseline.perplexity}
            trained={trained.perplexity}
            delta={data.perplexityDelta}
            higherIsBetter={false}
            format={(v) => v.toFixed(2)}
          />
          <MetricRow
            label="Tokens"
            baseline={baseline.tokenCount}
            trained={trained.tokenCount}
            delta={data.tokenCountDelta}
            higherIsBetter={false}
            format={(v) => Math.round(v).toString()}
          />
          <MetricRow
            label="Duration"
            baseline={baseline.durationMs}
            trained={trained.durationMs}
            delta={trained.durationMs - baseline.durationMs}
            higherIsBetter={false}
            unit="ms"
            format={(v) => Math.round(v).toString()}
          />
        </div>
      </div>

      {/* Summary */}
      {data.changed && (
        <div className="mt-4 rounded-lg border border-emerald-400/10 bg-emerald-500/[0.03] px-4 py-2.5">
          <p className="text-xs text-slate-400">
            {data.logProbDelta > 0
              ? `Generation became more consistent with training corpus (logProb improved by ${(data.logProbDelta * 100).toFixed(1)}%).`
              : `Generation output changed but logProb decreased by ${Math.abs(data.logProbDelta).toFixed(4)}.`}
            {data.perplexityDelta < 0
              ? ` Perplexity improved by ${Math.abs(data.perplexityDelta).toFixed(1)}.`
              : data.perplexityDelta > 0
                ? ` Perplexity increased by ${data.perplexityDelta.toFixed(1)}.`
                : ""}
          </p>
        </div>
      )}
    </motion.div>
  );
}
