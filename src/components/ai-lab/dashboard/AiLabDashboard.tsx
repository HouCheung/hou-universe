"use client";

// ============================================================
// AiLabDashboard — MiniMind Research Lab Dashboard
// ============================================================
//
// Composes 12 standalone dashboard sections, all data sourced
// exclusively through the adapter layer:
//
//   src/lib/ai-lab/adapters/
//     progressAdapter.ts  — module/experiment stats
//     missionAdapter.ts   — learning intelligence
//     moduleLinks.ts      — navigation route config
//     historyAdapter.ts   — experiment run history
//     trainingAdapter.ts  — training metrics
//
// Sections (Phase 54 order):
//   1. DashboardHero       — AI Lab identity + live stats
//   2. ResearchOverview    — model status, training status, experiment summary
//   3. ArchitectureExplorer — interactive pipeline visualization
//   4. CurrentMission      — next recommended action
//   5. ContinueLearning    — resume card (hidden when no progress)
//   6. TrainingObservatory — training metrics visualization
//   7. ExperimentHistoryPanel — training run history + metrics
//   8. ExperimentLeaderboard — ranked experiment results
//   9. GenerationShowcase   — before/after generation comparison
//  10. ModuleGalaxy         — full module grid with status
//  11. ExplorationLinks     — 6-card navigation hub
//  12. ExperimentShowcaseSection — highlights active experiments
//
// Zero direct registry imports in this file or its children.
// ============================================================

import { motion, type Variants } from "framer-motion";
import {
  FlaskConical,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { DashboardHero } from "./DashboardHero";
import { ResearchOverview } from "./ResearchOverview";
import { ArchitectureExplorer } from "./ArchitectureExplorer";
import { CurrentMission } from "./CurrentMission";
import { ContinueLearning } from "./ContinueLearning";
import { TrainingObservatory } from "./TrainingObservatory";
import { ExperimentHistoryPanel } from "./ExperimentHistoryPanel";
import { ExperimentLeaderboard } from "./ExperimentLeaderboard";
import { GenerationShowcase } from "./GenerationShowcase";
import { ModuleGalaxy } from "./ModuleGalaxy";
import { ExplorationLinks } from "./ExplorationLinks";
import {
  getActiveExperiments,
  getModules,
} from "@/lib/ai-lab/adapters/progressAdapter";
import { cn } from "@/lib/utils";

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
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" },
  }),
};

// ============================================================
// Bonus: Experiment Showcase (non-intrusive, additive)
// ============================================================

function ExperimentShowcaseSection() {
  const experiments = getActiveExperiments();
  const modules = getModules();

  if (experiments.length === 0) {
    return null;
  }

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.experimentsLabel" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {experiments.map((exp, i) => {
          const relatedMod = modules.find(
            (m) => m.id === exp.relatedModule
          );

          return (
            <motion.div
              key={exp.id}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
            >
              <Link
                href={`/ai-lab/experiments?id=${encodeURIComponent(exp.id)}`}
                className={cn(
                  "group flex flex-col rounded-xl border border-amber-500/20 bg-brand/[0.03] px-5 py-5 backdrop-blur-sm transition-all duration-300",
                  "hover:scale-[1.02] hover:border-amber-500/35 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(245,158,11,0.08)]",
                  "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-amber-500/30 dark:hover:bg-[rgba(var(--brand-rgb),0.07)]"
                )}
              >
                {/* Icon + Title */}
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/[0.06] transition-all duration-300 group-hover:border-amber-500/40 group-hover:shadow-[0_0_20px_rgba(245,158,11,0.12)] dark:border-amber-500/25 dark:bg-amber-500/[0.08]">
                    <FlaskConical className="size-4 text-amber-500/70 transition-all duration-300 group-hover:text-amber-500" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-amber-600 dark:group-hover:text-amber-400">
                      {exp.title}
                    </h3>
                    {relatedMod && (
                      <span className="text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                        {relatedMod.title} module
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="mb-3 line-clamp-2 flex-1 text-[0.7rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60">
                  {exp.description}
                </p>

                {/* Concepts */}
                {exp.concepts.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {exp.concepts.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-amber-500/10 bg-amber-500/[0.03] px-2 py-0.5 text-[0.6rem] text-amber-600/80 dark:border-amber-500/15 dark:bg-amber-500/[0.04] dark:text-amber-400/70"
                      >
                        {c}
                      </span>
                    ))}
                    {exp.concepts.length > 3 && (
                      <span className="rounded-full border border-slate-500/10 bg-slate-500/[0.03] px-2 py-0.5 text-[0.6rem] text-slate-500/80 dark:border-slate-500/15 dark:text-slate-400/70">
                        +{exp.concepts.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Footer arrow */}
                <div className="flex items-center justify-end">
                  <ArrowRight className="size-3.5 text-slate-400/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-amber-500/60" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Link to all experiments */}
      <div className="mt-6 text-center">
        <Link
          href="/ai-lab/experiments"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500/80 transition-colors hover:text-brand dark:text-slate-400/70 dark:hover:text-brand-light"
        >
          View all experiments
          <ArrowRight className="size-3" />
        </Link>
      </div>
    </motion.section>
  );
}

// ============================================================
// AiLabDashboard — composition root
// ============================================================

export function AiLabDashboard() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      <DashboardHero />
      <ResearchOverview />
      <ArchitectureExplorer />
      <CurrentMission />
      <ContinueLearning />
      <TrainingObservatory />
      <ExperimentHistoryPanel />
      <ExperimentLeaderboard />
      <GenerationShowcase />
      <ModuleGalaxy />
      <ExplorationLinks />
      <ExperimentShowcaseSection />
    </div>
  );
}
