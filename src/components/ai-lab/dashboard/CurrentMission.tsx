"use client";

// ============================================================
// CurrentMission — real roadmap-derived next action (Phase 70)
// ============================================================
//
// Reads UserProgress from localStorage via the mission adapter.
// Displays: current phase, module, learning objective, progress,
// next action, and cross-reference links to Knowledge + Experiments.
//
// States:
//   - Has next node: shows module name, description, progress, CTAs
//   - No progress yet: shows "Start your MiniMind journey"
//   - All mastered: shows congratulations + experiment CTA
//
// Cross-reference:
//   Explore in Knowledge → /ai-lab/knowledge?focus=<module>
//   Run Experiment       → /ai-lab/experiments?experiment=<related>
//
// Adapter source: src/lib/ai-lab/adapters/missionAdapter.ts
// Zero direct registry imports.
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Target,
  CheckCircle2,
  Brain,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  loadProgress,
  deriveMission,
  loadProgressPercent,
  type MissionData,
} from "@/lib/ai-lab/adapters/missionAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Animation variants
// ============================================================

const variants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: "easeOut" },
  },
};

// ============================================================
// CurrentMission
// ============================================================

export function CurrentMission() {
  const { t } = useTranslation();
  const [mission, setMission] = useState<MissionData | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    const progress = loadProgress();
    setMission(deriveMission(progress));
    setProgressPercent(loadProgressPercent());
  }, []);

  // ── SSR guard: skeleton until client hydration ──
  if (!mission) {
    return (
      <section className="mt-20 sm:mt-28">
        <SectionHeader titleKey="aiLab.dashboard.currentMission" />
        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-12 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200/30 dark:bg-white/[0.04]" />
        </div>
      </section>
    );
  }

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.currentMission" />

      {/* ── All mastered state ── */}
      {mission.isAllDone ? (
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] px-6 py-8 text-center backdrop-blur-sm dark:border-emerald-500/20 dark:bg-emerald-500/[0.04]">
          <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-500/70" />
          <p className="text-base font-semibold text-foreground">
            {t("aiLab.dashboard.allMastered")}
          </p>
          <p className="mt-2 text-sm text-slate-500/70 dark:text-slate-400/60">
            100% — {t("aiLab.dashboard.progressStat")}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/ai-lab/experiments"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-4 py-2 text-sm font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
            >
              <FlaskConical className="size-3.5" />
              {t("aiLab.dashboard.runExperiment")}
              <ArrowRight className="size-3.5" />
            </Link>
            <Link
              href="/ai-lab/knowledge"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.02] px-4 py-2 text-sm font-medium text-slate-600/80 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400/70 dark:hover:border-brand/25 dark:hover:text-brand/70"
            >
              <Brain className="size-3.5" />
              {t("aiLab.dashboard.openKnowledgeGraph")}
            </Link>
          </div>
        </div>
      ) : (
        /* ── Active mission card ── */
        <div className="space-y-3">
          <Link
            href={`/ai-lab/journey?module=${encodeURIComponent(mission.moduleId)}`}
            className="group flex items-center gap-5 rounded-xl border border-brand/10 bg-brand/[0.03] px-6 py-5 backdrop-blur-sm transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.07)] sm:px-8 sm:py-6"
          >
            {/* Status icon */}
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] transition-all duration-300 group-hover:border-brand/40 group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.12)] dark:border-brand/25 dark:bg-brand/[0.08]">
              <Target className="size-5.5 text-brand/70 transition-all duration-300 group-hover:text-brand" />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-brand/60 dark:text-brand/50">
                  {mission.recommendation?.description ??
                    t("aiLab.dashboard.noProgressYet")}
                </span>
                {/* Progress badge */}
                {progressPercent > 0 && (
                  <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-2 py-0.5 text-[0.6rem] font-medium tabular-nums text-brand/70 dark:border-brand/20 dark:text-brand/60">
                    {progressPercent}% {t("aiLab.dashboard.progressStat")}
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-base font-semibold text-foreground transition-colors group-hover:text-brand sm:text-lg">
                {mission.title}
              </h3>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500/80 dark:text-slate-400/70 sm:text-sm">
                {mission.description}
              </p>
            </div>

            {/* Arrow */}
            <div className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-brand/60 transition-all duration-300 group-hover:text-brand group-hover:translate-x-0.5 sm:flex dark:text-brand/50 dark:group-hover:text-brand/70">
              {mission.recommendation?.cta ??
                t("aiLab.dashboard.resumeJourney")}
              <ArrowRight className="size-3.5" />
            </div>
          </Link>

          {/* ── Cross-reference action links ── */}
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Link
              href={`/ai-lab/knowledge?focus=${encodeURIComponent(mission.moduleId)}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.02] px-3 py-1.5 text-xs font-medium text-slate-500/80 transition-all duration-300",
                "hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand",
                "dark:border-white/[0.06] dark:text-slate-400/60 dark:hover:border-brand/25 dark:hover:text-brand/70"
              )}
            >
              <Brain className="size-3" />
              {t("aiLab.dashboard.exploreInKnowledge")}
              <ArrowRight className="size-2.5" />
            </Link>
            <Link
              href={`/ai-lab/experiments?experiment=${encodeURIComponent(mission.moduleId)}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-amber-500/10 bg-amber-500/[0.02] px-3 py-1.5 text-xs font-medium text-amber-600/70 transition-all duration-300",
                "hover:border-amber-500/20 hover:bg-amber-500/[0.05] hover:text-amber-600",
                "dark:border-amber-500/15 dark:text-amber-400/60 dark:hover:border-amber-500/25 dark:hover:text-amber-400/80"
              )}
            >
              <FlaskConical className="size-3" />
              {t("aiLab.dashboard.tryExperiment")}
              <ArrowRight className="size-2.5" />
            </Link>
          </div>
        </div>
      )}
    </motion.section>
  );
}
