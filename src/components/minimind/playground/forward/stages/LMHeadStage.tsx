"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LMHeadVisualData } from "@/lib/minimind/visualization";
import { StageCard } from "../shared/StageCard";
import { DistributionChart } from "../shared/DistributionChart";
import { StatRow } from "../shared/StatRow";

// ============================================================
// LMHeadStage — Logits histogram + Top-K ranking + Distribution
// ============================================================
//
// Features:
//   - Logits histogram (DistributionChart)
//   - Distribution statistics: min, max, mean, stdDev, entropy
//   - Top-K predictions table (rank, token, logit, probability)
//   - Last hidden state preview
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface LMHeadStageProps {
  data: LMHeadVisualData;
  className?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function formatProb(p: number): string {
  if (p >= 0.01) return (p * 100).toFixed(2) + "%";
  if (p >= 0.0001) return (p * 100).toFixed(4) + "%";
  return p.toExponential(2);
}

// ── Component ────────────────────────────────────────────────

export function LMHeadStage({ data, className }: LMHeadStageProps) {
  const { logits, probabilities, topPredictions, distribution, lastHiddenState } =
    data;

  const hasProbs = probabilities.length > 0;
  const hasTopK = topPredictions.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Logits histogram */}
      <StageCard title="Logits Histogram">
        {logits.length > 0 ? (
          <DistributionChart
            data={logits}
            bins={50}
            height={120}
          />
        ) : (
          <p className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
            No logits data
          </p>
        )}
      </StageCard>

      {/* Distribution statistics */}
      <StageCard title="Distribution Statistics">
        <StatRow
          items={[
            { label: "Min", value: distribution.min },
            { label: "Max", value: distribution.max },
            { label: "Mean", value: distribution.mean },
            { label: "Std Dev", value: distribution.stdDev },
            { label: "Entropy", value: distribution.entropy },
            { label: "Vocab Size", value: logits.length },
          ]}
        />
      </StageCard>

      {/* Top-K predictions */}
      {hasTopK && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <StageCard title="Top-10 Predictions">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-brand/5 dark:border-white/[0.04]">
                    <th className="pb-2 pr-3 font-mono text-[0.6rem] font-medium text-slate-400/80 dark:text-slate-500/70">
                      #
                    </th>
                    <th className="pb-2 pr-3 font-mono text-[0.6rem] font-medium text-slate-400/80 dark:text-slate-500/70">
                      Token
                    </th>
                    <th className="pb-2 pr-3 text-right font-mono text-[0.6rem] font-medium text-slate-400/80 dark:text-slate-500/70">
                      Logit
                    </th>
                    <th className="pb-2 text-right font-mono text-[0.6rem] font-medium text-slate-400/80 dark:text-slate-500/70">
                      Probability
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topPredictions.map((pred) => (
                    <tr
                      key={pred.rank}
                      className={cn(
                        "border-b border-brand/[0.02] transition-colors hover:bg-brand/[0.02] dark:border-white/[0.02] dark:hover:bg-brand/[0.04]",
                        pred.rank === 1 && "bg-brand/[0.04] dark:bg-brand/[0.06]"
                      )}
                    >
                      <td className="py-1.5 pr-3 font-mono text-[0.65rem] tabular-nums text-slate-400 dark:text-slate-500">
                        {pred.rank}
                      </td>
                      <td
                        className="py-1.5 pr-3 font-mono text-[0.65rem] text-foreground/80"
                        title={`ID: ${pred.tokenId}`}
                      >
                        {pred.token}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono text-[0.65rem] tabular-nums text-slate-500/80 dark:text-slate-400/70">
                        {pred.logit.toFixed(4)}
                      </td>
                      <td className="py-1.5 text-right font-mono text-[0.65rem] tabular-nums text-foreground/80">
                        {formatProb(pred.probability)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </StageCard>
        </motion.div>
      )}

      {/* Probability bars for top 10 */}
      {hasProbs && hasTopK && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <StageCard title="Top-10 Probability Distribution">
            <div className="space-y-1">
              {topPredictions.slice(0, 10).map((pred) => (
                <div
                  key={pred.rank}
                  className="flex items-center gap-2"
                >
                  <span className="w-16 truncate text-right font-mono text-[0.6rem] text-slate-500/70 dark:text-slate-400/60">
                    {pred.token}
                  </span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.04]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(pred.probability * 100, 0.2)}%` }}
                      transition={{
                        delay: pred.rank * 0.05,
                        duration: 0.4,
                        ease: "easeOut",
                      }}
                      className="h-full rounded-full bg-brand/40 dark:bg-brand/50"
                    />
                  </div>
                  <span className="w-12 text-right font-mono text-[0.6rem] tabular-nums text-foreground/70">
                    {formatProb(pred.probability)}
                  </span>
                </div>
              ))}
            </div>
          </StageCard>
        </motion.div>
      )}

      {/* Last hidden state preview */}
      {lastHiddenState.length > 0 && (
        <StageCard title="Last Hidden State">
          <p className="mb-2 font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
            Final token representation before LM Head projection ({lastHiddenState.length}-dim)
          </p>
          <StatRow
            items={[
              { label: "h[0]", value: lastHiddenState[0] },
              { label: "h[1]", value: lastHiddenState[1] },
              { label: "h[2]", value: lastHiddenState[2] },
              { label: "…", value: "…" },
              {
                label: `h[${lastHiddenState.length - 1}]`,
                value: lastHiddenState[lastHiddenState.length - 1],
              },
            ]}
          />
        </StageCard>
      )}
    </div>
  );
}
