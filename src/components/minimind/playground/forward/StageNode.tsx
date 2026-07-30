"use client";

import { motion } from "framer-motion";
import {
  Split,
  Layers,
  RotateCw,
  Boxes,
  Target,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageId } from "@/data/minimind/visualization-capabilities";
import type { VisualTrace } from "@/lib/minimind/visualization";

// ============================================================
// StageNode — Single clickable pipeline stage card
// ============================================================
//
// Renders one stage in the Level 1 pipeline timeline. Shows:
//   - Stage icon from lucide-react
//   - Stage name
//   - Dynamic summary stat (from the actual model run)
//   - Status: success (green check) or degraded (amber warning)
//
// Click to select → selectedStageId set → Level 2 DeepDive opens.
// Click again to deselect.
// ============================================================

// ── Icon map ─────────────────────────────────────────────────

const STAGE_ICONS: Record<StageId, React.ComponentType<{ className?: string }>> = {
  tokenizer: Split,
  embedding: Layers,
  rope: RotateCw,
  transformer: Boxes,
  "lm-head": Target,
};

const STAGE_LABELS: Record<StageId, string> = {
  tokenizer: "Tokenizer",
  embedding: "Embedding",
  rope: "RoPE",
  transformer: "Transformer",
  "lm-head": "LM Head",
};

// ── Summary stat resolver ────────────────────────────────────

function resolveSummaryStat(
  stageId: StageId,
  trace: VisualTrace
): string {
  switch (stageId) {
    case "tokenizer": {
      const count = trace.tokenizer.tokens.length;
      return `${count} token${count !== 1 ? "s" : ""}`;
    }
    case "embedding": {
      const d = trace.embedding.dModel;
      return `${d}-dim vectors`;
    }
    case "rope": {
      const { numHeads, theta } = trace.rope.ropeConfig;
      return `${numHeads} head${numHeads !== 1 ? "s" : ""}, θ=${theta}`;
    }
    case "transformer": {
      const count = trace.transformer.length;
      return `${count} layer${count !== 1 ? "s" : ""}`;
    }
    case "lm-head": {
      const v = trace.lmHead.logits.length;
      return `${v.toLocaleString("en-US")} vocab logits`;
    }
  }
}

// ── Status resolver ──────────────────────────────────────────

function resolveStatus(
  stageId: StageId,
  trace: VisualTrace
): "success" | "degraded" {
  const caps = trace.capabilities;

  switch (stageId) {
    case "tokenizer":
      return caps.tokenizer.tokenList ? "success" : "degraded";
    case "embedding":
      return caps.embedding.vectorViewer ? "success" : "degraded";
    case "rope":
      return caps.rope.rotation2DView ? "success" : "degraded";
    case "transformer":
      return caps.transformer.residualFlowChart ? "success" : "degraded";
    case "lm-head":
      return caps.lmHead.logitsHistogram ? "success" : "degraded";
  }
}

// ── Types ────────────────────────────────────────────────────

interface StageNodeProps {
  stageId: StageId;
  trace: VisualTrace;
  isSelected: boolean;
  onClick: (stageId: StageId) => void;
  index: number;
}

// ── Component ────────────────────────────────────────────────

export function StageNode({
  stageId,
  trace,
  isSelected,
  onClick,
  index,
}: StageNodeProps) {
  const Icon = STAGE_ICONS[stageId];
  const label = STAGE_LABELS[stageId];
  const summary = resolveSummaryStat(stageId, trace);
  const status = resolveStatus(stageId, trace);

  const StatusIcon = status === "success" ? CheckCircle2 : AlertTriangle;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: index * 0.1,
        duration: 0.35,
        ease: "easeOut",
      }}
      onClick={() => onClick(stageId)}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200",
        isSelected
          ? "border-brand/40 bg-brand/[0.08] shadow-[0_0_12px_rgba(var(--brand-rgb),0.08)] dark:border-brand/30 dark:bg-brand/[0.10]"
          : "border-slate-200/60 bg-white/60 hover:border-brand/20 hover:bg-brand/[0.04] dark:border-white/[0.06] dark:bg-white/[0.02] dark:hover:border-brand/25 dark:hover:bg-brand/[0.06]"
      )}
    >
      {/* Stage icon */}
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
          isSelected
            ? "bg-brand/[0.12] text-brand dark:bg-brand/[0.18] dark:text-brand/90"
            : "bg-slate-100 text-slate-500 group-hover:bg-brand/[0.08] group-hover:text-brand/70 dark:bg-white/[0.04] dark:text-slate-400 dark:group-hover:bg-brand/[0.10] dark:group-hover:text-brand/60"
        )}
      >
        <Icon className="size-4" />
      </div>

      {/* Label + summary */}
      <div className="flex-1 truncate">
        <div className="text-xs font-medium text-foreground">{label}</div>
        <div className="mt-0.5 font-mono text-[0.65rem] text-slate-500/70 dark:text-slate-400/60">
          {summary}
        </div>
      </div>

      {/* Status indicator */}
      <StatusIcon
        className={cn(
          "size-3.5 shrink-0",
          status === "success"
            ? "text-emerald-500 dark:text-emerald-400"
            : "text-amber-500 dark:text-amber-400"
        )}
      />

      {/* Selection glow ring */}
      {isSelected && (
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-brand/25 dark:ring-brand/20" />
      )}
    </motion.button>
  );
}
