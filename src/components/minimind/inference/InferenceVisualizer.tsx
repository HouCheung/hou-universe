"use client";

import { motion } from "framer-motion";
import {
  Split,
  Layers,
  RotateCw,
  Boxes,
  Target,
  ArrowDown,
  Database,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { GenerationStep } from "@/lib/minimind/inference";
import { InferenceStageCard } from "./InferenceStageCard";

// ============================================================
// InferenceVisualizer — Pipeline stage flow visualization
// ============================================================
//
// Renders the inference pipeline as a sequence of glass stage
// cards connected by animated arrows:
//
//   Prompt → Tokenizer → Token IDs → Embedding →
//   Transformer Blocks → KV Cache → LM Head → Sampler → Next Token
//
// Each stage shows a summary derived from actual inference data.
// Reuses the visual language from forward/PipelineTimeline
// but adapted for the inference (generation) pipeline.
// ============================================================

// ── Pipeline stage definitions ────────────────────────────────

interface PipelineStage {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: "prompt", label: "Prompt", icon: () => null },
  { id: "tokenizer", label: "Tokenizer", icon: Split },
  { id: "token-ids", label: "Token IDs", icon: () => null },
  { id: "embedding", label: "Embedding", icon: Layers },
  { id: "transformer", label: "Transformer Blocks", icon: Boxes },
  { id: "kv-cache", label: "KV Cache", icon: Database },
  { id: "lm-head", label: "LM Head", icon: Target },
  { id: "sampler", label: "Sampler", icon: RotateCw },
  { id: "next-token", label: "Next Token", icon: ArrowDown },
];

// ── Types ────────────────────────────────────────────────────

interface InferenceVisualizerProps {
  /** The first step (step 0) has cacheState info */
  latestStep: GenerationStep | null;
  /** Total steps generated so far */
  stepCount: number;
  /** Whether generation is in progress */
  isRunning: boolean;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function InferenceVisualizer({
  latestStep,
  stepCount,
  isRunning,
  className,
}: InferenceVisualizerProps) {
  const { t } = useTranslation();

  const hasRun = latestStep !== null;

  const resolveStageSummary = (stageId: string): string => {
    if (!hasRun) return "—";

    switch (stageId) {
      case "prompt":
        return "User input text";
      case "tokenizer":
        return "Splits text → token IDs";
      case "token-ids":
        return latestStep
          ? `Token ID: ${latestStep.tokenId}`
          : "—";
      case "embedding":
        return "Projects IDs → dense vectors";
      case "transformer":
        return "Multi-head attention + FFN";
      case "kv-cache":
        return latestStep?.cacheState
          ? `Seq len: ${latestStep.cacheState.cachedSeqLen}`
          : "—";
      case "lm-head":
        return "Projects hidden → vocab logits";
      case "sampler":
        return latestStep
          ? latestStep.pipelineDescription.slice(0, 60) + "..."
          : "—";
      case "next-token":
        return hasRun
          ? `${stepCount} token${stepCount !== 1 ? "s" : ""} generated`
          : "—";
      default:
        return "—";
    }
  };

  const resolveStageStatus = (): "active" | "inactive" | "processing" => {
    if (!hasRun && !isRunning) return "inactive";
    if (isRunning) return "processing";
    return "active";
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          {t("aiLab.inference.pipelineVisualization")}
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
                    className="h-3 w-px origin-top bg-gradient-to-b from-brand/20 to-brand/5 dark:from-brand/30 dark:to-brand/10"
                  />
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: hasRun || isRunning ? 1 : 0 }}
                    transition={{ delay: i * 0.1 + 0.3, duration: 0.2 }}
                  >
                    <ArrowDown className="size-3 text-brand/30 dark:text-brand/50" />
                  </motion.div>
                </div>
              )}

              <InferenceStageCard
                label={stage.label}
                summary={resolveStageSummary(stage.id)}
                status={resolveStageStatus()}
                index={i}
                icon={
                  Icon ? (
                    <Icon className="size-3.5" />
                  ) : (
                    <span className="font-mono text-[0.55rem] text-current">
                      {i + 1}
                    </span>
                  )
                }
              />

              {/* Spacer for connector */}
              {!isLast && <div className="h-5" />}
            </div>
          );
        })}
      </div>

      {/* KV Cache status indicator */}
      {hasRun && latestStep?.cacheState && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
          className="flex items-center gap-2 rounded-lg border border-brand/10 bg-brand/[0.03] px-3 py-2 dark:border-brand/15 dark:bg-brand/[0.05]"
        >
          <Database className="size-3 text-brand/60" />
          <span className="font-mono text-[0.65rem] text-brand/70 dark:text-brand/60">
            KV Cache: {latestStep.cacheState.cachedSeqLen} positions ·{" "}
            {latestStep.cacheState.layerEntropyAverages.length} layers
          </span>
        </motion.div>
      )}
    </div>
  );
}
