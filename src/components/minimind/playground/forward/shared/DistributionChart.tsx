"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ============================================================
// DistributionChart — Histogram visualization with animated bars
// ============================================================
//
// Computes a histogram from numeric data: divides the range
// [min, max] into equal-width bins, counts values in each bin,
// and renders Framer Motion bars that grow from height 0 with
// staggered delays. Supports empty-state placeholder and
// configurable bin count, color, and height.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface DistributionChartProps {
  /** Numeric data to histogram */
  data: number[];
  /** Number of histogram bins */
  bins?: number;
  /** CSS color for bars (default: brand via --brand-rgb) */
  barColor?: string;
  /** Container height in pixels */
  height?: number;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function DistributionChart({
  data,
  bins = 30,
  barColor = "rgba(var(--brand-rgb), 0.6)",
  height = 140,
  className,
}: DistributionChartProps) {
  // ── Compute histogram ──────────────────────────────────────
  const histogram = useMemo(() => {
    if (data.length === 0) return { bins: [] as number[], maxCount: 0 };

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      if (val < min) min = val;
      if (val > max) max = val;
    }

    const range = max - min || 1; // avoid zero-width range
    const binWidth = range / bins;
    const counts = new Array(bins).fill(0);

    for (let i = 0; i < data.length; i++) {
      const idx = Math.min(bins - 1, Math.floor((data[i] - min) / binWidth));
      counts[idx]++;
    }

    let maxCount = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > maxCount) maxCount = counts[i];
    }

    return { bins: counts, maxCount };
  }, [data, bins]);

  // ── Empty state ────────────────────────────────────────────
  if (data.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height }}
        role="img"
        aria-label="Distribution chart — no data"
      >
        <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
          No data
        </span>
      </div>
    );
  }

  const { bins: binCounts, maxCount } = histogram;

  return (
    <div
      className={cn("flex items-end gap-px", className)}
      style={{ height }}
      role="img"
      aria-label={`Distribution chart — ${bins} bins, ${data.length} values, range [${Math.min(...data).toFixed(2)}, ${Math.max(...data).toFixed(2)}]`}
    >
      {binCounts.map((count, i) => {
        const barHeight =
          maxCount === 0
            ? 1
            : Math.max(1, (count / maxCount) * height);

        return (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: barHeight }}
            transition={{
              delay: i * 0.01,
              duration: 0.3,
              ease: "easeOut",
            }}
            className="flex-1 min-w-0 rounded-t-sm"
            style={{
              backgroundColor: barColor,
              minHeight: count > 0 ? 1 : 0,
            }}
          />
        );
      })}
    </div>
  );
}
