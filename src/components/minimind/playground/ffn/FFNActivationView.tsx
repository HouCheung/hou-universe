"use client";

import { useMemo } from "react";
import { DistributionChart } from "../forward/shared/DistributionChart";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// FFNActivationView — SiLU activation histogram comparison
// ============================================================
//
// Compares the distribution of Gate projection values before
// and after SiLU activation. Shows histogram side-by-side
// and summary statistics.
//
// Props:
//   gateProjection — raw gate values [seqLen][dFF]
//   gateActivation — SiLU-activated gate values [seqLen][dFF]
//   gatedHidden    — gate ⊙ up result [seqLen][dFF]
//   output         — final FFN output [seqLen][dModel]
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface FFNActivationViewProps {
  gateProjection: number[][];
  gateActivation: number[][];
  gatedHidden: number[][];
  output: number[][];
}

// ── Helpers ──────────────────────────────────────────────────

function flatten(matrix: number[][]): number[] {
  const flat: number[] = [];
  for (const row of matrix) {
    for (const v of row) flat.push(v);
  }
  return flat;
}

function computeStats(data: number[]): {
  mean: number;
  std: number;
  activeRatio: number;
} {
  if (data.length === 0) return { mean: 0, std: 0, activeRatio: 0 };
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;

  let sumSq = 0;
  for (const v of data) sumSq += (v - mean) ** 2;
  const std = Math.sqrt(sumSq / data.length);

  let active = 0;
  for (const v of data) {
    if (v > 0.001) active++;
  }
  return { mean, std, activeRatio: active / data.length };
}

// ── Component ────────────────────────────────────────────────

export function FFNActivationView({
  gateProjection,
  gateActivation,
  gatedHidden,
  output,
}: FFNActivationViewProps) {
  const rawFlat = useMemo(() => flatten(gateProjection), [gateProjection]);
  const actFlat = useMemo(() => flatten(gateActivation), [gateActivation]);
  const gatedFlat = useMemo(() => flatten(gatedHidden), [gatedHidden]);
  const outputFlat = useMemo(() => flatten(output), [output]);

  const rawStats = useMemo(() => computeStats(rawFlat), [rawFlat]);
  const actStats = useMemo(() => computeStats(actFlat), [actFlat]);
  const gatedStats = useMemo(() => computeStats(gatedFlat), [gatedFlat]);
  const outStats = useMemo(() => computeStats(outputFlat), [outputFlat]);

  if (rawFlat.length === 0) {
    return (
      <StageCard title="Activation Analysis">
        <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          Run FFN forward to see activation statistics.
        </p>
      </StageCard>
    );
  }

  return (
    <StageCard title="Activation Analysis — SwiGLU Pipeline">
      {/* ── 4-stage distribution ─────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Gate Proj (raw) */}
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            1. Gate Proj (raw)
          </h4>
          <DistributionChart
            data={rawFlat.slice(0, 4096)}
            bins={30}
            height={60}
          />
          <div className="mt-1.5 space-y-0.5 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            <p>μ={rawStats.mean.toFixed(3)}</p>
            <p>σ={rawStats.std.toFixed(3)}</p>
          </div>
        </div>

        {/* Gate Act (SiLU) */}
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            2. SiLU(gate)
          </h4>
          <DistributionChart
            data={actFlat.slice(0, 4096)}
            bins={30}
            height={60}
            barColor="rgba(16, 185, 129, 0.5)"
          />
          <div className="mt-1.5 space-y-0.5 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            <p>μ={actStats.mean.toFixed(3)}</p>
            <p>active: {(actStats.activeRatio * 100).toFixed(0)}%</p>
          </div>
        </div>

        {/* Gated (gate ⊙ up) */}
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            3. Gate ⊙ Up
          </h4>
          <DistributionChart
            data={gatedFlat.slice(0, 4096)}
            bins={30}
            height={60}
            barColor="rgba(245, 158, 11, 0.5)"
          />
          <div className="mt-1.5 space-y-0.5 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            <p>μ={gatedStats.mean.toFixed(3)}</p>
            <p>σ={gatedStats.std.toFixed(3)}</p>
          </div>
        </div>

        {/* Output (down proj) */}
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            4. Output (Down)
          </h4>
          <DistributionChart
            data={outputFlat.slice(0, 4096)}
            bins={30}
            height={60}
            barColor="rgba(99, 102, 241, 0.5)"
          />
          <div className="mt-1.5 space-y-0.5 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            <p>μ={outStats.mean.toFixed(3)}</p>
            <p>σ={outStats.std.toFixed(3)}</p>
          </div>
        </div>
      </div>

      {/* ── Explanation ──────────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.01]">
        <h4 className="mb-1.5 text-[0.7rem] font-semibold text-foreground">
          SwiGLU Flow
        </h4>
        <p className="font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          <strong>Gate Proj</strong> (W_gate · x) →{" "}
          <strong>SiLU</strong> (x·σ(x), range ≈ [-0.28, +∞)) →{" "}
          <strong>⊙ Up</strong> (element-wise gate × up, selective information) →{" "}
          <strong>Down Proj</strong> (W_down · gated, compress back to dModel).
          SiLU suppresses negative gate values near 0, creating sparse activations.
        </p>
      </div>
    </StageCard>
  );
}
