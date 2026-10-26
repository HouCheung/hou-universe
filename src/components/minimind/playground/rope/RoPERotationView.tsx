"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import type { RotationTrace } from "@/lib/minimind/rope";
import { StageCard } from "../forward/shared/StageCard";
import { cn } from "@/lib/utils";

// ============================================================
// RoPERotationView — 2D Rotation pair visualization
// ============================================================
//
// Shows each dimension pair's rotation as:
//   - A before/after vector table
//   - A 2D rotation diagram (via SVG)
//   - The angle and frequency for each pair
// ============================================================

interface RoPERotationViewProps {
  traces: RotationTrace[];
  position: number;
}

// ── 2D Rotation SVG sub-component ─────────────────────────

function RotationPairSVG({
  trace,
  size = 120,
}: {
  trace: RotationTrace;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const maxVal = Math.max(
    Math.abs(trace.before[0]),
    Math.abs(trace.before[1]),
    Math.abs(trace.after[0]),
    Math.abs(trace.after[1]),
    0.1
  );
  const scale = (size / 2 - 12) / maxVal;

  const bx = cx + trace.before[0] * scale;
  const by = cy - trace.before[1] * scale;
  const ax = cx + trace.after[0] * scale;
  const ay = cy - trace.after[1] * scale;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="size-full"
      aria-label={`2D rotation for dim pair ${trace.dimPairIndex}`}
    >
      {/* Axes */}
      <line
        x1={cx}
        y1={0}
        x2={cx}
        y2={size}
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={0.5}
      />
      <line
        x1={0}
        y1={cy}
        x2={size}
        y2={cy}
        stroke="currentColor"
        strokeOpacity={0.1}
        strokeWidth={0.5}
      />

      {/* Before vector */}
      <line
        x1={cx}
        y1={cy}
        x2={bx}
        y2={by}
        stroke="rgb(148, 163, 184)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={bx} cy={by} r={3} fill="rgb(148, 163, 184)" />

      {/* After vector */}
      <line
        x1={cx}
        y1={cy}
        x2={ax}
        y2={ay}
        stroke="rgba(var(--brand-rgb), 0.8)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <circle cx={ax} cy={ay} r={3} fill="rgba(var(--brand-rgb), 1)" />

      {/* Rotation arc */}
      {trace.angle !== 0 && (
        <path
          d={describeArc(cx, cy, 15, trace.before, trace.after)}
          fill="none"
          stroke="rgba(var(--brand-rgb), 0.3)"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
    </svg>
  );
}

function describeArc(
  cx: number,
  cy: number,
  radius: number,
  before: [number, number],
  after: [number, number]
): string {
  const angleBefore = Math.atan2(before[1], before[0]);
  const angleAfter = Math.atan2(after[1], after[0]);

  const x1 = cx + radius * Math.cos(angleBefore);
  const y1 = cy - radius * Math.sin(angleBefore);
  const x2 = cx + radius * Math.cos(angleAfter);
  const y2 = cy - radius * Math.sin(angleAfter);

  const largeArc = Math.abs(angleAfter - angleBefore) > Math.PI ? 1 : 0;
  const sweep = angleAfter > angleBefore ? 1 : 0;

  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}

// ── Main Component ────────────────────────────────────────

export function RoPERotationView({ traces, position }: RoPERotationViewProps) {
  const [showAll, setShowAll] = useState(false);
  const DISPLAY_COUNT = 6;

  const displayedTraces = useMemo(
    () => (showAll ? traces : traces.slice(0, DISPLAY_COUNT)),
    [traces, showAll]
  );

  return (
    <StageCard
      title={`2D Rotation Details — Position ${position} (${traces.length} pairs)`}
    >
      <p className="mb-4 font-mono text-[0.6rem] leading-relaxed text-slate-400/80 dark:text-slate-500/70">
        Each consecutive dimension pair (2i, 2i+1) rotates by angle = position ×
        freq_i. The vector norm stays exactly the same — RoPE is an orthogonal
        transformation.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayedTraces.map((trace) => (
          <motion.div
            key={trace.dimPairIndex}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: trace.dimPairIndex * 0.03, duration: 0.2 }}
            className={cn(
              "rounded-xl border border-brand/10 bg-brand/[0.02] p-3",
              "dark:border-white/[0.06] dark:bg-white/[0.01]"
            )}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[0.6rem] font-medium text-slate-500/70 dark:text-slate-400/60">
                Pair {trace.dimPairIndex}
              </span>
              <span className="font-mono text-[0.55rem] tabular-nums text-slate-400/60 dark:text-slate-500/50">
                d[{trace.evenDim},{trace.oddDim}]
              </span>
            </div>

            {/* 2D rotation SVG */}
            <div className="mb-2 flex justify-center">
              <RotationPairSVG trace={trace} size={100} />
            </div>

            {/* Values */}
            <div className="space-y-1 font-mono text-[0.55rem]">
              <div className="flex justify-between">
                <span className="text-slate-400/70 dark:text-slate-500/60">
                  Before:
                </span>
                <span className="tabular-nums text-slate-500/80 dark:text-slate-400/70">
                  ({trace.before[0].toFixed(4)}, {trace.before[1].toFixed(4)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand/70 dark:text-brand-light/70">
                  After:
                </span>
                <span className="tabular-nums text-brand/80 dark:text-brand-light/80">
                  ({trace.after[0].toFixed(4)}, {trace.after[1].toFixed(4)})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400/70 dark:text-slate-500/60">
                  θ:
                </span>
                <span className="tabular-nums text-slate-500/80 dark:text-slate-400/70">
                  {trace.angle.toFixed(4)} rad
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400/70 dark:text-slate-500/60">
                  freq:
                </span>
                <span className="tabular-nums text-slate-500/80 dark:text-slate-400/70">
                  {trace.frequency.toExponential(2)}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {traces.length > DISPLAY_COUNT && (
        <button
          onClick={() => setShowAll(!showAll)}
          className={cn(
            "mt-3 w-full rounded-lg border border-brand/10 px-3 py-2 text-center font-mono text-[0.65rem]",
            "text-brand/70 transition-colors hover:border-brand/30 hover:text-brand",
            "dark:border-white/[0.06] dark:text-brand/60 dark:hover:text-brand/80"
          )}
        >
          {showAll
            ? `Show fewer pairs`
            : `Show all ${traces.length} pairs`}
        </button>
      )}
    </StageCard>
  );
}
