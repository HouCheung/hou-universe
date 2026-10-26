"use client";

// ============================================================
// DashboardHero — AI Lab identity + premium hero (Phase 70)
// ============================================================
//
// Visual: research instrument + premium AI laboratory.
// NOT a generic SaaS dashboard.
//
// Hierarchy:
//   AI LAB
//   MINIMIND RESEARCH STUDIO
//   "Build. Train. Understand."
//   Short description
//   Primary CTA + Secondary CTA
//   Live stats row (real data)
//
// All data sourced through the adapter layer.
// Zero direct registry imports.
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  Sparkles,
  Rocket,
  Box,
  Layers,
  TrendingUp,
  ArrowRight,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { computeDashboardProgress } from "@/lib/ai-lab/adapters/progressAdapter";
import { loadProgressPercent } from "@/lib/ai-lab/adapters/missionAdapter";

// ============================================================
// Animation variants
// ============================================================

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

const statVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.6 + i * 0.1, ease: "easeOut" },
  }),
};

// ============================================================
// DashboardHero
// ============================================================

export function DashboardHero() {
  const { t } = useTranslation();
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    setProgressPercent(loadProgressPercent());
  }, []);

  const progress = computeDashboardProgress();
  const { modules, phase } = progress;

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative mx-auto max-w-4xl"
    >
      {/* ── Cosmic background accents ── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-20 -top-32 h-[400px] rounded-full opacity-[0.04] blur-[120px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(var(--brand-rgb), 0.4) 0%, rgba(var(--brand-deep-rgb), 0.15) 40%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 left-1/4 h-[300px] w-[50%] rounded-full opacity-[0.03] blur-[100px]"
        style={{
          background:
            "radial-gradient(ellipse, rgba(var(--brand-light-rgb), 0.2) 0%, rgba(var(--brand-rgb), 0.08) 50%, transparent 75%)",
        }}
      />

      {/* ── Glass card container ── */}
      <div className="relative rounded-2xl border border-brand/10 bg-brand/[0.02] px-8 py-12 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.03)] sm:px-14 sm:py-16">
        {/* Top glow line */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/25 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center">
          {/* ── Subhead: AI LAB ── */}
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]"
          >
            <Rocket className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("aiLab.subhead")}
            </span>
          </motion.div>

          {/* ── Main heading ── */}
          <motion.h1
            variants={itemVariants}
            className="mt-6 text-4xl font-black tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            {t("aiLab.studio.hero.title")}
          </motion.h1>

          {/* ── Tagline ── */}
          <motion.p
            variants={itemVariants}
            className="mt-4 font-mono text-sm tracking-wide text-brand/60 dark:text-brand-light/60"
          >
            {t("aiLab.studio.hero.mission")}
          </motion.p>

          {/* ── Description ── */}
          <motion.p
            variants={itemVariants}
            className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base"
          >
            {t("aiLab.studio.hero.subtitle")}
          </motion.p>

          {/* ── CTAs ── */}
          <motion.div
            variants={itemVariants}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            {/* Primary CTA: Start Journey */}
            <Link
              href="/ai-lab/journey"
              className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.08] px-5 py-2.5 text-sm font-semibold text-brand transition-all duration-300 hover:border-brand/35 hover:bg-brand/[0.14] hover:shadow-[0_0_24px_rgba(var(--brand-rgb),0.12)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-brand/25 dark:bg-brand/[0.1] dark:text-brand-light dark:hover:border-brand/40 dark:hover:bg-brand/[0.16]"
              aria-label={t("aiLab.dashboard.resumeJourney")}
            >
              <BookOpen className="size-4" />
              {t("aiLab.dashboard.resumeJourney")}
              <ArrowRight className="size-3.5" />
            </Link>

            {/* Secondary CTA: Explore Experiments */}
            <Link
              href="/ai-lab/experiments"
              className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.02] px-5 py-2.5 text-sm font-medium text-slate-600 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400 dark:hover:border-brand/25 dark:hover:text-brand/80"
              aria-label={t("aiLab.dashboard.runExperiment")}
            >
              <Sparkles className="size-4" />
              {t("aiLab.dashboard.runExperiment")}
            </Link>
          </motion.div>

          {/* ── Live stat row ── */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            {/* Modules */}
            <motion.div
              custom={0}
              initial="hidden"
              animate="visible"
              variants={statVariants}
              className="flex items-center gap-2"
            >
              <Box className="size-4 text-brand/50" />
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {modules.implemented}/{modules.total}
              </span>
              <span className="text-xs text-slate-500/60 dark:text-slate-400/50">
                {t("aiLab.studio.hero.modulesStat")}
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
              <Layers className="size-4 text-brand/50" />
              <span className="text-sm font-semibold text-foreground">
                {phase.label}
              </span>
              <span className="text-xs text-slate-500/60 dark:text-slate-400/50">
                {t("aiLab.studio.hero.phaseStat")}
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
              <TrendingUp className="size-4 text-brand/50" />
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {progressPercent}%
              </span>
              <span className="text-xs text-slate-500/60 dark:text-slate-400/50">
                {t("aiLab.dashboard.progressStat")}
              </span>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
