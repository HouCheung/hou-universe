"use client";

import { useMemo } from "react";
import { DistributionChart } from "../forward/shared/DistributionChart";
import { VectorBarChart } from "../forward/shared/VectorBarChart";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// FFNGateView — Gate projection distribution + detail
// ============================================================
//
// Renders the Gate projection output distribution (histogram)
// and a sampled vector bar chart of gate values.
//
// Props:
//   gateProjection — gate projection values [seqLen][dFF]
//   gateActivation — SiLU-activated gate values [seqLen][dFF]
//   selectedToken  — which token position to inspect
//   tokenLabel     — label for the selected token
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface FFNGateViewProps {
  gateProjection: number[][];
  gateActivation: number[][];
  selectedToken: number;
  tokenLabel: string;
}

// ── Component ────────────────────────────────────────────────

export function FFNGateView({
  gateProjection,
  gateActivation,
  selectedToken,
  tokenLabel,
}: FFNGateViewProps) {
  const seqLen = gateProjection.length;
  const pos = Math.min(selectedToken, Math.max(0, seqLen - 1));

  const rawGate = useMemo(() => gateProjection[pos] ?? [], [gateProjection, pos]);
  const activatedGate = useMemo(() => gateActivation[pos] ?? [], [gateActivation, pos]);

  // ── Flatten for distribution ───────────────────────────────
  const rawFlat = useMemo(() => {
    const flat: number[] = [];
    for (const row of gateProjection) {
      for (const v of row) flat.push(v);
    }
    return flat;
  }, [gateProjection]);

  const activatedFlat = useMemo(() => {
    const flat: number[] = [];
    for (const row of gateActivation) {
      for (const v of row) flat.push(v);
    }
    return flat;
  }, [gateActivation]);

  // ── Stats ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    let activeCount = 0;
    let suppressedCount = 0;
    for (const v of activatedGate) {
      if (v > 0.1) activeCount++;
      else if (v < 0.01) suppressedCount++;
    }
    return {
      total: activatedGate.length,
      active: activeCount,
      suppressed: suppressedCount,
    };
  }, [activatedGate]);

  if (seqLen === 0) {
    return (
      <StageCard title="Gate Projection">
        <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          Run FFN forward to see gate projection data.
        </p>
      </StageCard>
    );
  }

  return (
    <StageCard title={`Gate Projection — Token &ldquo;${tokenLabel}&rdquo; (pos ${pos})`}>
      {/* ── Stats pills ──────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400">
          dFF: {activatedGate.length}
        </span>
        <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-1 font-mono text-[0.6rem] text-emerald-600/70 dark:text-emerald-400/70">
          Active: {stats.active}
        </span>
        <span className="rounded-full border border-slate-500/15 bg-slate-500/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500/70 dark:border-white/[0.06] dark:text-slate-400/60">
          Suppressed: {stats.suppressed}
        </span>
      </div>

      {/* ── Distribution comparison ──────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Gate Proj (raw, before SiLU)
          </h4>
          <DistributionChart
            data={rawFlat}
            bins={40}
            height={80}
          />
          <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            Range: [{rawFlat.length > 0 ? Math.min(...rawFlat).toFixed(2) : "—"},{" "}
            {rawFlat.length > 0 ? Math.max(...rawFlat).toFixed(2) : "—"}]
          </p>
        </div>
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Gate Act (after SiLU)
          </h4>
          <DistributionChart
            data={activatedFlat}
            bins={40}
            height={80}
            barColor="rgba(16, 185, 129, 0.5)"
          />
          <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            SiLU: x · σ(x). Range ≈ [-0.278, +∞). Most suppressed → 0.
          </p>
        </div>
      </div>

      {/* ── Sampled gate values for selected token ────────────── */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Raw Gate Values (first 128 dims)
          </h4>
          <VectorBarChart
            data={rawGate.slice(0, 128)}
            maxBars={128}
            height={60}
          />
        </div>
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Activated Gate (SiLU, first 128 dims)
          </h4>
          <VectorBarChart
            data={activatedGate.slice(0, 128)}
            maxBars={128}
            height={60}
            positiveColor="rgba(16, 185, 129, 0.6)"
          />
        </div>
      </div>
    </StageCard>
  );
}
