"use client";

// ============================================================
// StudioHero — AI Research Studio hero section
// ============================================================
// Phase 64: Premium hero for the MiniMind Studio homepage.
//
// Features:
//   - Gradient text heading
//   - Glass card with glow accent
//   - 3 primary CTA buttons (Start Training, Playground, Research)
//   - 3 live stat indicators
//   - Staggered entrance animations
//
// Data sourced exclusively through studioAdapter.
// Zero business logic in this component.
// ============================================================

import { useTranslation } from "react-i18next";
import { motion, type Variants } from "framer-motion";
import {
  Rocket,
  Gamepad2,
  Microscope,
  Box,
  Layers,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  getStudioHeroData,
  type StudioAction,
  type StudioStat,
} from "@/lib/ai-lab/adapters/studioAdapter";
import { cn } from "@/lib/utils";

// ============================================================
// Icon resolvers (presentation logic, not business logic)
// ============================================================

const ACTION_ICON_MAP: Record<StudioAction["icon"], React.ComponentType<{ className?: string }>> = {
  Rocket,
  Gamepad2,
  Microscope,
};

const STAT_ICON_MAP: Record<StudioStat["icon"], React.ComponentType<{ className?: string }>> = {
  Box,
  Layers,
  TrendingUp,
};

// ============================================================
// Animation variants
// ============================================================

const heroVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: "easeOut" },
  },
};

const actionVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: 0.3 + i * 0.1, ease: "easeOut" },
  }),
};

const statVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.7 + i * 0.08, ease: "easeOut" },
  }),
};

const glowVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 1.2, delay: 0.1, ease: "easeOut" },
  },
};

// ============================================================
// Action button variants
// ============================================================

const actionButtonStyles: Record<StudioAction["variant"], string> = {
  primary: cn(
    "border-brand/20 bg-brand/[0.08] text-brand",
    "hover:border-brand/40 hover:bg-brand/[0.14] hover:text-brand-light",
    "hover:shadow-[0_0_24px_rgba(var(--brand-rgb),0.18)]",
    "dark:border-brand/30 dark:bg-brand/[0.10] dark:hover:border-brand/50"
  ),
  secondary: cn(
    "border-slate-500/15 bg-slate-500/[0.04] text-slate-300",
    "hover:border-brand/30 hover:bg-brand/[0.06] hover:text-brand-light",
    "hover:shadow-[0_0_16px_rgba(var(--brand-rgb),0.10)]",
    "dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-brand/35"
  ),
  outline: cn(
    "border-slate-500/10 bg-transparent text-slate-400",
    "hover:border-purple-500/30 hover:bg-purple-500/[0.04] hover:text-purple-400",
    "hover:shadow-[0_0_16px_rgba(168,85,247,0.10)]",
    "dark:border-white/[0.05] dark:hover:border-purple-500/30"
  ),
};

// ============================================================
// StudioHero
// ============================================================

export function StudioHero() {
  const { t } = useTranslation();
  const data = getStudioHeroData();

  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={heroVariants}
      className="relative mx-auto max-w-4xl"
    >
      {/* ── Ambient glow orbs ── */}
      <motion.div
        aria-hidden="true"
        variants={glowVariants}
        initial="hidden"
        animate="visible"
        className={cn(
          "pointer-events-none absolute -top-32 left-1/2 h-[28rem] w-[40rem] -translate-x-1/2 rounded-full opacity-[0.06] blur-[120px]",
          "bg-[radial-gradient(ellipse,rgba(var(--brand-rgb),0.4)_0%,rgba(var(--brand-deep-rgb),0.15)_40%,transparent_70%)]"
        )}
      />

      {/* ── Main glass card ── */}
      <div
        className={cn(
          "relative rounded-2xl border border-brand/15 bg-brand/[0.03] px-8 py-12 backdrop-blur-sm",
          "dark:border-white/[0.06] dark:bg-[rgba(var(--brand-rgb),0.04)]",
          "sm:px-14 sm:py-16 lg:px-20 lg:py-20"
        )}
      >
        {/* Top glow line */}
        <span
          className="absolute inset-x-0 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-brand/40 to-transparent"
          aria-hidden="true"
        />

        <div className="flex flex-col items-center text-center gap-6">
          {/* ── Subhead pill ── */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand/12 bg-brand/[0.05] px-4 py-1.5 dark:border-white/[0.06] dark:bg-white/[0.02]">
            <Sparkles className="size-3.5 text-brand/70" />
            <span className="font-mono text-[0.65rem] tracking-[0.15em] uppercase text-brand/80 dark:text-brand-light/70">
              MiniMind Research Studio
            </span>
          </div>

          {/* ── Main heading with gradient text ── */}
          <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-5xl lg:text-6xl">
            <span className="bg-gradient-to-br from-foreground via-foreground/90 to-brand bg-clip-text text-transparent">
              {t(data.titleKey)}
            </span>
          </h1>

          {/* ── Subtitle ── */}
          <p className="max-w-2xl text-sm leading-relaxed text-slate-500/80 sm:text-base dark:text-slate-400/70">
            {t(data.subtitleKey)}
          </p>

          {/* ── Mission statement ── */}
          <div className="flex items-center gap-1.5 text-xs text-brand/50 dark:text-brand-light/50">
            <Sparkles className="size-3" />
            <span className="font-mono italic">
              {t(data.missionKey)}
            </span>
          </div>

          {/* ── Primary action buttons ── */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {data.primaryActions.map((action, i) => {
              const ActionIcon = ACTION_ICON_MAP[action.icon];
              const isPrimary = action.variant === "primary";

              return (
                <motion.div
                  key={action.labelKey}
                  custom={i}
                  initial="hidden"
                  animate="visible"
                  variants={actionVariants}
                >
                  <Link
                    href={action.href}
                    aria-label={t(action.labelKey)}
                    className={cn(
                      "group inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-all duration-300",
                      "sm:px-6 sm:py-3 sm:text-base",
                      actionButtonStyles[action.variant],
                      isPrimary && "shadow-[0_0_20px_rgba(var(--brand-rgb),0.08)]"
                    )}
                  >
                    <ActionIcon
                      className={cn(
                        "size-4 transition-transform duration-300 group-hover:scale-110",
                        isPrimary ? "text-brand" : "",
                        action.variant === "outline" && "text-purple-500/60 group-hover:text-purple-400"
                      )}
                    />
                    {t(action.labelKey)}
                    <ArrowRight
                      className={cn(
                        "size-3.5 transition-all duration-300 group-hover:translate-x-0.5",
                        isPrimary ? "text-brand/70" : "opacity-50"
                      )}
                    />
                  </Link>
                </motion.div>
              );
            })}
          </div>

          {/* ── Live stat row ── */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-8">
            {data.stats.map((stat, i) => {
              const StatIcon = STAT_ICON_MAP[stat.icon];

              return (
                <motion.div
                  key={stat.labelKey}
                  custom={i}
                  initial="hidden"
                  animate="visible"
                  variants={statVariants}
                  className="flex items-center gap-2"
                >
                  <StatIcon className="size-4 text-brand/50" />
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {stat.value}
                  </span>
                  <span className="text-xs text-slate-500/60 dark:text-slate-400/50">
                    {t(stat.labelKey)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
