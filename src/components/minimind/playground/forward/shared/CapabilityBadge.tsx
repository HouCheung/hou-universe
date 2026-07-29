"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// CapabilityBadge — Rounded-full badge for feature availability
// ============================================================
//
// Displays a small badge indicating whether a capability is
// available (emerald + CheckCircle2) or unavailable
// (slate + XCircle). Used in model comparison and capability
// listings.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface CapabilityBadgeProps {
  available: boolean;
  label: string;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function CapabilityBadge({
  available,
  label,
  className,
}: CapabilityBadgeProps) {
  const Icon = available ? CheckCircle2 : XCircle;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-medium transition-colors",
        available
          ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/[0.06] dark:text-emerald-400"
          : "border-slate-500/10 bg-slate-500/[0.03] text-slate-400 dark:border-white/[0.04] dark:bg-white/[0.02] dark:text-slate-500",
        className
      )}
    >
      <Icon
        className={cn(
          "size-2.5",
          available ? "text-emerald-500 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
        )}
      />
      {label}
    </span>
  );
}
