"use client";

// ============================================================
// PathNodeCard — individual learning node card on the timeline
// ============================================================

import { motion } from "framer-motion";
import {
  CheckCircle,
  Trophy,
  Loader,
  Play,
  Lock,
  BookOpen,
  FlaskConical,
  Clock,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PathNodeCardData } from "@/lib/minimind/learning";
import { useTranslation } from "react-i18next";

// ============================================================
// Icon resolver
// ============================================================

const StatusIconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  CheckCircle,
  Trophy,
  Loader,
  Play,
  Lock,
};

function StatusIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = StatusIconMap[icon] ?? Lock;
  return <Icon className={className} />;
}

// ============================================================
// Status color mapping
// ============================================================
//
// Keys match the color names returned by enrichPathNode():
//   "emerald" → completed | mastered
//   "amber"   → in_progress
//   "brand"   → available
//   "slate"   → locked
// ============================================================

const StatusStyles: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  emerald: {
    border: "border-emerald-500/30 dark:border-emerald-500/40",
    bg: "bg-emerald-500/[0.05] dark:bg-emerald-500/[0.06]",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    border: "border-amber-500/30 dark:border-amber-500/40",
    bg: "bg-amber-500/[0.05] dark:bg-amber-500/[0.06]",
    text: "text-amber-600 dark:text-amber-400",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  brand: {
    border: "border-brand/25 dark:border-brand/30",
    bg: "bg-brand/[0.04] dark:bg-brand/[0.05]",
    text: "text-brand",
    badge: "border-brand/20 bg-brand/10 text-brand",
  },
  slate: {
    border: "border-slate-500/12 dark:border-slate-500/15",
    bg: "bg-slate-500/[0.02] dark:bg-slate-500/[0.03]",
    text: "text-slate-400 dark:text-slate-500",
    badge: "border-slate-500/10 bg-slate-500/5 text-slate-400 dark:text-slate-500",
  },
};

// ============================================================
// Badge label resolver
// ============================================================
//
// statusColor alone cannot distinguish "completed" vs "mastered"
// (both map to "emerald"). We use statusIcon for fine-grained labels.
// ============================================================

function getBadgeLabel(statusIcon: string): string {
  switch (statusIcon) {
    case "Trophy":
      return "minimind.learning.status.mastered";
    case "CheckCircle":
      return "minimind.learning.status.done";
    case "Loader":
      return "minimind.learning.status.active";
    case "Play":
      return "minimind.learning.status.ready";
    default:
      return "minimind.learning.status.locked";
  }
}

// ============================================================
// PathNodeCard
// ============================================================

interface PathNodeCardProps {
  data: PathNodeCardData;
  index: number;
  onSelect: (sourceId: string) => void;
}

export function PathNodeCard({ data, index, onSelect }: PathNodeCardProps) {
  const { t } = useTranslation();
  const { learningNode, statusColor, statusIcon, isClickable } = data;
  const styles = StatusStyles[statusColor] ?? StatusStyles.slate;
  const node = learningNode.knowledgeNode;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: "easeOut",
      }}
      onClick={() => isClickable && onSelect(learningNode.sourceId)}
      disabled={!isClickable}
      className={cn(
        "group relative w-full rounded-xl border p-4 text-left transition-all duration-300 backdrop-blur-sm",
        styles.border,
        styles.bg,
        isClickable &&
          "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/5",
        !isClickable && "cursor-not-allowed opacity-60"
      )}
    >
      {/* Glow accent bar for available */}
      {statusColor === "brand" && (
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />
      )}

      {/* Pulse accent bar for in-progress */}
      {statusColor === "amber" && (
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent animate-pulse"
          aria-hidden="true"
        />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            styles.border,
            styles.bg
          )}
        >
          {node.type === "experiment" ? (
            <FlaskConical className={cn("size-4", styles.text)} />
          ) : (
            <BookOpen className={cn("size-4", styles.text)} />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {node.label}
            </h3>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider",
                styles.badge
              )}
            >
              <StatusIcon icon={statusIcon} className="size-2.5" />
              {t(getBadgeLabel(statusIcon))}
            </span>

            {/* Depth badge */}
            <span className="text-[0.6rem] font-mono text-slate-400 dark:text-slate-500">
              {t("minimind.learning.step", { step: learningNode.depth + 1 })}
            </span>
          </div>

          {node.metadata.description && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
              {node.metadata.description}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 text-[0.65rem] text-slate-400 dark:text-slate-500">
            {/* Est. time */}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {t("minimind.learning.minute", { count: learningNode.estimatedMinutes })}
            </span>

            {/* Concept count */}
            {learningNode.conceptIds.length > 0 && (
              <span>
                {t("minimind.learning.concept", { count: learningNode.conceptIds.length })}
              </span>
            )}

            {/* Experiment count */}
            {learningNode.experimentIds.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <FlaskConical className="size-3" />
                {learningNode.experimentIds.length}
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        {isClickable && (
          <ChevronRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 dark:text-slate-600" />
        )}
      </div>
    </motion.button>
  );
}
