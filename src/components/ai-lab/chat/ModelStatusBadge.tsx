"use client";

// ============================================================
// ModelStatusBadge — real model state indicator
// ============================================================
// Phase 76: Replaced the static "REAL MODEL" badge with a
// state-driven indicator. The dot color and label derive from
// the model's actual status (baseline vs trained vs training vs
// generating), computed by MiniMindChatShell from checkpoint
// availability, active training session, and generation state.
//
// No hardcoded status — the shell passes real state in.
// ============================================================

import { useTranslation } from "react-i18next";

// ============================================================
// Types
// ============================================================

export type ModelStatus = "baseline" | "trained" | "training" | "generating";

interface ModelStatusBadgeProps {
  status?: ModelStatus;
  /** Checkpoint/session name shown when a trained model is active */
  checkpointName?: string;
}

// ============================================================
// Status config
// ============================================================

const STATUS_CONFIG: Record<
  ModelStatus,
  { dotClass: string; pulse: boolean; labelKey: string }
> = {
  baseline: {
    dotClass: "bg-amber-400",
    pulse: false,
    labelKey: "aiLab.chat.status.untrained",
  },
  trained: {
    dotClass: "bg-emerald-400",
    pulse: false,
    labelKey: "aiLab.chat.status.trained",
  },
  training: {
    dotClass: "bg-sky-400",
    pulse: true,
    labelKey: "aiLab.chat.status.training",
  },
  generating: {
    dotClass: "bg-emerald-400",
    pulse: true,
    labelKey: "aiLab.chat.status.generating",
  },
};

// ============================================================
// ModelStatusBadge
// ============================================================

export function ModelStatusBadge({
  status = "baseline",
  checkpointName,
}: ModelStatusBadgeProps) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.03] px-3 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
      {/* Status dot */}
      <span className="relative flex size-2">
        {config.pulse && (
          <span
            className={`absolute inline-flex size-full animate-pulse rounded-full opacity-75 ${config.dotClass}`}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${config.dotClass}`} />
      </span>

      {/* Status label */}
      <span className="font-mono text-[0.6rem] tracking-wide text-slate-600 dark:text-slate-300">
        {t(config.labelKey)}
      </span>

      {/* Checkpoint name (trained only) */}
      {status === "trained" && checkpointName && (
        <>
          <span
            aria-hidden="true"
            className="h-3 w-px bg-brand/10 dark:bg-white/[0.08]"
          />
          <span className="max-w-[16rem] truncate font-mono text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
            {checkpointName}
          </span>
        </>
      )}
    </div>
  );
}
