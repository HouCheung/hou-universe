"use client";

// ============================================================
// ContinueLearning — resume card + first-visit fallback (Phase 70)
// ============================================================
//
// Reads UserProgress from localStorage via the mission adapter.
//
// States:
//   - Has progress: show resume card with module info + 3 actions
//   - No progress / first visit: show welcome card with CTA to
//     start the first learning module (does NOT fabricate progress)
//
// Adapter source: src/lib/ai-lab/adapters/missionAdapter.ts
// Zero direct registry imports.
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  BookOpen,
  Brain,
  FlaskConical,
  ArrowRight,
  Clock,
  Play,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  loadProgress,
  deriveResumeData,
  formatTimeAgo,
  type ResumeData,
} from "@/lib/ai-lab/adapters/missionAdapter";

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
// ContinueLearning
// ============================================================

export function ContinueLearning() {
  const { t } = useTranslation();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const progress = loadProgress();
    setResumeData(deriveResumeData(progress));
    setHasChecked(true);
  }, []);

  // ── SSR guard: don't render until client hydration ──
  if (!hasChecked) {
    return (
      <section className="mt-20 sm:mt-28">
        <SectionHeader titleKey="aiLab.dashboard.continueLearning" />
        <div className="h-20 animate-pulse rounded-xl bg-brand/[0.03] dark:bg-[rgba(var(--brand-rgb),0.04)]" />
      </section>
    );
  }

  // ── Has progress: resume card ──
  if (resumeData) {
    const timeAgo = formatTimeAgo(resumeData.lastUpdated);

    return (
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-80px" }}
        variants={variants}
        className="mt-20 sm:mt-28"
      >
        <SectionHeader titleKey="aiLab.dashboard.continueLearning" />

        <div className="rounded-xl border border-brand/10 bg-brand/[0.03] px-6 py-6 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-8 sm:py-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: resume info */}
            <div className="flex items-center gap-4">
              {/* Progress ring */}
              <div className="relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-brand/20 bg-brand/[0.04] dark:border-brand/25 dark:bg-brand/[0.06]">
                <span className="text-sm font-bold tabular-nums text-brand dark:text-brand-light">
                  {resumeData.percentComplete}%
                </span>
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {resumeData.moduleTitle}
                </p>
                <p className="mt-0.5 text-xs text-slate-500/80 dark:text-slate-400/70">
                  {resumeData.modulesCompleted}/{resumeData.modulesTotal}{" "}
                  {t("aiLab.dashboard.modulesStat")}
                  {" · "}
                  {resumeData.percentComplete}%{" "}
                  {t("aiLab.dashboard.progressStat")}
                </p>
                {timeAgo && (
                  <p className="mt-1.5 flex items-center gap-1 text-[0.65rem] text-slate-400/80 dark:text-slate-500/70">
                    <Clock className="size-3" />
                    {t("aiLab.dashboard.lastActive")}: {timeAgo}
                  </p>
                )}
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/ai-lab/journey?module=${encodeURIComponent(resumeData.moduleId)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-3.5 py-2 text-xs font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
              >
                <BookOpen className="size-3.5" />
                {t("aiLab.dashboard.resumeJourney")}
                <ArrowRight className="size-3" />
              </Link>

              <Link
                href="/ai-lab/knowledge"
                className="inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.02] px-3.5 py-2 text-xs font-medium text-slate-600/80 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400/70 dark:hover:border-brand/25 dark:hover:text-brand/70"
              >
                <Brain className="size-3.5" />
                {t("aiLab.dashboard.openKnowledgeGraph")}
              </Link>

              <Link
                href="/ai-lab/experiments"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/15 bg-amber-500/[0.03] px-3.5 py-2 text-xs font-medium text-amber-600/80 transition-all duration-300 hover:border-amber-500/30 hover:bg-amber-500/[0.06] hover:text-amber-600 dark:border-amber-500/20 dark:text-amber-500/60 dark:hover:border-amber-500/35 dark:hover:text-amber-500/80"
              >
                <FlaskConical className="size-3.5" />
                {t("aiLab.dashboard.runExperiment")}
              </Link>
            </div>
          </div>
        </div>
      </motion.section>
    );
  }

  // ── No progress / first visit: welcome card ──
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.continueLearning" />

      <div className="rounded-xl border border-dashed border-brand/15 bg-brand/[0.02] px-6 py-8 text-center backdrop-blur-sm dark:border-white/[0.08] dark:bg-[rgba(var(--brand-rgb),0.03)]">
        <BookOpen className="mx-auto size-8 text-brand/30 dark:text-brand/20" />
        <h3 className="mt-4 text-base font-semibold text-foreground">
          {t("aiLab.dashboard.startJourneyTitle")}
        </h3>
        <p className="mt-2 max-w-md mx-auto text-sm text-slate-500/70 dark:text-slate-400/60">
          {t("aiLab.dashboard.startJourneyDesc")}
        </p>
        <Link
          href="/ai-lab/journey?module=tokenizer"
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/[0.06] px-5 py-2.5 text-sm font-semibold text-brand transition-all duration-300 hover:border-brand/35 hover:bg-brand/[0.12] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-brand/25 dark:bg-brand/[0.08] dark:text-brand-light dark:hover:border-brand/40 dark:hover:bg-brand/[0.14]"
          aria-label="Start learning journey"
        >
          <Play className="size-4" />
          {t("aiLab.dashboard.beginLearning")}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </motion.section>
  );
}
