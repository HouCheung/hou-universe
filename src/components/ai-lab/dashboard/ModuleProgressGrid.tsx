"use client";

// ============================================================
// ModuleProgressGrid — 8 MiniMind modules with mastery status (Phase 70)
// ============================================================
//
// Each card shows: status indicator, module name, concept progress,
// progress bar, mastery status, next action.
//
// Mastery statuses derived from registry + user progress:
//   Mastered  — module completed + concepts reviewed
//   Learning  — module in-progress or user actively learning
//   Started   — user has some progress in this module
//   Locked    — upcoming, no user progress yet
//
// Click navigates to: /ai-lab/journey?module=<module>
//
// Responsive:
//   Desktop: 4 columns | Tablet: 2 columns | Mobile: 1 column
//
// Adapter sources:
//   - src/lib/ai-lab/adapters/progressAdapter.ts (module data)
//   - src/lib/ai-lab/adapters/missionAdapter.ts (user progress)
//
// Zero direct registry imports.
// ============================================================

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  CheckCircle2,
  BookOpen,
  Lock,
  Play,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { getModules, type MiniMindModule } from "@/lib/ai-lab/adapters/progressAdapter";
import { loadProgress } from "@/lib/ai-lab/adapters/missionAdapter";
import type { UserProgress } from "@/data/minimind/learning-registry";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

type MasteryStatus = "Mastered" | "Learning" | "Started" | "Locked";

interface ModuleWithMastery extends MiniMindModule {
  mastery: MasteryStatus;
  conceptProgress: number; // 0–100
  masteredConcepts: number;
  totalConcepts: number;
}

// ============================================================
// Mastery derivation
// ============================================================

function deriveMastery(
  mod: MiniMindModule,
  progress: UserProgress | null
): MasteryStatus {
  if (!progress) {
    // No progress at all — show implemented modules as "Started", rest as "Locked"
    if (mod.status === "completed" || mod.status === "in-progress") return "Started";
    return "Locked";
  }

  const nodeStatus = progress.nodeStatus;
  const moduleKey = `module:${mod.id}`;

  // Check if user has this module's node mastered/completed
  const moduleStatus = nodeStatus[moduleKey];
  if (moduleStatus === "mastered") return "Mastered";
  if (moduleStatus === "completed") return "Mastered";
  if (moduleStatus === "in_progress") return "Learning";

  // Check if any node within this module has progress
  const hasModuleProgress = Object.entries(nodeStatus).some(
    ([key, status]) =>
      key.startsWith(`module:${mod.id}`) ||
      (key.startsWith("concept:") && status !== "locked")
  );

  if (hasModuleProgress) return "Started";

  // Registry-based fallback
  if (mod.status === "completed") return "Mastered";
  if (mod.status === "in-progress") return "Learning";

  return "Locked";
}

function deriveConceptProgress(
  mod: MiniMindModule,
  _progress: UserProgress | null
): { mastered: number; total: number; percent: number } {
  // Derive concept counts from module metadata
  const concepts = mod.metadata?.concepts ?? [];
  const total = Math.max(concepts.length, 1);

  // For now, base concept progress on module implementation status
  let mastered = 0;
  if (mod.status === "completed") mastered = total;
  else if (mod.status === "in-progress") mastered = Math.floor(total * 0.4);

  const percent = Math.round((mastered / total) * 100);
  return { mastered, total, percent };
}

// ============================================================
// Mastery config
// ============================================================

const MASTERY_CONFIG: Record<
  MasteryStatus,
  { dot: string; label: string; badge: string; icon: React.ComponentType<{ className?: string }> }
