"use client";

// ============================================================
// DashboardHero — AI Lab identity + live MiniMind stats
// ============================================================
//
// Clones MissionBanner's visual pattern (glass card, glow accent,
// Rocket icon, heading, intro, mission statement) and adds a
// 3-stat row below the mission statement:
//   Modules: implemented/total | Phase: current | Progress: N%
//
// Data sources:
//   - MINIMIND_MODULES → module counts
//   - LEARNING_PATHS → current critical-path phase label
//   - localStorage("minimind-learning-progress") → completion %
//
// All data is read-only. Zero new metadata.
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles, Rocket, Box, Layers, TrendingUp } from "lucide-react";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { LEARNING_PATHS } from "@/data/minimind/learning-registry";

// ============================================================
// Types
// ============================================================

interface StoredProgress {
  v: number;
  nodeStatus: Record<string, string>;
  conceptReviewed: Record<string, boolean>;
  experimentCompleted: Record<string, boolean>;
  lastUpdated: string;
}

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.4 + i * 0.12, ease: "easeOut" },
  }),
};

// ============================================================
// Helpers
// ============================================================

function loadProgressPercent(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return 0;
    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1 || !parsed.nodeStatus) return 0;
    const statuses = Object.values(parsed.nodeStatus);
    if (statuses.length === 0) return 0;
    const done = statuses.filter(
      (s) => s === "completed" || s === "mastered"
    ).length;
    return Math.round((done / statuses.length) * 100);
  } catch {
    return 0;
  }
}

// ============================================================
// DashboardHero
// ============================================================

export function DashboardHero() {
  const { t } = useTranslation();
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    setProgressPercent(loadProgressPercent());
  }, []);

  // ── Derived stats ──
  const implementedCount = MINIMIND_MODULES.filter(
    (m) => m.implemented
  ).length;
  const totalCount = MINIMIND_MODULES.length;

  // Current phase from critical path: find the phase of the first
  // in-progress module on the critical path, or default to first path label.
  const criticalPath = LEARNING_PATHS.find((p) => p.type === "critical");
  const criticalPathLabel = criticalPath?.label ?? "Foundation";

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={variants}
      className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
    >
      {/* Glow accent */}
      <span
        className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col items-center text-center gap-4">
        {/* Subhead pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
          <Rocket className="size-3.5 text-brand/70" />
          <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
            {t("aiLab.subhead")}
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          {t("aiLab.heading")}
        </h1>

        {/* Intro */}
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          {t("aiLab.intro")}
        </p>

        {/* Mission */}
        <div className="flex items-center gap-1.5 text-xs text-brand/60 dark:text-brand-light/60">
          <Sparkles className="size-3" />
          <span className="font-mono italic">
            {t("aiLab.missionStatement")}
          </span>
        </div>

        {/* ── Live stat row ── */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-6">
          {/* Modules */}
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <Box className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {implementedCount}/{totalCount}
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.modulesStat")}
            </span>
          </motion.div>

          {/* Phase */}
          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <Layers className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground">
              {criticalPathLabel}
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.phaseStat")}
            </span>
          </motion.div>

          {/* Progress */}
          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={statVariants}
            className="flex items-center gap-2"
          >
            <TrendingUp className="size-4 text-brand/60" />
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {progressPercent}%
            </span>
            <span className="text-xs text-slate-500/70 dark:text-slate-400/60">
              {t("aiLab.dashboard.progressStat")}
            </span>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
