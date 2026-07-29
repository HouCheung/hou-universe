"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import { Grid3X3, ChevronLeft, ChevronRight } from "lucide-react";

// ============================================================
// EmbeddingMatrixView — Embedding matrix heatmap slice
// ============================================================
//
// Renders a portion of the embedding matrix as a heatmap grid.
// Each row = one token's embedding vector.
// The currently-selected token row is highlighted with a glow.
//
// Paginated — shows ROWS_PER_PAGE rows at a time for performance.
// ============================================================

// ── Constants ────────────────────────────────────────────────

/** Number of token rows to render per page */
const ROWS_PER_PAGE = 32;

/** Number of columns (dimensions) to display — first N dims */
const COLS_TO_SHOW = 64;

// ── Animation ────────────────────────────────────────────────

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.015, duration: 0.25, ease: "easeOut" },
  }),
};

// ── Helpers ──────────────────────────────────────────────────

/** Map a float value in [-maxAbs, +maxAbs] to a heat color */
function heatColor(value: number, maxAbs: number): string {
  if (maxAbs === 0) return "rgb(100 116 139 / 0.08)";

  // Sigmoid-like compression for better visual range
  const t = value / maxAbs; // [-1, 1]
  const clamped = Math.max(-1, Math.min(1, t));

  if (clamped >= 0) {
    // Positive → brand/warm
    const alpha = 0.06 + clamped * 0.85;
    return `rgb(var(--brand-rgb) / ${alpha.toFixed(2)})`;
  }
  // Negative → cool/slate
  const alpha = 0.06 + Math.abs(clamped) * 0.75;
  return `rgb(100 116 139 / ${alpha.toFixed(2)})`;
}

function formatCellValue(v: number): string {
  if (v === 0) return " 0";
  return v > 0 ? `+${v.toFixed(3)}` : v.toFixed(3);
}

// ── Component ────────────────────────────────────────────────

interface EmbeddingMatrixViewProps {
  /** Full embedding matrix — Float64Array[] from MiniEmbedding.getRawMatrix() */
  matrix: ReadonlyArray<Float64Array>;
  /** Currently selected token ID — highlighted row */
  selectedTokenId: number;
  /** Callback when user clicks a row to select a different token */
  onSelectToken: (tokenId: number) => void;
}

