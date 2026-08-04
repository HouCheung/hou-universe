"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Circle, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { TrainingCapability } from "@/lib/minimind/pretrain";

// ============================================================
// TrainingCapabilityPanel — Honest capability report
// ============================================================
//
// Clearly separates what's implemented from what's pending.
// The gradient/weight-update boundary is the key educational
// message: the training loop runs end-to-end, but parameters
// don't change because there's no autograd.
//
// Two-column layout:
//   ✅ Implemented          ⚠ Not Yet Available
//
// All data from TrainingCapability (Pretrainer.getCapability()).
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface TrainingCapabilityPanelProps {
  capability: TrainingCapability;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function TrainingCapabilityPanel({
  capability,
  className,
}: TrainingCapabilityPanelProps) {
  const { t } = useTranslation();

  const implementedItems = [
    {
      key: "dataset" as const,
      label: t("aiLab.training.capDataset"),
      active: true,
    },
    {
      key: "forwardPass" as const,
      label: t("aiLab.training.capForwardPass"),
      active: capability.forwardPass,
    },
    {
      key: "lossCalculation" as const,
      label: t("aiLab.training.capLossCalculation"),
      active: capability.lossCalculation,
    },
    {
      key: "trainingLoop" as const,
      label: t("aiLab.training.capTrainingLoop"),
      active: true,
    },
    {
      key: "traceCollection" as const,
      label: t("aiLab.training.capTraceCollection"),
      active: true,
    },
  ];

  const pendingItems = [
    {
      key: "backpropagation" as const,
      label: t("aiLab.training.capBackpropagation"),
      active: capability.gradientComputation,
    },
    {
      key: "gradientComputation" as const,
      label: t("aiLab.training.capGradientComputation"),
      active: capability.gradientComputation,
    },
    {
      key: "weightUpdates" as const,
      label: t("aiLab.training.capWeightUpdates"),
      active: capability.parameterUpdate,
    },
  ];

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.training.capabilityTitle")}
        </h3>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Implemented column */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35, ease: "easeOut" }}
          className="rounded-xl border border-emerald-200/40 bg-emerald-50/[0.15] dark:border-emerald-500/12 dark:bg-emerald-500/[0.03] overflow-hidden"
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-emerald-200/30 dark:border-emerald-500/[0.06]">
            <CheckCircle2 className="size-3.5 text-emerald-500 dark:text-emerald-400" />
            <span className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80">
              {t("aiLab.training.implemented")}
            </span>
          </div>

          {/* Items */}
          <div className="px-4 py-2.5 space-y-2">
            {implementedItems.map((item, i) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.04, duration: 0.25 }}
                className="flex items-center gap-2.5"
              >
                {item.active ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500/80 dark:text-emerald-400/80" />
                ) : (
                  <Circle className="size-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
                )}
                <span
                  className={cn(
                    "text-xs",
                    item.active
                      ? "text-foreground/80"
                      : "text-slate-400/60 dark:text-slate-500/50"
                  )}
                >
                  {item.label}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Not implemented column */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
          className="rounded-xl border border-amber-200/40 bg-amber-50/[0.10] dark:border-amber-500/12 dark:bg-amber-500/[0.03] overflow-hidden"
        >
          {/* Column header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-200/30 dark:border-amber-500/[0.06]">
            <ShieldAlert className="size-3.5 text-amber-500 dark:text-amber-400" />
            <span className="text-xs font-semibold text-amber-700/80 dark:text-amber-400/80">
              {t("aiLab.training.notImplemented")}
            </span>
          </div>

          {/* Items */}
          <div className="px-4 py-2.5 space-y-2">
            {pendingItems.map((item, i) => (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.04, duration: 0.25 }}
                className="flex items-center gap-2.5"
              >
                {item.active ? (
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500/80 dark:text-emerald-400/80" />
                ) : (
                  <Circle className="size-3.5 shrink-0 text-amber-400/60 dark:text-amber-500/60" />
                )}
                <span
                  className={cn(
                    "text-xs",
                    item.active
                      ? "text-foreground/80"
                      : "text-amber-600/70 dark:text-amber-400/60"
                  )}
                >
                  {item.label}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
