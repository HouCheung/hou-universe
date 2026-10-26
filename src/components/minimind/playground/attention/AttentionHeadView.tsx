"use client";

import { useMemo } from "react";
import { VectorBarChart } from "../forward/shared/VectorBarChart";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// AttentionHeadView — Single-head Q/K/V detail + pattern
// ============================================================
//
// Renders Q/K/V vector bar charts for a single head and
// summarizes its attention pattern (per-query distribution).
//
// Props:
//   qHead        — Q vectors for this head [seqLen][headDim]
//   kHead        — K vectors for this head [seqLen][headDim]
//   vHead        — V vectors for this head [seqLen][headDim]
//   weights      — attentionWeights[head][seqLen][seqLen]
//   tokens       — token strings for labels
//   headIndex    — which head
//   selectedPos  — which query position to inspect (0-indexed)
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface AttentionHeadViewProps {
  qHead: number[][];
  kHead: number[][];
  vHead: number[][];
  weights: number[][];
  tokens: string[];
  headIndex: number;
  selectedPos: number;
}

// ── Component ────────────────────────────────────────────────

export function AttentionHeadView({
  qHead,
  kHead,
  vHead,
  weights,
  tokens,
  headIndex,
  selectedPos,
}: AttentionHeadViewProps) {
  const seqLen = tokens.length;

  // ── Safely clamp selectedPos ───────────────────────────────
  const pos = Math.min(selectedPos, seqLen - 1);

  const qVector = qHead[pos] ?? [];
  const kVector = kHead[pos] ?? [];
  const vVector = vHead[pos] ?? [];

  // ── Attention pattern for this query position ──────────────
  const queryAttention = useMemo(() => weights[pos] ?? [], [weights, pos]);

  // ── Top attended tokens ────────────────────────────────────
  const topAttended = useMemo(() => {
    if (!queryAttention.length) return [];
    return queryAttention
      .map((w, i) => ({ weight: w, index: i, token: tokens[i] ?? `[${i}]` }))
      .filter((x) => x.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);
  }, [queryAttention, tokens]);

  const tokenLabel = tokens[pos] ?? `[${pos}]`;

  if (seqLen === 0) {
    return (
      <StageCard title={`Head ${headIndex} Detail`}>
        <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          Enter text above to see per-head details.
        </p>
      </StageCard>
    );
  }

  return (
    <StageCard title={`Head ${headIndex} — Token &ldquo;${tokenLabel}&rdquo; (pos ${pos})`}>
      {/* ── Q / K / V vectors ────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Q Vector (Query)
          </h4>
          <VectorBarChart
            data={qVector}
            maxBars={64}
            height={60}
          />
          <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            dim={qVector.length}
          </p>
        </div>
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            K Vector (Key)
          </h4>
          <VectorBarChart
            data={kVector}
            maxBars={64}
            height={60}
            positiveColor="rgba(236, 72, 153, 0.6)"
          />
          <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            dim={kVector.length}
          </p>
        </div>
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            V Vector (Value)
          </h4>
          <VectorBarChart
            data={vVector}
            maxBars={64}
            height={60}
            positiveColor="rgba(16, 185, 129, 0.6)"
          />
          <p className="mt-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
            dim={vVector.length}
          </p>
        </div>
      </div>

      {/* ── Attention pattern for this query ─────────────────── */}
      <div className="mt-5">
        <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
          Attention Pattern — where does &ldquo;{tokenLabel}&rdquo; attend?
        </h4>

        {/* Bar chart of attention weights */}
        <div className="flex items-end gap-px" style={{ height: 48 }}>
          {queryAttention.map((w, i) => {
            const h = Math.max(1, w * 48);
            return (
              <div
                key={i}
                className="flex-1 min-w-0 rounded-t-sm"
                style={{
                  height: h,
                  backgroundColor:
                    i === pos
                      ? "rgba(236, 72, 153, 0.6)"
                      : `rgba(var(--brand-rgb), ${Math.max(0.1, w * 2).toFixed(2)})`,
                }}
                title={`${tokens[i] ?? `[${i}]`}: ${w.toFixed(4)}`}
              />
            );
          })}
        </div>

        {/* X-axis labels */}
        <div className="mt-1 flex">
          {tokens.map((token, i) => (
            <div
              key={i}
              className="flex-1 overflow-hidden text-center"
              title={token}
            >
              <span className="font-mono text-[0.5rem] text-slate-400/60 dark:text-slate-500/50">
                {token.slice(0, 3)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Top-5 attended tokens ────────────────────────────── */}
      <div className="mt-4">
        <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
          Top Attended Tokens
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {topAttended.map((x) => (
            <span
              key={x.index}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.04] px-2.5 py-1 dark:border-white/[0.06] dark:bg-white/[0.02]"
            >
              <span className="font-mono text-[0.6rem] text-foreground">
                {x.token}
              </span>
              <span className="font-mono text-[0.55rem] text-brand/70 dark:text-brand-light/70">
                {x.weight.toFixed(4)}
              </span>
            </span>
          ))}
        </div>
      </div>
    </StageCard>
  );
}
