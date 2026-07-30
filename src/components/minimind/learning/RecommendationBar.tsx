"use client";

// ============================================================
// RecommendationBar — horizontal scroll of next-step cards
// ============================================================

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  TrendingUp,
  Compass,
  Beaker,
  Sparkles,
} from "lucide-react";
import type { Recommendation } from "@/data/minimind/learning-registry";
import { adaptRecommendations } from "@/lib/minimind/learning";
import { cn } from "@/lib/utils";

// ============================================================
// Icon resolver per recommendation reason
// ============================================================

const ReasonIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  next_in_path: ArrowRight,
  prerequisite_for: TrendingUp,
  experiment: Beaker,
  reinforce: Sparkles,
  explore: Compass,
};

const ReasonBadges: Record<string, string> = {
  next_in_path: "Next Step",
  prerequisite_for: "Gateway",
  experiment: "Validate",
  reinforce: "Reinforce",
  explore: "Explore",
};

const ReasonColors: Record<string, string> = {
  next_in_path: "border-brand/20 bg-brand/10 text-brand",
  prerequisite_for: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  experiment: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  reinforce: "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  explore: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400",
};

// ============================================================
// RecommendationBar
// ============================================================

interface RecommendationBarProps {
  recommendations: Recommendation[];
}

export function RecommendationBar({ recommendations }: RecommendationBarProps) {
  const cards = useMemo(
    () => adaptRecommendations(recommendations),
    [recommendations]
  );

  if (cards.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Recommended Next Steps
      </h3>

      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none">
        {cards.map((card, i) => {
          const ReasonIcon =
            ReasonIcons[card.recommendation.reason] ?? Compass;
          const reasonColor =
            ReasonColors[card.recommendation.reason] ??
            "border-slate-500/20 bg-slate-500/10 text-slate-500";

          return (
            <motion.div
              key={card.recommendation.sourceId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="shrink-0 snap-start"
            >
              <Link
                href={card.actionHref}
                className="group flex w-[200px] flex-col gap-2 rounded-xl border border-brand/10 bg-brand/[0.02] p-3.5 backdrop-blur-sm transition-all duration-300 hover:border-brand/25 hover:bg-brand/[0.05] hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/5 dark:border-white/[0.06] dark:bg-white/[0.02]"
              >
                {/* Priority bar */}
                <div className="h-0.5 w-full rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-brand/60 transition-all duration-500"
                    style={{ width: `${card.priorityPercent}%` }}
                  />
                </div>

                {/* Reason badge */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 self-start rounded-full border px-2 py-0.5 text-[0.6rem] font-mono uppercase tracking-wider",
                    reasonColor
                  )}
                >
                  <ReasonIcon className="size-2.5" />
                  {ReasonBadges[card.recommendation.reason] ?? "Explore"}
                </span>

                {/* Node label */}
                <p className="text-sm font-semibold text-foreground line-clamp-2">
                  {card.node?.label ??
                    card.recommendation.sourceId.replace(/^(module|concept|experiment):/, "")}
                </p>

                {/* Description */}
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                  {card.recommendation.description}
                </p>

                {/* CTA */}
                <span className="mt-auto inline-flex items-center gap-1 text-[0.65rem] font-medium text-brand transition-colors group-hover:text-brand/80">
                  {card.actionLabel}
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
