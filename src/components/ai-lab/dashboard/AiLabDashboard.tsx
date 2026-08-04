"use client";

// ============================================================
// AiLabDashboard — MiniMind Project Showcase Dashboard
// ============================================================
//
// Composes 5 sections, all data sourced exclusively from:
//   - src/data/minimind/module-registry.ts   (MINIMIND_MODULES)
//   - src/data/minimind/experiment-registry.ts (MINIMIND_EXPERIMENTS)
//
// Zero dependencies on: localStorage, learning-registry,
// mastery, or recommendation systems.
//
// Sections:
//   1. Hero              — MiniMind Research Lab identity
//   2. Project Status    — module / implemented / inference stats
//   3. Module Grid       — all modules: name, status, implemented, deps
//   4. Experiment Showcase — active experiments from registry
//   5. Exploration Links — nav cards (reuses existing component)
// ============================================================

import { motion, type Variants } from "framer-motion";
import {
  Rocket,
  Box,
  CheckCircle2,
  Cpu,
  FlaskConical,
  ArrowRight,
  GitBranch,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { SectionHeader } from "@/components/home/SectionHeader";
import { ExplorationLinks } from "./ExplorationLinks";
import {
  MINIMIND_MODULES,
  type MiniMindModule,
} from "@/data/minimind/module-registry";
import {
  MINIMIND_EXPERIMENTS,
  getActiveExperiments,
} from "@/data/minimind/experiment-registry";
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

const statVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.3 + i * 0.12, ease: "easeOut" },
  }),
};

// ============================================================
// Derived data (computed once at module scope from SSOT)
// ============================================================

const implementedModules = MINIMIND_MODULES.filter((m) => m.implemented);
const totalModules = MINIMIND_MODULES.length;
const implementedCount = implementedModules.length;
const inferenceAvailable = MINIMIND_MODULES.some(
  (m) => m.id === "inference" && m.implemented
);
const activeExperiments = getActiveExperiments();

// ============================================================
// Helpers
// ============================================================

const STATUS_STYLE: Record<MiniMindModule["status"], { dot: string; label: string }> = {
  completed: {
    dot: "bg-emerald-500/60",
    label: "Completed",
  },
  "in-progress": {
    dot: "bg-brand/60",
    label: "In Progress",
  },
  upcoming: {
    dot: "bg-slate-400/40",
    label: "Upcoming",
  },
};

// ============================================================
// Section 1: Hero
// ============================================================

function HeroSection() {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
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
            MiniMind Research Lab
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
          MiniMind Research Lab
        </h1>

        {/* Description */}
        <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
          Building a small language model from scratch.
        </p>
      </div>
    </motion.section>
  );
}

// ============================================================
// Section 2: Project Status
// ============================================================

interface StatCard {
  icon: LucideIcon;
  value: string;
  label: string;
}

function ProjectStatusSection() {
  const stats: StatCard[] = [
    {
      icon: Box,
      value: `${totalModules}`,
      label: "Modules Total",
    },
    {
      icon: CheckCircle2,
      value: `${implementedCount}`,
      label: "Implemented",
    },
    {
      icon: Cpu,
      value: inferenceAvailable ? "Yes" : "No",
      label: "Inference Ready",
    },
  ];

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={sectionVariants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.currentMission" />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            custom={i}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={statVariants}
            className="flex items-center gap-4 rounded-xl border border-brand/10 bg-brand/[0.03] px-6 py-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/[0.06] dark:border-brand/25 dark:bg-brand/[0.08]">
              <stat.icon className="size-4.5 text-brand/70" />
            </div>
            <div>
              <p className="text-xl font-bold tabular-nums text-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-slate-500/70 dark:text-slate-400/60">
                {stat.label}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

// ============================================================
// Section 3: Module Grid
// ============================================================

function ModuleGridSection() {
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
        {MINIMIND_MODULES.map((mod, i) => {
          const style = STATUS_STYLE[mod.status];

          return (
            <motion.div
              key={mod.id}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
              className={cn(
                "group rounded-xl border border-brand/10 bg-brand/[0.03] px-5 py-4 backdrop-blur-sm transition-all duration-300",
                "hover:scale-[1.02] hover:border-brand/20 hover:bg-brand/[0.06] hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.05)]",
                "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] dark:hover:border-white/[0.12] dark:hover:bg-[rgba(var(--brand-rgb),0.07)]"
              )}
            >
              {/* Status dot + name */}
              <div className="mb-2 flex items-center gap-2.5">
                <span
                  className={cn("size-2 shrink-0 rounded-full", style.dot)}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                  {mod.title}
                </span>
              </div>

              {/* Description */}
              <p className="mb-3 line-clamp-2 text-[0.65rem] leading-relaxed text-slate-500/70 dark:text-slate-500/60">
                {mod.description}
              </p>

              {/* Metadata row: status + implemented */}
              <div className="mb-3 flex flex-wrap items-center gap-3 text-[0.6rem]">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                    mod.status === "completed"
                      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400"
                      : mod.status === "in-progress"
                        ? "border-brand/20 bg-brand/[0.06] text-brand dark:text-brand-light"
                        : "border-slate-500/15 bg-slate-500/[0.04] text-slate-500 dark:text-slate-400"
                  )}
                >
                  {style.label}
                </span>

                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
                    mod.implemented
                      ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-400"
                      : "border-slate-500/15 bg-slate-500/[0.04] text-slate-500 dark:text-slate-400"
                  )}
                >
                  <CheckCircle2 className="size-2.5" />
                  {mod.implemented ? "Implemented" : "Not Implemented"}
                </span>
              </div>

              {/* Dependencies */}
              {mod.metadata.dependencies &&
                mod.metadata.dependencies.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[0.6rem] text-slate-500/60 dark:text-slate-400/50">
                    <GitBranch className="size-3" />
                    <span className="font-medium">Deps:</span>
                    <span className="truncate">
                      {mod.metadata.dependencies.join(", ")}
                    </span>
                  </div>
                )}
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}

// ============================================================
// Section 4: Experiment Showcase
// ============================================================

function ExperimentShowcaseSection() {
  if (activeExperiments.length === 0) {
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
        {activeExperiments.map((exp, i) => {
          const relatedMod = MINIMIND_MODULES.find(
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
          View all {MINIMIND_EXPERIMENTS.length} experiments
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
      <HeroSection />
      <ProjectStatusSection />
      <ModuleGridSection />
      <ExperimentShowcaseSection />
      <ExplorationLinks />
    </div>
  );
}
