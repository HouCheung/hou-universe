"use client";

// ============================================================
// CurrentMission — learning-registry derived next action
// ============================================================
//
// Reads UserProgress from localStorage and calls learning-registry
// intelligence to determine:
//   1. The next available module on the critical path
//   2. The top-priority recommendation
//
// States:
//   - Has next node: shows module name, description, CTA link
//   - No progress yet: falls back to "Start with Tokenizer"
//   - All mastered: shows congratulations + experiment CTA
//
// Data sources:
//   - localStorage("minimind-learning-progress") → UserProgress
//   - getNextNodes(progress) → available module sourceIds
//   - getRecommendations(progress) → top priority rec
//   - MINIMIND_MODULES → resolve module title/description
// ============================================================

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, Target, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  getNextNodes,
  getRecommendations,
} from "@/data/minimind/learning-registry";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import type {
  UserProgress,
  Recommendation,
  LearningStatus,
} from "@/data/minimind/learning-registry";

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

function loadProgress(): UserProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("minimind-learning-progress");
    if (!raw) return null;
    const parsed: StoredProgress = JSON.parse(raw);
    if (parsed.v !== 1) return null;
    return {
      nodeStatus: (parsed.nodeStatus ?? {}) as Record<string, LearningStatus>,
      conceptReviewed: parsed.conceptReviewed ?? {},
      experimentCompleted: parsed.experimentCompleted ?? {},
      lastUpdated: parsed.lastUpdated ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ============================================================
// Derive current mission
// ============================================================

interface MissionData {
  moduleId: string; // MINIMIND_MODULES id (no prefix)
  title: string;
  description: string;
  recommendation: Recommendation | null;
  isAllDone: boolean;
}

function deriveMission(progress: UserProgress | null): MissionData {
  // ── Fallback: first visit, no progress ──
  if (!progress) {
    const firstModule = MINIMIND_MODULES[0];
    return {
      moduleId: firstModule?.id ?? "tokenizer",
      title: firstModule?.title ?? "Tokenizer",
      description: firstModule?.description ?? "",
      recommendation: null,
      isAllDone: false,
    };
  }

  // ── Get next available nodes ──
  const nextIds = getNextNodes(progress);

  // ── Get recommendations ──
  const recommendations = getRecommendations(progress);
  const topRec = recommendations.length > 0 ? recommendations[0] : null;

  // ── All done? ──
  if (nextIds.length === 0 && recommendations.length === 0) {
    return {
      moduleId: "",
      title: "",
      description: "",
      recommendation: null,
      isAllDone: true,
    };
  }

  // ── Pick the first available node ──
  // getNextNodes returns KnowledgeNode.id format: "module:tokenizer"
  // Strip prefix to get MINIMIND_MODULES id: "tokenizer"
  const nextSourceId = nextIds[0] ?? "module:tokenizer";
  const moduleId = nextSourceId.replace(/^module:/, "");
  const mod = MINIMIND_MODULES.find((m) => m.id === moduleId);

  return {
    moduleId,
    title: mod?.title ?? moduleId,
    description: mod?.description ?? "",
    recommendation: topRec,
    isAllDone: false,
  };
}

// ============================================================
// CurrentMission
// ============================================================

export function CurrentMission() {
  const { t } = useTranslation();
  const [mission, setMission] = useState<MissionData | null>(null);

  useEffect(() => {
    const progress = loadProgress();
    setMission(deriveMission(progress));
  }, []);

  // SSR guard — render nothing until client-side hydration
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
          <Link
            href="/ai-lab/experiments"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/15 bg-brand/[0.04] px-4 py-2 text-sm font-medium text-brand/80 transition-all duration-300 hover:border-brand/30 hover:bg-brand/[0.08] hover:text-brand dark:border-brand/20 dark:text-brand/70 dark:hover:border-brand/35 dark:hover:text-brand/90"
          >
            {t("aiLab.dashboard.runExperiment")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        /* ── Active mission card ── */
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
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-brand/60 dark:text-brand/50">
                {mission.recommendation
                  ? mission.recommendation.description
                  : t("aiLab.dashboard.noProgressYet")}
              </span>
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
      )}
    </motion.section>
  );
}
