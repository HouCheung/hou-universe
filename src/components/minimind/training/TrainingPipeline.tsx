"use client";

import { motion } from "framer-motion";
import {
  Database,
  Zap,
  Calculator,
  AlertTriangle,
  Settings,
  ClipboardList,
  ArrowDown,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { TrainingStageCard } from "./TrainingStageCard";

// ============================================================
// TrainingPipeline — Visualize the pretraining pipeline
// ============================================================
//
// Renders the training loop as a sequence of glass stage
// cards connected by animated arrows:
//
//   ToyDataset
//      ↓
//   Forward Pass (MiniMindModel)
//      ↓
//   Loss Calculation (CrossEntropyLoss)
//      ↓
//   ⚠ Gradient Boundary (explicit TODO)
//      ↓
//   Optimizer Step (NoOpOptimizer)
//      ↓
//   Training Trace
//
// Each stage shows a summary derived from actual training data
// when available. The gradient boundary is explicitly marked
// as a TODO — no fake gradients.
// ============================================================

// ── Pipeline stage definitions ────────────────────────────────

interface PipelineStage {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isBoundary?: boolean;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: "dataset", label: "datasetStage", icon: Database },
  { id: "forward", label: "forwardStage", icon: Zap },
  { id: "loss", label: "lossStage", icon: Calculator },
  { id: "gradient-boundary", label: "gradientBoundaryStage", icon: AlertTriangle, isBoundary: true },
  { id: "optimizer", label: "optimizerStage", icon: Settings },
  { id: "trace", label: "traceStage", icon: ClipboardList },
];

// ── Types ────────────────────────────────────────────────────

interface TrainingPipelineProps {
  /** Whether training has been executed */
  hasRun: boolean;
  /** Whether training is in progress */
  isRunning: boolean;
  /** Dataset size for summary */
  datasetSize: number;
  /** Total forward pass steps */
  steps: number;
  /** Epoch count */
  epochs: number;
  /** Last epoch's average loss */
  lastLoss: number | null;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function TrainingPipeline({
  hasRun,
  isRunning,
  datasetSize,
  steps,
  epochs,
  lastLoss,
  className,
}: TrainingPipelineProps) {
  const { t } = useTranslation();

  const resolveStageSummary = (stageId: string): string => {
    switch (stageId) {
      case "dataset":
        return hasRun
          ? `${datasetSize} samples, ${epochs} epoch${epochs !== 1 ? "s" : ""}`
          : `${datasetSize} samples loaded`;
      case "forward":
        return hasRun
          ? `${steps} forward passes (${epochs} epochs × ${datasetSize} samples)`
          : "MiniMindModel.forward()";
      case "loss":
        return hasRun
          ? `Avg loss: ${lastLoss?.toFixed(4) ?? "—"}`
          : "CrossEntropyLoss.forward()";
      case "gradient-boundary":
        return hasRun
          ? "Backpropagation pending autograd support"
          : "Requires autograd engine";
      case "optimizer":
        return "NoOpOptimizer — accepts gradients, no weight updates";
      case "trace":
        return hasRun
          ? `${epochs} epochs recorded, capability documented`
          : "TrainingResult with full trace";
      default:
        return "—";
    }
  };

  const resolveStageStatus = (
    stageId: string
  ): "active" | "inactive" | "processing" | "blocked" => {
    if (!hasRun && !isRunning) return "inactive";
    if (stageId === "gradient-boundary") return "blocked";
    if (isRunning) return "processing";
    return "active";
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.training.pipelineTitle")}
        </h3>
      </div>

      {/* Stage cards with connectors */}
      <div className="relative">
        {PIPELINE_STAGES.map((stage, i) => {
          const isLast = i === PIPELINE_STAGES.length - 1;
          const Icon = stage.icon;

          return (
            <div key={stage.id} className="relative">
              {/* Connector arrow between stages */}
              {!isLast && (
                <div className="absolute left-[28px] top-full z-0 flex flex-col items-center">
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: hasRun || isRunning ? 1 : 0 }}
                    transition={{
                      delay: i * 0.1 + 0.2,
                      duration: 0.3,
                      ease: "easeOut",
                    }}
                    className={cn(
                      "h-3 w-px origin-top bg-gradient-to-b",
                      stage.id === "loss"
                        ? "from-amber-500/30 to-amber-500/15 dark:from-amber-500/40 dark:to-amber-500/20"
                        : "from-brand/20 to-brand/5 dark:from-brand/30 dark:to-brand/10"
                    )}
                  />
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hasRun || isRunning ? 1 : 0 }}
                    transition={{ delay: i * 0.1 + 0.3, duration: 0.2 }}
                  >
                    <ArrowDown
                      className={cn(
                        "size-3",
                        stage.id === "loss"
                          ? "text-amber-500/40 dark:text-amber-500/60"
                          : "text-brand/30 dark:text-brand/50"
                      )}
                    />
                  </motion.div>
                </div>
              )}

              <TrainingStageCard
                label={t(`aiLab.training.${stage.label}`)}
                summary={resolveStageSummary(stage.id)}
                status={resolveStageStatus(stage.id)}
                index={i}
                icon={<Icon className="size-3.5" />}
              />

              {/* Spacer for connector */}
              {!isLast && <div className="h-5" />}
            </div>
          );
        })}
      </div>

      {/* Gradient boundary annotation */}
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: hasRun ? 1 : 0, y: hasRun ? 0 : 4 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="flex items-start gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.03] px-3 py-2.5 dark:border-amber-500/12 dark:bg-amber-500/[0.04]"
      >
        <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500/70" />
        <div>
          <span className="text-[0.65rem] font-semibold text-amber-600/80 dark:text-amber-500/70">
            {t("aiLab.training.gradientBoundaryNote")}
          </span>
          <p className="mt-0.5 text-[0.65rem] text-amber-500/60 dark:text-amber-500/50 leading-relaxed">
            {t("aiLab.training.gradientBoundaryDetail")}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
