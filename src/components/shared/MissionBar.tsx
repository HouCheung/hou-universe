"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";
import { getCurrentPhase, getCurrentTask, getOverallProgress } from "@/data/roadmap";
import { useEntrance } from "./EntranceSequence";

const containerVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut", delay: 0.6 },
  },
};

export function MissionBar() {
  const { t } = useTranslation();
  const { contentVisible } = useEntrance();

  const currentPhase = getCurrentPhase();
  const currentTask = getCurrentTask();
  const progress = getOverallProgress();

  if (!currentPhase || !currentTask) {
    return null;
  }

  return (
    <motion.div
      initial="hidden"
      animate={contentVisible ? "visible" : "hidden"}
      variants={containerVariants}
      className="mt-8"
    >
      <Link
        href="/ai-lab"
        className="group relative mx-auto block max-w-sm rounded-xl border border-brand/15 bg-brand/[0.03] px-5 py-4 backdrop-blur-sm transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.06] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.08)]"
      >
        {/* Top accent glow line */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/40 to-transparent opacity-50 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden="true"
        />

        {/* Header row: label + sparkle icon */}
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("hero.missionLabel")}
          </span>
          <ChevronRight className="ml-auto size-3 text-slate-400/50 transition-transform duration-300 group-hover:translate-x-0.5" />
        </div>

        {/* Phase + Task */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-medium text-brand/80 dark:text-brand-light/80">
            {t(currentPhase.titleKey)}
          </span>
          <span className="text-[0.6rem] text-slate-400 dark:text-slate-600">→</span>
          <span className="text-sm font-semibold text-foreground">
            {t(currentTask.titleKey)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-2.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200/60 dark:bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
              initial={{ width: 0 }}
              animate={{ width: `${progress.percent}%` }}
              transition={{ duration: 1.2, ease: "easeOut", delay: 1.0 }}
            />
          </div>
          <span className="font-mono text-[0.6rem] tabular-nums text-slate-500 dark:text-slate-500">
            {progress.percent}%
          </span>
        </div>
      </Link>
    </motion.div>
  );
}
