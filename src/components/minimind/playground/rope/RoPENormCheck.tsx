"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { StageCard } from "../forward/shared/StageCard";
import { StatRow } from "../forward/shared/StatRow";

// ============================================================
// RoPENormCheck — Norm invariance verification display
// ============================================================
//
// Shows the core RoPE property: ||x|| = ||RoPE(x)||
// (vector L2 norm is preserved under rotation).
// ============================================================

interface RoPENormCheckProps {
  normBefore: number;
  normAfter: number;
  normDelta: number;
  normPreserved: boolean;
}

export function RoPENormCheck({
  normBefore,
  normAfter,
  normDelta,
  normPreserved,
}: RoPENormCheckProps) {
  const tolerance = 1e-10;

  return (
    <StageCard title="Norm Invariance Check">
      <p className="mb-4 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
        RoPE rotates vectors in 2D planes — an orthogonal transformation that
        preserves the vector&apos;s L2 norm. This property ensures that position
        encoding doesn&apos;t change the semantic magnitude of token
        representations.
      </p>

      {/* Norm comparison */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.01]">
          <p className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
            ||x|| (Before RoPE)
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
            {normBefore.toFixed(6)}
          </p>
        </div>
        <div className="rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.06] dark:bg-white/[0.01]">
          <p className="text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
            ||RoPE(x)|| (After RoPE)
          </p>
          <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
            {normAfter.toFixed(6)}
          </p>
        </div>
      </div>

      {/* Verdict */}
      <div className="flex flex-wrap items-center gap-3">
        {normPreserved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5 text-[0.65rem] font-medium text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Norm Preserved ✓
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/[0.06] px-3 py-1.5 text-[0.65rem] font-medium text-red-600 dark:border-red-400/20 dark:bg-red-400/[0.06] dark:text-red-400">
            <XCircle className="size-3.5" />
            Norm Changed ✗
          </span>
        )}
      </div>

      <div className="mt-3">
        <StatRow
          items={[
            { label: "Δ Norm", value: normDelta },
            {
              label: "Tolerance",
              value: `${tolerance}`,
            },
            {
              label: "Formula",
              value: "||x|| = ||rotate(x, pos)||",
            },
          ]}
        />
      </div>

      <p className="mt-3 font-mono text-[0.55rem] leading-relaxed text-slate-400/60 dark:text-slate-500/50">
        The norm delta of {normDelta.toExponential(2)} is due to floating-point
        rounding. Values below {tolerance} confirm the rotation is orthogonal.
      </p>
    </StageCard>
  );
}
