"use client";

import { useMemo } from "react";
import { HeatmapGrid } from "../forward/shared/HeatmapGrid";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// AttentionHeatmap — Attention weights matrix visualization
// ============================================================
//
// Renders the attention weights for a single head as a
// HeatmapGrid. Each cell [qPos, kPos] shows how strongly the
// query token at position qPos attends to the key token at kPos.
//
// Props:
//   weights      — attentionWeights[head][seqLen][seqLen]
//   tokens       — token strings for axis labels
//   headIndex    — which head is being displayed
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface AttentionHeatmapProps {
  weights: number[][];
  tokens: string[];
  headIndex: number;
}

// ── Component ────────────────────────────────────────────────

export function AttentionHeatmap({
  weights,
  tokens,
  headIndex,
}: AttentionHeatmapProps) {
  const seqLen = tokens.length;

  // ── Compute stats ──────────────────────────────────────────
  const { maxWeight, avgEntropy } = useMemo(() => {
    if (!weights.length || !weights[0]?.length) {
      return { maxWeight: 0, avgEntropy: 0 };
    }

    let m = 0;
    let totalEntropy = 0;

    for (let q = 0; q < weights.length; q++) {
      let rowEntropy = 0;
      for (let k = 0; k < (weights[q]?.length ?? 0); k++) {
        const w = weights[q][k];
        if (w > m) m = w;
        if (w > 0) {
          rowEntropy -= w * Math.log2(w + 1e-12);
        }
      }
      totalEntropy += rowEntropy;
    }

    const avgE = weights.length > 0 ? totalEntropy / weights.length : 0;
    return { maxWeight: m, avgEntropy: avgE };
  }, [weights]);

  if (seqLen === 0) {
    return (
      <StageCard title="Attention Heatmap">
        <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          Enter text above to see the attention heatmap.
        </p>
      </StageCard>
    );
  }

  return (
    <StageCard title={`Attention Weights — Head ${headIndex}`}>
      {/* ── Stats pills ──────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
          Seq Len: {seqLen}
        </span>
        <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
          Max Weight: {maxWeight.toFixed(4)}
        </span>
        <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
          Avg Entropy: {avgEntropy.toFixed(3)}
        </span>
        <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
          Causal Masked
        </span>
      </div>

      {/* ── Axis labels (columns = keys) ─────────────────────── */}
      <div className="mb-1 flex" style={{ paddingLeft: 48 }}>
        {tokens.map((token, i) => (
          <div
            key={i}
            className="flex items-center justify-center overflow-hidden"
            style={{ width: 16 }}
            title={`Key: ${token}`}
          >
            <span className="font-mono text-[0.5rem] text-slate-400/60 dark:text-slate-500/50 truncate">
              {token.slice(0, 2)}
            </span>
          </div>
        ))}
      </div>

      {/* ── Heatmap with row labels ──────────────────────────── */}
      <div className="flex">
        {/* Row labels (queries) */}
        <div className="flex shrink-0 flex-col pr-1.5" style={{ width: 44 }}>
          {tokens.map((token, i) => (
            <div
              key={i}
              className="flex items-center justify-end"
              style={{ height: 16 }}
              title={`Query: ${token}`}
            >
              <span className="font-mono text-[0.5rem] text-slate-400/60 dark:text-slate-500/50 truncate max-w-full">
                {token.slice(0, 4)}
              </span>
            </div>
          ))}
        </div>

        {/* Heatmap grid */}
        <HeatmapGrid
          data={weights}
          rows={seqLen}
          cols={seqLen}
          cellSize={16}
        />
      </div>

      {/* ── Legend ───────────────────────────────────────────── */}
      <div className="mt-4 flex items-center gap-3 text-[0.6rem] text-slate-400/70 dark:text-slate-500/60">
        <span className="font-mono">
          Q (rows) × K (cols) — darker = stronger attention
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-[rgba(var(--brand-rgb),0.5)]" />
          Positive
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-sm bg-slate-400/50" />
          Zero/Masked
        </span>
      </div>
    </StageCard>
  );
}