> = {
  Mastered: {
    dot: "bg-emerald-500/60",
    label: "aiLab.dashboard.mastered",
    badge:
      "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  Learning: {
    dot: "bg-brand/60",
    label: "aiLab.dashboard.learning",
    badge:
      "border-brand/20 bg-brand/[0.06] text-brand dark:text-brand-light",
    icon: BookOpen,
  },
  Started: {
    dot: "bg-amber-500/50",
    label: "aiLab.dashboard.started",
    badge:
      "border-amber-500/20 bg-amber-500/[0.06] text-amber-600 dark:text-amber-400",
    icon: Play,
  },
  Locked: {
    dot: "bg-slate-400/30",
    label: "aiLab.dashboard.locked",
    badge:
      "border-slate-500/15 bg-slate-500/[0.04] text-slate-500 dark:text-slate-400",
    icon: Lock,
  },
};

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

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: "easeOut" },
  }),
};

// ============================================================
// Progress bar sub-component
// ============================================================

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-200/50 dark:bg-white/[0.06]">
      <motion.div
        className="h-full rounded-full bg-brand/60 dark:bg-brand/50"
        initial={{ width: 0 }}
        whileInView={{ width: `${percent}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
      />
    </div>
  );
}

// ============================================================
// ModuleProgressGrid
// ============================================================

export function ModuleProgressGrid() {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<UserProgress | null>(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  const modules = getModules();
  const enrichedModules: ModuleWithMastery[] = useMemo(
    () =>
      modules.map((mod) => {
        const mastery = deriveMastery(mod, progress);
        const conceptInfo = deriveConceptProgress(mod, progress);
        return {
          ...mod,
          mastery,
          conceptProgress: conceptInfo.percent,
          masteredConcepts: conceptInfo.mastered,
          totalConcepts: conceptInfo.total,
        };
      }),
    [modules, progress]
  );

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.sections.moduleProgress" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {enrichedModules.map((mod, i) => {
          const masteryCfg = MASTERY_CONFIG[mod.mastery];
          const isLocked = mod.mastery === "Locked";

          return (
            <motion.div
              key={mod.id}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
            >
              <Link
                href={
                  isLocked
                    ? "#"
                    : `/ai-lab/journey?module=${encodeURIComponent(mod.id)}`
                }
                onClick={(e) => {
                  if (isLocked) e.preventDefault();
                }}
                className={cn(
                  "group flex flex-col rounded-xl border px-5 py-4 backdrop-blur-sm transition-all duration-300",
                  isLocked
                    ? "cursor-not-allowed border-slate-500/[0.06] bg-slate-500/[0.01] opacity-60 dark:border-white/[0.03] dark:bg-white/[0.005]"
                    : "border-brand/10 bg-brand/[0.03] hover:scale-[1.02] hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)] dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.07)]"
                )}
                aria-disabled={isLocked}
              >
                {/* Status dot + name */}
                <div className="mb-2 flex items-center gap-2.5">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      masteryCfg.dot
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "truncate text-sm font-semibold transition-colors",
                      isLocked
                        ? "text-slate-500/60 dark:text-slate-400/50"
                        : "text-foreground group-hover:text-brand"
                    )}
                  >
                    {mod.title}
                  </span>
                </div>

                {/* Description */}
                <p className="mb-3 line-clamp-2 flex-1 text-[0.65rem] leading-relaxed text-slate-500/60 dark:text-slate-500/50">
                  {mod.description}
                </p>

                {/* Mastery badge */}
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6rem] font-medium",
                      masteryCfg.badge
                    )}
                  >
                    <masteryCfg.icon className="size-2.5" />
                    {t(masteryCfg.label)}
                  </span>
                  <span className="text-[0.6rem] text-slate-500/50 dark:text-slate-400/40 tabular-nums">
                    {mod.masteredConcepts}/{mod.totalConcepts} {t("aiLab.dashboard.conceptsLabel")}
                  </span>
                </div>

                {/* Progress bar */}
                <ProgressBar percent={mod.conceptProgress} />

                {/* Next action */}
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[0.6rem] text-slate-500/50 dark:text-slate-400/40">
                    {isLocked
                      ? t("aiLab.dashboard.completePrerequisites")
                      : mod.mastery === "Mastered"
                        ? t("aiLab.dashboard.reviewExperiment")
                        : t("aiLab.dashboard.continueLearningAction")}
                  </span>
                  {!isLocked && (
                    <ArrowRight className="size-3 text-slate-400/40 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
