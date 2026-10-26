"use client";

import { motion } from "framer-motion";
import { Clock, FileText, Hash, OctagonX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { GenerationTrace } from "@/lib/minimind/inference";

// ============================================================
// GenerationTracePanel — Trace summary + KV Cache inspection
// ============================================================
//
// Displays the final GenerationTrace after inference completes:
//   - Prompt text
//   - Duration (ms)
//   - Tokens generated count
//   - Stop reason
//   - Per-layer KV Cache status (cached sequence length, entropy)
//
// All data comes from GenerationTrace as returned by
// InferenceEngine.getTrace() — no fake data.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface GenerationTracePanelProps {
  trace: GenerationTrace;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ── Component ────────────────────────────────────────────────

export function GenerationTracePanel({
  trace,
  className,
}: GenerationTracePanelProps) {
  const { t } = useTranslation();

  const statItems = [
    {
      icon: FileText,
      label: t("aiLab.inference.promptLabel2"),
      value: trace.prompt,
      mono: false,
    },
    {
      icon: Clock,
      label: t("aiLab.inference.durationLabel"),
      value: fmtMs(trace.durationMs),
      mono: true,
    },
    {
      icon: Hash,
      label: t("aiLab.inference.tokensGeneratedLabel"),
      value: String(trace.steps.length),
      mono: true,
    },
    {
      icon: OctagonX,
      label: t("aiLab.inference.stopReasonLabel"),
      value: trace.steps.length > 0
        ? trace.steps[trace.steps.length - 1].pipelineDescription.includes("Stop")
          ? "Stop token"
          : "maxTokens"
        : "—",
      mono: true,
    },
  ];

  const kvEntries = trace.finalCache;
  const cachedSeqLen = kvEntries.length > 0
    ? kvEntries[0].metadata.length
    : 0;
  const layerCount = kvEntries.length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.inference.generationTrace")}
        </h3>
      </div>

      {/* Trace stats grid */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {statItems.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3, ease: "easeOut" }}
            className="rounded-xl border border-slate-200/60 bg-white/60 px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
          >
            <div className="flex items-center gap-1.5 mb-1">
              <item.icon className="size-3 text-slate-400 dark:text-slate-500" />
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {item.label}
              </span>
            </div>
            <div
              className={cn(
                "text-sm",
                item.mono
                  ? "font-mono text-foreground"
                  : "text-foreground/80 break-all"
              )}
            >
              {item.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* KV Cache Panel */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
        className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-white/[0.06] dark:bg-white/[0.02] overflow-hidden"
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-white/[0.04]">
          <div className="h-5 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
          <h4 className="text-xs font-semibold tracking-tight text-foreground">
            {t("aiLab.inference.kvCachePanel")}
          </h4>
        </div>

        <div className="px-4 py-3 space-y-3">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.01]">
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("aiLab.inference.layerCount")}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {layerCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.01]">
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("aiLab.inference.cachedSeqLen")}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">
                {cachedSeqLen}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-white/[0.04] dark:bg-white/[0.01]">
              <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("aiLab.inference.cacheStatus")}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <div
                  className={cn(
                    "size-1.5 rounded-full",
                    cachedSeqLen > 0
                      ? "bg-emerald-400 dark:bg-emerald-500"
                      : "bg-slate-300 dark:bg-slate-600"
                  )}
                />
                <span className="font-mono text-xs text-foreground/70">
                  {cachedSeqLen > 0
                    ? t("aiLab.inference.active")
                    : t("aiLab.inference.inactive")}
                </span>
              </div>
            </div>
          </div>

          {/* Per-layer entropy bars */}
          {kvEntries.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Layer Attention Entropy
              </span>
              <div className="space-y-1">
                {kvEntries.map((entry) => {
                  const lastMeta =
                    entry.metadata.length > 0
                      ? entry.metadata[entry.metadata.length - 1]
                      : null;
                  const avgEntropy =
                    lastMeta?.headEntropies
                      ? lastMeta.headEntropies.reduce((a, b) => a + b, 0) /
                        lastMeta.headEntropies.length
                      : 0;

                  return (
                    <div
                      key={entry.layerIndex}
                      className="flex items-center gap-2"
                    >
                      <span className="w-16 shrink-0 font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
                        Layer {entry.layerIndex}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-white/[0.04] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min(100, (avgEntropy / 5) * 100)}%`,
                          }}
                          transition={{
                            delay: 0.3 + entry.layerIndex * 0.05,
                            duration: 0.5,
                            ease: "easeOut",
                          }}
                          className="h-full rounded-full bg-gradient-to-r from-brand/40 to-brand/60 dark:from-brand/50 dark:to-brand/70"
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
                        {avgEntropy.toFixed(2)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
