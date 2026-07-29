"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ============================================================
// StageCard — Reusable glass card wrapper
// ============================================================
//
// Wraps content in a glass-morphism card with a glow accent line
// at the top and an optional title. Matches the AI Lab pattern:
// rounded-2xl, border brand/15, subtle brand bg, backdrop blur.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface StageCardProps {
  children: ReactNode;
  title?: string;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function StageCard({ children, title, className }: StageCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border border-brand/15 bg-brand/[0.03] backdrop-blur-sm",
        "dark:border-white/[0.08] dark:bg-white/[0.02]",
        "p-5",
        className
      )}
    >
      {/* Glow accent line at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent dark:via-brand/40" />

      {title && (
        <h3 className="mb-4 text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h3>
      )}

      {children}
    </div>
  );
}
