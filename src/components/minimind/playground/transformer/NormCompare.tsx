"use client";

import { useMemo } from "react";
import { VectorBarChart } from "../forward/shared/VectorBarChart";
import { DistributionChart } from "../forward/shared/DistributionChart";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// NormCompare — RMSNorm before/after comparison
// ============================================================
//
// Shows the effect of RMSNorm on the hidden state distribution:
// before normalization vs after normalization.
//
// Props:
//   beforeNorm  — hidden states before RMSNorm [seqLen][dModel]
//   afterNorm   — hidden states after RMSNorm [seqLen][dModel]
//   normLabel   — label describing this norm instance
//   selectedPos — which token position to inspect
//   tokenLabel  — label for selected token
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface NormCompareProps {
  beforeNorm: number[][];
  afterNorm: number[][];
  normLabel: string;
  selectedPos: number;
  tokenLabel: string;
}

// ── Helpers ──────────────────────────────────────────────────

function flatten(matrix: number[][]): number[] {
  const flat: number[] = [];
  for (const row of matrix) {
    for (const v of row) flat.push(v);
  }
  return flat;
}

function computeStats(data: number[]): { mean: number; std: number; min: number; max: number } {
  if (data.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };
  let sum = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    sum += v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const mean = sum / data.length;
  let sumSq = 0;
  for (const v of data) sumSq += (v - mean) ** 2;
  return { mean, std: Math.sqrt(sumSq / data.length), min: lo, max: hi };
}

// ── Component ────────────────────────────────────────────────

export function NormCompare({
  beforeNorm,
  afterNorm,
  normLabel,
  selectedPos,
  tokenLabel,
}: NormCompareProps) {
  const seqLen = beforeNorm.length;
  const pos = Math.min(selectedPos, Math.max(0, seqLen - 1));

  const beforeVec = beforeNorm[pos] ?? [];
  const afterVec = afterNorm[pos] ?? [];

  // ── Flat distributions ─────────────────────────────────────
  const beforeFlat = useMemo(() => flatten(beforeNorm), [beforeNorm]);
  const afterFlat = useMemo(() => flatten(afterNorm), [afterNorm]);

  const beforeStats = useMemo(() => computeStats(beforeFlat), [beforeFlat]);
  const afterStats = useMemo(() => computeStats(afterFlat), [afterFlat]);

  if (seqLen === 0) {
    return (
      <StageCard title={`RMSNorm — ${normLabel}`}>
        <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          Run transformer block to see normalization effect.
        </p>
      </StageCard>
    );
  }

  return (
    <StageCard title={`RMSNorm — ${normLabel} (pos ${pos}, &ldquo;${tokenLabel}&rdquo;)`}>
      {/* ── Stats comparison ─────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        {[
          { label: "μ", before: beforeStats.mean, after: afterStats.mean },
          { label: "σ", before: beforeStats.std, after: afterStats.std },
          { label: "Min", before: beforeStats.min, after: afterStats.min },
          { label: "Max", before: beforeStats.max, after: afterStats.max },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-brand/10 bg-brand/[0.02] px-3 py-2 text-center dark:border-white/[0.05] dark:bg-white/[0.01]"
          >
            <p className="font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
              {s.label}
            </p>
            <p className="font-mono text-[0.65rem] tabular-nums text-foreground">
              {s.before.toFixed(3)}
            </p>
            <p className="font-mono text-[0.6rem] tabular-nums text-brand/70 dark:text-brand-light/70">
              → {s.after.toFixed(3)}
            </p>
          </div>
        ))}
      </div>

      {/* ── Distribution comparison ──────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Before RMSNorm
          </h4>
          <DistributionChart
            data={beforeFlat.slice(0, 4096)}
            bins={40}
            height={80}
          />
        </div>
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            After RMSNorm
          </h4>
          <DistributionChart
            data={afterFlat.slice(0, 4096)}
            bins={40}
            height={80}
            barColor="rgba(16, 185, 129, 0.5)"
          />
        </div>
      </div>

      {/* ── Vector comparison for selected token ─────────────── */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Before (first 128 dims)
          </h4>
          <VectorBarChart
            data={beforeVec.slice(0, 128)}
            maxBars={128}
            height={60}
          />
        </div>
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            After (first 128 dims)
          </h4>
          <VectorBarChart
            data={afterVec.slice(0, 128)}
            maxBars={128}
            height={60}
            positiveColor="rgba(16, 185, 129, 0.6)"
          />
        </div>
      </div>

      {/* ── Explanation ──────────────────────────────────────── */}
      <div className="mt-4 rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.01]">
        <p className="font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          RMSNorm(x) = x / RMS(x) · γ, where RMS(x) = √(mean(x²) + ε).
          After normalization: μ ≈ 0, σ ≈ 1. This stabilizes training
          by preventing internal covariate shift across layers.
        </p>
      </div>
    </StageCard>
  );
}
