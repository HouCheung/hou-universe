"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type {
  AttentionHeatmapData,
  ExperimentError,
  ExperimentTiming,
} from "@/lib/minimind/experiments";
import { StageCard } from "@/components/minimind/playground/forward/shared/StageCard";
import { StatRow } from "@/components/minimind/playground/forward/shared/StatRow";
import { HeatmapGrid } from "@/components/minimind/playground/forward/shared/HeatmapGrid";
import { DistributionChart } from "@/components/minimind/playground/forward/shared/DistributionChart";

// ============================================================
// Component
// ============================================================

interface AttentionHeatmapResultProps {
  data: AttentionHeatmapData;
  errors: ExperimentError[];
  timing: ExperimentTiming;
}

export function AttentionHeatmapResult({
  data,
  errors,
  timing,
}: AttentionHeatmapResultProps) {
  const [selectedHead, setSelectedHead] = useState(0);
  const [viewMode, setViewMode] = useState<"weights" | "scores">("weights");

  const currentHead = data.heads[selectedHead];
  const viewData = viewMode === "weights" ? currentHead?.weights : currentHead?.rawScores;

  return (
    <div className="space-y-6">
      {/* ── Timing ───────────────────────────────────────────── */}
      <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
        Completed in {timing.durationMs.toFixed(0)}ms
      </p>

      {/* ── Errors ────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
          {errors.map((err, i) => (
            <p key={i} className="font-mono text-xs text-amber-600 dark:text-amber-400">
              [{err.phase}] {err.message}
            </p>
          ))}
        </div>
      )}

      {/* ── Context card ──────────────────────────────────────── */}
      <StageCard title="Attention Context">
        <StatRow
          items={[
            { label: "Seq Len", value: data.seqLen },
            { label: "Num Heads", value: data.numHeads },
            { label: "Head Dim", value: data.headDim },
            { label: "Causal Mask", value: data.causalMaskApplied ? "On" : "Off" },
          ]}
        />
      </StageCard>

      {data.heads.length === 0 ? (
        <StageCard>
          <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
            No attention data available.
          </p>
        </StageCard>
      ) : (
        <>
          {/* ── Head selector ─────────────────────────────────── */}
          {data.numHeads > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: data.numHeads }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedHead(i)}
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                    selectedHead === i
                      ? "border-brand/30 bg-brand/[0.08] text-brand dark:border-brand/40 dark:text-brand/80"
                      : "border-brand/10 bg-transparent text-slate-500 dark:border-white/[0.08] dark:text-slate-400"
                  )}
                >
                  Head {i}
                </button>
              ))}
            </div>
          )}

          {/* ── Heatmap card ──────────────────────────────────── */}
          <StageCard title={`Head ${selectedHead} — ${viewMode === "weights" ? "Attention Weights" : "Raw Scores"}`}>
            <div className="space-y-3">
              {/* View toggle */}
              <div className="flex gap-2">
                {(["weights", "scores"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    className={cn(
                      "rounded-full border px-3 py-1 font-mono text-[0.6rem] uppercase transition-colors",
                      viewMode === mode
                        ? "border-brand/20 bg-brand/[0.06] text-brand/80"
                        : "border-brand/8 bg-transparent text-slate-400 dark:border-white/[0.05]"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>

              {viewData && viewData.length > 0 ? (
                <div className="flex justify-center overflow-x-auto">
                  <HeatmapGrid
                    data={viewData}
                    rows={data.seqLen}
                    cols={data.seqLen}
                    cellSize={Math.max(12, Math.min(32, Math.floor(400 / data.seqLen)))}
                  />
                </div>
              ) : (
                <p className="font-mono text-xs text-slate-400">
                  No {viewMode} data for this head.
                </p>
              )}
            </div>
          </StageCard>

          {/* ── Head entropy ──────────────────────────────────── */}
          <StageCard title="Head Attention Entropy">
            <p className="mb-2 font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
              Higher entropy = more diffuse attention (token attends broadly).
              Lower entropy = focused attention (token attends to few positions).
            </p>
            <DistributionChart
              data={data.heads.map((h) => h.entropy)}
              bins={Math.min(data.numHeads, 12)}
              barColor="rgba(var(--brand-rgb), 0.5)"
              height={100}
            />
            <div className="mt-2 flex flex-wrap gap-3">
              {data.heads.map((h, i) => (
                <span
                  key={i}
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    i === selectedHead ? "text-brand" : "text-slate-400 dark:text-slate-500"
                  )}
                >
                  H{i}: {h.entropy.toFixed(2)}
                </span>
              ))}
            </div>
          </StageCard>

          {/* ── Head diversity (optional) ──────────────────────── */}
          {data.headDiversity && (
            <StageCard title="Head Diversity Matrix">
              <p className="mb-2 font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
                Pairwise similarity between head attention patterns.
                Lower values = heads attend to different patterns (more diversity).
              </p>
              <div className="flex justify-center overflow-x-auto">
                <HeatmapGrid
                  data={data.headDiversity.pairwiseSimilarity}
                  rows={data.numHeads}
                  cols={data.numHeads}
                  cellSize={20}
                />
              </div>
            </StageCard>
          )}
        </>
      )}
    </div>
  );
}
