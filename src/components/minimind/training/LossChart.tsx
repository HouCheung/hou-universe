"use client";

import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ============================================================
// LossChart — Training loss visualization
// ============================================================
//
// Displays epoch-by-epoch loss values from TrainingResult.
// With NoOpOptimizer (no weight updates), losses are identical
// across epochs — the chart clearly communicates this.
//
// Design:
//   - Horizontal bar chart (one bar per epoch)
//   - Bar height proportional to loss value
//   - Flat bars = no weight updates (the honest lesson)
//   - Annotation explains why loss doesn't decrease
//
// All data comes from TrainingResult.lossHistory — no fake data.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface LossChartProps {
  lossHistory: number[];
  epochs: number;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────

/** Check if all losses are effectively identical (no gradient updates) */
function isFlatLoss(losses: number[]): boolean {
  if (losses.length < 2) return false;
  const max = Math.max(...losses);
  const min = Math.min(...losses);
  return max - min < 1e-8;
}

// ── Component ────────────────────────────────────────────────

export function LossChart({ lossHistory, epochs, className }: LossChartProps) {
  const { t } = useTranslation();

  if (lossHistory.length === 0) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {t("aiLab.training.lossChartTitle")}
          </h3>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300/80 bg-slate-50/50 px-4 py-8 text-center dark:border-white/[0.06] dark:bg-white/[0.02]">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {t("aiLab.training.noLossData")}
          </p>
        </div>
      </div>
    );
  }

  const flat = isFlatLoss(lossHistory);
  const maxLoss = Math.max(...lossHistory);
  const minLoss = Math.min(...lossHistory);
  // Scale bars relative to max loss (min bar height 10% for visibility)
  const minBarRatio = 0.1;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.training.lossChartTitle")}
        </h3>
        <span className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          ({epochs} {t("aiLab.training.epochsLabel")})
        </span>
      </div>

      {/* Loss bars */}
      <div className="rounded-xl border border-slate-200/60 bg-white/60 px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <div className="space-y-2.5">
          {lossHistory.map((loss, i) => {
            // Scale: each bar height proportional to loss relative to max
            const ratio =
              maxLoss > 0
                ? minBarRatio + ((loss - minLoss) / (maxLoss || 1)) * (1 - minBarRatio)
                : 1;
            const barWidth = ratio * 100;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.35, ease: "easeOut" }}
                className="flex items-center gap-3"
              >
                {/* Epoch label */}
                <span className="w-16 shrink-0 font-mono text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {t("aiLab.training.epochAbbr")} {i + 1}
                </span>

                {/* Bar */}
                <div className="flex-1 h-6 rounded-md bg-slate-100 dark:bg-white/[0.04] overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${barWidth}%` }}
                    transition={{
                      delay: i * 0.08 + 0.2,
                      duration: 0.5,
                      ease: "easeOut",
                    }}
                    className={cn(
                      "h-full rounded-md",
                      flat
                        ? "bg-gradient-to-r from-brand/40 to-brand/50 dark:from-brand/45 dark:to-brand/55"
                        : "bg-gradient-to-r from-brand/50 to-brand/70 dark:from-brand/50 dark:to-brand/75"
                    )}
                  />

                  {/* Loss value overlay */}
                  <span
                    className={cn(
                      "absolute inset-y-0 left-2 flex items-center font-mono text-[0.65rem] font-semibold",
                      barWidth > 30
                        ? "text-white/90"
                        : "text-slate-700 dark:text-slate-300"
                    )}
                    style={{ left: `calc(${barWidth}% + 8px)` }}
                  />
                </div>

                {/* Loss value */}
                <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold text-foreground tabular-nums">
                  {loss.toFixed(4)}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* Flat-loss explanation */}
        {flat && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] px-3 py-2.5 dark:border-amber-500/12 dark:bg-amber-500/[0.04]"
          >
            <Info className="size-3.5 shrink-0 mt-0.5 text-amber-500/70" />
            <p className="text-[0.65rem] text-amber-500/60 dark:text-amber-500/50 leading-relaxed">
              {t("aiLab.training.flatLossExplanation")}
            </p>
          </motion.div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t("aiLab.training.avgLoss")}
          </div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
            {(lossHistory.reduce((a, b) => a + b, 0) / lossHistory.length).toFixed(4)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t("aiLab.training.minLoss")}
          </div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
            {Math.min(...lossHistory).toFixed(4)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="text-[0.6rem] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t("aiLab.training.maxLoss")}
          </div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-foreground tabular-nums">
            {Math.max(...lossHistory).toFixed(4)}
          </div>
        </div>
      </div>
    </div>
  );
}
