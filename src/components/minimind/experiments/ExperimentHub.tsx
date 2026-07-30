"use client";

import { motion, type Variants } from "framer-motion";
import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getActiveExperiments, getPlannedExperiments } from "@/data/minimind/experiment-registry";
import { ExperimentCard } from "./ExperimentCard";

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

// ============================================================
// ExperimentHub
// ============================================================

interface ExperimentHubProps {
  /** Callback fired when the user clicks an experiment card to enter the experiment playground */
  onSelectExperiment: (id: string) => void;
}

/**
 * ExperimentHub — top-level page that lists MiniMind interactive experiments.
 *
 * Pulls the experiment catalog from the experiment-registry SSOT and renders
 * active experiments in a responsive card grid with staggered Framer Motion
 * animations. When no active experiments exist, a glass-panel empty state is
 * shown with the count of planned experiments.
 */
export function ExperimentHub({ onSelectExperiment }: ExperimentHubProps) {
  const { t } = useTranslation();
  const activeExperiments = getActiveExperiments();
  const plannedExperiments = getPlannedExperiments();

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="text-center"
      >
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("minimind.experiments.heading")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("minimind.experiments.intro")}
        </p>
      </motion.div>

      {/* Active experiments grid */}
      {activeExperiments.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {activeExperiments.map((exp) => (
            <ExperimentCard
              key={exp.id}
              experiment={exp}
              onSelect={onSelectExperiment}
            />
          ))}
        </motion.div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-16 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.02]">
          <FlaskConical className="size-8 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {t("minimind.experiments.noActive")}
          </p>
          {plannedExperiments.length > 0 && (
            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">
              {t("minimind.experiments.plannedCount", { count: plannedExperiments.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
