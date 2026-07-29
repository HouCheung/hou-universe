"use client";

import { cn } from "@/lib/utils";

// ============================================================
// StatRow — Flex-wrap row of glass pills for stat display
// ============================================================
//
// Each item renders as a pill with a label and formatted value.
// Numbers: integers use toLocaleString(), floats use toFixed(4).
// Values are rendered with font-mono text-xs.
// ============================================================

// ── Helpers ──────────────────────────────────────────────────

function formatValue(value: string | number): string {
  if (typeof value === "string") return value;
  if (Number.isInteger(value)) return value.toLocaleString("en-US");
  return value.toFixed(4);
}

// ── Types ────────────────────────────────────────────────────

interface StatItem {
  label: string;
  value: string | number;
}

interface StatRowProps {
  items: StatItem[];
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function StatRow({ items, className }: StatRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-full border px-3 py-1.5 backdrop-blur-sm transition-colors",
            "border-brand/10 bg-brand/[0.04]",
            "dark:border-white/[0.06] dark:bg-white/[0.02]"
          )}
        >
          <span className="text-[0.6rem] tracking-wide text-slate-500/70 dark:text-slate-400/60">
            {item.label}
          </span>
          <span className="ml-1.5 font-mono text-xs tabular-nums text-foreground">
            {formatValue(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
