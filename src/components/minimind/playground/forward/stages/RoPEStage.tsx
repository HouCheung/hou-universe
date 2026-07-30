"use client";

import { useState, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoPEVisualData, RoPERotationTrace } from "@/lib/minimind/visualization";
import { StageCard } from "../shared/StageCard";
import { VectorBarChart } from "../shared/VectorBarChart";
import { StatRow } from "../shared/StatRow";

// ============================================================
// RoPEStage — Head selector + rotation viz + norm check
// ============================================================
//
// Features:
//   - Position + Head selector
//   - Before/After vector side-by-side
//   - 2D rotation pair details
//   - Norm invariance check (green ✓ / red ✗)
//   - RoPE config summary
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface RoPEStageProps {
  data: RoPEVisualData;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function RoPEStage({ data, className }: RoPEStageProps) {
  const { rotationTraces, ropeConfig, before, after } = data;
  const numPositions = rotationTraces.length;
  const numHeads = ropeConfig.numHeads;

  const [selectedPos, setSelectedPos] = useState(0);
  const [selectedHead, setSelectedHead] = useState(0);

  const headTrace: RoPERotationTrace | null = useMemo(
    () => rotationTraces[selectedPos]?.[selectedHead] ?? null,
    [rotationTraces, selectedPos, selectedHead]
  );

  const selectedBefore = useMemo(
    () => before[selectedPos] ?? [],
    [before, selectedPos]
  );

  const selectedAfter = useMemo(
    () => after[selectedPos] ?? [],
    [after, selectedPos]
  );

  const handlePositionChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedPos(Number(e.target.value));
    },
    []
  );

  const handleHeadChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedHead(Number(e.target.value));
    },
    []
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Selectors */}
      <StageCard title="Position & Head Selector">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <label
              htmlFor="rope-position"
              className="text-[0.7rem] font-medium text-slate-500/70 dark:text-slate-400/60"
            >
              Position:
            </label>
            <select
              id="rope-position"
              value={selectedPos}
              onChange={handlePositionChange}
              className={cn(
                "rounded-lg border border-brand/10 bg-slate-50/80 px-3 py-1.5 font-mono text-xs",
                "dark:border-white/[0.06] dark:bg-white/[0.03]",
                "text-foreground focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
              )}
            >
              {Array.from({ length: numPositions }, (_, i) => (
                <option key={i} value={i}>
                  Position {i}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5">
            <label
              htmlFor="rope-head"
              className="text-[0.7rem] font-medium text-slate-500/70 dark:text-slate-400/60"
            >
              Head:
            </label>
            <select
              id="rope-head"
              value={selectedHead}
              onChange={handleHeadChange}
              className={cn(
                "rounded-lg border border-brand/10 bg-slate-50/80 px-3 py-1.5 font-mono text-xs",
                "dark:border-white/[0.06] dark:bg-white/[0.03]",
                "text-foreground focus:border-brand/30 focus:outline-none focus:ring-1 focus:ring-brand/20"
              )}
            >
              {Array.from({ length: numHeads }, (_, i) => (
                <option key={i} value={i}>
                  Head {i}
                </option>
              ))}
            </select>
          </div>
        </div>
      </StageCard>

      {/* Before/After vectors */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StageCard title="Before RoPE">
          {selectedBefore.length > 0 ? (
            <VectorBarChart
              data={selectedBefore}
              maxBars={64}
              height={100}
            />
          ) : (
            <p className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
              No data
            </p>
          )}
        </StageCard>

        <StageCard title="After RoPE">
          {selectedAfter.length > 0 ? (
            <VectorBarChart
              data={selectedAfter}
              maxBars={64}
              height={100}
            />
          ) : (
            <p className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
              No data
            </p>
          )}
        </StageCard>
      </div>

      {/* Rotation trace detail */}
      {headTrace && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <StageCard title={`Rotation Trace — Position ${selectedPos}, Head ${selectedHead}`}>
            <div className="space-y-3">
              {/* Norm check */}
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
                  Norm Invariance:
                </span>
                {headTrace.normPreserved ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-0.5 text-[0.6rem] font-medium text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-400">
                    <CheckCircle2 className="size-2.5" />
                    Preserved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/[0.06] px-2 py-0.5 text-[0.6rem] font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/[0.06] dark:text-red-400">
                    <XCircle className="size-2.5" />
                    Changed
                  </span>
                )}
              </div>

              <StatRow
                items={[
                  { label: "Norm Before", value: headTrace.normBefore },
                  { label: "Norm After", value: headTrace.normAfter },
                  {
                    label: "Δ Norm",
                    value: Math.abs(headTrace.normAfter - headTrace.normBefore),
                  },
                ]}
              />

              {/* Sampled dimension pairs */}
              {headTrace.sampledPairs.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                    Sampled Dimension Pairs (2D Rotation)
                  </h4>
                  <div className="space-y-1.5">
                    {headTrace.sampledPairs.map((pair) => (
                      <div
                        key={pair.dimPairIndex}
                        className="flex items-center justify-between rounded-lg border border-brand/5 bg-brand/[0.02] px-3 py-1.5 dark:border-white/[0.04] dark:bg-white/[0.01]"
                      >
                        <span className="font-mono text-[0.6rem] text-slate-500/70 dark:text-slate-400/60">
                          d[{pair.evenDim},{pair.oddDim}]
                        </span>
                        <span className="font-mono text-[0.6rem] tabular-nums text-slate-500/70 dark:text-slate-400/60">
                          θ = {pair.angle.toFixed(4)} rad
                        </span>
                        <span className="font-mono text-[0.6rem] tabular-nums text-slate-500/70 dark:text-slate-400/60">
                          freq = {pair.frequency.toExponential(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </StageCard>
        </motion.div>
      )}

      {/* RoPE config */}
      <StageCard title="RoPE Configuration">
        <StatRow
          items={[
            { label: "Head Dim", value: ropeConfig.headDim },
            { label: "Num Heads", value: ropeConfig.numHeads },
            { label: "Theta (θ)", value: ropeConfig.theta },
            { label: "Max Seq Len", value: ropeConfig.maxSeqLen },
          ]}
        />
      </StageCard>
    </div>
  );
}
