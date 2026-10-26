"use client";

import { useMemo } from "react";
import { VectorBarChart } from "../forward/shared/VectorBarChart";
import { StageCard } from "../forward/shared/StageCard";

// ============================================================
// ResidualFlow — Residual connection before/after visualization
// ============================================================
//
// Shows how residual connections preserve and transform the
// hidden state. For each residual step (Attention and FFN),
// displays: Input → Sublayer Output → Residual Output.
//
// Props:
//   hiddenStates            — original input [seqLen][dModel]
//   attentionOutput         — attention sublayer output [seqLen][dModel]
//   afterAttentionResidual  — after first residual add [seqLen][dModel]
//   ffnOutput               — FFN sublayer output [seqLen][dModel]
//   afterFFNResidual        — after second residual add (final) [seqLen][dModel]
//   selectedPos             — which token position to inspect
//   tokenLabel              — label for selected token
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface ResidualFlowProps {
  hiddenStates: number[][];
  attentionOutput: number[][];
  afterAttentionResidual: number[][];
  ffnOutput: number[][];
  afterFFNResidual: number[][];
  selectedPos: number;
  tokenLabel: string;
}

// ── Helpers ──────────────────────────────────────────────────

function computeDelta(a: number[], b: number[]): number[] {
  const len = Math.min(a.length, b.length);
  const delta = new Array(len);
  for (let i = 0; i < len; i++) {
    delta[i] = a[i] - b[i];
  }
  return delta;
}

function l2Norm(vec: number[]): number {
  let sum = 0;
  for (const v of vec) sum += v * v;
  return Math.sqrt(sum);
}

// ── Component ────────────────────────────────────────────────

export function ResidualFlow({
  hiddenStates,
  attentionOutput,
  afterAttentionResidual,
  ffnOutput,
  afterFFNResidual,
  selectedPos,
  tokenLabel,
}: ResidualFlowProps) {
  const seqLen = hiddenStates.length;
  const pos = Math.min(selectedPos, Math.max(0, seqLen - 1));

  const input = useMemo(() => hiddenStates[pos] ?? [], [hiddenStates, pos]);
  const attnOut = useMemo(() => attentionOutput[pos] ?? [], [attentionOutput, pos]);
  const afterAttn = useMemo(() => afterAttentionResidual[pos] ?? [], [afterAttentionResidual, pos]);
  const ffnOut = useMemo(() => ffnOutput[pos] ?? [], [ffnOutput, pos]);
  const afterFFN = useMemo(() => afterFFNResidual[pos] ?? [], [afterFFNResidual, pos]);

  // ── Compute deltas ─────────────────────────────────────────
  const attnDelta = useMemo(
    () => computeDelta(afterAttn, input),
    [afterAttn, input]
  );
  const ffnDelta = useMemo(
    () => computeDelta(afterFFN, afterAttn),
    [afterFFN, afterAttn]
  );

  // ── Compute norms ──────────────────────────────────────────
  const norms = useMemo(
    () => ({
      input: l2Norm(input),
      attnOut: l2Norm(attnOut),
      afterAttn: l2Norm(afterAttn),
      ffnOut: l2Norm(ffnOut),
      afterFFN: l2Norm(afterFFN),
      attnDelta: l2Norm(attnDelta),
      ffnDelta: l2Norm(ffnDelta),
    }),
    [input, attnOut, afterAttn, ffnOut, afterFFN, attnDelta, ffnDelta]
  );

  if (seqLen === 0) {
    return (
      <StageCard title="Residual Flow">
        <p className="font-mono text-[0.65rem] text-slate-400 dark:text-slate-500">
          Run the transformer block to see residual flow.
        </p>
      </StageCard>
    );
  }

  return (
    <StageCard title={`Residual Flow — Token &ldquo;${tokenLabel}&rdquo; (pos ${pos})`}>
      {/* ── Norm stat pills ──────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { label: "‖Input‖", value: norms.input },
          { label: "‖Attn Out‖", value: norms.attnOut },
          { label: "‖+Attn Res‖", value: norms.afterAttn },
          { label: "‖FFN Out‖", value: norms.ffnOut },
          { label: "‖+FFN Res‖", value: norms.afterFFN },
        ].map((s) => (
          <span
            key={s.label}
            className="rounded-full border border-brand/10 bg-brand/[0.04] px-3 py-1 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-400"
          >
            {s.label}: {s.value.toFixed(3)}
          </span>
        ))}
      </div>

      {/* ── Flow visualization ───────────────────────────────── */}
      <div className="space-y-4">
        {/* Pre-Norm + Attention → Residual 1 */}
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Residual 1: x → Attention(Norm(x)) → x + Attn(Norm(x))
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                Input x
              </p>
              <VectorBarChart
                data={input.slice(0, 64)}
                maxBars={64}
                height={50}
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                Attention Output
              </p>
              <VectorBarChart
                data={attnOut.slice(0, 64)}
                maxBars={64}
                height={50}
                positiveColor="rgba(236, 72, 153, 0.6)"
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                x + Attn
              </p>
              <VectorBarChart
                data={afterAttn.slice(0, 64)}
                maxBars={64}
                height={50}
                positiveColor="rgba(16, 185, 129, 0.6)"
              />
            </div>
          </div>
        </div>

        {/* Pre-Norm + FFN → Residual 2 */}
        <div>
          <h4 className="mb-2 text-[0.65rem] font-medium text-slate-500/70 dark:text-slate-400/60">
            Residual 2: x → FFN(Norm(x)) → x + FFN(Norm(x))
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="mb-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                After Attn Residual
              </p>
              <VectorBarChart
                data={afterAttn.slice(0, 64)}
                maxBars={64}
                height={50}
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                FFN Output
              </p>
              <VectorBarChart
                data={ffnOut.slice(0, 64)}
                maxBars={64}
                height={50}
                positiveColor="rgba(245, 158, 11, 0.6)"
              />
            </div>
            <div>
              <p className="mb-1 font-mono text-[0.55rem] text-slate-400/60 dark:text-slate-500/50">
                x + FFN (Final)
              </p>
              <VectorBarChart
                data={afterFFN.slice(0, 64)}
                maxBars={64}
                height={50}
                positiveColor="rgba(16, 185, 129, 0.7)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Delta norms ──────────────────────────────────────── */}
      <div className="mt-5 rounded-xl border border-brand/10 bg-brand/[0.02] px-4 py-3 dark:border-white/[0.05] dark:bg-white/[0.01]">
        <h4 className="mb-1.5 text-[0.7rem] font-semibold text-foreground">
          Residual Delta Analysis
        </h4>
        <p className="font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
          ‖Attn Delta‖ = ‖(x+Attn) − x‖ = {norms.attnDelta.toFixed(4)}
          {" / "}
          ‖FFN Delta‖ = ‖(x+FFN) − (x+Attn)‖ = {norms.ffnDelta.toFixed(4)}
          {" / "}
          Total change: ‖Final − Input‖ ={" "}
          {l2Norm(computeDelta(afterFFN, input)).toFixed(4)}.
          Residual connections let gradients flow directly through the
          identity path, preventing vanishing gradients in deep networks.
        </p>
      </div>
    </StageCard>
  );
}
