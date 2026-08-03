"use client";

// ============================================================
// ExplorationLinks — 6-card navigation hub grid
// ============================================================
//
// Responsive grid of navigation cards linking to all AI Lab
// sub-pages. Each card follows the existing CTA card pattern
// from JourneySection / KnowledgeMap / ForwardPlaygroundSection.
//
// Grid layout:
//   1 col (mobile) → 2 col (sm) → 3 col (lg)
//
// Data sources:
//   - MINIMIND_MODULES → module count badges
//   - MINIMIND_EXPERIMENTS → active experiment count badge
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import { SectionHeader } from "@/components/home/SectionHeader";
import {
  Map,
  Brain,
  Layers,
  FlaskConical,
  Gamepad2,
  Cpu,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { MINIMIND_MODULES } from "@/data/minimind/module-registry";
import { getActiveExperiments } from "@/data/minimind/experiment-registry";
import { cn } from "@/lib/utils";

// ============================================================
// Route config
// ============================================================

interface ExploreRoute {
  key: string;
  icon: LucideIcon;
  href: string;
  i18nLabel: string;
  i18nDesc: string;
  /** Tailwind classes for the icon container border + glow */
  colorBorder: string;
  colorGlow: string;
  colorText: string;
  colorHoverBorder: string;
  /** Optional: derive a badge string from registries */
  getBadge?: () => string | null;
}

function buildRoutes(): ExploreRoute[] {
  const implementedCount = MINIMIND_MODULES.filter(
    (m) => m.implemented
  ).length;
  const totalCount = MINIMIND_MODULES.length;
  const activeExperimentCount = getActiveExperiments().length;

  return [
    {
      key: "journey",
      icon: Map,
      href: "/ai-lab/journey",
      i18nLabel: "aiLab.sections.learningJourney",
      i18nDesc: "aiLab.dashboard.journeyDesc",
      colorBorder: "border-emerald-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]",
      colorText: "text-emerald-500/60 group-hover:text-emerald-500/80",
      colorHoverBorder: "group-hover:border-emerald-500/40",
      getBadge: () => `${implementedCount}/${totalCount} modules`,
    },
    {
      key: "knowledge",
      icon: Brain,
      href: "/ai-lab/knowledge",
      i18nLabel: "aiLab.sections.knowledgeMap",
      i18nDesc: "aiLab.dashboard.knowledgeDesc",
      colorBorder: "border-brand/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(var(--brand-rgb),0.1)]",
      colorText: "text-brand/60 group-hover:text-brand/80",
      colorHoverBorder: "group-hover:border-brand/40",
      getBadge: () => `${MINIMIND_MODULES.length} modules`,
    },
    {
      key: "experience",
      icon: Layers,
      href: "/ai-lab/experience",
      i18nLabel: "aiLab.dashboard.experienceLabel",
      i18nDesc: "aiLab.dashboard.experienceDesc",
      colorBorder: "border-violet-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]",
      colorText: "text-violet-500/60 group-hover:text-violet-500/80",
      colorHoverBorder: "group-hover:border-violet-500/40",
    },
    {
      key: "experiments",
      icon: FlaskConical,
      href: "/ai-lab/experiments",
      i18nLabel: "aiLab.dashboard.experimentsLabel",
      i18nDesc: "aiLab.dashboard.experimentsDesc",
      colorBorder: "border-amber-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(245,158,11,0.1)]",
      colorText: "text-amber-500/60 group-hover:text-amber-500/80",
      colorHoverBorder: "group-hover:border-amber-500/40",
      getBadge: () => `${activeExperimentCount} active`,
    },
    {
      key: "playground",
      icon: Gamepad2,
      href: "/ai-lab/playground",
      i18nLabel: "aiLab.dashboard.playgroundLabel",
      i18nDesc: "aiLab.dashboard.playgroundDesc",
      colorBorder: "border-sky-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(14,165,233,0.1)]",
      colorText: "text-sky-500/60 group-hover:text-sky-500/80",
      colorHoverBorder: "group-hover:border-sky-500/40",
    },
    {
      key: "inference",
      icon: Cpu,
      href: "/ai-lab/inference",
      i18nLabel: "aiLab.dashboard.inferenceLabel",
      i18nDesc: "aiLab.dashboard.inferenceDesc",
      colorBorder: "border-rose-500/20",
      colorGlow: "group-hover:shadow-[0_0_20px_rgba(244,63,94,0.1)]",
      colorText: "text-rose-500/60 group-hover:text-rose-500/80",
      colorHoverBorder: "group-hover:border-rose-500/40",
    },
  ];
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

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.06, ease: "easeOut" },
  }),
};

// ============================================================
// ExplorationLinks
// ============================================================

export function ExplorationLinks() {
  const { t } = useTranslation();
  const routes = buildRoutes();

  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={variants}
      className="mt-20 sm:mt-28"
    >
      <SectionHeader titleKey="aiLab.dashboard.explorationHub" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {routes.map((route, i) => {
          const badge = route.getBadge?.() ?? null;

          return (
            <motion.div
              key={route.key}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={cardVariants}
            >
              <Link
                href={route.href}
                className={cn(
                  "group flex flex-col items-center justify-center rounded-xl border bg-brand/[0.02] px-5 py-10 text-center transition-all duration-300 hover:bg-brand/[0.05] dark:bg-[rgba(var(--brand-rgb),0.03)] dark:hover:bg-[rgba(var(--brand-rgb),0.06)]",
                  route.colorBorder,
                  "dark:border-white/[0.06]",
                  route.colorHoverBorder,
                  "dark:hover:border-white/[0.12]"
                )}
              >
                {/* Icon container */}
                <div
                  className={cn(
                    "mb-3 flex size-12 items-center justify-center rounded-full border bg-brand/[0.04] transition-all duration-300 dark:bg-brand/[0.06]",
                    route.colorBorder,
                    route.colorHoverBorder,
                    route.colorGlow,
                    "dark:border-brand/20 dark:group-hover:border-brand/35"
                  )}
                >
                  <route.icon
                    className={cn(
                      "size-5.5 transition-all duration-300",
                      route.colorText
                    )}
                  />
                </div>

                {/* Label */}
                <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-brand">
                  {t(route.i18nLabel)}
                </h3>

                {/* Description */}
                <p className="mt-1.5 max-w-[18rem] text-xs leading-relaxed text-slate-500/70 transition-colors group-hover:text-slate-500/90 dark:text-slate-500/60 dark:group-hover:text-slate-400/80">
                  {t(route.i18nDesc)}
                </p>

                {/* Footer: badge + arrow */}
                <div className="mt-3 flex items-center gap-2">
                  {badge && (
                    <span className="rounded-full border border-brand/10 bg-brand/[0.04] px-2.5 py-0.5 text-[0.6rem] font-medium text-slate-500/80 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-400/70">
                      {badge}
                    </span>
                  )}
                  <ArrowRight className="size-3 text-slate-400/50 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-brand/60" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
}
