"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { VisualTrace } from "@/lib/minimind/visualization";
import type { StageId } from "@/data/minimind/visualization-capabilities";
import { TokenizerStage } from "./stages/TokenizerStage";
import { EmbeddingStage } from "./stages/EmbeddingStage";
import { RoPEStage } from "./stages/RoPEStage";
import { TransformerStage } from "./stages/TransformerStage";
import { LMHeadStage } from "./stages/LMHeadStage";
import { CapabilityBadge } from "./shared/CapabilityBadge";

// ============================================================
// DeepDivePanel — Level 2: stage detail container
// ============================================================
//
// Renders when selectedStageId is non-null. Slides in below
// the PipelineTimeline via AnimatePresence. Delegates to the
// correct stage component, passing ONLY that stage's typed
// slice of VisualTrace.
//
// Each stage component receives:
//   - Its typed data slice (e.g. VisualTrace["tokenizer"])
//   - Its capabilities flags for graceful degradation
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface DeepDivePanelProps {
  trace: VisualTrace;
  stageId: StageId;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function DeepDivePanel({
  trace,
  stageId,
  className,
}: DeepDivePanelProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stageId}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={cn("space-y-4", className)}
      >
        {/* Section header */}
        <div className="flex items-center gap-2.5">
          <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/50 to-brand/10 dark:from-brand/60 dark:to-brand/10" />
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Stage Detail
          </h3>
          <span className="font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
            Level 2
          </span>
        </div>

        {/* Stage component */}
        {stageId === "tokenizer" && <TokenizerStage data={trace.tokenizer} />}

        {stageId === "embedding" && <EmbeddingStage data={trace.embedding} />}

        {stageId === "rope" && <RoPEStage data={trace.rope} />}

        {stageId === "transformer" && (
          <TransformerStage
            data={trace.transformer}
            capabilities={trace.capabilities.transformer}
          />
        )}

        {stageId === "lm-head" && <LMHeadStage data={trace.lmHead} />}

        {/* Capability overview footer */}
        <StageCapabilityFooter stageId={stageId} trace={trace} />
      </motion.div>
    </AnimatePresence>
  );
}

// ── Capability Footer ────────────────────────────────────────

function StageCapabilityFooter({
  stageId,
  trace,
}: {
  stageId: StageId;
  trace: VisualTrace;
}) {
  const caps = trace.capabilities;

  const badges: { available: boolean; label: string }[] = [];

  switch (stageId) {
    case "tokenizer":
      badges.push(
        { available: caps.tokenizer.tokenList, label: "Token List" },
        { available: caps.tokenizer.vocabExplorer, label: "Vocab Explorer" }
      );
      break;
    case "embedding":
      badges.push(
        { available: caps.embedding.vectorViewer, label: "Vector Viewer" },
        { available: caps.embedding.matrixHeatmap, label: "Matrix Heatmap" },
        { available: caps.embedding.statsPanel, label: "Stats Panel" }
      );
      break;
    case "rope":
      badges.push(
        { available: caps.rope.rotation2DView, label: "2D Rotation" },
        { available: caps.rope.normCheck, label: "Norm Check" },
        { available: caps.rope.frequencyChart, label: "Frequency Chart" }
      );
      break;
    case "transformer":
      badges.push(
        { available: caps.transformer.attentionHeatmap, label: "Attn Heatmap" },
        { available: caps.transformer.attentionHeadDiversity, label: "Head Diversity" },
        { available: caps.transformer.ffnGateDistribution, label: "FFN Gates" },
        { available: caps.transformer.residualFlowChart, label: "Residual Flow" }
      );
      break;
    case "lm-head":
      badges.push(
        { available: caps.lmHead.logitsHistogram, label: "Histogram" },
        { available: caps.lmHead.topKRanking, label: "Top-K" },
        { available: caps.lmHead.probabilityDistribution, label: "Prob Dist" }
      );
      break;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-brand/5 bg-brand/[0.01] px-3 py-2 dark:border-white/[0.03] dark:bg-white/[0.01]">
      <span className="text-[0.6rem] font-medium text-slate-400/70 dark:text-slate-500/60">
        Capabilities:
      </span>
      {badges.map((b) => (
        <CapabilityBadge key={b.label} available={b.available} label={b.label} />
      ))}
    </div>
  );
}
