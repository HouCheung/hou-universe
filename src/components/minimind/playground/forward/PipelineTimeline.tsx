"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { STAGE_CAPABILITIES } from "@/data/minimind/visualization-capabilities";
import type { StageId } from "@/data/minimind/visualization-capabilities";
import type { VisualTrace } from "@/lib/minimind/visualization";
import { StageNode } from "./StageNode";

// ============================================================
// PipelineTimeline — Level 1: animated stage flow
// ============================================================
//
// Renders 5 StageNode cards connected by animated vertical
// connector lines. Each card shows a summary stat from the
// actual model run. Click a card to select the stage for
// Level 2 deep-dive inspection.
//
// Animation: staggered fade-in + slide from left using
// Framer Motion Variants, matching the AI Lab pattern.
//
// Uses STAGE_CAPABILITIES from the metadata registry for
// stage order, icons, and labels.
// ============================================================

// ── Types ────────────────────────────────────────────────────

interface PipelineTimelineProps {
  trace: VisualTrace;
  selectedStageId: StageId | null;
  onSelectStage: (stageId: StageId | null) => void;
  className?: string;
}

// ── Component ────────────────────────────────────────────────

export function PipelineTimeline({
  trace,
  selectedStageId,
  onSelectStage,
  className,
}: PipelineTimelineProps) {
  const stages = STAGE_CAPABILITIES;

  const handleStageClick = (stageId: StageId) => {
    onSelectStage(selectedStageId === stageId ? null : stageId);
  };

  return (
    <div className={cn("space-y-1", className)}>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2.5">
        <div className="h-6 w-0.5 rounded-full bg-gradient-to-b from-brand/40 to-brand/0 dark:from-brand/50 dark:to-brand/0" />
        <h3 className="text-sm font-semibold tracking-tight text-foreground">
          Pipeline Overview
        </h3>
        <span className="font-mono text-[0.6rem] text-slate-400/60 dark:text-slate-500/50">
          Level 1
        </span>
      </div>

      {/* Stage cards with connectors */}
      <div className="relative">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;

          return (
            <div key={stage.stageId} className="relative">
              {/* Connector line + dot (not after last) */}
              {!isLast && (
                <div className="absolute left-[22px] top-full z-0 flex flex-col items-center">
                  {/* Vertical line */}
                  <motion.div
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{
                      delay: i * 0.1 + 0.3,
                      duration: 0.3,
                      ease: "easeOut",
                    }}
                    className="h-2 w-px origin-top bg-gradient-to-b from-brand/20 to-brand/5 dark:from-brand/30 dark:to-brand/10"
                  />
                  {/* Small dot */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: i * 0.1 + 0.4,
                      duration: 0.2,
                    }}
                    className="size-1 rounded-full bg-brand/30 dark:bg-brand/50"
                  />
                </div>
              )}

              <StageNode
                stageId={stage.stageId}
                trace={trace}
                isSelected={selectedStageId === stage.stageId}
                onClick={handleStageClick}
                index={i}
              />

              {/* Spacer for connector */}
              {!isLast && <div className="h-2.5" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
