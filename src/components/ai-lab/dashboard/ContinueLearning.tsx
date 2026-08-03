"use client";

// ============================================================
// ContinueLearning — localStorage resume card
// ============================================================
//
// Reads UserProgress from localStorage. If the user has started
// learning, shows a resume card with the last active module,
// overall progress, and three action buttons.
//
// States:
//   - Has progress: shows resume card with 3 actions
//   - No progress / first visit: renders nothing (return null)
//
// Data sources:
//   - localStorage("minimind-learning-progress") → UserProgress
//   - getOverallProgress(progress) → stats
//   - MINIMIND_MODULES → resolve module title
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
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { getOverallProgress } from "@/data/minimind/learning-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import type { UserProgress, LearningStatus } from "@/data/minimind/learning-registry";

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

interface ResumeData {
  moduleId: string;
  moduleTitle: string;
  percentComplete: number;
  modulesCompleted: number;
  modulesTotal: number;
  lastUpdated: string;
}

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
// localStorage helpers
// ============================================================

function loadResumeData(): ResumeData | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return null;

    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;

    const progress: UserProgress = {
      nodeStatus: (parsed.nodeStatus ?? {}) as Record<string, LearningStatus>,
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };

    // Must have at least one non-locked node to show resume
    const hasAnyProgress = Object.values(progress.nodeStatus).some(
      (s) => s !== "locked"
    );
    if (!hasAnyProgress) return null;

    // Find the in_progress node, or fall back to last completed
    let activeSourceId = "";
    for (const [id, status] of Object.entries(progress.nodeStatus)) {
      if (status === "in_progress") {
        activeSourceId = id;
        break;
      }
    }
    if (!activeSourceId) {
      // Fallback: last completed
      for (const [id, status] of Object.entries(progress.nodeStatus)) {
        if (status === "completed" || status === "mastered") {
          activeSourceId = id;
        }
      }
    }

    // Strip "module:" prefix to get MINIMIND_MODULES id
    const moduleId = activeSourceId.replace(/^module:/, "");
    const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);

    const stats = getOverallProgress(progress);

    return {
      moduleId,
      moduleTitle: mod?.title ?? moduleId,
      percentComplete: stats.percentComplete,
      modulesCompleted: stats.modulesCompleted,
      modulesTotal: stats.modulesTotal,
      lastUpdated: progress.lastUpdated,
    };
  } catch {
    return null;
  }
}

// ============================================================
// Time ago formatter
// ============================================================

function formatTimeAgo(isoString: string): string {
  try {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffMs = now - then;
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return `${Math.floor(diffDays / 30)}mo ago`;
  } catch {
    return "";
  }
}

// ============================================================
// ContinueLearning
// ============================================================

export function ContinueLearning() {
  const { t } = useTranslation();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);

  useEffect(() => {
    setResumeData(loadResumeData());
  }, []);

  // ── Hidden when no progress ──
  if (!resumeData) return null;

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
            {/* Progress ring (simplified as filled circle) */}
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
            {/* Continue Journey */}
            <Link
              href={`/ai-lab/journey?module=${encodeURIComponent(resumeData.moduleId)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-3.5 py-2 text-xs font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
            >
              <BookOpen className="size-3.5" />
              {t("aiLab.dashboard.resumeJourney")}
              <ArrowRight className="size-3" />
            </Link>

            {/* Open Knowledge Graph */}
            <Link
              href="/ai-lab/knowledge"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/10 bg-brand/[0.02] px-3.5 py-2 text-xs font-medium text-slate-600/80 transition-all duration-300 hover:border-brand/20 hover:bg-brand/[0.05] hover:text-brand dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-slate-400/70 dark:hover:border-brand/25 dark:hover:text-brand/70"
            >
              <Brain className="size-3.5" />
              {t("aiLab.dashboard.openKnowledgeGraph")}
            </Link>

            {/* Run Experiment */}
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
