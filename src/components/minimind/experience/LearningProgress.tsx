"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  MINIMIND_MODULES,
  getModuleProgress,
} from "@/data/minimind/module-registry";
import { getAllNodes } from "@/data/roadmap";

// ============================================================
// Animation variants
// ============================================================

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

const rowVariants: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" },
  }),
};

// ============================================================
// Status display helpers
// ============================================================

function getStatusLabel(
  status: string,
  t: (key: string) => string
): string {
  switch (status) {
    case "completed":
      return t("roadmap.status.completed");
    case "in-progress":
      return t("roadmap.status.inProgress");
    case "upcoming":
      return t("roadmap.status.upcoming");
    default:
      return status;
  }
}

function getStatusColor(status: string): {
  badge: string;
  bar: string;
} {
  switch (status) {
    case "completed":
      return {
        badge:
          "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-400",
        bar: "from-emerald-500 to-emerald-400",
      };
    case "in-progress":
      return {
        badge: "border-brand/25 bg-brand/[0.08] text-brand",
        bar: "from-brand to-brand-deep",
      };
    case "upcoming":
      return {
        badge:
          "border-slate-500/[0.12] bg-slate-500/[0.04] text-slate-500 dark:border-white/[0.04] dark:text-slate-600",
        bar: "from-slate-500/30 to-slate-500/20",
      };
    default:
      return {
        badge:
          "border-slate-500/[0.12] bg-slate-500/[0.04] text-slate-500 dark:text-slate-600",
        bar: "from-slate-500/30 to-slate-500/20",
      };
  }
}

// ============================================================
// LearningProgress
// ============================================================

export function LearningProgress() {
  const { t } = useTranslation();

  // Build progress entries: merge registry data with roadmap status
  const allNodes = getAllNodes();
  const entries = MINIMIND_MODULES.map((mod) => {
    const roadmapNode = allNodes.find((n) => n.id === mod.id);
    // Module registry status is the source of truth; roadmap supplements i18n
    const progress = getModuleProgress(mod.status);
    const colors = getStatusColor(mod.status);

    return {
      id: mod.id,
      title: mod.title,
      description: mod.description,
      status: mod.status,
      phase: mod.phase,
      implemented: mod.implemented,
      progress,
      colors,
      titleKey: roadmapNode?.titleKey,
      descriptionKey: roadmapNode?.descriptionKey,
    };
  });

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
    >
      {/* Section header */}
      <div className="mb-10 flex items-center gap-5 sm:mb-14">
        <div className="h-10 w-1 shrink-0 rounded-full bg-gradient-to-b from-slate-500 via-slate-400 to-slate-600" />
        <div className="flex flex-col gap-0.5">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            {t("minimind.experience.sectionTitles.progress")}
          </h2>
        </div>
      </div>

      <p className="-mt-6 mb-10 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
        {t("minimind.experience.progress.description")}
      </p>

      {/* Progress rows */}
      <div className="flex flex-col gap-4">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={rowVariants}
            className="group rounded-xl border border-brand/10 bg-brand/[0.02] px-5 py-4 backdrop-blur-sm transition-all duration-300 hover:border-brand/20 dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:border-brand/25"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: title + metadata */}
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold tracking-tight text-foreground">
                    {entry.title}
                  </span>
                  {/* Status badge */}
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.55rem] font-mono tracking-[0.1em] uppercase",
                      entry.colors.badge
                    )}
                  >
                    {getStatusLabel(entry.status, t)}
                  </span>
                  {/* Phase badge */}
                  <span className="inline-flex items-center rounded-full border border-slate-500/[0.1] px-2 py-0.5 text-[0.55rem] font-mono tracking-[0.1em] uppercase text-slate-500/60 dark:border-white/[0.04] dark:text-slate-600">
                    {entry.phase}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500/70 dark:text-slate-400/60 line-clamp-1">
                  {entry.description}
                </p>
              </div>

              {/* Right: percentage */}
              <span className="text-lg font-black tabular-nums text-foreground sm:text-xl">
                {entry.progress}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/50 dark:bg-white/[0.05]">
              <motion.div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r",
                  entry.colors.bar
                )}
                initial={{ width: 0 }}
                whileInView={{ width: `${entry.progress}%` }}
                viewport={{ once: true }}
                transition={{ duration: 1, ease: "easeOut", delay: i * 0.08 }}
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
