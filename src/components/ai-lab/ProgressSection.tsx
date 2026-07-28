"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import { getCurrentPhase, getCurrentTask, getOverallProgress } from "@/data/roadmap";
import { Zap, TrendingUp } from "lucide-react";

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

export function ProgressSection() {
  const { t } = useTranslation();
  const currentPhase = getCurrentPhase();
  const currentTask = getCurrentTask();
  const progress = getOverallProgress();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.progress" />

      <div className="grid gap-5 sm:grid-cols-3">
        {/* Current Phase */}
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="size-4 text-brand/70" />
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
              Phase
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {currentPhase ? t(currentPhase.titleKey) : "—"}
          </p>
        </div>

        {/* Current Task */}
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-brand/70" />
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
              Task
            </span>
          </div>
          <p className="text-lg font-bold text-foreground">
            {currentTask ? t(currentTask.titleKey) : "—"}
          </p>
        </div>

        {/* Overall Progress */}
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-slate-500 dark:text-slate-400/60">
              Progress
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black text-foreground tabular-nums">
              {progress.percent}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-500">
              {progress.completed}/{progress.total} done
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/50 dark:bg-white/[0.06]">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-brand-deep"
              initial={{ width: 0 }}
              whileInView={{ width: `${progress.percent}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </motion.section>
  );
}
