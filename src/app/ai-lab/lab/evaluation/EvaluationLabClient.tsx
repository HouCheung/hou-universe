"use client";

// ============================================================
// EvaluationLabClient — MiniMind Evaluation & Benchmarks
// ============================================================
// Phase 69: Wrapper for evaluation and benchmark capabilities.
// Reuses existing training observatory and copilot analysis.
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { TrendingUp, BarChart3, Activity } from "lucide-react";
import Link from "next/link";
import {
  hasObservatoryData,
  getTrainingSummary,
  getLossCurveData,
  getObservatoryStats,
  type TrainingSummary,
  type LossCurveData,
} from "@/lib/ai-lab/adapters/trainingVisualizationAdapter";
import {
  hasCopilotData,
  getLatestCopilotAnalysis,
  getCriticalFindings,
  type CopilotAnalysis,
  type CopilotFinding,
} from "@/lib/ai-lab/adapters/researchCopilotAdapter";

// ============================================================
// EvaluationLabClient
// ============================================================

export function EvaluationLabClient() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<TrainingSummary | null>(null);
  const [lossData, setLossData] = useState<LossCurveData | null>(null);
  const [stats, setStats] = useState<ReturnType<typeof getObservatoryStats> | null>(null);
  const [copilot, setCopilot] = useState<CopilotAnalysis | null>(null);
  const [findings, setFindings] = useState<CopilotFinding[]>([]);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (hasObservatoryData()) {
      setHasData(true);
      setSummary(getTrainingSummary());
      setLossData(getLossCurveData());
      setStats(getObservatoryStats());
    }
    if (hasCopilotData()) {
      const analysis = getLatestCopilotAnalysis();
      setCopilot(analysis);
      if (analysis) {
        setFindings(getCriticalFindings(analysis));
      }
    }
  }, []);

  return (
    <div className="space-y-12">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center text-center"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <BarChart3 className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("aiLab.chat.lab.evaluation.title")}
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          Evaluation & Benchmarks
        </h1>
        <p className="mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-400">
          {t("aiLab.chat.lab.evaluation.description")}
        </p>
      </motion.div>

      {/* Data status */}
      {!hasData ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 rounded-2xl border border-brand/[0.06] bg-brand/[0.02] px-6 py-12 text-center dark:border-white/[0.04] dark:bg-white/[0.01]"
        >
          <Activity className="size-8 text-slate-500/30" />
          <p className="font-mono text-sm text-slate-500/60 dark:text-slate-400/40">
            No training data yet.
          </p>
          <Link
            href="/ai-lab/lab/training"
            className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.06] px-4 py-2 font-mono text-xs text-brand transition-colors hover:bg-brand/[0.12]"
          >
            <TrendingUp className="size-3.5" />
            Run training first
          </Link>
        </motion.div>
      ) : (
        <>
          {/* Stats KPIs */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Runs", value: stats.totalRuns },
                { label: "Best Loss", value: stats.bestLoss?.toFixed(4) ?? "—" },
                { label: "Avg Tokens/s", value: stats.averageThroughput?.toFixed(0) ?? "—" },
                { label: "Completed", value: stats.completedRuns },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-brand/[0.06] bg-brand/[0.02] px-4 py-3 text-center dark:border-white/[0.04] dark:bg-white/[0.01]"
                >
                  <p className="font-mono text-lg font-bold tabular-nums text-foreground">
                    {kpi.value}
                  </p>
                  <p className="mt-0.5 font-mono text-[0.6rem] tracking-wide text-slate-500/60 dark:text-slate-400/40">
                    {kpi.label}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Training summary */}
          {summary && (
            <div className="rounded-2xl border border-brand/[0.06] bg-brand/[0.02] px-6 py-5 dark:border-white/[0.04] dark:bg-white/[0.01]">
              <h2 className="mb-3 font-mono text-xs tracking-[0.1em] uppercase text-slate-500/60 dark:text-slate-400/40">
                Latest Training
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="font-mono text-[0.6rem] text-slate-500/50">Model</p>
                  <p className="font-mono text-sm text-foreground">{summary.experimentName}</p>
                </div>
                <div>
                  <p className="font-mono text-[0.6rem] text-slate-500/50">Final Loss</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {summary.finalLoss?.toFixed(4) ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[0.6rem] text-slate-500/50">Perplexity</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {summary.perplexity?.toFixed(2) ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[0.6rem] text-slate-500/50">Throughput</p>
                  <p className="font-mono text-sm tabular-nums text-foreground">
                    {summary.tokensPerSecond?.toFixed(0) ?? "—"} tok/s
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Findings */}
          {findings.length > 0 && (
            <div className="rounded-2xl border border-brand/[0.06] bg-brand/[0.02] px-6 py-5 dark:border-white/[0.04] dark:bg-white/[0.01]">
              <h2 className="mb-4 font-mono text-xs tracking-[0.1em] uppercase text-slate-500/60 dark:text-slate-400/40">
                Research Findings
              </h2>
              <div className="space-y-3">
                {findings.slice(0, 5).map((finding, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-brand/[0.04] bg-brand/[0.01] px-3 py-2.5 dark:border-white/[0.02] dark:bg-white/[0.005]"
                  >
                    <span
                      className={`mt-0.5 size-1.5 shrink-0 rounded-full ${
                        finding.severity === "critical"
                          ? "bg-red-400"
                          : finding.severity === "warning"
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-medium text-foreground/80">
                        {finding.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[0.65rem] text-slate-500/60 dark:text-slate-400/40">
                        {finding.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
