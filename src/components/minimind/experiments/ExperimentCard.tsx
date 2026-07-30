"use client";

import { motion, type Variants } from "framer-motion";
import {
  Split,
  Layers,
  Eye,
  Thermometer,
  FlaskConical,
  Sparkles,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MiniMindExperiment } from "@/data/minimind/experiment-registry";

// ============================================================
// Icon map — experiment module → lucide icon
// ============================================================

const MODULE_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  tokenizer: Split,
  embedding: Layers,
  attention: Eye,
  inference: Thermometer,
};

function getIcon(moduleId: string): React.ComponentType<{ className?: string }> {
  return MODULE_ICON_MAP[moduleId] ?? FlaskConical;
}

// ============================================================
// Animation variants
// ============================================================

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

// ============================================================
// ExperimentCard
// ============================================================

interface ExperimentCardProps {
  experiment: MiniMindExperiment;
  onSelect: (id: string) => void;
}

export function ExperimentCard({ experiment, onSelect }: ExperimentCardProps) {
  const isActive = experiment.status === "active";
  const Icon = getIcon(experiment.relatedModule);
  const visibleConcepts = experiment.concepts.slice(0, 3);
  const overflowCount = experiment.concepts.length - 3;

  return (
    <motion.button
      variants={cardVariants}
      onClick={() => isActive && onSelect(experiment.id)}
      disabled={!isActive}
      className={cn(
        "relative w-full rounded-2xl border p-5 text-left transition-all duration-300",
        "border-brand/15 bg-brand/[0.03] backdrop-blur-sm",
        "dark:border-white/[0.08] dark:bg-white/[0.02]",
        isActive
          ? "cursor-pointer hover:scale-[1.02] hover:border-brand/30 hover:bg-brand/[0.06] dark:hover:border-white/[0.15] dark:hover:bg-white/[0.04]"
          : "cursor-default opacity-60"
      )}
    >
      {/* Glow accent */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r",
          isActive
            ? "from-transparent via-brand/30 to-transparent"
            : "from-transparent via-slate-300/30 to-transparent"
        )}
        aria-hidden="true"
      />

      {/* Header row: icon + title + status */}
      <div className="mb-3 flex items-start gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            "border border-brand/10 bg-brand/[0.06]",
            "dark:border-white/[0.06] dark:bg-white/[0.03]"
          )}
        >
          <Icon className="size-4 text-brand/70" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            {experiment.title}
          </h3>
        </div>

        {/* Status badge */}
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[0.6rem] tracking-wider uppercase",
            isActive
              ? "border-brand/15 bg-brand/[0.06] text-brand/80 dark:border-brand/25 dark:text-brand/70"
              : "border-slate-200 bg-slate-50 text-slate-400 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-slate-500"
          )}
        >
          {isActive ? (
            <>
              <Sparkles className="size-2.5" />
              Active
            </>
          ) : (
            <>
              <Clock className="size-2.5" />
              Planned
            </>
          )}
        </span>
      </div>

      {/* Description */}
      <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {experiment.description}
      </p>

      {/* Concept tags */}
      <div className="flex flex-wrap items-center gap-1.5">
        {visibleConcepts.map((concept) => (
          <span
            key={concept}
            className="rounded-full border border-brand/8 bg-brand/[0.03] px-2 py-0.5 font-mono text-[0.6rem] text-slate-500 dark:border-white/[0.05] dark:bg-white/[0.02] dark:text-slate-400"
          >
            {concept}
          </span>
        ))}
        {overflowCount > 0 && (
          <span className="font-mono text-[0.6rem] text-slate-400 dark:text-slate-500">
            +{overflowCount} more
          </span>
        )}
      </div>
    </motion.button>
  );
}