export function EmbeddingMatrixView({
  matrix,
  selectedTokenId,
  onSelectToken,
}: EmbeddingMatrixViewProps) {
  const totalRows = matrix.length;
  const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);

  // Start on the page containing the selected token
  const [page, setPage] = useState(() =>
    Math.floor(selectedTokenId / ROWS_PER_PAGE)
  );

  const startRow = page * ROWS_PER_PAGE;
  const endRow = Math.min(startRow + ROWS_PER_PAGE, totalRows);
  const visibleRows = endRow - startRow;

  // Compute maxAbs across visible rows + visible cols for consistent color scale
  const maxAbs = useMemo(() => {
    let m = 0;
    for (let r = startRow; r < endRow; r++) {
      const row = matrix[r];
      const limit = Math.min(COLS_TO_SHOW, row.length);
      for (let c = 0; c < limit; c++) {
        const abs = Math.abs(row[c]);
        if (abs > m) m = abs;
      }
    }
    // Guard against all-zero pages
    return m === 0 ? 0.001 : m;
  }, [matrix, startRow, endRow]);

  const goToPrevPage = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  // Navigate to the page containing a given token
  const goToTokenPage = useCallback(
    (tokenId: number) => {
      const targetPage = Math.floor(tokenId / ROWS_PER_PAGE);
      setPage(targetPage);
      onSelectToken(tokenId);
    },
    [onSelectToken]
  );

  return (
    <div className="rounded-xl border border-brand/10 bg-brand/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-brand/[0.06] px-5 py-3 dark:border-white/[0.04]">
        <Grid3X3 className="size-3.5 text-brand/70" />
        <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
          Embedding Matrix
        </span>
        <span className="ml-auto font-mono text-[0.55rem] text-slate-500/60 dark:text-slate-500/50">
          {totalRows}×{COLS_TO_SHOW} (first {COLS_TO_SHOW} dims)
        </span>
      </div>

      {/* Color scale legend */}
      <div className="flex items-center gap-2 border-b border-brand/[0.04] px-5 py-2 dark:border-white/[0.03]">
        <span className="font-mono text-[0.5rem] text-slate-500/60 dark:text-slate-500/50">
          −{maxAbs.toFixed(3)}
        </span>
        <div className="h-2 flex-1 rounded-full bg-gradient-to-r from-slate-400/40 via-slate-400/10 to-brand/80" />
        <span className="font-mono text-[0.5rem] text-slate-500/60 dark:text-slate-500/50">
          +{maxAbs.toFixed(3)}
        </span>
      </div>

      {/* Column headers (dimension indices) */}
      <div className="flex border-b border-brand/[0.03] dark:border-white/[0.02]">
        {/* Row label gutter */}
        <div className="w-12 shrink-0 px-1 py-1" />
        {Array.from({ length: COLS_TO_SHOW }, (_, c) => (
          <div
            key={c}
            className="flex-1 px-0.5 py-1 text-center font-mono text-[0.45rem] leading-none text-slate-500/50 dark:text-slate-500/50"
            title={`d[${c}]`}
          >
            {c % 8 === 0 ? c : "·"}
          </div>
        ))}
      </div>

      {/* Matrix rows */}
      <div className="max-h-[420px] overflow-y-auto">
        {Array.from({ length: visibleRows }, (_, i) => {
          const rowIndex = startRow + i;
          const row = matrix[rowIndex];
          const isSelected = rowIndex === selectedTokenId;

          return (
            <motion.button
              key={rowIndex}
              custom={i}
              variants={rowVariants}
              initial="hidden"
              animate="visible"
              onClick={() => goToTokenPage(rowIndex)}
              className={`flex w-full items-center text-left transition-colors duration-150 hover:bg-brand/[0.06] dark:hover:bg-white/[0.03] ${
                isSelected
                  ? "bg-brand/[0.1] ring-1 ring-inset ring-brand/30 dark:bg-[rgba(var(--brand-rgb),0.12)] dark:ring-brand/40"
                  : ""
              }`}
            >
              {/* Row label */}
              <div
                className={`w-12 shrink-0 px-1.5 py-0.5 text-right font-mono text-[0.5rem] leading-relaxed ${
                  isSelected
                    ? "font-bold text-brand dark:text-brand-light"
                    : "text-slate-500/70 dark:text-slate-500/60"
                }`}
              >
                {rowIndex}
              </div>

              {/* Cells */}
              {Array.from({ length: COLS_TO_SHOW }, (_, c) => {
                const value = row[c];
                const bg = heatColor(value, maxAbs);

                return (
                  <div
                    key={c}
                    className="flex-1 px-0.5 py-0.5"
                    style={{ backgroundColor: bg }}
                    title={`W[${rowIndex}][${c}] = ${formatCellValue(value)}`}
                  >
                    <span className="block text-center font-mono text-[0.42rem] leading-none text-transparent select-none">
                      {c % 16 === 0 ? "·" : " "}
                    </span>
                  </div>
                );
              })}
            </motion.button>
          );
        })}
      </div>

      {/* Pagination controls */}
      <div className="flex items-center justify-between border-t border-brand/[0.06] px-5 py-2.5 dark:border-white/[0.04]">
        <span className="font-mono text-[0.55rem] text-slate-500/60 dark:text-slate-500/50">
          Rows {startRow}–{endRow - 1} of {totalRows}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevPage}
            disabled={page === 0}
            className="flex size-7 items-center justify-center rounded-md border border-slate-500/[0.1] bg-slate-500/[0.03] text-slate-500 transition-colors hover:border-brand/20 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-500 dark:hover:text-brand-light"
            aria-label="Previous page"
          >
            <ChevronLeft className="size-3" />
          </button>
          <span className="min-w-[3rem] text-center font-mono text-[0.55rem] text-slate-500/70 dark:text-slate-500/60">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={page >= totalPages - 1}
            className="flex size-7 items-center justify-center rounded-md border border-slate-500/[0.1] bg-slate-500/[0.03] text-slate-500 transition-colors hover:border-brand/20 hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-500 dark:hover:text-brand-light"
            aria-label="Next page"
          >
            <ChevronRight className="size-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
