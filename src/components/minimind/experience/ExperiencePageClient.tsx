"use client";

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { Sparkles } from "lucide-react";
import { ArchitectureOverview } from "@/components/minimind/experience/ArchitectureOverview";
import { MiniMindFlow } from "@/components/minimind/experience/MiniMindFlow";
import { ModuleDependencyGraph } from "@/components/minimind/experience/ModuleDependencyGraph";
import { LearningProgress } from "@/components/minimind/experience/LearningProgress";

// ============================================================
// Animation variants
// ============================================================

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

// ============================================================
// ExperiencePageClient
// ============================================================

export function ExperiencePageClient() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40 max-sm:px-5 max-sm:py-20">
      {/* ================================================================ */}
      {/* Page Header */}
      {/* ================================================================ */}
      <motion.section
        initial="hidden"
        animate="visible"
        variants={headerVariants}
        className="relative mx-auto max-w-4xl rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-10 backdrop-blur-sm dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)] sm:px-12 sm:py-14"
      >
        {/* Glow accent */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/30 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-4">
          {/* Label */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/10 bg-brand/[0.04] px-4 py-1.5 dark:border-white/[0.05] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-slate-500 dark:text-slate-400/60">
              {t("minimind.experience.subhead")}
            </span>
          </div>

          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            {t("minimind.experience.heading")}
          </h1>

          <p className="max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-slate-400 sm:text-base">
            {t("minimind.experience.intro")}
          </p>
        </div>
      </motion.section>

      {/* ================================================================ */}
      {/* Sections */}
      {/* ================================================================ */}
      <div className="mt-20 flex flex-col gap-20 sm:mt-28 sm:gap-28">
        <ArchitectureOverview />
        <MiniMindFlow />
        <ModuleDependencyGraph />
        <LearningProgress />
      </div>
    </div>
  );
}
