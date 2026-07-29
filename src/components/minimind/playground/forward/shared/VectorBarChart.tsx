"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// VectorBarChart — Thin-bar animated bar chart for dense vectors
// ============================================================
//
// Renders numeric data as a strip of thin (w-[3px]) Framer Motion
// animated bars. Each bar grows from height 0 to its computed
// height with a staggered delay. Positive values use the brand
// color; negative values use a neutral slate.
//
// Adapted from EmbeddingVectorView patterns — standalone reusable
// chart without the card chrome, suitable for embedding in panels
// with their own layout.
// ============================================================

// ── Helpers ──────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 0.01) return v.toFixed(4);
  if (abs >= 0.0001) return v.toFixed(6);
  return v.toExponential(2);
}

// ── Types ────────────────────────────────────────────────────

interface VectorBarChartProps {
  /** Numeric data to render as bars */
  data: number[];
  /** Maximum number of bars to display (evenly sampled) */
  maxBars?: number;
  /** CSS color for positive values (default: brand via --brand-rgb) */
  positiveColor?: string;
  /** CSS color for negative values (default: slate-400) */
  negativeColor?: string;
  /** Container height in pixels */
  height?: number;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function VectorBarChart({
  data,
  maxBars = 128,
  positiveColor = "rgba(var(--brand-rgb), 0.8)",
  negativeColor = "rgb(148, 163, 184)",
  height = 120,
  className,
}: VectorBarChartProps) {
  // ── Compute absMax for height scaling ──────────────────────
  const absMax = useMemo(() => {
    let m = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > m) m = abs;
    }
    return m;
  }, [data]);

  // ── Sample evenly if data exceeds maxBars ──────────────────
  const { sampled, step, sampledCount } = useMemo(() => {
    const count = Math.min(data.length, maxBars);
    const s = Math.max(1, Math.floor(data.length / count));
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(data[i * s]);
    }
    return { sampled: out, step: s, sampledCount: count };
  }, [data, maxBars]);

  // ── Empty state ────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height }}
        role="img"
        aria-label="Vector bar chart — no data"
      >
        <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
          No data
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-end gap-px", className)}
      style={{ height }}
      role="img"
      aria-label={`Vector bar chart — ${sampledCount} bars from ${data.length} values`}
    >
      {sampled.map((value, i) => {
        const barHeight =
          absMax === 0
            ? 1
            : Math.max(1, (Math.abs(value) / absMax) * height);
        const color = value >= 0 ? positiveColor : negativeColor;
        const dimIndex = i * step;

        return (
          <motion.div
            key={dimIndex}
            initial={{ height: 0 }}
            animate={{ height: barHeight }}
            transition={{
              delay: i * 0.002,
              duration: 0.25,
              ease: "easeOut",
            }}
            className="w-[3px] min-w-0 origin-bottom rounded-t-[1px]"
            style={{ backgroundColor: color }}
            title={`d[${dimIndex}] = ${formatValue(value)}`}
          />
        );
      })}

    </div>
  );
}
