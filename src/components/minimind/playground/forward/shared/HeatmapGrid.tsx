"use client";

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";

// ============================================================
// HeatmapGrid — Color-intensity grid with hover tooltips
// ============================================================
//
// Renders a 2D numeric array as a CSS Grid of colored cells.
// Positive values use the brand blue color ramp; negative
// values use a slate ramp. Intensity (alpha) scales with the
// absolute value relative to the global absMax. Hovering a
// cell reveals a tooltip with [row, col] coordinates and
// the raw value.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface HeatmapGridProps {
  /** 2D numeric data: data[row][col] */
  data: number[][];
  /** Number of rows (derived from data.length if omitted) */
  rows?: number;
  /** Number of columns (derived from data[0].length if omitted) */
  cols?: number;
  /** Cell size in pixels (square) */
  cellSize?: number;
  className?: string;
}

interface TooltipState {
  row: number;
  col: number;
  value: number;
  x: number;
  y: number;
}

// ── Helpers ──────────────────────────────────────────────────

function formatValue(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 0.01) return v.toFixed(4);
  if (abs >= 0.0001) return v.toFixed(6);
  return v.toExponential(2);
}

// ── Component ────────────────────────────────────────────────

export function HeatmapGrid({
  data,
  rows,
  cols,
  cellSize = 16,
  className,
}: HeatmapGridProps) {
  const rowCount = rows ?? data.length;
  const colCount = cols ?? (data[0]?.length ?? 0);

  // ── Compute absMax for intensity normalization ─────────────
  const absMax = useMemo(() => {
    let m = 0;
    for (let r = 0; r < Math.min(rowCount, data.length); r++) {
      const row = data[r];
      if (!row) continue;
      for (let c = 0; c < Math.min(colCount, row.length); c++) {
        const abs = Math.abs(row[c]);
        if (abs > m) m = abs;
      }
    }
    return m;
  }, [data, rowCount, colCount]);

  // ── Tooltip state ──────────────────────────────────────────
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, row: number, col: number, value: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        row,
        col,
        value,
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
      });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // ── Empty state ────────────────────────────────────────────
  if (data.length === 0 || rowCount === 0 || colCount === 0) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ minHeight: 60 }}
        role="img"
        aria-label="Heatmap grid — no data"
      >
        <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
          No data
        </span>
      </div>
    );
  }

  return (
    <div className={cn("relative inline-block", className)}>
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: `repeat(${colCount}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${rowCount}, ${cellSize}px)`,
        }}
        role="img"
        aria-label={`Heatmap grid — ${rowCount} rows × ${colCount} columns`}
      >
        {Array.from({ length: rowCount }, (_, r) =>
          Array.from({ length: colCount }, (_, c) => {
            const value = data[r]?.[c] ?? 0;
            const alpha =
              absMax === 0 ? 0 : Math.abs(value) / absMax;

            const backgroundColor =
              value >= 0
                ? `rgba(var(--brand-rgb), ${alpha.toFixed(2)})`
                : `rgba(148, 163, 184, ${alpha.toFixed(2)})`;

            return (
              <div
                key={`${r}-${c}`}
                className="cursor-crosshair transition-[outline]"
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor,
                }}
                onMouseEnter={(e) => handleMouseEnter(e, r, c, value)}
                onMouseLeave={handleMouseLeave}
              />
            );
          })
        )}
      </div>

      {/* ── Hover tooltip ────────────────────────────────────── */}
      {tooltip && (
        <div
          className={cn(
            "pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full",
            "rounded-md border border-slate-200 bg-white/90 px-2 py-1",
            "dark:border-white/10 dark:bg-slate-900/90",
            "shadow-lg backdrop-blur-sm"
          )}
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
        >
          <span className="font-mono text-[0.6rem] leading-tight text-slate-700 dark:text-slate-200">
            [{tooltip.row},{tooltip.col}]&ensp;{formatValue(tooltip.value)}
          </span>
        </div>
      )}
    </div>
  );
}
