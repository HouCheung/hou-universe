"use client";

import { useMemo } from "react";
import { motion, type Variants } from "framer-motion";
import { BarChart3 } from "lucide-react";
import type { EmbeddingVector } from "@/lib/minimind/embedding";

// ============================================================
// EmbeddingVectorView — Single token's dense vector visualization
// ============================================================
//
// Displays every dimension value of an embedding vector in a
// compact strip chart so users can see the distribution of values
// that encodes a token's semantic meaning.
//
// Design: each dimension rendered as a thin vertical bar whose
// height and color encode the value (positive = warm, negative = cool).
// This is deliberately NOT a bar chart library — we want raw
// geometric rendering to keep the "educational" feel.
// ============================================================

// ── Animation ────────────────────────────────────────────────

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.0008, delayChildren: 0.05 },
  },
};

const barVariants: Variants = {
  hidden: { scaleY: 0, opacity: 0 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: { duration: 0.25, ease: "easeOut" },
  },
};

// ── Helpers ──────────────────────────────────────────────────

/** Map a value in [-maxAbs, +maxAbs] to a percentage height (0–100) */
function valueToHeightPercent(value: number, maxAbs: number): number {
  if (maxAbs === 0) return 50;
  return Math.round((Math.abs(value) / maxAbs) * 100);
}

/** Map a value to a color — warm (brand) for positive, cool (slate) for negative */
function valueToColor(value: number, maxAbs: number): string {
  if (maxAbs === 0) return "rgb(var(--brand-rgb) / 0.3)";
  const intensity = Math.abs(value) / maxAbs;
  if (value >= 0) {
    // Warm: brand color, opacity proportional to intensity
    return `rgb(var(--brand-rgb) / ${(0.25 + intensity * 0.7).toFixed(2)})`;
  }
  // Cool: slate/blue-gray
  return `rgb(100 116 139 / ${(0.25 + intensity * 0.65).toFixed(2)})`;
}

/** Format a float for the tooltip / label — show 4 significant digits */
function formatValue(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 0.01) return v.toFixed(4);
  if (abs >= 0.0001) return v.toFixed(6);
  return v.toExponential(2);
}

// ── Component ────────────────────────────────────────────────

interface EmbeddingVectorViewProps {
  /** The embedding vector to display */
  vector: EmbeddingVector;
  /** Token ID this vector belongs to (for labeling) */
  tokenId: number;
}

export function EmbeddingVectorView({
  vector,
  tokenId,
}: EmbeddingVectorViewProps) {
  const maxAbs = useMemo(() => {
    let m = 0;
    for (let i = 0; i < vector.length; i++) {
      const abs = Math.abs(vector[i]);
      if (abs > m) m = abs;
    }
    return m;
  }, [vector]);

  const stats = useMemo(() => {
    if (vector.length === 0) return { min: 0, max: 0, mean: 0 };
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = 0; i < vector.length; i++) {
      const v = vector[i];
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v;
    }
    return { min, max, mean: sum / vector.length };
  }, [vector]);

  // How many bars to show — cap at 256 for performance / readability
  const displayDim = Math.min(vector.length, 256);
  const step = Math.max(1, Math.floor(vector.length / displayDim));

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <BarChart3 className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Embedding Vector
        </span>
        <span className="ml-auto font-mono text-[0.55rem] text-slate-500/60 dark:text-slate-500/50">
          Token #{tokenId} · {vector.length}d
        </span>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 border-b border-brand/[0.04] px-5 py-2.5 dark:border-white/[0.03]">
        {[
          { label: "Min", value: formatValue(stats.min) },
          { label: "Max", value: formatValue(stats.max) },
          { label: "Mean", value: formatValue(stats.mean) },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="font-mono text-[0.55rem] text-slate-500/60 dark:text-slate-500/50">
              {s.label}
            </span>
            <span className="font-mono text-[0.6rem] font-semibold text-slate-700 dark:text-slate-300">
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="flex items-end gap-px px-5 py-4"
        style={{ height: 100 }}
        role="img"
        aria-label={`Embedding vector visualization for token ${tokenId}`}
      >
        {Array.from({ length: displayDim }, (_, i) => {
          const dimIndex = i * step;
          const value = vector[dimIndex];
          const heightPct = valueToHeightPercent(value, maxAbs);
          const color = valueToColor(value, maxAbs);

          return (
            <motion.div
              key={dimIndex}
              variants={barVariants}
              className="flex-1 min-w-0 origin-bottom rounded-t-[1px]"
              style={{
                height: `${Math.max(heightPct, 1)}%`,
                backgroundColor: color,
                marginBottom: heightPct === 0 ? 0 : undefined,
              }}
              title={`d[${dimIndex}] = ${formatValue(value)}`}
            />
          );
        })}
      </motion.div>

      {/* Axis labels */}
      <div className="flex justify-between px-5 pb-3">
        <span className="font-mono text-[0.5rem] text-slate-500/50 dark:text-slate-500/50">
          d₀
        </span>
        <span className="font-mono text-[0.5rem] text-slate-500/50 dark:text-slate-500/50">
          d<sub>{Math.min(displayDim * step, vector.length - 1)}</sub>
        </span>
      </div>
    </div>
  );
}
